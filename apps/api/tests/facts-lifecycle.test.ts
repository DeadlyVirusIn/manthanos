// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact lifecycle tests for Task 5B.
// Scenarios:
//   1.  version-chain creation
//   2.  multi-version lineage traversal
//   3.  history endpoint
//   4.  invalid transitions on superseded
//   5.  workspace isolation (revise / history)
//   6.  audit-chain participation (revise)
//   7.  contest lifecycle
//   8.  uncontest lifecycle
//   9.  contest/uncontest workspace isolation
//   10. contest/uncontest audit-chain participation
//   11. exclude_contested list filter
// Tombstone tests are added in commit 4.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-fact-lc-'));
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
  return (r.json() as { id: string }).id;
}

async function postFact(
  workspaceId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function getFact(
  workspaceId: string,
  factId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function patchFact(
  workspaceId: string,
  factId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'PATCH',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function promote(
  workspaceId: string,
  factId: string,
  body: object = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/promote`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function revise(
  workspaceId: string,
  factId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/revise`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function history(
  workspaceId: string,
  factId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/history`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function listFacts(
  workspaceId: string,
  query = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/facts${query}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function contest(
  workspaceId: string,
  factId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/contest`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function uncontest(
  workspaceId: string,
  factId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/uncontest`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

// ────────── 1. version-chain creation ──────────

describe('1 — version-chain creation', () => {
  it('first revise turns a singleton fact into a 2-version chain', async () => {
    const ws = await createWorkspace('Chain start');
    const v1 = await postFact(ws, { area: 'audience', statement: 'they use Toggl' });
    expect(v1.body.version_chain_root_id).toBeNull();
    expect(v1.body.superseded_by_fact_id).toBeNull();
    expect(v1.body.is_head).toBe(true);

    const r = await revise(ws, v1.body.id as string, {
      statement: 'they use Toggl and a spreadsheet',
    });
    expect(r.status).toBe(201);
    expect(r.body.previous_fact_id).toBe(v1.body.id);
    expect(r.body.version_chain_root_id).toBe(v1.body.id);
    const newFact = r.body.fact as Record<string, unknown>;
    expect(newFact.version_chain_root_id).toBe(v1.body.id);
    expect(newFact.superseded_by_fact_id).toBeNull();
    expect(newFact.is_head).toBe(true);

    // Predecessor now superseded.
    const old = await getFact(ws, v1.body.id as string);
    expect(old.body.superseded_by_fact_id).toBe(newFact.id);
    expect(old.body.is_head).toBe(false);
    expect(old.body.version_chain_root_id).toBe(v1.body.id);
  });

  it('revise inherits area when only statement is provided', async () => {
    const ws = await createWorkspace('Inherit area');
    const v1 = await postFact(ws, { area: 'X', statement: 'one' });
    const r = await revise(ws, v1.body.id as string, { statement: 'two' });
    const newFact = r.body.fact as Record<string, unknown>;
    expect(newFact.area).toBe('X');
    expect(newFact.statement).toBe('two');
  });

  it('revise rejects when neither area nor statement changes', async () => {
    const ws = await createWorkspace('Empty revise');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    const r = await revise(ws, v1.body.id as string, { area: 'x', statement: 'y' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('body');
  });

  it('revise rejects empty body (neither field provided)', async () => {
    const ws = await createWorkspace('No body');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    const r = await revise(ws, v1.body.id as string, {});
    expect(r.status).toBe(400);
  });

  it('revise rejects empty area or statement with 400', async () => {
    const ws = await createWorkspace('Bad revise');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    expect((await revise(ws, v1.body.id as string, { statement: '' })).status).toBe(400);
    expect((await revise(ws, v1.body.id as string, { area: '   ' })).status).toBe(400);
  });

  it('revise rejects when target hash collides with another live fact', async () => {
    const ws = await createWorkspace('Collide');
    const a = await postFact(ws, { area: 'x', statement: 'one' });
    const b = await postFact(ws, { area: 'x', statement: 'two' });
    const r = await revise(ws, b.body.id as string, { statement: 'one' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('duplicate_fact');
    expect(r.body.existing_fact_id).toBe(a.body.id);
  });
});

// ────────── 2. multi-version lineage traversal ──────────

describe('2 — multi-version lineage traversal', () => {
  it('builds a 4-version chain with stable root and walking head', async () => {
    const ws = await createWorkspace('Lineage');
    const v1 = await postFact(ws, { area: 'a', statement: 's1' });
    const rev1 = await revise(ws, v1.body.id as string, { statement: 's2' });
    const v2id = (rev1.body.fact as Record<string, unknown>).id as string;
    const rev2 = await revise(ws, v2id, { statement: 's3' });
    const v3id = (rev2.body.fact as Record<string, unknown>).id as string;
    const rev3 = await revise(ws, v3id, { statement: 's4' });
    const v4id = (rev3.body.fact as Record<string, unknown>).id as string;

    // Root id stays anchored at v1 across all revisions.
    expect(rev1.body.version_chain_root_id).toBe(v1.body.id);
    expect(rev2.body.version_chain_root_id).toBe(v1.body.id);
    expect(rev3.body.version_chain_root_id).toBe(v1.body.id);

    // Every prior version points at its immediate successor.
    expect((await getFact(ws, v1.body.id as string)).body.superseded_by_fact_id).toBe(v2id);
    expect((await getFact(ws, v2id)).body.superseded_by_fact_id).toBe(v3id);
    expect((await getFact(ws, v3id)).body.superseded_by_fact_id).toBe(v4id);
    expect((await getFact(ws, v4id)).body.superseded_by_fact_id).toBeNull();
    expect((await getFact(ws, v4id)).body.is_head).toBe(true);
  });

  it('default list returns only the head; include_superseded reveals the rest', async () => {
    const ws = await createWorkspace('List default');
    const v1 = await postFact(ws, { area: 'a', statement: 's1' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    await revise(ws, v1.body.id as string, { statement: 's2' }).catch(() => undefined); // no-op; v1 is now superseded
    // The above second revise attempts to revise v1 (now superseded) and
    // should fail; the chain has 2 facts: v1 (superseded) and v2 (head).

    const def = await listFacts(ws);
    expect(def.body.total).toBe(1); // only the head
    const all = await listFacts(ws, '?include_superseded=true');
    expect(all.body.total).toBe(2);
  });
});

// ────────── 3. history endpoint ──────────

describe('3 — history endpoint', () => {
  it('returns the singleton chain for a never-revised fact', async () => {
    const ws = await createWorkspace('Singleton history');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    const h = await history(ws, v1.body.id as string);
    expect(h.status).toBe(200);
    expect(h.body.root_id).toBe(v1.body.id);
    expect(h.body.head_id).toBe(v1.body.id);
    expect(h.body.total_versions).toBe(1);
    const versions = h.body.versions as Array<{ position: number; fact: Record<string, unknown> }>;
    expect(versions.length).toBe(1);
    expect(versions[0]?.position).toBe(0);
    expect(versions[0]?.fact.id).toBe(v1.body.id);
  });

  it('walks a 3-version chain root → head in order', async () => {
    const ws = await createWorkspace('Walk chain');
    const v1 = await postFact(ws, { area: 'a', statement: 's1' });
    const r1 = await revise(ws, v1.body.id as string, { statement: 's2' });
    const v2id = (r1.body.fact as Record<string, unknown>).id as string;
    const r2 = await revise(ws, v2id, { statement: 's3' });
    const v3id = (r2.body.fact as Record<string, unknown>).id as string;

    // From the root.
    const fromRoot = await history(ws, v1.body.id as string);
    expect(fromRoot.body.root_id).toBe(v1.body.id);
    expect(fromRoot.body.head_id).toBe(v3id);
    expect(fromRoot.body.total_versions).toBe(3);
    const versions = fromRoot.body.versions as Array<{
      position: number;
      fact: Record<string, unknown>;
    }>;
    expect(versions.map((v) => v.fact.id)).toEqual([v1.body.id, v2id, v3id]);
    expect(versions.map((v) => v.position)).toEqual([0, 1, 2]);

    // From the head — same response.
    const fromHead = await history(ws, v3id);
    expect(fromHead.body.root_id).toBe(v1.body.id);
    expect(fromHead.body.head_id).toBe(v3id);

    // From an intermediate version — also same response.
    const fromMid = await history(ws, v2id);
    expect(fromMid.body.total_versions).toBe(3);
  });

  it('returns 404 for an unknown fact id', async () => {
    const ws = await createWorkspace('No fact history');
    const r = await history(ws, 'fact-does-not-exist');
    expect(r.status).toBe(404);
  });

  it('returns 404 against an unknown workspace', async () => {
    const r = await history('ws-nope', 'fact-x');
    expect(r.status).toBe(404);
  });
});

// ────────── 4. invalid transitions on superseded ──────────

describe('4 — superseded versions are read-only', () => {
  it('PATCH on a superseded fact returns 409 invalid_lifecycle', async () => {
    const ws = await createWorkspace('Patch superseded');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    const r = await patchFact(ws, v1.body.id as string, { statement: 's1 corrected' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('superseded');
  });

  it('promote on a superseded fact returns 409', async () => {
    const ws = await createWorkspace('Promote superseded');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    const r = await promote(ws, v1.body.id as string);
    expect(r.status).toBe(409);
  });

  it('revising a superseded fact returns 409 (revise the head instead)', async () => {
    const ws = await createWorkspace('Revise superseded');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    const r1 = await revise(ws, v1.body.id as string, { statement: 's2' });
    const v2id = (r1.body.fact as Record<string, unknown>).id as string;
    // Try to revise v1 (now superseded) — should be blocked.
    const r2 = await revise(ws, v1.body.id as string, { statement: 's2b' });
    expect(r2.status).toBe(409);
    expect(r2.body.state).toBe('superseded');
    // Revising the head should still work.
    const r3 = await revise(ws, v2id, { statement: 's3' });
    expect(r3.status).toBe(201);
  });
});

// ────────── 5. workspace isolation ──────────

describe('5 — workspace isolation', () => {
  it('revise / history against another workspace return 404', async () => {
    const wsA = await createWorkspace('WsA');
    const wsB = await createWorkspace('WsB');
    const f = await postFact(wsA, { area: 'x', statement: 'y' });
    expect((await revise(wsB, f.body.id as string, { statement: 'z' })).status).toBe(404);
    expect((await history(wsB, f.body.id as string)).status).toBe(404);
  });

  it('the same chain root id can exist in two workspaces independently', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const a = await postFact(wsA, { area: 'x', statement: 'same' });
    const b = await postFact(wsB, { area: 'x', statement: 'same' });
    await revise(wsA, a.body.id as string, { statement: 'same+a' });
    await revise(wsB, b.body.id as string, { statement: 'same+b' });

    const hA = await history(wsA, a.body.id as string);
    const hB = await history(wsB, b.body.id as string);
    expect(hA.body.total_versions).toBe(2);
    expect(hB.body.total_versions).toBe(2);
    expect(hA.body.root_id).toBe(a.body.id);
    expect(hB.body.root_id).toBe(b.body.id);
  });
});

// ────────── 6. audit-chain participation ──────────

describe('6 — audit-chain participation', () => {
  it('each revise emits a fact.revise event in the correct order', async () => {
    const ws = await createWorkspace('Audit revise');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    const v2 = ((await listFacts(ws)).body.facts as Array<{ id: string }>)[0];
    if (!v2) throw new Error('expected head version');
    await revise(ws, v2.id, { statement: 's3' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT seq, action FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'fact.%' ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ seq: number; action: string }>;
    expect(events.map((e) => e.action)).toEqual(['fact.create', 'fact.revise', 'fact.revise']);
  });

  it('fact.revise payload contains chain info, diff, and hashes', async () => {
    const ws = await createWorkspace('Audit revise payload');
    const v1 = await postFact(ws, { area: 'A', statement: 's1' });
    const rev = await revise(ws, v1.body.id as string, { area: 'B', statement: 's2' });

    // Locate the audit seq for the revise event.
    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const reviseRow = substrate.db.handle
      .prepare(`SELECT seq FROM audit_events WHERE workspace_id = ? AND action = 'fact.revise'`)
      .get(ws) as { seq: number };
    const eventResp = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws}/audit/${reviseRow.seq}`,
      headers: { host: '127.0.0.1' },
    });
    const payload = (eventResp.json() as Record<string, unknown>).payload as Record<
      string,
      unknown
    >;
    expect(payload.previous_fact_id).toBe(v1.body.id);
    expect(payload.new_fact_id).toBe((rev.body.fact as Record<string, unknown>).id);
    expect(payload.version_chain_root_id).toBe(v1.body.id);
    expect(Array.isArray(payload.changes)).toBe(true);
    expect((payload.changes as unknown[]).length).toBe(2); // area + statement both changed
    expect(payload.previous_statement_hash).toBe(v1.body.statement_hash);
    expect(payload.new_statement_hash).toBe(
      (rev.body.fact as Record<string, unknown>).statement_hash,
    );
  });
});

