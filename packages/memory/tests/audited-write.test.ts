// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyChain } from '@manthanos/safety';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AsyncMutex, auditedWrite, createBlobStore, openDb, runRecovery } from '../src/index.js';

const WORKSPACE_ID = 'ws-test-001';

async function makeWorkspaceDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'manthan-mem-test-'));
}

describe('auditedWrite', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeWorkspaceDir();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persists a chain of events with blob references', async () => {
    const dbPath = path.join(dir, '.manthan/memory/manthan.db');
    const jsonlPath = path.join(dir, '.manthan/audit.log');
    const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
    const m = await openDb({ dbPath });

    // Seed workspace row.
    m.handle
      .prepare(
        `INSERT INTO workspaces (id, root_path, git_remote_hash, created_at)
         VALUES (?, ?, NULL, ?)`,
      )
      .run(WORKSPACE_ID, dir, new Date().toISOString());

    const ctx = { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() };

    const r1 = await auditedWrite(ctx, {
      workspaceId: WORKSPACE_ID,
      actor: 'system:test',
      action: 'workspace.created',
      kind: 'system',
      decision: 'auto-approve',
      payload: { manthanos: 'genesis', schema: 1 },
    });
    expect(r1.seq).toBe(1);
    expect(r1.payloadHash).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await auditedWrite(ctx, {
      workspaceId: WORKSPACE_ID,
      actor: 'system:test',
      action: 'plan.invoked',
      kind: 'network-read',
      decision: 'auto-approve',
      payload: { task: 'add OAuth' },
    });
    expect(r2.seq).toBe(2);

    // Verify the chain in SQLite.
    const rows = m.handle
      .prepare(
        `SELECT workspace_id, seq, ts, actor, action, kind, payload_hash, decision, prev_hash, self_hash
         FROM audit_events WHERE workspace_id = ? ORDER BY seq ASC`,
      )
      .all(WORKSPACE_ID);
    const verify = verifyChain(rows as never);
    expect(verify.ok).toBe(true);
    expect(verify.checked).toBe(2);

    // Verify the JSONL mirror matches SQLite.
    const jsonl = await readFile(jsonlPath, 'utf8');
    const lines = jsonl.trim().split('\n');
    expect(lines.length).toBe(2);
    const parsed = lines.map((l) => JSON.parse(l) as { seq: number });
    expect(parsed.map((p) => p.seq)).toEqual([1, 2]);

    // Recovery on a clean state returns chain OK.
    const report = await runRecovery({
      db: m.handle,
      blobs,
      jsonlPath,
      workspaceId: WORKSPACE_ID,
    });
    expect(report.chainOk).toBe(true);
    expect(report.chainCheckedEvents).toBe(2);

    m.close();
  });

  it('serializes concurrent writes via the mutex', async () => {
    const dbPath = path.join(dir, '.manthan/memory/manthan.db');
    const jsonlPath = path.join(dir, '.manthan/audit.log');
    const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
    const m = await openDb({ dbPath });
    m.handle
      .prepare(
        `INSERT INTO workspaces (id, root_path, git_remote_hash, created_at)
         VALUES (?, ?, NULL, ?)`,
      )
      .run(WORKSPACE_ID, dir, new Date().toISOString());

    const ctx = { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() };

    const promises = Array.from({ length: 10 }, (_, i) =>
      auditedWrite(ctx, {
        workspaceId: WORKSPACE_ID,
        actor: 'system:test',
        action: `event.${i}`,
        kind: 'system',
        decision: 'auto-approve',
      }),
    );
    const results = await Promise.all(promises);
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const rows = m.handle
      .prepare(
        `SELECT workspace_id, seq, ts, actor, action, kind, payload_hash, decision, prev_hash, self_hash
         FROM audit_events WHERE workspace_id = ? ORDER BY seq ASC`,
      )
      .all(WORKSPACE_ID);
    expect(verifyChain(rows as never).ok).toBe(true);

    m.close();
  });
});
