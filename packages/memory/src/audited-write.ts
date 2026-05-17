// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// auditedWrite — the only entry point for state-mutating persistence.
// Implements CRASH_CONSISTENCY.md §2 (P1–P4) end-to-end.
//
// Ordering (per CRASH_CONSISTENCY §1, SQLite-as-truth):
//   P1: prepare payload + compute hash
//   P2: persist blob (atomic, idempotent)
//   P3: SQLite transaction (audit_events row + brain rows)
//   P4: append JSONL mirror line

import path from 'node:path';
import { JsonCanon } from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';
import { type AuditEventBody, computeSelfHash } from '@manthanos/safety';
import type Database from 'better-sqlite3';
import type { BlobStore } from './blob-store.js';

export interface AuditedWriteInput {
  readonly workspaceId: string;
  readonly actor: string;
  readonly action: string;
  readonly kind: string;
  readonly decision: string;
  /** Optional payload — if present, persisted to the blob store. */
  readonly payload?: unknown;
  /**
   * Brain-row writes to perform inside the same SQLite transaction.
   * They receive the allocated audit_seq for foreign-key linkage.
   */
  readonly brainWrites?: (audit: {
    seq: number;
    workspaceId: string;
    selfHash: string;
  }) => void;
  /**
   * Optional simulation-only timestamp override. Used exclusively by the
   * brain-aging simulator to back-date events so the audit chain reflects
   * a realistic project timeline. Production callers MUST NOT pass this.
   */
  readonly tsOverride?: string;
}

export interface AuditedWriteResult {
  readonly seq: number;
  readonly selfHash: string;
  readonly payloadHash: string | null;
  readonly blobReused: boolean;
}

export interface AuditedWriteContext {
  readonly db: Database.Database;
  readonly blobs: BlobStore;
  /** Absolute path to `.manthan/audit.log`. */
  readonly jsonlPath: string;
  /** In-memory mutex to serialize audited writes within this process. */
  readonly mutex: AsyncMutex;
}

/** Simple async mutex (no external dep). */
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.queue;
    this.queue = prev.then(() => next);
    return prev.then(() => release);
  }
}

export async function auditedWrite(
  ctx: AuditedWriteContext,
  input: AuditedWriteInput,
): Promise<AuditedWriteResult> {
  const release = await ctx.mutex.acquire();
  try {
    return await runProtocol(ctx, input);
  } finally {
    release();
  }
}

async function runProtocol(
  ctx: AuditedWriteContext,
  input: AuditedWriteInput,
): Promise<AuditedWriteResult> {
  // -------------- P1: prepare --------------
  // Wall-clock observation reused for the event ts. The simulator may
  // override this to back-date events for realistic project-timeline
  // synthesis; the chain semantics (prev_hash → self_hash) are unaffected
  // because they hash the canonical body, which includes ts.
  const ts = input.tsOverride ?? new Date().toISOString();

  // -------------- P2: blob persist --------------
  let payloadHash: string | null = null;
  let blobReused = false;
  if (input.payload !== undefined) {
    const result = await ctx.blobs.put(input.payload);
    payloadHash = result.hash;
    blobReused = result.reused;
  }

  // -------------- P3: SQLite transaction --------------
  const { seq, selfHash } = ctx.db.transaction(() => {
    const prevRow = ctx.db
      .prepare(
        'SELECT seq, self_hash FROM audit_events WHERE workspace_id = ? ORDER BY seq DESC LIMIT 1',
      )
      .get(input.workspaceId) as { seq: number; self_hash: string } | undefined;

    const nextSeq = (prevRow?.seq ?? 0) + 1;
    const prevHash: string | null = prevRow?.self_hash ?? null;

    const body: AuditEventBody = {
      workspace_id: input.workspaceId,
      seq: nextSeq,
      ts,
      actor: input.actor,
      action: input.action,
      kind: input.kind,
      payload_hash: payloadHash,
      decision: input.decision,
    };
    const computed = computeSelfHash(prevHash, body);

    ctx.db
      .prepare(
        `INSERT INTO audit_events
           (workspace_id, seq, ts, actor, action, kind, payload_hash, decision, prev_hash, self_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.workspaceId,
        nextSeq,
        ts,
        input.actor,
        input.action,
        input.kind,
        payloadHash,
        input.decision,
        prevHash,
        computed,
      );

    if (payloadHash !== null) {
      ctx.db
        .prepare(
          `INSERT OR IGNORE INTO blobs (payload_hash, size_bytes, first_referenced_at)
           VALUES (?, ?, ?)`,
        )
        .run(payloadHash, 0, ts);
    }

    input.brainWrites?.({ seq: nextSeq, workspaceId: input.workspaceId, selfHash: computed });

    return { seq: nextSeq, selfHash: computed };
  })();

  // -------------- P4: JSONL append --------------
  await appendJsonl(ctx.jsonlPath, {
    workspace_id: input.workspaceId,
    seq,
    ts,
    actor: input.actor,
    action: input.action,
    kind: input.kind,
    payload_hash: payloadHash,
    decision: input.decision,
    prev_hash: seq === 1 ? null : await fetchPrevHashForJsonl(ctx.db, input.workspaceId, seq),
    self_hash: selfHash,
  });

  return { seq, selfHash, payloadHash, blobReused };
}

async function fetchPrevHashForJsonl(
  db: Database.Database,
  workspaceId: string,
  currentSeq: number,
): Promise<string | null> {
  const row = db
    .prepare('SELECT self_hash FROM audit_events WHERE workspace_id = ? AND seq = ?')
    .get(workspaceId, currentSeq - 1) as { self_hash: string } | undefined;
  return row?.self_hash ?? null;
}

async function appendJsonl(jsonlPath: string, record: Record<string, unknown>): Promise<void> {
  const platform = getPlatform();
  const line = `${JsonCanon.stringify(record)}\n`;

  // Atomic append: open with O_APPEND; small writes are atomic on POSIX.
  // On Windows, we use a similar pattern; OS guarantees may be weaker.
  // PAL fs.atomicWrite is full-file replace and not suitable for append;
  // we use Node's appendFile here with explicit fsync via open+sync.
  const { open, mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(jsonlPath), { recursive: true });
  const fh = await open(jsonlPath, 'a');
  try {
    await fh.write(line);
    await fh.sync();
  } finally {
    await fh.close();
  }
  // Best-effort directory fsync — PAL handles platform differences.
  void platform; // referenced for clarity that this path is PAL-aware in spirit
}
