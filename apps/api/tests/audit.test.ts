// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Audit chain HTTP read tests.
// Covers Sprint 1 Task 4's 7 required scenarios: pagination, filtering,
// missing seq, valid chain, tampered chain, empty chain, large-chain
// traversal — plus a few targeted edge cases.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-audit-'));
  handle = await createDaemon({
    config: {
      port: 0,
      host: '127.0.0.1',
      logLevel: 'silent',
      workspaceRoot,
    },
    noListen: true,
  });
});

afterEach(async () => {
  await handle.shutdown().catch(() => undefined);
  await rm(workspaceRoot, { recursive: true, force: true });
});

async function createWorkspace(name: string): Promise<string> {
  const r = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/workspaces',
    headers: { host: '127.0.0.1' },
    payload: { name },
  });
  const body = r.json() as { id: string };
  return body.id;
}

async function patchWorkspace(id: string, body: object): Promise<void> {
  await handle.app.inject({
    method: 'PATCH',
    url: `/api/v1/workspaces/${id}`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
}

async function listAudit(
  id: string,
  query = '',
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${id}/audit${query}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function getAuditEntry(
  id: string,
  seq: number | string,
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${id}/audit/${seq}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function verifyAudit(id: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${id}/audit/verify`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

describe('GET /api/v1/workspaces/:id/audit — list', () => {
  it('returns 404 for unknown workspace', async () => {
    const r = await listAudit('ws-nope');
    expect(r.status).toBe(404);
  });

  it('returns empty events for a workspace with no events (empty chain)', async () => {
    // Insert a workspace row directly so the FK passes but no audit events exist.
    handle.substrate?.db.handle
      .prepare(
        `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
         VALUES (?, ?, ?, 'active', 3, 0)`,
      )
      .run('ws-bare', '/tmp/bare', new Date().toISOString());
    const r = await listAudit('ws-bare');
    expect(r.status).toBe(200);
    expect(r.body.events).toEqual([]);
    expect(r.body.head_seq).toBeNull();
    expect(r.body.has_more).toBe(false);
  });

  it('returns events newest-first', async () => {
    const id = await createWorkspace('Newest first');
    await patchWorkspace(id, { name: 'Second' });
    await patchWorkspace(id, { status: 'paused' });

    const r = await listAudit(id);
    expect(r.status).toBe(200);
    const events = r.body.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(3);
    // seq 3, 2, 1.
    expect(events.map((e) => e.seq)).toEqual([3, 2, 1]);
    expect(events[0]?.event_type).toBe('workspace.update');
    expect(events[events.length - 1]?.event_type).toBe('workspace.create');
    expect(r.body.head_seq).toBe(3);
  });

  it('paginates with limit + before_seq', async () => {
    const id = await createWorkspace('Page me');
    for (let i = 0; i < 10; i++) {
      await patchWorkspace(id, { name: `iteration ${i}` });
    }
    // Now 11 events total (1 create + 10 updates).
    const first = await listAudit(id, '?limit=5');
    expect(first.status).toBe(200);
    expect((first.body.events as unknown[]).length).toBe(5);
    expect(first.body.has_more).toBe(true);
    expect(first.body.head_seq).toBe(11);
    expect((first.body.events as Array<{ seq: number }>)[0]?.seq).toBe(11);
    expect((first.body.events as Array<{ seq: number }>)[4]?.seq).toBe(7);
    expect(first.body.next_before_seq).toBe(7);

    const second = await listAudit(id, `?limit=5&before_seq=${first.body.next_before_seq}`);
    expect((second.body.events as Array<{ seq: number }>)[0]?.seq).toBe(6);
    expect((second.body.events as Array<{ seq: number }>)[4]?.seq).toBe(2);
    expect(second.body.has_more).toBe(true);

    const third = await listAudit(id, `?limit=5&before_seq=${second.body.next_before_seq}`);
    expect((third.body.events as Array<{ seq: number }>).length).toBe(1);
    expect((third.body.events as Array<{ seq: number }>)[0]?.seq).toBe(1);
    expect(third.body.has_more).toBe(false);
    expect(third.body.next_before_seq).toBeNull();
  });

  it('rejects invalid limit/before_seq with 400', async () => {
    const id = await createWorkspace('Bad query');
    const r1 = await listAudit(id, '?limit=abc');
    expect(r1.status).toBe(400);
    expect(r1.body.field).toBe('limit');
    const r2 = await listAudit(id, '?before_seq=-1');
    expect(r2.status).toBe(400);
    expect(r2.body.field).toBe('before_seq');
  });

  it('filters by event_type', async () => {
    const id = await createWorkspace('Filter type');
    await patchWorkspace(id, { name: 'one' });
    await patchWorkspace(id, { name: 'two' });

    const r = await listAudit(id, '?event_type=workspace.create');
    const events = r.body.events as Array<{ event_type: string }>;
    expect(events.length).toBe(1);
    expect(events[0]?.event_type).toBe('workspace.create');

    const r2 = await listAudit(id, '?event_type=workspace.update');
    expect((r2.body.events as unknown[]).length).toBe(2);
  });

  it('filters by actor', async () => {
    const id = await createWorkspace('Filter actor');
    await patchWorkspace(id, { name: 'one' });

    // All current events are authored by 'user'. A query for an unknown
    // actor returns zero events.
    const r1 = await listAudit(id, '?actor=user');
    expect((r1.body.events as unknown[]).length).toBe(2);

    const r2 = await listAudit(id, '?actor=robot');
    expect((r2.body.events as unknown[]).length).toBe(0);
  });

  it('filters by date range (since/until)', async () => {
    const id = await createWorkspace('Filter dates');
    // Capture a midpoint before the next mutation.
    await new Promise((r) => setTimeout(r, 10));
    const midpoint = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));
    await patchWorkspace(id, { name: 'after midpoint' });

    const after = await listAudit(id, `?since=${encodeURIComponent(midpoint)}`);
    expect((after.body.events as unknown[]).length).toBe(1);
    expect((after.body.events as Array<{ event_type: string }>)[0]?.event_type).toBe(
      'workspace.update',
    );

    const before = await listAudit(id, `?until=${encodeURIComponent(midpoint)}`);
    expect((before.body.events as unknown[]).length).toBe(1);
    expect((before.body.events as Array<{ event_type: string }>)[0]?.event_type).toBe(
      'workspace.create',
    );
  });

  it('rejects malformed since/until with 400', async () => {
    const id = await createWorkspace('Date format');
    const r = await listAudit(id, '?since=notadate');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('since');
  });

  it('combines filters', async () => {
    const id = await createWorkspace('Combined');
    await patchWorkspace(id, { name: 'x' });
    await patchWorkspace(id, { name: 'y' });
    const r = await listAudit(id, '?event_type=workspace.update&actor=user&limit=10');
    expect((r.body.events as unknown[]).length).toBe(2);
  });
});

describe('GET /api/v1/workspaces/:id/audit/:seq — single', () => {
  it('returns the single event with full payload', async () => {
    const id = await createWorkspace('Single');
    const r = await getAuditEntry(id, 1);
    expect(r.status).toBe(200);
    expect(r.body.seq).toBe(1);
    expect(r.body.event_type).toBe('workspace.create');
    expect(r.body.actor).toBe('user');
    expect(typeof r.body.timestamp).toBe('string');
    expect(r.body.prev_hash).toBeNull();
    expect(typeof r.body.self_hash).toBe('string');
    expect(r.body.payload_resolved).toBe('present');
    const payload = r.body.payload as Record<string, unknown>;
    expect(payload.workspace_id).toBe(id);
    expect(payload.name).toBe('Single');
  });

  it('returns 404 for missing seq', async () => {
    const id = await createWorkspace('Missing seq');
    const r = await getAuditEntry(id, 999);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('returns 400 for non-integer seq', async () => {
    const id = await createWorkspace('Non-int seq');
    const r = await getAuditEntry(id, 'abc');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('seq');
  });

  it('returns 400 for seq < 1', async () => {
    const id = await createWorkspace('Zero seq');
    const r = await getAuditEntry(id, '0');
    expect(r.status).toBe(400);
  });

  it('returns 404 for unknown workspace', async () => {
    const r = await getAuditEntry('ws-nope', 1);
    expect(r.status).toBe(404);
  });

  it('subsequent event prev_hash matches previous event self_hash', async () => {
    const id = await createWorkspace('Chain links');
    await patchWorkspace(id, { name: 'second' });
    const first = await getAuditEntry(id, 1);
    const second = await getAuditEntry(id, 2);
    expect(second.body.prev_hash).toBe(first.body.self_hash);
  });

  it('reports missing_blob when the blob file is gone', async () => {
    const id = await createWorkspace('Missing blob');
    // Look up the payload hash for seq=1, then remove the blob file.
    const row = handle.substrate?.db.handle
      .prepare('SELECT payload_hash FROM audit_events WHERE workspace_id = ? AND seq = ?')
      .get(id, 1) as { payload_hash: string };
    const blobPath = handle.substrate?.blobs.pathFor(row.payload_hash);
    const { unlink } = await import('node:fs/promises');
    await unlink(blobPath);

    const r = await getAuditEntry(id, 1);
    expect(r.status).toBe(200);
    expect(r.body.payload).toBeNull();
    expect(r.body.payload_resolved).toBe('missing_blob');
  });
});

describe('GET /api/v1/workspaces/:id/audit/verify — integrity', () => {
  it('returns valid for a fresh workspace chain', async () => {
    const id = await createWorkspace('Valid chain');
    await patchWorkspace(id, { name: 'second' });
    await patchWorkspace(id, { status: 'paused' });

    const r = await verifyAudit(id);
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.head_seq).toBe(3);
    expect(r.body.total_events).toBe(3);
    expect(r.body.broken_at_seq).toBeNull();
  });

  it('returns valid for an empty chain', async () => {
    handle.substrate?.db.handle
      .prepare(
        `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
         VALUES (?, ?, ?, 'active', 3, 0)`,
      )
      .run('ws-empty', '/tmp/empty', new Date().toISOString());
    const r = await verifyAudit('ws-empty');
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.head_seq).toBeNull();
    expect(r.body.total_events).toBe(0);
    expect(r.body.broken_at_seq).toBeNull();
  });

  it('detects tampering by mutating an event in place', async () => {
    const id = await createWorkspace('Tamper me');
    await patchWorkspace(id, { name: 'will be tampered' });
    await patchWorkspace(id, { name: 'three' });

    // Pre-tamper: chain is valid.
    expect((await verifyAudit(id)).body.valid).toBe(true);

    // Tamper: change the recorded actor on seq=2 to corrupt its self_hash
    // implicitly (the self_hash on disk now doesn't match the body).
    handle.substrate?.db.handle
      .prepare('UPDATE audit_events SET actor = ? WHERE workspace_id = ? AND seq = ?')
      .run('attacker', id, 2);

    const r = await verifyAudit(id);
    expect(r.body.valid).toBe(false);
    expect(r.body.head_seq).toBe(3);
    expect(r.body.total_events).toBe(3);
    // verifyChain recomputes each event's self_hash from its body; when
    // seq=2's body was tampered, the computed self_hash diverges from the
    // stored value at seq=2 itself.
    expect(r.body.broken_at_seq).toBe(2);
  });

  it('detects a self_hash mutation directly at the tampered event', async () => {
    const id = await createWorkspace('Hash tamper');
    await patchWorkspace(id, { name: 'second' });
    await patchWorkspace(id, { name: 'third' });

    // Overwrite seq=2's self_hash with garbage. verifyChain recomputes
    // self_hash from the body and sees the mismatch at seq=2.
    handle.substrate?.db.handle
      .prepare('UPDATE audit_events SET self_hash = ? WHERE workspace_id = ? AND seq = ?')
      .run('deadbeef'.repeat(8), id, 2);

    const r = await verifyAudit(id);
    expect(r.body.valid).toBe(false);
    expect(r.body.broken_at_seq).toBe(2);
  });

  it('detects a prev_hash mutation at the tampered event itself', async () => {
    // When prev_hash is corrupted, verifyChain's prev_hash continuity
    // check fails at that event (before reaching the self_hash check).
    const id = await createWorkspace('Prev tamper');
    await patchWorkspace(id, { name: 'second' });
    handle.substrate?.db.handle
      .prepare('UPDATE audit_events SET prev_hash = ? WHERE workspace_id = ? AND seq = ?')
      .run('deadbeef'.repeat(8), id, 2);

    const r = await verifyAudit(id);
    expect(r.body.valid).toBe(false);
    expect(r.body.broken_at_seq).toBe(2);
    expect(r.body.actual_prev_hash).toBe('deadbeef'.repeat(8));
  });

  it('returns 404 for unknown workspace', async () => {
    const r = await verifyAudit('ws-nope');
    expect(r.status).toBe(404);
  });
});

describe('large-chain traversal', () => {
  it('handles a 250-event chain end-to-end via pagination', async () => {
    const id = await createWorkspace('Large');
    // 1 create + 249 updates = 250 events.
    for (let i = 0; i < 249; i++) {
      await patchWorkspace(id, { name: `iter-${i}` });
    }

    // Verify in one shot.
    const verify = await verifyAudit(id);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.head_seq).toBe(250);
    expect(verify.body.total_events).toBe(250);

    // Page through with limit=50.
    const collected: number[] = [];
    let beforeSeq: number | null = null;
    while (true) {
      const q = beforeSeq === null ? '?limit=50' : `?limit=50&before_seq=${beforeSeq}`;
      const page = await listAudit(id, q);
      const events = page.body.events as Array<{ seq: number }>;
      for (const e of events) {
        collected.push(e.seq);
      }
      if (!page.body.has_more) break;
      beforeSeq = page.body.next_before_seq as number;
    }
    // We expect every seq from 250 down to 1, in order.
    expect(collected.length).toBe(250);
    expect(collected[0]).toBe(250);
    expect(collected[collected.length - 1]).toBe(1);
    // Strictly monotonically decreasing.
    for (let i = 1; i < collected.length; i++) {
      const prev = collected[i - 1];
      if (prev === undefined) throw new Error('unreachable');
      expect(collected[i]).toBe(prev - 1);
    }
  }, 30_000);
});
