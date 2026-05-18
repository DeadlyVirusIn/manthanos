# `manthan replay` — Operator Walkthrough

`manthan replay <runId>` verifies the integrity of the continuity
record for a past `manthan plan` run. It is a local-first,
deterministic check: it reads the artifacts the substrate wrote at
run time, recomputes the hashes the substrate committed to, and
reports whether the values still match.

Replay is **not** a re-invocation of the model. It does not say
anything about what the model would produce today, nor about whether
the recorded response was semantically correct. Those are different
questions, intentionally out of scope. See "What replay does NOT
verify" below.

---

## 1. Reading replay quickly

| If you see | What it means | What to do |
|---|---|---|
| `status: verified` | Every integrity check ran and passed. | Trust the recorded run operationally. |
| `status: legacy` | Some integrity field predates the verifier; the chain still hashes correctly. | The run is readable; deeper verification for the missing field is not possible. |
| `status: unverifiable` | A required artifact is structurally absent (e.g., missing blob, missing `context_snapshots` row). | Inspect what's missing; the recorded run is incomplete. |
| `status: CORRUPTED` | At least one explicit hash mismatch. | Inspect `.manthan/audit-corruption.log`; the substrate refuses to mutate until corruption is reviewed. |

Exit codes mirror the status:

| Exit code | Status |
|---|---|
| `0` | `verified` |
| `1` | `legacy` |
| `2` | `unverifiable` (or `ReplayError` — workspace / run not found) |
| `3` | `corrupted` |

CI gates can `manthan replay <runId> --json | jq -r .verification.status`.

---

## 2. What replay verifies

Replay runs four mechanical checks. Each is a recompute of a hash
the substrate committed at run time, compared against the stored
value.

1. **Audit chain linkage.**
   Every audit event for the workspace is walked in `seq` order. Each
   event's `self_hash = sha256(prev_hash || JsonCanon(body))` is
   recomputed and compared. A flipped byte anywhere in any audit row
   breaks the chain.

2. **Per-event blob integrity.**
   Every audit event with a `payload_hash` is verified by re-reading
   the blob from `.manthan/audit/blobs/` and recomputing
   `sha256(JsonCanon(parsed))`. The blob's content must hash to the
   recorded value.

3. **Canonical response hash.**
   Every `agent.invoke` event's payload includes a `canonical_hash`
   field — the sha256 of the canonical projection of the model's
   response at the moment it was recorded. Replay recomputes that
   hash from the stored canonical and compares.

4. **Bundle hash.**
   Every `context_snapshots` row carries a `bundle_hash` plus
   per-layer `content_sha256` values inside `layers_json`. Replay
   rebuilds the canonical bundle struct from the persisted layer
   metadata and recomputes the hash.

If all four checks return `ok`, the run is `verified`. The substrate
recorded what it claims to have recorded, and the artifacts on disk
have not drifted from those records.

---

## 3. What replay does NOT verify

Replay's scope is the integrity of recorded artifacts. It does **not**
make any of the following claims:

- **No model re-invocation.** Replay does not call the provider. It
  reads stored bytes.
- **No model determinism claim.** Replay does not claim the same
  request, sent to the same provider today, would produce the same
  response. Model behavior across time is a black box; replay does
  not pretend otherwise.
- **No semantic correctness check.** Replay does not say whether the
  recorded response was *right*, only that it was *recorded
  correctly*.
- **No repository / git-state check.** Replay verifies the bundle
  was hashed correctly at write time; it does not verify that the
  files referenced by the bundle are unchanged today. The layer
  content hashes commit to what the substrate read at run time, not
  to what is on disk now.
- **No provider-side check.** Replay does not contact any provider,
  inspect any provider's audit log, or otherwise verify anything
  outside `.manthan/`.

Treat replay as **forensic** verification of recorded continuity
artifacts, not as a guarantee of model behavior.

---

## 4. The four statuses in detail

### 4.1 `verified`

Every applicable check ran and passed. The chain is intact, every
referenced blob hashes to its recorded value, the canonical response
hash recomputes, and the bundle hash recomputes.

**Common causes.** A fresh, untampered run from a workspace that has
been initialized with the current substrate version. This is the
expected state.

**Operator implications.** The substrate's records are
mechanically defensible. The recorded run can be safely cited in
issues, debate, or reviews. Trust it operationally as far as
"recorded artifacts are intact" goes — see §3 for the boundary.

### 4.2 `legacy`

The chain still hashes correctly, but one or more of the
recompute-and-compare checks cannot run because the field it needs
is absent from the stored artifacts.