// ────────── 7. contest lifecycle ──────────

describe('7 — contest lifecycle', () => {
  it('contesting stamps contested_at and contested_reason and sets is_contested', async () => {
    const ws = await createWorkspace('Contest happy');
    const v1 = await postFact(ws, { area: 'x', statement: 'disputed claim' });
    expect(v1.body.is_contested).toBe(false);

    const r = await contest(ws, v1.body.id as string, { reason: 'conflicting evidence' });
    expect(r.status).toBe(200);
    const fact = r.body.fact as Record<string, unknown>;
    expect(typeof fact.contested_at).toBe('string');
    expect(fact.contested_reason).toBe('conflicting evidence');
    expect(fact.is_contested).toBe(true);
    expect(fact.is_head).toBe(true);
    expect(fact.tier).toBe('T0');
  });

  it('contesting an already-contested fact returns 409', async () => {
    const ws = await createWorkspace('Double contest');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'first' });
    const r = await contest(ws, v1.body.id as string, { reason: 'second' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('contested');
  });

  it('contest requires a string reason', async () => {
    const ws = await createWorkspace('Missing reason');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    const r = await contest(ws, v1.body.id as string, {});
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('reason');
  });

  it('contest rejects empty or whitespace-only reason', async () => {
    const ws = await createWorkspace('Empty reason');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    expect((await contest(ws, v1.body.id as string, { reason: '' })).status).toBe(400);
    expect((await contest(ws, v1.body.id as string, { reason: '   ' })).status).toBe(400);
  });

  it('contest on a superseded fact returns 409 invalid_lifecycle', async () => {
    const ws = await createWorkspace('Contest superseded');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    const r = await contest(ws, v1.body.id as string, { reason: 'too late' });
    expect(r.status).toBe(409);
    expect(r.body.state).toBe('superseded');
  });

  it('a contested fact is still listable by default', async () => {
    const ws = await createWorkspace('Contested listable');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'flag' });
    const list = await listFacts(ws);
    expect(list.body.total).toBe(1);
  });
});

