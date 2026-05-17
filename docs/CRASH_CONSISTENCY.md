# ManthanOS — Crash-Consistency Protocol

> The exact write protocol, recovery algorithm, and integrity invariants
> that make "the brain is the unit of replay" mechanically true after
> any crash, on Linux, macOS, and Windows.
> Status: substrate design lock — required before any persistence
> code is written.

---

## 0. Why this document exists

ManthanOS keeps state across three media that must stay coherent:

1. **SQLite database** (`.manthan/memory/manthan.db`) — the queryable
   brain, including the `audit_events` table.
2. **Append-only audit log** (`.manthan/audit.log`, rotated JSONL) —
   a human-readable, grep-able mirror of `audit_events`.
3. **Content-addressed blob store**
   (`.manthan/audit/blobs/<sha256>.json`) — full payloads referenced
   by hash from audit events.

Without an explicit write protocol, these three drift under any of:

- `kill -9` mid-write.
- Power loss.
- OOM killer.
- Windows AV momentarily locking a file during `rename`.
- A network filesystem replaying a write out of order.

This document defines the protocol that makes drift detectable,
recoverable, and bounded. It is the single most important
substrate doc; everything in `packages/memory` and `packages/safety`
depends on it.

---

## 1. Authority model

**SQLite is the source of truth.** The audit log JSONL and the blob
store are derived. If JSONL and SQLite disagree, SQLite wins; the
JSONL is regenerated. If a blob is missing, the workflow that
referenced it is marked corrupted; the blob is never re-fabricated.

This authority order has one consequence stated as an invariant
(see §4): **any state visible in SQLite must have its blobs
already on disk**.

Why SQLite-as-truth, not JSONL-as-truth:

- SQLite gives us atomic multi-row transactions (Merkle chain head
  + workflow step + brain rows in one commit).
- WAL mode handles its own crash recovery rigorously.
- Indexed queries over a million events are sub-millisecond; grep
  over a 1-GB JSONL is not.
- The JSONL serves auditability and human inspection. It is
  deterministically reconstructible from `audit_events`.

---

## 2. The write protocol (per effectful action)

The protocol below is followed for every action that mutates
ManthanOS state. It is implemented in `packages/memory` as
`auditedWrite()` and is the only entry point allowed for persistence
of audit-bearing actions (lint-enforced).

```
Step P1 — Prepare
  Compute payload (request body, response, file diff, decision body).
  Compute payload_hash = sha256(JsonCanon(payload)).

Step P2 — Blob persist  [idempotent]
  If file .manthan/audit/blobs/<payload_hash>.json exists with
  matching content hash: skip.
  Else:
    a. Write .manthan/audit/blobs/<payload_hash>.json.tmp (open
       O_CREAT|O_WRONLY|O_TRUNC, write bytes).
    b. fsync(file).
    c. rename(.tmp, final).                   [atomic on POSIX]
    d. fsync(parent_dir).                     [POSIX; Windows: best
                                                effort + retry on
                                                ERROR_ACCESS_DENIED]
  See §3 for Windows AV-race handling.

Step P3 — SQLite transaction
  BEGIN IMMEDIATE.
  Compute next_seq = (SELECT MAX(seq) FROM audit_events WHERE
                      workspace_id = ?) + 1.
  Compute prev_hash = (SELECT self_hash FROM audit_events WHERE
                       workspace_id = ? AND seq = next_seq - 1).
                      (NULL for genesis.)
  Compute self_hash = sha256(prev_hash || JsonCanon(event_body)).
  INSERT INTO audit_events (workspace_id, seq, ts, actor, action,
                            kind, payload_hash, decision,
                            prev_hash, self_hash).
  INSERT/UPDATE brain rows (workflow_steps, decisions, facts, etc.)
                            referencing seq.
  COMMIT.
                                              [SQLite WAL fsync per
                                                synchronous=NORMAL]

Step P4 — JSONL mirror
  Open .manthan/audit.log for append.
  Write one JsonCanon line ending with '\n'.
  fsync(file).
  fsync(parent_dir).                          [POSIX]
```