**Common causes.**

- A workspace from before the `agent.invoke` blob carried
  `canonical_hash` — the canonical-hash check has nothing to
  compare against.
- A `context_snapshots.layers_json` that predates per-layer
  `content_sha256` — the bundle-hash recompute cannot run.

**Operator implications.** The run is readable. The audit chain
still validates. What replay cannot do is the additional
recompute-and-compare check for the missing field, so it surfaces
the gap explicitly rather than silently passing. A `legacy` run is
**not** the same as a `verified` run. Treat it as "the substrate at
that time did not record enough to do deeper verification, but it
did not lie about what it recorded".

### 4.3 `unverifiable`

A required artifact is structurally absent. The chain may still be
intact for everything that is present, but a piece replay needs is
missing on disk.

**Common causes.**

- The blob file for a referenced `payload_hash` was deleted
  (filesystem cleanup, an aggressive `rm`, a tool that touched
  `.manthan/`).
- The `context_snapshots` row for the run is missing.
- The `agent.invoke` event for the run does not exist.

**Operator implications.** The recorded run is **incomplete**.
Whether to keep using it depends on what's missing — a missing blob
means that event cannot be replayed against; a missing
`context_snapshots` row means the bundle hash cannot be checked but
the model's response is still verifiable. The output's
`unverifiable notes:` block names the specific artifact.

### 4.4 `CORRUPTED`

At least one explicit hash mismatch was detected. Corruption always
wins in the status decision — even if every other check is `ok`, a
single mismatch resolves the overall status to `corrupted`.

**Common causes.**

- A blob file on disk has been modified since the event was written
  (intentional edit, filesystem corruption, a bug in an external
  tool touching `.manthan/`).
- An `audit_events` row was modified directly (someone ran an
  `UPDATE` against the SQLite DB).
- A `context_snapshots.bundle_hash` was changed independent of its
  `layers_json`.
- An interior `audit_events` row was deleted, creating a sequence
  gap. (See `recovery` for related signals — `manthan doctor` also
  surfaces this class.)

**Operator implications.** The substrate refuses to write new audit
events while the workspace is in this state. `manthan plan` will
fail with `ERROR CHAIN_CORRUPTED` until the corruption is reviewed.
The corruption record is preserved in `.manthan/audit-corruption.log`
— a side-channel append-only log that lives outside the audit
chain so a corrupted chain cannot mask its own findings.

There is no automatic repair. Recovery is operator-driven by design;
automatic repair tools double as tamper tools.

---

## 5. Example outputs

The examples below are real CLI captures with the run id and hashes
left as the substrate wrote them. The `manthan replay` rendering
uses two-space indentation and a 16-character key alignment column;
the only colour applied by default is `green` on `ok`/`verified`,
`yellow` on `legacy`/`unverifiable`, and `red` on `MISMATCH`/
`CORRUPTED`. Run with `--no-color` for a pipe-friendly, colour-free
version.

### 5.1 `verified` (human-readable, `--no-color`)

```
manthan replay — wf_12d9101f-0830-4783-8fee-e1713516b171
  (integrity check of recorded artifacts; no model re-invocation)

  status:         verified
  chain:          ok
  blobs:          5 checked, 0 mismatched, 0 missing
  canonical_hash: ok
  bundle_hash:    ok

  audit events:   5 for this run
  started:        2026-05-18T21:21:16.939Z
  workflow status: completed
  bundle_hash:    6a49e97cd9f8eed6464da733305b701b90e2eacf3aa7d1e31c600d5db15de3e4
  canonical_hash: 060613924fee95e16dd893e2a316906ecc2a8aad00c118414d16f66f0d3b1f30
  tokens:         in=10 out=10
  cost:           $0.000100 (100 micro)
  finish reason:  tool_use
```

### 5.2 `verified` (`--json` excerpt)

```sh
$ manthan replay wf_12d9101f-0830-4783-8fee-e1713516b171 --json | jq '.verification'
{
  "status": "verified",
  "checks": {
    "chain": "ok",
    "blobs": {
      "checked": 5,
      "failed": 0,
      "missing": 0
    },
    "canonicalHash": "ok",
    "bundleHash": "ok"
  },
  "failures": [],
  "legacy": [],
  "unverifiable": []
}
```

### 5.3 `legacy` (human-readable, `--no-color`)