// ────────── 8. uncontest lifecycle ──────────

describe('8 — uncontest lifecycle', () => {
  it('uncontesting clears contested_at and contested_reason', async () => {
    const ws = await createWorkspace('Uncontest happy');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'flag' });
    const r = await uncontest(ws, v1.body.id as string, { resolution: 'evidence verified' });
    expect(r.status).toBe(200);
    const fact = r.body.fact as Record<string, unknown>;
    expect(fact.contested_at).toBeNull();
    expect(fact.contested_reason).toBeNull();
    expect(fact.is_contested).toBe(false);
  });

  it('uncontesting a non-contested fact returns 409', async () => {
    const ws = await createWorkspace('Uncontest clean');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    const r = await uncontest(ws, v1.body.id as string, { resolution: 'nothing to clear' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('not_contested');
  });

  it('uncontest requires a string resolution', async () => {
    const ws = await createWorkspace('Missing resolution');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'flag' });
    const r = await uncontest(ws, v1.body.id as string, {});
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('resolution');
  });

  it('uncontest rejects empty or whitespace-only resolution', async () => {
    const ws = await createWorkspace('Empty resolution');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'flag' });
    expect((await uncontest(ws, v1.body.id as string, { resolution: '' })).status).toBe(400);
    expect((await uncontest(ws, v1.body.id as string, { resolution: '  ' })).status).toBe(400);
  });

  it('uncontest on a superseded fact returns 409', async () => {
    const ws = await createWorkspace('Uncontest superseded');
    const v1 = await postFact(ws, { area: 'x', statement: 's1' });
    await contest(ws, v1.body.id as string, { reason: 'flag' });
    await revise(ws, v1.body.id as string, { statement: 's2' });
    const r = await uncontest(ws, v1.body.id as string, { resolution: 'resolved' });
    expect(r.status).toBe(409);
    expect(r.body.state).toBe('superseded');
  });

  it('round-trip: contest → uncontest → contest is allowed', async () => {
    const ws = await createWorkspace('Round trip');
    const v1 = await postFact(ws, { area: 'x', statement: 'y' });
    await contest(ws, v1.body.id as string, { reason: 'r1' });
    await uncontest(ws, v1.body.id as string, { resolution: 'cleared' });
    const r = await contest(ws, v1.body.id as string, { reason: 'r2' });
    expect(r.status).toBe(200);
    expect((r.body.fact as Record<string, unknown>).contested_reason).toBe('r2');
  });
});