**Concurrency:** P3 holds a SQLite IMMEDIATE-mode lock. Concurrent
audited writes serialize at SQLite. Within a single process, an
in-memory mutex prevents reordering of `auditedWrite()` calls.

**Recoverable failure points:** between any two steps. See §5.

---

## 3. Atomicity assumptions (per OS)

### 3.1 POSIX (Linux, macOS)

- `rename()` is atomic within a single filesystem; the destination
  appears either as the old content or the new content, never partial.
- `fsync(fd)` ensures file data + metadata reach durable storage.
- `fsync(dir_fd)` ensures the directory entry referencing the new
  file is durable. **Required** for crash-safety of P2.d.
- `O_APPEND` writes ≤ PIPE_BUF (4096 bytes typically) are atomic
  with respect to other appenders.

### 3.2 Windows (NTFS)

- `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`
  is documented atomic. Node's `fs.rename` uses this on modern Node
  on NTFS. **Required** for P2.c on Windows.
- AV software may transiently lock a freshly-renamed file with
  `ERROR_SHARING_VIOLATION` (32) or `ERROR_ACCESS_DENIED` (5). The
  PAL retries `rename` on these errors per §3.3.
- `FlushFileBuffers` is the equivalent of `fsync(fd)`. PAL applies
  it.
- Directory fsync is **not supported** on Windows. PAL records that
  it tried and accepts a weaker guarantee. NTFS journal provides
  most of what we need; the gap is documented (see §10).
- SQLite WAL mode on NTFS is well-supported; SQLite handles its own
  durability via its journal.

### 3.3 Cross-platform rename retry policy

When `rename` fails with a recoverable error code (Windows AV race
or short-lived FS issue), PAL retries with exponential backoff:

| Attempt | Delay before retry |
|---|---|
| 1 → 2 | 100 ms |
| 2 → 3 | 500 ms |
| 3 → 4 | 2,000 ms |
| 4 → fail | — |

After 4 attempts, the operation fails with a precise error citing
the OS error code and the file path. The audit log is **not**
updated for failed P2 attempts.

Errors classified as "recoverable" (Windows): `EPERM`, `EBUSY`,
`EACCES`, `EEXIST` (only when overwriting), `ENOTEMPTY` (only on
directory rename). All others fail immediately.

---

## 4. Invariants

These hold at all times when the runtime is at rest (between
`auditedWrite()` calls) and after recovery (§5).

- **I1 — Blob-precedence.** For every row in `audit_events` whose
  `payload_hash` is non-null, the file
  `.manthan/audit/blobs/<payload_hash>.json` exists and has the
  matching SHA-256 hash.
- **I2 — Chain integrity.** For every row in `audit_events` with
  `seq > 1`: `prev_hash` equals `audit_events.self_hash[seq-1]` and
  `self_hash = sha256(prev_hash || JsonCanon(body))`. The genesis
  row at `seq = 1` has `prev_hash = NULL` and a fixed canonical
  genesis body (see §11).
- **I3 — Sequential seq.** `audit_events.seq` is strictly increasing
  with no gaps within a workspace_id.
- **I4 — Brain-references-audit.** For any brain row that records
  an `audit_seq` foreign reference, that audit event exists.
- **I5 — JSONL ⊆ SQLite.** The `.manthan/audit.log` file (plus its
  rotated predecessors) contains a prefix of the JsonCanon
  serializations of rows in `audit_events`, ordered by `seq`. JSONL
  may be missing the tail (it is the derived view); JSONL must not
  contain anything not in SQLite.
- **I6 — Lock-respected.** All persistence operations happen inside
  the workspace lock (§7).

**Forbidden states** (any invariant violated). On detection:
- I1 violated → workflow that wrote the audit event is marked
  `corrupted_blob`. Runtime continues; affected workflow cannot be
  replayed.
- I2 violated → runtime enters `audit_corrupted` mode. All mutating
  operations refused. User informed with precise seq + expected /
  actual hashes.
- I3 violated → audit_corrupted mode.
- I4 violated → individual brain row marked `dangling`; workflow
  marked `crashed_recoverable` (see §5).
- I5 violated (JSONL has events not in SQLite) → audit_corrupted
  mode.

