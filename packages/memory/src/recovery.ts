// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Startup recovery sequence per CRASH_CONSISTENCY.md §5.1 (R1–R8).

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';
import { type ChainedAuditEvent, verifyChain } from '@manthanos/safety';
import type Database from 'better-sqlite3';
import type { BlobStore } from './blob-store.js';

export interface RecoveryInput {
  readonly db: Database.Database;
  readonly blobs: BlobStore;
  readonly jsonlPath: string;
  readonly workspaceId: string;
}

export interface RecoveryReport {
  readonly chainOk: boolean;
  readonly chainCheckedEvents: number;
  readonly chainFailedAtSeq?: number;
  readonly orphanBlobsFound: number;
  readonly jsonlAppendedFromSqlite: number;
  readonly crashedWorkflowsMarked: number;
}

export async function runRecovery(input: RecoveryInput): Promise<RecoveryReport> {
  // R3: chain verification.
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
    return {
      chainOk: false,
      chainCheckedEvents: chainResult.checked,
      chainFailedAtSeq: chainResult.failedAtSeq,
      orphanBlobsFound: 0,
      jsonlAppendedFromSqlite: 0,
      crashedWorkflowsMarked: 0,
    };
  }

  // R4: orphan-blob reconciliation.
  // We scan the blob index in SQLite vs file system. The file scan happens
  // only if both directories exist (avoids slow walks on cold workspaces).
  const orphanBlobsFound = await reconcileOrphanBlobs(input);

  // R5: JSONL reconciliation.
  const jsonlAppended = await reconcileJsonl(input, rows);

  // R6: brain reconciliation (mark stranded running workflows).
  const crashed = input.db
    .prepare(
      `UPDATE workflows
       SET status = 'crashed_recoverable'
       WHERE workspace_id = ? AND status = 'running'`,
    )
    .run(input.workspaceId);

  return {
    chainOk: true,
    chainCheckedEvents: chainResult.checked,
    orphanBlobsFound,
    jsonlAppendedFromSqlite: jsonlAppended,
    crashedWorkflowsMarked: crashed.changes,
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

async function reconcileJsonl(
  input: RecoveryInput,
  sqliteRows: readonly ChainedAuditEvent[],
): Promise<number> {
  // Read the JSONL file (if any) and find its highest valid seq for this
  // workspace.
  let maxJsonlSeq = 0;
  try {
    const content = await readFile(input.jsonlPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { workspace_id?: string; seq?: number };
        if (parsed.workspace_id === input.workspaceId && typeof parsed.seq === 'number') {
          if (parsed.seq > maxJsonlSeq) maxJsonlSeq = parsed.seq;
        }
      } catch {
        // truncated trailing line — ignore; we will append from SQLite.
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
  }

  const missing = sqliteRows.filter((r) => r.seq > maxJsonlSeq);
  if (missing.length === 0) return 0;

  const { open, mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(input.jsonlPath), { recursive: true });
  const fh = await open(input.jsonlPath, 'a');
  try {
    const { JsonCanon } = await import('@manthanos/adapters-sdk');
    for (const r of missing) {
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
      await fh.write(`${JsonCanon.stringify(record)}\n`);
    }
    await fh.sync();
  } finally {
    await fh.close();
  }
  return missing.length;
}
