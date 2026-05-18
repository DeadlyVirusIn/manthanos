// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Startup recovery sequence per CRASH_CONSISTENCY.md §5.1 (R1–R8).
//
// P0.4 extension: detect corruption classes the original tail-gap
// reconciliation silently tolerated:
//   - sequence discontinuity in audit_events (I3 violation)
//   - genesis-anchor violation (I2: seq=1 must have prev_hash=null)
//   - JSONL row not present in SQLite (I5 violation)
//   - JSONL row with mismatched fields versus SQLite (I5 violation)
//   - JSONL mid-file malformed line (not at the tail)
//   - missing blob file for an event with a non-null payload_hash
//     (I1 violation)
//
// Recovery never silently rewrites a corrupted record. When a
// corruption signal fires, the runtime enters a refused-mutation
// state and the finding is written to
// `.manthan/audit-corruption.log` outside the chain. Callers must
// refuse mutating operations whenever `status !== 'clean' &&
// status !== 'partial'`.

import { appendFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { JsonCanon } from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';
import { type ChainedAuditEvent, verifyChain } from '@manthanos/safety';
import type Database from 'better-sqlite3';
import type { BlobStore } from './blob-store.js';

export interface RecoveryInput {
  readonly db: Database.Database;
  readonly blobs: BlobStore;
  readonly jsonlPath: string;
  readonly workspaceId: string;
  /** Optional override for the side-channel corruption log path. */
  readonly corruptionLogPath?: string;
}

/**
 * Discrete recovery outcomes. Mutating callers must refuse to run
 * when status is `corrupted` or `unrecoverable`.
 *
 *   clean         — no findings; system fully functional.
 *   partial       — recoverable reconciliations occurred
 *                   (orphan-blob recording, tail-of-JSONL append).
 *                   System fully functional.
 *   corrupted     — at least one explicit corruption signal; system
 *                   enters refused-mutation state. The corruption
 *                   record is preserved (no silent repair).
 *   unrecoverable — chain does not anchor to a valid genesis or
 *                   the audit log is structurally not a chain at
 *                   all. System cannot safely continue.
 */
export type RecoveryStatus = 'clean' | 'partial' | 'corrupted' | 'unrecoverable';

export type RecoveryFindingCategory =
  | 'chain'
  | 'sequence_gap'
  | 'genesis_anchor'
  | 'jsonl_row_not_in_sqlite'
  | 'jsonl_field_mismatch'
  | 'jsonl_malformed_interior'
  | 'blob_missing';

export interface RecoveryFinding {
  readonly category: RecoveryFindingCategory;
  readonly detail: string;
  readonly seq?: number;
  readonly expected?: string;
  readonly actual?: string;
}

export interface RecoveryReport {
  readonly status: RecoveryStatus;
  /** Legacy alias for status === 'clean' || status === 'partial'. */
  readonly chainOk: boolean;
  readonly chainCheckedEvents: number;
  readonly chainFailedAtSeq?: number;
  readonly orphanBlobsFound: number;
  readonly jsonlAppendedFromSqlite: number;
  readonly crashedWorkflowsMarked: number;
  /**
   * True when R6 (mark stranded `running` workflows as
   * `crashed_recoverable`) was skipped because the recovery status
   * is `unrecoverable`. The chain doesn't anchor to a valid genesis,
   * so the system enters read-only forensic mode and refuses to
   * mutate workflow state. The skip reason is preserved verbatim.
   */
  readonly workflowsMarkSkipped: boolean;
  readonly workflowsMarkSkipReason?: string;
  readonly findings: readonly RecoveryFinding[];
}

export async function runRecovery(input: RecoveryInput): Promise<RecoveryReport> {
  const findings: RecoveryFinding[] = [];

  // ---- R3a. Chain verification (existing behavior, now structured) ----
  const rows = input.db
    .prepare(
      `SELECT workspace_id, seq, ts, actor, action, kind, payload_hash,
              decision, prev_hash, self_hash
       FROM audit_events
       WHERE workspace_id = ?
       ORDER BY seq ASC`,
    )
    .all(input.workspaceId) as ChainedAuditEvent[];

  const chainResult = verifyChain(rows);
  if (!chainResult.ok) {
    findings.push({
      category: 'chain',
      detail:
        'audit chain hash mismatch (prev_hash or self_hash does not match the canonical recompute)',
      seq: chainResult.failedAtSeq,
      expected: chainResult.expected,
      actual: chainResult.actual,
    });
  }

  // ---- R3b. Genesis-anchor invariant (CRASH_CONSISTENCY §4 I2) ----
  // The first audit event in a non-empty workspace must be seq=1 with
  // prev_hash = null. Anything else is an orphan-segment / structural
  // anomaly we cannot safely continue past.
  let unrecoverable = false;
  if (rows.length > 0) {
    const first = rows[0] as ChainedAuditEvent;
    if (first.seq !== 1) {
      findings.push({
        category: 'genesis_anchor',
        detail: `audit chain does not start at seq=1; first row is seq=${first.seq}. This is an orphan chain segment and cannot be safely continued.`,
        seq: first.seq,
      });
      unrecoverable = true;
    } else if (first.prev_hash !== null) {
      findings.push({
        category: 'genesis_anchor',
        detail: 'seq=1 has a non-null prev_hash; genesis anchor invariant (I2) violated.',
        seq: 1,
        actual: first.prev_hash,
      });
      unrecoverable = true;
    }
  }

  // ---- R3c. Sequence contiguity (CRASH_CONSISTENCY §4 I3) ----
  // seq must be strictly increasing with no gaps within a workspace.
  // Gaps indicate interior deletion or never-committed seq holes.
  let expectedSeq = 1;
  for (const r of rows) {
    if (r.seq !== expectedSeq) {
      findings.push({
        category: 'sequence_gap',
        detail: `sequence discontinuity: expected seq=${expectedSeq}, found seq=${r.seq}. An interior audit row may have been deleted, or seq numbers are non-contiguous.`,
        seq: r.seq,
        expected: String(expectedSeq),
        actual: String(r.seq),
      });
      // Don't flood findings on a single deletion that bumps every
      // subsequent seq; record the first gap and stop.
      break;
    }
    expectedSeq += 1;
  }

  // ---- R3d. Blob existence (CRASH_CONSISTENCY §4 I1, payload side) ----
  // For each audit event with a non-null payload_hash, the blob file
  // must exist on disk. Missing blobs do not destroy chain integrity
  // (the chain commits to payload_hash, not the blob bytes), but they
  // mean the recorded action cannot be replayed and any workflow that
  // wrote that blob is no longer reconstructable. Record explicitly;
  // do not synthesize the blob.
  for (const r of rows) {
    if (!r.payload_hash) continue;
    const exists = await input.blobs.exists(r.payload_hash);
    if (!exists) {
      findings.push({
        category: 'blob_missing',
        detail: `audit row references payload_hash=${r.payload_hash} but the blob file is missing on disk. Workflow cannot be replayed from this row.`,
        seq: r.seq,
        expected: r.payload_hash,
      });
    }
  }

  // ---- R4. Orphan-blob reconciliation (unchanged) ----
  // A blob present on disk but not referenced in audit_events is
  // recorded in orphan_blobs. This is recoverable bookkeeping, not
  // corruption.
  const orphanBlobsFound = await reconcileOrphanBlobs(input);

  // ---- R5. JSONL reconciliation with full parity scan ----
  const jsonlReport = await reconcileJsonl(input, rows);
  for (const f of jsonlReport.findings) findings.push(f);

  // ---- R6. Mark stranded running workflows ----
  // Skip the mutation entirely when the workspace is `unrecoverable`.
  // The chain doesn't anchor to a valid genesis, so any state we
  // change here is itself unverifiable; entering read-only forensic
  // mode preserves the corrupted evidence for inspection. For
  // `corrupted` (but anchored) workspaces we still mark stranded
  // workflows — the corruption is local and the workflow row's
  // status field is operationally useful for the operator.
  let crashedChanges = 0;
  let workflowsMarkSkipped = false;
  let workflowsMarkSkipReason: string | undefined;
  if (unrecoverable) {
    workflowsMarkSkipped = true;
    workflowsMarkSkipReason =
      'recovery status=unrecoverable; skipped workflow state mutation to preserve forensic evidence and avoid writing past an unverifiable chain.';
  } else {
    const crashed = input.db
      .prepare(
        `UPDATE workflows
         SET status = 'crashed_recoverable'
         WHERE workspace_id = ? AND status = 'running'`,
      )
      .run(input.workspaceId);
    crashedChanges = crashed.changes;
  }

  // ---- Resolve overall status ----
  let status: RecoveryStatus;
  if (unrecoverable) {
    status = 'unrecoverable';
  } else if (findings.length > 0) {
    status = 'corrupted';
  } else if (orphanBlobsFound > 0 || jsonlReport.appended > 0) {
    status = 'partial';
  } else {
    status = 'clean';
  }

  // ---- Side-channel corruption log (preserves forensic evidence) ----
  // The log lives outside the chain so a corrupted chain cannot mask
  // its own findings. Append-only; never rewritten.
  if (status === 'corrupted' || status === 'unrecoverable') {
    await writeCorruptionLog(input, status, findings);
  }

  return {
    status,
    chainOk: chainResult.ok,
    chainCheckedEvents: chainResult.checked,
    ...(chainResult.failedAtSeq !== undefined ? { chainFailedAtSeq: chainResult.failedAtSeq } : {}),
    orphanBlobsFound,
    jsonlAppendedFromSqlite: jsonlReport.appended,
    crashedWorkflowsMarked: crashedChanges,
    workflowsMarkSkipped,
    ...(workflowsMarkSkipReason !== undefined ? { workflowsMarkSkipReason } : {}),
    findings,
  };
}

async function reconcileOrphanBlobs(input: RecoveryInput): Promise<number> {
  // Walk blob root with deterministic order; a blob present on disk but
  // not referenced in audit_events is recorded as orphan.
  const platform = getPlatform();
  let count = 0;
  try {
    const shards = await platform.fs.readSortedDir(input.blobs.root);
    for (const shard of shards) {
      const shardDir = path.join(input.blobs.root, shard);
      let files: string[];
      try {
        files = await platform.fs.readSortedDir(shardDir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const hash = `${shard}${f.slice(0, -'.json'.length)}`;
        if (hash.length !== 64) continue;
        const referenced = input.db
          .prepare('SELECT 1 FROM audit_events WHERE payload_hash = ? LIMIT 1')
          .get(hash);
        if (!referenced) {
          // Already recorded as orphan?
          const exists = input.db
            .prepare('SELECT 1 FROM orphan_blobs WHERE payload_hash = ?')
            .get(hash);
          if (exists) continue;
          const blobStat = await stat(path.join(shardDir, f));
          input.db
            .prepare(
              `INSERT OR IGNORE INTO orphan_blobs (payload_hash, size_bytes, discovered_at)
               VALUES (?, ?, ?)`,
            )
            .run(hash, blobStat.size, new Date().toISOString());
          count++;
        }
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
  }
  return count;
}

interface JsonlRecord {
  workspace_id?: string;
  seq?: number;
  ts?: string;
  actor?: string;
  action?: string;
  kind?: string;
  payload_hash?: string | null;
  decision?: string;
  prev_hash?: string | null;
  self_hash?: string;
}

interface JsonlReconcileResult {
  appended: number;
  findings: RecoveryFinding[];
}

async function reconcileJsonl(
  input: RecoveryInput,
  sqliteRows: readonly ChainedAuditEvent[],
): Promise<JsonlReconcileResult> {
  // P0.4: full parity scan instead of tail-only max-seq.
  // - Each JSONL line for this workspace must correspond to a row in
  //   SQLite with matching fields (I5: JSONL ⊆ SQLite).
  // - Mid-file malformed lines (not the last line) are corruption,
  //   not the standard tail-truncation case.
  // - Only the tail line is allowed to be malformed (P4 partial-line
  //   scenario in §5).

  const findings: RecoveryFinding[] = [];
  const sqliteBySeq = new Map<number, ChainedAuditEvent>();
  for (const r of sqliteRows) sqliteBySeq.set(r.seq, r);

  let content: string;
  try {
    content = await readFile(input.jsonlPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
    content = '';
  }

  // Walk the file. The last newline may be missing only on the very
  // last record; treat that one missing line as a partial tail.
  const lines = content.split('\n');
  let maxJsonlSeq = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.length === 0) continue; // blank lines are tolerated
    let parsed: JsonlRecord;
    try {
      parsed = JSON.parse(line) as JsonlRecord;
    } catch {
      // Only the final non-empty line is allowed to be truncated.
      const isLast = i === lines.length - 1 || lines.slice(i + 1).every((l) => l.length === 0);
      if (!isLast) {
        findings.push({
          category: 'jsonl_malformed_interior',
          detail: `JSONL has a malformed line at interior position ${i + 1}; only the tail line may be truncated. Mid-file malformation is corruption.`,
        });
      }
      continue;
    }
    if (parsed.workspace_id !== input.workspaceId) continue;
    if (typeof parsed.seq !== 'number') continue;

    if (parsed.seq > maxJsonlSeq) maxJsonlSeq = parsed.seq;

    const sqliteRow = sqliteBySeq.get(parsed.seq);
    if (!sqliteRow) {
      findings.push({
        category: 'jsonl_row_not_in_sqlite',
        detail: `JSONL contains seq=${parsed.seq} for this workspace but SQLite has no matching row (I5 violation).`,
        seq: parsed.seq,
      });
      continue;
    }

    // Field-by-field match. Mismatches mean JSONL was tampered or
    // written by a different schema; do not silently overwrite.
    const mismatches = compareJsonlToSqlite(parsed, sqliteRow);
    for (const m of mismatches) {
      findings.push({
        category: 'jsonl_field_mismatch',
        detail: `JSONL field "${m.field}" disagrees with SQLite at seq=${parsed.seq}.`,
        seq: parsed.seq,
        expected: m.sqliteValue,
        actual: m.jsonlValue,
      });
    }
  }

  // Tail-append catch-up (the safe, idempotent reconciliation).
  const missing = sqliteRows.filter((r) => r.seq > maxJsonlSeq);
  let appended = 0;
  if (missing.length > 0) {
    const platform = getPlatform();
    await platform.fs.ensureDir(path.dirname(input.jsonlPath));
    const lines = missing.map((r) => {
      const record = {
        workspace_id: r.workspace_id,
        seq: r.seq,
        ts: r.ts,
        actor: r.actor,
        action: r.action,
        kind: r.kind,
        payload_hash: r.payload_hash,
        decision: r.decision,
        prev_hash: r.prev_hash,
        self_hash: r.self_hash,
      };
      return `${JsonCanon.stringify(record)}\n`;
    });
    await appendFile(input.jsonlPath, lines.join(''));
    appended = missing.length;
  }

  return { appended, findings };
}

function compareJsonlToSqlite(
  jsonl: JsonlRecord,
  sqlite: ChainedAuditEvent,
): Array<{ field: string; jsonlValue: string; sqliteValue: string }> {
  const out: Array<{ field: string; jsonlValue: string; sqliteValue: string }> = [];
  const check = (name: string, j: unknown, s: unknown): void => {
    if (j !== s) {
      out.push({ field: name, jsonlValue: stringify(j), sqliteValue: stringify(s) });
    }
  };
  check('ts', jsonl.ts, sqlite.ts);
  check('actor', jsonl.actor, sqlite.actor);
  check('action', jsonl.action, sqlite.action);
  check('kind', jsonl.kind, sqlite.kind);
  check('payload_hash', jsonl.payload_hash ?? null, sqlite.payload_hash ?? null);
  check('decision', jsonl.decision, sqlite.decision);
  check('prev_hash', jsonl.prev_hash ?? null, sqlite.prev_hash ?? null);
  check('self_hash', jsonl.self_hash, sqlite.self_hash);
  return out;
}

function stringify(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return String(v);
}

async function writeCorruptionLog(
  input: RecoveryInput,
  status: RecoveryStatus,
  findings: readonly RecoveryFinding[],
): Promise<void> {
  // The corruption log lives outside the audit chain (parallel to
  // `audit.log`) so a corrupted chain cannot mask its own findings.
  // Append-only by design; never rewritten by the runtime.
  const platform = getPlatform();
  const logPath =
    input.corruptionLogPath ?? path.join(path.dirname(input.jsonlPath), 'audit-corruption.log');
  await platform.fs.ensureDir(path.dirname(logPath));
  const entry = {
    detected_at: new Date().toISOString(),
    workspace_id: input.workspaceId,
    status,
    findings,
  };
  await appendFile(logPath, `${JsonCanon.stringify(entry)}\n`);
}