---

## 5. Crash scenarios and recovery

For each crash point in §2's protocol, the recovery rule produces
a consistent state without losing more than is irrecoverable.

| Crash between | What's on disk | Recovery rule | Outcome |
|---|---|---|---|
| Before P2 | Nothing new. | None needed. | Action never happened. |
| P2.a–c (.tmp exists) | Tmp blob. | Delete tmp. | Action never happened. |
| P2.d (renamed, dir-fsync pending) | Blob exists. | Treat as P2 complete. | Idempotent on retry — re-running P2 finds the blob and skips. |
| Between P2 and P3 begin | Blob exists; no audit row. | Orphan blob; recorded in `orphan_blobs` table with `discovered_ts`. GC after 30 days. | Action never happened. |
| During P3 | SQLite WAL handles recovery. Either P3 fully committed or fully rolled back. | If rolled back: orphan blob (above). If committed: see next row. | Either "never happened" or "happened; P4 pending." |
| Between P3 commit and P4 begin | Blob exists; audit row exists in SQLite. JSONL missing the line. | Run JSONL reconcile (§5.1). | Action happened. JSONL catches up. |
| During P4 (partial line) | JSONL has a partial line. | Detect truncated trailing line by parse failure; truncate to last complete `\n`; re-append from SQLite. | Action happened. JSONL repaired. |
| After P4 | All consistent. | None. | Action durably happened. |

### 5.1 Startup recovery sequence

Executed by `packages/memory` `recovery.run()` before any
mutating operation. Idempotent — safe to run repeatedly.

```
R1. Acquire workspace lock (§7). If lock present and PID alive: refuse.
R2. SQLite open with WAL mode. SQLite handles its own WAL recovery.
R3. Audit chain verification:
    For each (workspace_id, seq) in audit_events ordered by seq:
      recompute self_hash; compare with stored.
      On mismatch: enter audit_corrupted mode (§5.2). HALT.
    On success: record verification ts.
R4. Orphan-blob reconciliation:
    Scan .manthan/audit/blobs/. For each blob hash not referenced
    by audit_events.payload_hash: insert into orphan_blobs with
    discovered_ts = now (if not already present).
R5. JSONL reconciliation:
    Read max seq present in JSONL (parse last complete line).
    For each audit_event in SQLite with seq > max_jsonl_seq, append
    its JsonCanon serialization to JSONL. fsync.
R6. Brain reconciliation:
    For each workflow_runs row with status='running': mark
    'crashed_recoverable'. Same for in-progress debates.
R7. GC orphan blobs older than 30 days; record GC event.
R8. Release lock acquisition flag — runtime is now mutable.
```

R3 is the only step that can transition the runtime to a refused-
mutation state.

### 5.2 `audit_corrupted` mode

A failed chain verification (I2 or I3 violation) indicates either
disk corruption, an external tamper, or — most likely — a bug in
ManthanOS persistence. The runtime:

- Refuses all mutating operations (writes, workflow runs, brain
  updates).
- Allows read commands (`manthan brain stats`, `manthan audit show
  <seq>`, `manthan doctor`).
- Surfaces an explicit, structured error on every CLI invocation
  with the offending seq and the expected vs. observed self_hash.
- Logs the corruption to a side channel
  (`.manthan/audit-corruption.log`) outside the corrupted chain.

No automatic repair. The user invokes
`manthan audit recover --force --i-understand` to:

- Mark all rows from corruption seq onward as `quarantined`.
- Start a new chain segment with a new genesis row referencing the
  prior corrupted segment's last good seq.
- All affected workflow runs become unrecoverable; the user must
  decide whether to re-run them.

This is intentionally manual. Automatic repair tools double as
tamper tools.

---

## 6. Replay integrity guarantees

Given the protocol above, replay (`manthan replay <runId>`)
guarantees:

- **G1.** For any committed workflow run, all blobs referenced by
  its audit events are present (I1).
- **G2.** The audit chain segment covering the run is verifiable
  (I2).
- **G3.** The packed context bundle reconstructed from the recorded
  brain snapshot is byte-identical via `JsonCanon` (per
  DEBATE_PROTOCOL §7.1).