// ────────── 9. contest/uncontest workspace isolation ──────────

describe('9 — contest/uncontest workspace isolation', () => {
  it('contest against another workspace returns 404', async () => {
    const wsA = await createWorkspace('IsoContestA');
    const wsB = await createWorkspace('IsoContestB');
    const f = await postFact(wsA, { area: 'x', statement: 'y' });
    expect((await contest(wsB, f.body.id as string, { reason: 'cross' })).status).toBe(404);
  });

  it('uncontest against another workspace returns 404', async () => {
    const wsA = await createWorkspace('IsoUncontestA');
    const wsB = await createWorkspace('IsoUncontestB');
    const f = await postFact(wsA, { area: 'x', statement: 'y' });
    await contest(wsA, f.body.id as string, { reason: 'flag' });
    expect((await uncontest(wsB, f.body.id as string, { resolution: 'cross' })).status).toBe(404);
  });
});

// ────────── 10. contest/uncontest audit-chain participation ──────────

describe('10 — contest/uncontest audit-chain participation', () => {
  it('contest emits a fact.contest event whose payload carries the reason', async () => {
    const ws = await createWorkspace('Audit contest');
    const v1 = await postFact(ws, { area: 'a', statement: 's' });
    await contest(ws, v1.body.id as string, { reason: 'audit me' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(`SELECT seq FROM audit_events WHERE workspace_id = ? AND action = 'fact.contest'`)
      .get(ws) as { seq: number };
    const eventResp = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws}/audit/${row.seq}`,
      headers: { host: '127.0.0.1' },
    });
    const payload = (eventResp.json() as Record<string, unknown>).payload as Record<
      string,
      unknown
    >;
    expect(payload.fact_id).toBe(v1.body.id);
    expect(payload.reason).toBe('audit me');
    expect(typeof payload.contested_at).toBe('string');
  });

  it('uncontest emits a fact.uncontest event that preserves the previous contestation', async () => {
    const ws = await createWorkspace('Audit uncontest');
    const v1 = await postFact(ws, { area: 'a', statement: 's' });
    await contest(ws, v1.body.id as string, { reason: 'initial flag' });
    await uncontest(ws, v1.body.id as string, { resolution: 'all clear' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(`SELECT seq FROM audit_events WHERE workspace_id = ? AND action = 'fact.uncontest'`)
      .get(ws) as { seq: number };
    const eventResp = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws}/audit/${row.seq}`,
      headers: { host: '127.0.0.1' },
    });
    const payload = (eventResp.json() as Record<string, unknown>).payload as Record<
      string,
      unknown
    >;
    expect(payload.fact_id).toBe(v1.body.id);
    expect(payload.resolution).toBe('all clear');
    expect(payload.previous_contested_reason).toBe('initial flag');
    expect(typeof payload.previous_contested_at).toBe('string');
  });

  it('events appear in the correct chronological order', async () => {
    const ws = await createWorkspace('Audit order');
    const v1 = await postFact(ws, { area: 'a', statement: 's' });
    await contest(ws, v1.body.id as string, { reason: 'r1' });
    await uncontest(ws, v1.body.id as string, { resolution: 'cleared' });
    await contest(ws, v1.body.id as string, { reason: 'r2' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT seq, action FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'fact.%' ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ seq: number; action: string }>;
    expect(events.map((e) => e.action)).toEqual([
      'fact.create',
      'fact.contest',
      'fact.uncontest',
      'fact.contest',
    ]);
  });
});

