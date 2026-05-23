// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact API tests. Covers Sprint 1 Task 5A's 8 required scenarios:
// CRUD lifecycle, tier promotion, tier demotion, invalid transitions,
// duplicate facts, workspace isolation, audit-chain participation,
// pagination/filtering — plus targeted edge cases.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-facts-'));
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

async function demote(
  workspaceId: string,
  factId: string,
  body: object = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/demote`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

describe('1 — CRUD lifecycle', () => {
  it('creates, reads, updates, lists in sequence', async () => {
    const ws = await createWorkspace('CRUD');
    // Create
    const created = await postFact(ws, {
      area: 'audience-workflow',
      statement: 'Hourly designers manually track profitability',
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^fact-/);
    expect(created.body.tier).toBe('T0');
    expect(created.body.confidence).toBeCloseTo(0.3);
    expect(typeof created.body.statement_hash).toBe('string');
    expect((created.body.statement_hash as string).length).toBe(64);

    // Read
    const fetched = await getFact(ws, created.body.id as string);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
    expect(fetched.body.area).toBe('audience-workflow');

    // Update
    const updated = await patchFact(ws, created.body.id as string, {
      statement: 'Hourly designers manually track profitability via spreadsheets',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.statement).toBe(
      'Hourly designers manually track profitability via spreadsheets',
    );
    // Hash must change when statement changes.
    expect(updated.body.statement_hash).not.toBe(created.body.statement_hash);

    // List
    const list = await listFacts(ws);
    expect(list.status).toBe(200);
    expect((list.body.facts as unknown[]).length).toBe(1);
    expect(list.body.total).toBe(1);
  });

  it('rejects empty area or statement with 400', async () => {
    const ws = await createWorkspace('Reject empties');
    const r1 = await postFact(ws, { area: '', statement: 'x' });
    expect(r1.status).toBe(400);
    expect(r1.body.field).toBe('area');

    const r2 = await postFact(ws, { area: 'x', statement: '   ' });
    expect(r2.status).toBe(400);
    expect(r2.body.field).toBe('statement');
  });

  it('rejects missing required fields with 400', async () => {
    const ws = await createWorkspace('Reject missing');
    const r1 = await postFact(ws, { area: 'x' });
    expect(r1.status).toBe(400);
    expect(r1.body.field).toBe('statement');
    const r2 = await postFact(ws, { statement: 'y' });
    expect(r2.status).toBe(400);
    expect(r2.body.field).toBe('area');
  });

  it('returns 404 when fetching unknown fact', async () => {
    const ws = await createWorkspace('Unknown fact');
    const r = await getFact(ws, 'fact-does-not-exist');
    expect(r.status).toBe(404);
  });

  it('PATCH no-op leaves the fact unchanged and writes no audit event', async () => {
    const ws = await createWorkspace('No-op patch');
    const created = await postFact(ws, { area: 'x', statement: 'y' });
    const before = created.body.audit_seq as number;
    const r = await patchFact(ws, created.body.id as string, {});
    expect(r.status).toBe(200);
    expect(r.body.audit_seq).toBe(before);
  });
});

describe('2 — tier promotion', () => {
  it('promotes T0 → T+1 by default', async () => {
    const ws = await createWorkspace('Promote');
    const f = await postFact(ws, { area: 'x', statement: 'y' });
    const r = await promote(ws, f.body.id as string, { note: 'corroborated' });
    expect(r.status).toBe(200);
    expect(r.body.from_tier).toBe('T0');
    expect(r.body.to_tier).toBe('T+1');
    expect((r.body.fact as Record<string, unknown>).tier).toBe('T+1');
    expect((r.body.fact as Record<string, unknown>).confidence).toBeCloseTo(0.7);
  });

  it('promotes step by step from T-2 → T-1 → T0 → T+1', async () => {
    const ws = await createWorkspace('Step promote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T-2' });
    const p1 = await promote(ws, f.body.id as string);
    expect(p1.body.to_tier).toBe('T-1');
    const p2 = await promote(ws, f.body.id as string);
    expect(p2.body.to_tier).toBe('T0');
    const p3 = await promote(ws, f.body.id as string);
    expect(p3.body.to_tier).toBe('T+1');
  });

  it('promote at the ceiling (T+1) is a no-op (200, no audit bump)', async () => {
    const ws = await createWorkspace('Ceiling promote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T+1' });
    const seqBefore = f.body.audit_seq as number;
    const r = await promote(ws, f.body.id as string);
    expect(r.status).toBe(200);
    expect(r.body.from_tier).toBe('T+1');
    expect(r.body.to_tier).toBe('T+1');
    // Audit seq did not advance.
    const fetched = await getFact(ws, f.body.id as string);
    expect(fetched.body.audit_seq).toBe(seqBefore);
  });

  it('promote sets last_corroborated (corroboration semantics)', async () => {
    const ws = await createWorkspace('Corroboration');
    const f = await postFact(ws, { area: 'x', statement: 'y' });
    const corrBefore = f.body.last_corroborated as string;
    await new Promise((r) => setTimeout(r, 5));
    const r = await promote(ws, f.body.id as string);
    const corrAfter = (r.body.fact as Record<string, unknown>).last_corroborated as string;
    expect(Date.parse(corrAfter)).toBeGreaterThan(Date.parse(corrBefore));
  });
});

describe('3 — tier demotion', () => {
  it('demotes T+1 → T0 by default', async () => {
    const ws = await createWorkspace('Demote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T+1' });
    const r = await demote(ws, f.body.id as string, { reason: 'contradicted' });
    expect(r.status).toBe(200);
    expect(r.body.from_tier).toBe('T+1');
    expect(r.body.to_tier).toBe('T0');
  });

  it('demotes step by step from T+1 → T0 → T-1 → T-2', async () => {
    const ws = await createWorkspace('Step demote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T+1' });
    const d1 = await demote(ws, f.body.id as string);
    expect(d1.body.to_tier).toBe('T0');
    const d2 = await demote(ws, f.body.id as string);
    expect(d2.body.to_tier).toBe('T-1');
    const d3 = await demote(ws, f.body.id as string);
    expect(d3.body.to_tier).toBe('T-2');
  });

  it('demote at the floor (T-2) is a no-op (200)', async () => {
    const ws = await createWorkspace('Floor demote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T-2' });
    const r = await demote(ws, f.body.id as string);
    expect(r.status).toBe(200);
    expect(r.body.from_tier).toBe('T-2');
    expect(r.body.to_tier).toBe('T-2');
  });

  it('demote does NOT advance last_corroborated (administrative touch)', async () => {
    const ws = await createWorkspace('Touch only');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T+1' });
    const corrBefore = f.body.last_corroborated as string;
    await new Promise((r) => setTimeout(r, 5));
    const r = await demote(ws, f.body.id as string);
    const fact = r.body.fact as Record<string, unknown>;
    expect(fact.last_corroborated).toBe(corrBefore);
    // But last_administratively_touched DID advance.
    expect(Date.parse(fact.last_administratively_touched as string)).toBeGreaterThan(
      Date.parse(corrBefore),
    );
  });
});

describe('4 — invalid tier transitions', () => {
  it('rejects promote with a target_tier <= current tier (409)', async () => {
    const ws = await createWorkspace('Bad promote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T0' });
    const r = await promote(ws, f.body.id as string, { target_tier: 'T-1' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_tier_transition');
    expect(r.body.from).toBe('T0');
    expect(r.body.to).toBe('T-1');
    expect(r.body.direction).toBe('promote');
  });

  it('rejects demote with a target_tier >= current tier (409)', async () => {
    const ws = await createWorkspace('Bad demote');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T0' });
    const r = await demote(ws, f.body.id as string, { target_tier: 'T+1' });
    expect(r.status).toBe(409);
    expect(r.body.direction).toBe('demote');
  });

  it('rejects unknown tier strings with 400', async () => {
    const ws = await createWorkspace('Unknown tier');
    const f = await postFact(ws, { area: 'x', statement: 'y' });
    const r1 = await promote(ws, f.body.id as string, { target_tier: 'T+2' });
    expect(r1.status).toBe(400);
    const r2 = await postFact(ws, { area: 'a', statement: 'b', tier: 'T+3' });
    expect(r2.status).toBe(400);
    const r3 = await postFact(ws, { area: 'c', statement: 'd', tier: 'banana' });
    expect(r3.status).toBe(400);
  });

  it('rejects promote/demote on a missing fact with 404', async () => {
    const ws = await createWorkspace('Missing fact xition');
    const r1 = await promote(ws, 'fact-nope');
    expect(r1.status).toBe(404);
    const r2 = await demote(ws, 'fact-nope');
    expect(r2.status).toBe(404);
  });
});

describe('5 — duplicate fact prevention', () => {
  it('rejects creating a fact with the same (area, statement) as 409', async () => {
    const ws = await createWorkspace('Dup');
    const a = await postFact(ws, { area: 'audience', statement: 'they use Toggl' });
    expect(a.status).toBe(201);
    const b = await postFact(ws, { area: 'audience', statement: 'they use Toggl' });
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('duplicate_fact');
    expect(b.body.existing_fact_id).toBe(a.body.id);
  });

  it('allows the same statement under a different area (no collision)', async () => {
    const ws = await createWorkspace('Different area');
    const a = await postFact(ws, { area: 'audience', statement: 'they use Toggl' });
    const b = await postFact(ws, { area: 'workflow', statement: 'they use Toggl' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.statement_hash).not.toBe(b.body.statement_hash);
  });

  it('rejects PATCH that would collide with another existing fact (409)', async () => {
    const ws = await createWorkspace('Patch collide');
    const a = await postFact(ws, { area: 'x', statement: 'one' });
    const b = await postFact(ws, { area: 'x', statement: 'two' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const r = await patchFact(ws, b.body.id as string, { statement: 'one' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('duplicate_fact');
    expect(r.body.existing_fact_id).toBe(a.body.id);
  });

  it('allows PATCH to the same statement (hash unchanged) as a no-op', async () => {
    const ws = await createWorkspace('Patch same');
    const a = await postFact(ws, { area: 'x', statement: 'y' });
    const before = a.body.audit_seq as number;
    const r = await patchFact(ws, a.body.id as string, { statement: 'y', area: 'x' });
    expect(r.status).toBe(200);
    expect(r.body.audit_seq).toBe(before);
  });
});

describe('6 — workspace isolation', () => {
  it('facts in workspace A are not visible to workspace B', async () => {
    const wsA = await createWorkspace('A');
    const wsB = await createWorkspace('B');
    const a = await postFact(wsA, { area: 'x', statement: 'private to A' });
    expect(a.status).toBe(201);

    // Direct GET against B with A's fact id → 404.
    const cross = await getFact(wsB, a.body.id as string);
    expect(cross.status).toBe(404);

    // List in B is empty.
    const list = await listFacts(wsB);
    expect((list.body.facts as unknown[]).length).toBe(0);
    expect(list.body.total).toBe(0);
  });

  it('PATCH/promote/demote against workspace B with A’s fact id returns 404', async () => {
    const wsA = await createWorkspace('A2');
    const wsB = await createWorkspace('B2');
    const a = await postFact(wsA, { area: 'x', statement: 'A only' });
    const factId = a.body.id as string;

    expect((await patchFact(wsB, factId, { area: 'new' })).status).toBe(404);
    expect((await promote(wsB, factId)).status).toBe(404);
    expect((await demote(wsB, factId)).status).toBe(404);

    // A is untouched.
    const stillA = await getFact(wsA, factId);
    expect(stillA.body.tier).toBe('T0');
    expect(stillA.body.area).toBe('x');
  });

  it('the same (area, statement) can exist in two workspaces independently', async () => {
    const wsA = await createWorkspace('Same statement A');
    const wsB = await createWorkspace('Same statement B');
    const a = await postFact(wsA, { area: 'q', statement: 'identical' });
    const b = await postFact(wsB, { area: 'q', statement: 'identical' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.statement_hash).toBe(b.body.statement_hash);
  });
});

describe('7 — audit-chain participation', () => {
  it('every mutation emits the expected audit action', async () => {
    const ws = await createWorkspace('Audit');
    const created = await postFact(ws, { area: 'x', statement: 'y' });
    await patchFact(ws, created.body.id as string, { statement: 'y prime' });
    await promote(ws, created.body.id as string);
    await demote(ws, created.body.id as string);

    const events = handle.substrate?.db.handle
      .prepare(
        `SELECT seq, action FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'fact.%' ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ seq: number; action: string }>;
    expect(events.map((e) => e.action)).toEqual([
      'fact.create',
      'fact.update',
      'fact.promote',
      'fact.demote',
    ]);
  });

  it('no-op transitions emit no audit events', async () => {
    const ws = await createWorkspace('No-op no audit');
    const f = await postFact(ws, { area: 'x', statement: 'y', tier: 'T+1' });
    const beforeCount = (
      handle.substrate?.db.handle
        .prepare(
          `SELECT COUNT(*) AS n FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'fact.%'`,
        )
        .get(ws) as { n: number }
    ).n;
    // Promote at T+1 ceiling — no-op.
    await promote(ws, f.body.id as string);
    // Demote with same target — no-op.
    await demote(ws, f.body.id as string, { target_tier: 'T+1' });

    const afterCount = (
      handle.substrate?.db.handle
        .prepare(
          `SELECT COUNT(*) AS n FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'fact.%'`,
        )
        .get(ws) as { n: number }
    ).n;
    expect(afterCount).toBe(beforeCount);
  });

  it('fact.create payload contains the canonical statement and hash', async () => {
    const ws = await createWorkspace('Payload check');
    const created = await postFact(ws, { area: 'aa', statement: 'ss' });
    const factId = created.body.id as string;
    // Find the corresponding audit event.
    const evt = handle.substrate?.db.handle
      .prepare(
        `SELECT seq, payload_hash FROM audit_events
         WHERE workspace_id = ? AND action = 'fact.create'`,
      )
      .get(ws) as { seq: number; payload_hash: string };
    // The payload was persisted to the blob store; resolve via the
    // existing single-event audit endpoint.
    const eventResp = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws}/audit/${evt.seq}`,
      headers: { host: '127.0.0.1' },
    });
    const payload = (eventResp.json() as Record<string, unknown>).payload as Record<
      string,
      unknown
    >;
    expect(payload.fact_id).toBe(factId);
    expect(payload.area).toBe('aa');
    expect(payload.statement).toBe('ss');
    expect(payload.tier).toBe('T0');
    expect(typeof payload.statement_hash).toBe('string');
  });
});

describe('8 — pagination & filtering', () => {
  it('paginates with limit + offset', async () => {
    const ws = await createWorkspace('Page facts');
    for (let i = 0; i < 12; i++) {
      await postFact(ws, { area: 'a', statement: `fact ${i}` });
    }
    const first = await listFacts(ws, '?limit=5');
    expect(first.body.returned).toBe(5);
    expect(first.body.total).toBe(12);
    expect(first.body.has_more).toBe(true);

    const second = await listFacts(ws, '?limit=5&offset=5');
    expect(second.body.returned).toBe(5);
    expect(second.body.offset).toBe(5);
    expect(second.body.has_more).toBe(true);

    const third = await listFacts(ws, '?limit=5&offset=10');
    expect(third.body.returned).toBe(2);
    expect(third.body.has_more).toBe(false);
  });

  it('filters by tier', async () => {
    const ws = await createWorkspace('Tier filter');
    await postFact(ws, { area: 'x', statement: '1', tier: 'T0' });
    await postFact(ws, { area: 'x', statement: '2', tier: 'T+1' });
    await postFact(ws, { area: 'x', statement: '3', tier: 'T-1' });

    const t0 = await listFacts(ws, '?tier=T0');
    expect(t0.body.total).toBe(1);
    const t1 = await listFacts(ws, '?tier=T%2B1');
    expect(t1.body.total).toBe(1);
    const tn1 = await listFacts(ws, '?tier=T-1');
    expect(tn1.body.total).toBe(1);
  });

  it('filters by area', async () => {
    const ws = await createWorkspace('Area filter');
    await postFact(ws, { area: 'aa', statement: '1' });
    await postFact(ws, { area: 'bb', statement: '2' });
    await postFact(ws, { area: 'aa', statement: '3' });

    const r = await listFacts(ws, '?area=aa');
    expect(r.body.total).toBe(2);
    expect((r.body.facts as Array<{ area: string }>).every((f) => f.area === 'aa')).toBe(true);
  });

  it('combines tier + area filters', async () => {
    const ws = await createWorkspace('Combined');
    await postFact(ws, { area: 'aa', statement: '1', tier: 'T0' });
    await postFact(ws, { area: 'aa', statement: '2', tier: 'T+1' });
    await postFact(ws, { area: 'bb', statement: '3', tier: 'T+1' });
    const r = await listFacts(ws, '?area=aa&tier=T%2B1');
    expect(r.body.total).toBe(1);
  });

  it('rejects invalid limit/offset/tier with 400', async () => {
    const ws = await createWorkspace('Bad query');
    expect((await listFacts(ws, '?limit=-1')).status).toBe(400);
    expect((await listFacts(ws, '?offset=abc')).status).toBe(400);
    expect((await listFacts(ws, '?tier=T%2B5')).status).toBe(400);
  });

  it('returns empty result when no facts match the filter', async () => {
    const ws = await createWorkspace('No match');
    await postFact(ws, { area: 'x', statement: '1' });
    const r = await listFacts(ws, '?tier=T-2');
    expect(r.body.total).toBe(0);
    expect((r.body.facts as unknown[]).length).toBe(0);
  });
});

describe('top-level route validation', () => {
  it('returns 404 for fact routes against unknown workspace', async () => {
    expect((await postFact('ws-nope', { area: 'x', statement: 'y' })).status).toBe(404);
    expect((await listFacts('ws-nope')).status).toBe(404);
    expect((await getFact('ws-nope', 'fact-x')).status).toBe(404);
    expect((await patchFact('ws-nope', 'fact-x', { area: 'a' })).status).toBe(404);
    expect((await promote('ws-nope', 'fact-x')).status).toBe(404);
    expect((await demote('ws-nope', 'fact-x')).status).toBe(404);
  });
});