- **G4.** The control-flow path (which steps ran, in what order) is
  deterministic given (workflow_def, parameters, brain_snapshot,
  recorded_human_decisions) — see DETERMINISTIC_ORDERING in
  ARCHITECTURE §10.1.

What replay does **not** guarantee:

- That re-invocation against the provider yields identical output.
- That wall-clock or token counts match.
- That a workflow run interrupted by crash can be deterministically
  resumed (it can be replayed up to the last persisted step; what
  happens after is a new live run, audited separately).

These bounds are surfaced to users in CLI error messages whenever
relevant.

---

## 7. Lock semantics

A workspace lock file at `.manthan/locks/workspace.lock` ensures
single-runtime ownership.

- Lock file content: `{pid: <int>, started_at: <ts>, host: <string>}`.
- Acquisition: `O_CREAT|O_EXCL` (atomic create). On `EEXIST`, read
  the existing lock, check if PID is alive on the same host. If
  dead → reclaim (delete + recreate). If alive → refuse with a
  precise error.
- Release: explicit on graceful shutdown; left behind on crash but
  reclaimable.
- Windows: PID-alive check uses `OpenProcess` + `GetExitCodeProcess`
  via a tiny native helper, or a fallback to a stale-after-N-minutes
  heuristic when the helper is unavailable.

A single Node process holds the lock for its lifetime. Within the
process, persistence operations serialize via an in-memory mutex.

The lock does **not** protect against external tools mutating
`.manthan/` (e.g., a user running `rm` on the directory). The audit
chain catches such mutations on next startup (R3).

---

## 8. WAL & checkpoint policy

- SQLite open with `PRAGMA journal_mode=WAL` and `synchronous=NORMAL`
  (the FULL setting offers minor durability gains at heavy
  performance cost; NORMAL combined with explicit fsyncs in the
  audit protocol is the right trade-off).
- `PRAGMA journal_size_limit=67108864` (64 MB) — caps WAL growth.
- `PRAGMA wal_autocheckpoint=1000` — auto-checkpoint at 1000 pages
  (~4 MB).
- Explicit `PRAGMA wal_checkpoint(PASSIVE)` is called on graceful
  shutdown.
