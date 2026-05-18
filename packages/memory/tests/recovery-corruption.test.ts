// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn
//
// P0.4: pin the corruption classes that startup recovery must
// detect. Before this commit, recovery only flagged chain-hash
// mismatch. The tests below each induce a SINGLE corruption mode
// against an otherwise-intact workspace so it is unambiguous which
// check is supposed to catch which fault.
//
// Corruption is preserved, not repaired. The runtime enters a
// refused-mutation state and writes a side-channel record to
// `.manthan/audit-corruption.log` outside the chain.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonCanon } from '@manthanos/adapters-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AsyncMutex, auditedWrite, createBlobStore, openDb, runRecovery } from '../src/index.js';

const WS = 'ws_recovery_corruption';

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-rec-corr-'));
  const dbPath = path.join(dir, '.manthan/memory/manthan.db');
  const jsonlPath = path.join(dir, '.manthan/audit.log');
  const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, dir, new Date().toISOString());

  const ctx = { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() };
  // Write a few audit events so we have a chain to corrupt.
  for (let i = 0; i < 4; i += 1) {
    await auditedWrite(ctx, {
      workspaceId: WS,
      actor: 'system:test',
      action: `event.${i}`,
      kind: 'system',
      decision: 'auto-approve',
      payload: { idx: i },
    });
  }
  return { dir, dbPath, jsonlPath, blobs, m };
}

describe('recovery corruption detection', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('clean workspace → status=clean, no findings', async () => {
    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('clean');
    expect(r.findings).toHaveLength(0);
    expect(r.chainOk).toBe(true);
  });

  it('interior row deletion → status=corrupted, sequence_gap finding', async () => {
    // Delete seq=2 from audit_events. The chain itself still verifies
    // up to seq=1; the gap is detected separately.
    env.m.handle.prepare('DELETE FROM audit_events WHERE workspace_id = ? AND seq = 2').run(WS);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    expect(r.findings.some((f) => f.category === 'sequence_gap')).toBe(true);
    const gap = r.findings.find((f) => f.category === 'sequence_gap');
    expect(gap?.expected).toBe('2');
  });

  it('mutated audit row → status=corrupted, chain finding', async () => {
    // Flip the action of seq=2 without recomputing self_hash. The
    // chain recompute will detect the mismatch.
    env.m.handle
      .prepare('UPDATE audit_events SET action = ? WHERE workspace_id = ? AND seq = 2')
      .run('event.MUTATED', WS);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    expect(r.findings.some((f) => f.category === 'chain')).toBe(true);
  });

  it('genesis missing (no seq=1) → status=unrecoverable, genesis_anchor finding', async () => {
    // Delete seq=1. The chain would now begin at seq=2 with a non-null
    // prev_hash referencing the missing seq=1.
    env.m.handle.prepare('DELETE FROM audit_events WHERE workspace_id = ? AND seq = 1').run(WS);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('unrecoverable');
    expect(r.findings.some((f) => f.category === 'genesis_anchor')).toBe(true);
  });

  it('blob missing for an audit row → status=corrupted, blob_missing finding', async () => {
    // Find a blob and delete it.
    const row = env.m.handle
      .prepare(
        'SELECT payload_hash FROM audit_events WHERE workspace_id = ? AND payload_hash IS NOT NULL LIMIT 1',
      )
      .get(WS) as { payload_hash: string };
    expect(row.payload_hash).toBeTruthy();
    const blobPath = path.join(
      env.dir,
      '.manthan/audit/blobs',
      row.payload_hash.slice(0, 2),
      `${row.payload_hash.slice(2)}.json`,
    );
    await rm(blobPath);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    expect(r.findings.some((f) => f.category === 'blob_missing')).toBe(true);
  });

  it('JSONL row not in SQLite → status=corrupted, jsonl_row_not_in_sqlite finding', async () => {
    // Append a fake JSONL line for a seq that does not exist in SQLite.
    const ghost = {
      workspace_id: WS,
      seq: 999,
      ts: new Date().toISOString(),
      actor: 'ghost',
      action: 'event.ghost',
      kind: 'system',
      payload_hash: null,
      decision: 'auto-approve',
      prev_hash: null,
      self_hash: 'a'.repeat(64),
    };
    await writeFile(
      env.jsonlPath,
      `${(await readFile(env.jsonlPath, 'utf8')).trimEnd()}\n${JsonCanon.stringify(ghost)}\n`,
    );

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    expect(r.findings.some((f) => f.category === 'jsonl_row_not_in_sqlite')).toBe(true);
  });

  it('JSONL field mismatch vs SQLite → status=corrupted, jsonl_field_mismatch finding', async () => {
    // Rewrite the JSONL line for seq=2 with a different actor.
    const raw = await readFile(env.jsonlPath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const lineForSeq2 = lines.findIndex((l) => {
      try {
        const p = JSON.parse(l) as { seq?: number; workspace_id?: string };
        return p.seq === 2 && p.workspace_id === WS;
      } catch {
        return false;
      }
    });
    expect(lineForSeq2).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(lines[lineForSeq2] as string) as Record<string, unknown>;
    parsed.actor = 'user:tampered';
    lines[lineForSeq2] = JsonCanon.stringify(parsed);
    await writeFile(env.jsonlPath, `${lines.join('\n')}\n`);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    const f = r.findings.find((x) => x.category === 'jsonl_field_mismatch');
    expect(f).toBeDefined();
    expect(f?.seq).toBe(2);
  });

  it('JSONL malformed interior line (not tail) → status=corrupted, jsonl_malformed_interior finding', async () => {
    // Insert a garbage line between seq=2 and seq=3.
    const raw = await readFile(env.jsonlPath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const idxSeq2 = lines.findIndex((l) => {
      try {
        return (JSON.parse(l) as { seq?: number }).seq === 2;
      } catch {
        return false;
      }
    });
    lines.splice(idxSeq2 + 1, 0, '{"this is not valid json');
    await writeFile(env.jsonlPath, `${lines.join('\n')}\n`);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status).toBe('corrupted');
    expect(r.findings.some((f) => f.category === 'jsonl_malformed_interior')).toBe(true);
  });

  it('tail-only malformed line → tolerated, status remains clean/partial', async () => {
    // Append a partial line at the very end. This is the standard P4
    // crash scenario the existing recovery handles.
    const raw = await readFile(env.jsonlPath, 'utf8');
    await writeFile(env.jsonlPath, `${raw}{"partial line, no newl`);

    const r = await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
    });
    expect(r.status === 'clean' || r.status === 'partial').toBe(true);
    expect(r.findings.some((f) => f.category === 'jsonl_malformed_interior')).toBe(false);
  });

  it('corruption findings are written to side-channel audit-corruption.log', async () => {
    env.m.handle.prepare('DELETE FROM audit_events WHERE workspace_id = ? AND seq = 2').run(WS);
    const corruptionLogPath = path.join(env.dir, '.manthan/audit-corruption.log');
    await mkdir(path.dirname(corruptionLogPath), { recursive: true });

    await runRecovery({
      db: env.m.handle,
      blobs: env.blobs,
      jsonlPath: env.jsonlPath,
      workspaceId: WS,
      corruptionLogPath,
    });

    const logRaw = await readFile(corruptionLogPath, 'utf8');
    const entry = JSON.parse(logRaw.trim()) as {
      status: string;
      workspace_id: string;
      findings: Array<{ category: string }>;
    };
    expect(entry.status).toBe('corrupted');
    expect(entry.workspace_id).toBe(WS);
    expect(entry.findings.some((f) => f.category === 'sequence_gap')).toBe(true);
  });
});