// ────────── 11. exclude_contested list filter ──────────

describe('11 — exclude_contested list filter', () => {
  it('default list includes contested facts', async () => {
    const ws = await createWorkspace('Default contested');
    await postFact(ws, { area: 'x', statement: 'clean' });
    const b = await postFact(ws, { area: 'x', statement: 'flagged' });
    await contest(ws, b.body.id as string, { reason: 'flag' });
    const r = await listFacts(ws);
    expect(r.body.total).toBe(2);
  });

  it('?exclude_contested=true hides contested facts', async () => {
    const ws = await createWorkspace('Exclude contested');
    const a = await postFact(ws, { area: 'x', statement: 'clean' });
    const b = await postFact(ws, { area: 'x', statement: 'flagged' });
    await contest(ws, b.body.id as string, { reason: 'flag' });
    const r = await listFacts(ws, '?exclude_contested=true');
    expect(r.body.total).toBe(1);
    const facts = r.body.facts as Array<{ id: string }>;
    expect(facts[0]?.id).toBe(a.body.id);
  });

  it('after uncontesting, the fact reappears under exclude_contested=true', async () => {
    const ws = await createWorkspace('Reappear');
    const a = await postFact(ws, { area: 'x', statement: 'flagged' });
    await contest(ws, a.body.id as string, { reason: 'flag' });
    expect((await listFacts(ws, '?exclude_contested=true')).body.total).toBe(0);
    await uncontest(ws, a.body.id as string, { resolution: 'cleared' });
    expect((await listFacts(ws, '?exclude_contested=true')).body.total).toBe(1);
  });
});