```
manthan replay — wf_0f4809a6-a9f4-4f06-ad20-37a26cbbd38f
  (integrity check of recorded artifacts; no model re-invocation)

  status:         legacy (some integrity fields predate the verifier)
  chain:          ok
  blobs:          5 checked, 0 mismatched, 0 missing
  canonical_hash: ok
  bundle_hash:    legacy (recompute not possible from stored data)

  audit events:   5 for this run
  …

  legacy notes (not corruption, but not verified either):
    - [bundle_hash] layers_json predates P0.3; layer 0 lacks content_sha256
```

### 5.4 `CORRUPTED` (human-readable, `--no-color`)

```
manthan replay — wf_a163696a-3b67-454e-a39a-a61b0043da58
  (integrity check of recorded artifacts; no model re-invocation)

  status:         CORRUPTED — an explicit hash mismatch was detected
  chain:          ok
  blobs:          5 checked, 1 mismatched, 0 missing
  canonical_hash: ok
  bundle_hash:    ok

  audit events:   5 for this run
  …

  failures:
    - [blob] blob content does not hash to recorded payload_hash for seq=3 (seq=3)
        expected: 86ee1af08f52f9739ec84b49d9b0850086cca28debeab6d1810b11835abb4886
        actual:   333f67d6901c39820d98b3cb2e1dc2df65a0355db1dd426ae2498f292bc6c125

-> inspect .manthan/audit-corruption.log for the recorded findings.
```

### 5.5 `unverifiable` (human-readable, `--no-color`)

```
manthan replay — wf_7a49cedf-c7da-4f70-b47a-18bd124e3cf2
  (integrity check of recorded artifacts; no model re-invocation)

  status:         unverifiable (a required artifact is missing)
  chain:          ok
  blobs:          5 checked, 0 mismatched, 0 missing
  canonical_hash: ok
  bundle_hash:    unverifiable (artifact missing)

  …

  unverifiable notes:
    - [bundle_hash] no context_snapshots row found for this run
```

---

## 6. How to read failures

Each entry in the `failures:` block follows a consistent shape:

```
- [<check>] <detail>  (seq=<n>)
    expected: <hash hex>
    actual:   <hash hex>
```

- **`<check>`** is one of `chain`, `blob`, `canonical_hash`,
  `bundle_hash`. It identifies which mechanical check fired.
- **`<detail>`** is the substrate's literal description. It is not
  paraphrased by the renderer; if it looks unfamiliar, search the
  substrate source — there will be exactly one place that emits it.
- **`seq=<n>`** points at the audit-event row in
  `.manthan/audit.log` and the corresponding `audit_events.seq` in
  SQLite. Use it to locate the offending event.
- **`expected` vs `actual`** are full lowercase sha256 hex. Compare
  them byte-by-byte; even one differing nibble is a real mismatch.

If the `chain` check fails, the audit chain is broken — every event
after the failed `seq` is no longer cryptographically linked back
to genesis. If the `blob` check fails, the file at
`.manthan/audit/blobs/<first-2-hex>/<remaining-62-hex>.json` has
been modified or replaced. If `canonical_hash` fails, the
`canonical` field inside the blob does not hash to the
`canonical_hash` field beside it — the canonical projection
embedded in the blob has drifted. If `bundle_hash` fails, the
`layers_json` in `context_snapshots` was modified, or the
`bundle_hash` column itself was edited independently.

The `legacy notes:` and `unverifiable notes:` blocks follow the
same shape minus the `expected`/`actual` pair. They name the
specific check that could not run and the artifact it needed.

---

## 7. `.manthan/audit-corruption.log`

This file is append-only. The substrate writes one
`JsonCanon`-serialized line per recovery run that detected
corruption. Each entry is structured as:

```json
{
  "detected_at": "<ISO8601 ts>",
  "workspace_id": "<ws_…>",
  "status": "corrupted" | "unrecoverable",
  "findings": [
    { "category": "<class>", "detail": "<text>", "seq": <n>?, ... }
  ]
}
```

`category` is one of:

- `chain` — chain hash mismatch.
- `sequence_gap` — interior `seq` discontinuity in `audit_events`.
- `genesis_anchor` — first event is not at `seq=1` with
  `prev_hash=null`. Status escalates to `unrecoverable`.
- `blob_missing` — a non-null `payload_hash` references a blob file
  that is no longer on disk.
- `jsonl_row_not_in_sqlite` — `.manthan/audit.log` contains a row
  for this workspace that has no matching SQLite row.
- `jsonl_field_mismatch` — JSONL fields disagree with SQLite for
  the same `seq`.