- On Windows, additionally `PRAGMA mmap_size=0` to avoid mmap
  on NTFS (some Windows AV products misinterpret mmap'd writes).

---

## 9. Blob store lifecycle

- **Layout:** `.manthan/audit/blobs/<first2-of-hash>/<rest-of-hash>.json`
  (sharded by first byte to keep directories under 65k entries on
  Windows where large directories are slow).
- **Immutability:** blobs are never modified after rename. Re-writes
  with the same hash are skipped (idempotent).
- **GC:** monthly background pass (run by `manthan brain clean` or
  on user demand):
  - Delete `orphan_blobs` rows older than 30 days; unlink their
    files.
  - Delete normal blobs whose audit_events have all been
    deleted/rotated *and* whose containing audit log has been
    archived (Phase 4+ — MVP does not delete normal blobs).
- **Quotas:** soft warning at 1 GB blob store size; hard refusal
  at 10 GB until the user runs cleanup (configurable in
  `config.yaml`).

---

## 10. Audit-log JSONL lifecycle

- **Rotation:** when current `audit.log` exceeds 50 MB, rotate to
  `audit.log.<n>` and start a fresh file. Rotation is itself an
  audited operation (audit_event of kind `audit.rotate`).
- **Reconstruction:** JSONL files can be deleted entirely; on next
  startup, R5 regenerates them from SQLite. This is the formal
  basis for invariant I5.
- **Retention:** indefinite by default. `manthan audit prune
  --before=<date>` requires explicit invocation and writes a
  `audit.prune` event before any deletion.

---

## 11. Genesis event

The first event for every workspace has:

```
seq         = 1
ts          = workspace creation time (UTC, RFC 3339)
actor       = "system:bootstrap"
action      = "workspace.created"
kind        = "system"
payload_hash = sha256("manthanos:genesis:v1") (a fixed sentinel)
prev_hash   = NULL
self_hash   = sha256(NULL || JsonCanon(body))
```

The genesis blob (`<sentinel-hash>.json`) is a fixed file:

```json
{ "manthanos": "genesis", "schema": 1 }
```

Genesis is content-addressed; the same canonical body produces the
same payload_hash everywhere. This ensures cross-workspace
verification of "this is a real ManthanOS workspace."

---

## 12. Operator-visible warnings

Conditions reported by `manthan doctor` and the CLI preamble:

- **WARN: large WAL.** Current `manthan.db-wal` > 32 MB without a
  checkpoint in the last hour. Indicates checkpoint starvation;
  recommends graceful shutdown.
- **WARN: orphan blobs.** > 50 `orphan_blobs` rows. Recommends
  `manthan brain clean`.
- **WARN: stale lock.** Lock file present, PID dead. Auto-reclaimed
  but logged.
- **ERROR: chain corruption.** Detected by R3. Runtime in
  `audit_corrupted` mode. User must run `manthan audit recover`.
- **WARN: long path.** Workspace path > 200 chars on Windows.
- **WARN: AV interference.** > 3 rename retries in last 24h
  indicates AV pressure; recommends excluding `.manthan/` from
  real-time scanning.

---

## 13. Crash simulation matrix (Phase 0–1 test plan)

The implementation includes a fault-injection harness exercised in
CI. The matrix:

| ID | Crash at | OS | Expected outcome |
|---|---|---|---|
| C1 | P2.b (after fsync, before rename) | linux | Tmp file present; deleted on R-startup. |
| C1w | same | windows | Same. AV-race handled per §3.3. |
| C2 | P2.c (after rename, before parent fsync) | linux | Blob present; treated as P2 complete on retry. |
| C2w | same | windows | Same (best-effort dir fsync). |
| C3 | Between P2 and P3 | all | Orphan blob; recorded in `orphan_blobs`. |
| C4 | During P3 transaction | all | SQLite rollback; orphan blob. |
| C5 | Between P3 and P4 | all | JSONL caught up by R5. |
| C6 | During P4 append (partial line) | all | Truncated line; R5 detects and repairs. |
| C7 | During P4 after fsync, before dir fsync | linux | Action durable. |
| C8 | Concurrent `auditedWrite` from two processes | all | Lock prevents (one process refused). |
| C9 | Tampered audit row (one byte changed) | all | R3 detects; audit_corrupted mode. |
| C10 | Removed blob | all | R4 records as missing on next audit access; workflow marked `corrupted_blob`. |
| C11 | Filesystem full mid-P2 | all | Operation fails with explicit error; no state change. |
| C12 | SQLite WAL corruption | all | SQLite recovery; if unrecoverable → audit_corrupted. |

Each row corresponds to an automated test that uses Node `kill -9`
on a child process running a known operation, then exercises R3–R7
recovery and verifies the expected outcome.

---

## 14. Forbidden anti-patterns

These are bugs if they appear in `packages/memory` or any caller:

- Direct `JSON.stringify` for any persisted data (must use
  `JsonCanon`).
- Direct `fs.writeFile` / `fs.rename` outside PAL (lint-enforced).
- SQLite mutations outside an explicit transaction.
- Append to `audit.log` without first committing the SQLite row.
- Mutations holding a SQLite lock across an async network call.
- Background "fix-up" tasks that modify `audit_events` after insert.
- Any garbage collection that deletes blobs referenced by retained
  audit rows.

---

## 15. Open questions

- Whether to require fsync on every audit append, or batch fsync
  per N events. **MVP decision: fsync every append.** Latency is
  acceptable for solo-user workflows; correctness is preferred.
- Whether to add a remote-witness option in Phase 5 (per
  SAFETY_MODEL.md §15) using only the SQLite chain + a Merkle
  commitment, no JSONL dependency.
- Whether the workspace lock should also cover the blob store dir,
  or whether per-blob writes can race safely under the existing
  protocol. **MVP decision: workspace lock covers everything.**
- Whether the audit-corrupted mode should auto-create a write-only
  side-store for analytics (so the user can still capture state
  while figuring out the corruption). Deferred.