- `jsonl_malformed_interior` — a mid-file line in
  `.manthan/audit.log` is not parseable. (Tail-only truncation is
  tolerated by design.)

The log lives outside the audit chain so that a chain corruption
cannot rewrite the corruption record itself. Treat each entry as
forensic evidence: never edit, never delete. If you need to
archive an entry for issue triage, copy it; do not move it.

---

## 8. Using replay during debugging

A typical debugging flow when a `manthan plan` result looks wrong:

1. Note the `run logged: wf_…` line from the post-plan summary.
2. Run `manthan replay <runId>` and read the status.
3. If status is `verified`, the substrate did its job — the issue
   is with model behavior, prompt content, or upstream state.
   Replay can confirm what was injected (bundle hash, canonical
   response) so you can pin which inputs produced the unexpected
   output.
4. If status is `legacy`, `unverifiable`, or `corrupted`, the
   substrate's own records cannot be fully trusted for this run.
   Address the substrate state first; do not draw conclusions about
   model behavior until the run is at least `legacy` with explicit
   notes about what's missing.

For deeper inspection, `manthan replay <runId> --show-text` prints
the recorded model response between explicit fences. The body is
the model's verbatim output (redacted as written at run time);
replay does not reformat or re-styling it.

For programmatic / CI consumption, `manthan replay <runId> --json`
emits the full `ReplayResult` struct on stdout. The output is
byte-identical to the underlying object — no rendering transforms,
no inferred fields, no flattening. Exit codes match the
human-readable mode.

---

## 9. Filing an issue from replay output

When a replay surfaces a problem, the
`.github/ISSUE_TEMPLATE/continuity-failure.yml` and
`.github/ISSUE_TEMPLATE/bug-report.yml` templates ask for the
following. Have them ready before opening the issue:

1. The run id (from the post-plan summary or the replay output).
2. The output of `manthan replay <runId> --json --no-color`. Paste
   the full JSON into the template — `jq` is not required to file
   the issue, but the JSON form is the most useful for diagnosis.
3. The output of `manthan doctor`. Use `--strict` if you want a
   non-zero exit code from CI; for issue filing, the default form
   is enough.
4. If the issue is `corrupted`, copy the relevant entries from
   `.manthan/audit-corruption.log` verbatim.
5. The minimal reproducer if you can describe one. (Often you
   cannot — corruption events tend to be artefacts of out-of-band
   filesystem activity. Saying "I don't know what happened between
   the run and now" is fine; the audit log carries the forensic
   detail.)

A single useful issue looks like:

```
manthan version:  0.0.0-phase0
run id:           wf_a163696a-3b67-454e-a39a-a61b0043da58
replay status:    corrupted
exit code:        3

<paste of --json output>

<paste of relevant audit-corruption.log entries>

<paste of manthan doctor output>
```

That is enough to triage every category of replay failure the
substrate produces.

---

## 10. Glossary (one-line definitions)

- **audit chain** — the sequence of audit events for a workspace,
  cryptographically linked via `self_hash`.
- **blob** — a content-addressed file under `.manthan/audit/blobs/`
  storing an audit event's payload.
- **bundle** — the structured context the substrate built for a
  plan run (charter facts, trusted facts, repo content, task
  brief). The bundle hash commits to a deterministic canonical
  projection of the bundle's metadata.
- **canonical projection** — the substrate's standard, version-
  pinned shape for a model response, designed so the same
  recorded response produces the same hash across SDK minor
  upgrades.
- **canonical_hash** — `sha256(JsonCanon(canonical))` for an
  `agent.invoke` event, persisted into the audit payload at
  write time and rechecked on replay.
- **content_sha256** — per-layer hash of the bundle's layer
  content, persisted into `context_snapshots.layers_json` and used
  by `recomputeBundleHash`.
- **forensic** — the log/record posture: append-only, never
  rewritten, preserved exactly as observed.
- **legacy** — a replay status: chain intact, but a recompute-and-
  compare check could not run because the field it needs is
  absent. Not the same as `verified`.
- **JsonCanon** — the substrate's deterministic JSON
  canonicalization. Stable across encodings; the same logical
  object always produces the same byte sequence.
- **run id** — `wf_<uuid>`, identifies a single `manthan plan`
  invocation.
- **substrate** — the on-disk components of ManthanOS for a
  workspace: SQLite DB, blob store, JSONL audit log,
  `context_snapshots`, recovery state.

---

If something in this document feels ambiguous, file an issue using
the `bug-report` template and reference this page. Operator
documentation drifts away from code over time; we'd rather hear
about it early than late.
