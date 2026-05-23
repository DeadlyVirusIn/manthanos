// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact-extraction + provenance-read tests for Task 6B commit 3.
// Scenarios:
//   1.  conversation-level extraction (no quote_id)
//   2.  quote-level extraction
//   3.  corroboration (re-extraction of same content)
//   4.  extraction from tombstoned conversation
//   5.  quote ownership validation
//   6.  extraction status transitions
//   7.  listing facts for a conversation
//   8.  provenance reads
//   9.  workspace isolation
//   10. audit-chain participation
//   11. body validation

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-extract-'));
  handle = await createDaemon({
    config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot },
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

async function postConversation(
  workspaceId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/conversations`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function getConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function tombstoneConversation(
  workspaceId: string,
  conversationId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/tombstone`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function extract(
  workspaceId: string,
  conversationId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/extract`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function listFactsForConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/facts`,
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

async function getProvenance(
  workspaceId: string,
  factId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/provenance`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

function validConvBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    person_name: 'Alex',
    occurred_at: '2026-05-20T15:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'validated',
    ...overrides,
  };
}

async function seedConversationWithQuotes(
  ws: string,
  personName: string,
  quoteTexts: string[],
): Promise<{ conversationId: string; quoteIds: string[] }> {
  const r = await postConversation(
    ws,
    validConvBody({
      person_name: personName,
      verbatim_quotes: quoteTexts.map((t) => ({ text: t })),
    }),
  );
  return {
    conversationId: r.body.id as string,
    quoteIds: (r.body.verbatim_quotes as Array<{ id: string }>).map((q) => q.id),
  };
}

// ────────── 1. conversation-level extraction ──────────

describe('1 — conversation-level extraction (no quote_id)', () => {
  it('creates a new fact with conversation-level provenance and returns 201', async () => {
    const ws = await createWorkspace('Conv-level');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Alex', ['q1', 'q2']);

    const r = await extract(ws, conversationId, {
      area: 'audience',
      statement: 'they use Toggl daily',
    });
    expect(r.status).toBe(201);
    expect(r.body.was_created).toBe(true);

    const fact = r.body.fact as Record<string, unknown>;
    expect(typeof fact.id).toBe('string');
    expect((fact.id as string).startsWith('fact-')).toBe(true);
    expect(fact.area).toBe('audience');
    expect(fact.statement).toBe('they use Toggl daily');
    expect(fact.tier).toBe('T0');
    expect(fact.active_source_count).toBe(1);
    expect(fact.degraded_source_count).toBe(0);
    expect(fact.provenance_degraded).toBe(false);
  });

  it('provenance row has source kind=conversation', async () => {
    const ws = await createWorkspace('Conv-prov');
    const { conversationId } = await seedConversationWithQuotes(ws, 'B', ['x']);
    const r = await extract(ws, conversationId, { area: 'a', statement: 's' });
    const factId = (r.body.fact as { id: string }).id;
    const prov = await getProvenance(ws, factId);
    expect(prov.status).toBe(200);
    const sources = prov.body.provenance as Array<{ kind: string; source_id: string }>;
    expect(sources).toHaveLength(1);
    expect(sources[0]?.kind).toBe('conversation');
    expect(sources[0]?.source_id).toBe(conversationId);
  });
});

// ────────── 2. quote-level extraction ──────────

describe('2 — quote-level extraction', () => {
  it('creates a new fact with quote-level provenance', async () => {
    const ws = await createWorkspace('Quote-level');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'C', [
      'I switched from Harvest',
      'we use spreadsheets',
    ]);
    const r = await extract(ws, conversationId, {
      area: 'audience',
      statement: 'they switched from Harvest',
      quote_id: quoteIds[0],
    });
    expect(r.status).toBe(201);
    const factId = (r.body.fact as { id: string }).id;

    const prov = await getProvenance(ws, factId);
    const sources = prov.body.provenance as Array<{ kind: string; source_id: string }>;
    expect(sources).toHaveLength(1);
    expect(sources[0]?.kind).toBe('quote');
    expect(sources[0]?.source_id).toBe(quoteIds[0]);
  });

  it('allows extractions from different quotes of the same conversation', async () => {
    const ws = await createWorkspace('Multi-quote');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'D', [
      'first',
      'second',
    ]);
    const a = await extract(ws, conversationId, {
      area: 'a',
      statement: 'fact one',
      quote_id: quoteIds[0],
    });
    const b = await extract(ws, conversationId, {
      area: 'a',
      statement: 'fact two',
      quote_id: quoteIds[1],
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((a.body.fact as { id: string }).id).not.toBe((b.body.fact as { id: string }).id);
  });
});

// ────────── 3. corroboration ──────────

describe('3 — corroboration (re-extraction of same content)', () => {
  it('re-extracting same content returns existing fact with was_created=false and status 200', async () => {
    const ws = await createWorkspace('Corro');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);

    const first = await extract(ws, convA, { area: 'audience', statement: 'they ship weekly' });
    expect(first.status).toBe(201);
    expect(first.body.was_created).toBe(true);
    const factId = (first.body.fact as { id: string }).id;

    const second = await extract(ws, convB, {
      area: 'audience',
      statement: 'they ship weekly',
    });
    expect(second.status).toBe(200);
    expect(second.body.was_created).toBe(false);
    expect((second.body.fact as { id: string }).id).toBe(factId);
  });

  it('corroboration increments active_source_count and adds a provenance row', async () => {
    const ws = await createWorkspace('CorroCount');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);

    const first = await extract(ws, convA, { area: 'a', statement: 'shared truth' });
    const factId = (first.body.fact as { id: string }).id;
    await extract(ws, convB, { area: 'a', statement: 'shared truth' });

    const fact = await getFact(ws, factId);
    expect(fact.body.active_source_count).toBe(2);
    expect(fact.body.degraded_source_count).toBe(0);

    const prov = await getProvenance(ws, factId);
    expect(prov.body.total).toBe(2);
  });

  it('existing fact tier and confidence are preserved on corroboration', async () => {
    const ws = await createWorkspace('CorroTier');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);

    // Create with T+1.
    const first = await extract(ws, convA, {
      area: 'a',
      statement: 'high-tier truth',
      tier: 'T+1',
    });
    expect((first.body.fact as Record<string, unknown>).tier).toBe('T+1');

    // Corroborate with a different requested tier — should be ignored.
    const second = await extract(ws, convB, {
      area: 'a',
      statement: 'high-tier truth',
      tier: 'T-1',
    });
    expect(second.body.was_created).toBe(false);
    expect((second.body.fact as Record<string, unknown>).tier).toBe('T+1');
    expect((second.body.fact as Record<string, unknown>).confidence).toBe(0.7);
  });

  it('last_corroborated bumps on corroboration but statement is unchanged', async () => {
    const ws = await createWorkspace('CorroTs');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);

    const first = await extract(ws, convA, { area: 'a', statement: 's' });
    const factId = (first.body.fact as { id: string }).id;
    const firstCorroborated = (first.body.fact as Record<string, unknown>)
      .last_corroborated as string;
    // Wait a hair so the new ISO timestamp differs.
    await new Promise((r) => setTimeout(r, 5));
    await extract(ws, convB, { area: 'a', statement: 's' });
    const fact = await getFact(ws, factId);
    const secondCorroborated = fact.body.last_corroborated as string;
    expect(secondCorroborated >= firstCorroborated).toBe(true);
    expect(fact.body.statement).toBe('s');
  });

  it('a tombstoned predecessor fact does NOT corroborate; dedup skips tombstoned rows', async () => {
    // Sanity check that tombstoned facts do not act as a corroboration
    // target. The existing selectFactByHash already excludes them, but
    // the test guards regression.
    const ws = await createWorkspace('CorroTombSkip');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const first = await extract(ws, conversationId, { area: 'a', statement: 'reusable' });
    const factId = (first.body.fact as { id: string }).id;

    // Tombstone the fact directly via the existing fact-tombstone route.
    const tombResp = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws}/facts/${factId}/tombstone`,
      headers: { host: '127.0.0.1' },
      payload: { reason: 'erase' },
    });
    expect(tombResp.statusCode).toBe(200);

    // Re-extracting same content should mint a NEW fact (dedup excludes tombstoned).
    const second = await extract(ws, conversationId, { area: 'a', statement: 'reusable' });
    expect(second.status).toBe(201);
    expect(second.body.was_created).toBe(true);
    expect((second.body.fact as { id: string }).id).not.toBe(factId);
  });
});

// ────────── 4. extraction from tombstoned conversation ──────────

describe('4 — extraction from tombstoned conversation', () => {
  it('returns 409 with state=tombstoned', async () => {
    const ws = await createWorkspace('ExtTomb');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    const r = await extract(ws, conversationId, { area: 'a', statement: 's' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('tombstoned');
  });
});

// ────────── 5. quote ownership validation ──────────

describe('5 — quote ownership validation', () => {
  it('400 when quote_id belongs to a different conversation', async () => {
    const ws = await createWorkspace('QuoteOwn');
    const a = await seedConversationWithQuotes(ws, 'A', ['ax']);
    const b = await seedConversationWithQuotes(ws, 'B', ['bx']);
    const r = await extract(ws, a.conversationId, {
      area: 'x',
      statement: 's',
      quote_id: b.quoteIds[0],
    });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('quote_id');
  });

  it('400 when quote_id does not exist anywhere', async () => {
    const ws = await createWorkspace('QuoteUnknown');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, {
      area: 'a',
      statement: 's',
      quote_id: 'quote-does-not-exist',
    });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('quote_id');
  });
});

// ────────── 6. extraction status transitions ──────────

describe('6 — extraction status transitions', () => {
  it('first extraction flips status pending → extracted and sets last_extracted_at', async () => {
    const ws = await createWorkspace('Status1');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);

    const pre = await getConversation(ws, conversationId);
    expect(pre.body.fact_extraction_status).toBe('pending');
    expect(pre.body.last_extracted_at).toBeNull();

    await extract(ws, conversationId, { area: 'a', statement: 's' });
    const post = await getConversation(ws, conversationId);
    expect(post.body.fact_extraction_status).toBe('extracted');
    expect(typeof post.body.last_extracted_at).toBe('string');
  });

  it('repeated extraction keeps status=extracted and updates last_extracted_at', async () => {
    const ws = await createWorkspace('Status2');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);

    await extract(ws, conversationId, { area: 'a', statement: 'one' });
    const afterFirst = await getConversation(ws, conversationId);
    const firstTs = afterFirst.body.last_extracted_at as string;
    await new Promise((r) => setTimeout(r, 5));
    await extract(ws, conversationId, { area: 'a', statement: 'two' });
    const afterSecond = await getConversation(ws, conversationId);
    expect(afterSecond.body.fact_extraction_status).toBe('extracted');
    expect((afterSecond.body.last_extracted_at as string) >= firstTs).toBe(true);
  });
});

// ────────── 7. listing facts for a conversation ──────────

describe('7 — listing facts for a conversation', () => {
  it('returns the facts extracted from this conversation (quote- and conv-level)', async () => {
    const ws = await createWorkspace('ListFacts');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'A', ['x', 'y']);
    const a = await extract(ws, conversationId, { area: 'a', statement: 'one' });
    const b = await extract(ws, conversationId, {
      area: 'a',
      statement: 'two',
      quote_id: quoteIds[0],
    });
    const c = await extract(ws, conversationId, {
      area: 'a',
      statement: 'three',
      quote_id: quoteIds[1],
    });

    const r = await listFactsForConversation(ws, conversationId);
    expect(r.status).toBe(200);
    expect(r.body.conversation_id).toBe(conversationId);
    expect(r.body.total).toBe(3);
    const ids = (r.body.facts as Array<{ id: string }>).map((f) => f.id).sort();
    expect(ids).toEqual([a, b, c].map((x) => (x.body.fact as { id: string }).id).sort());
  });

  it('returns an empty list when no extractions have occurred', async () => {
    const ws = await createWorkspace('NoFacts');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await listFactsForConversation(ws, conversationId);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect(r.body.facts).toEqual([]);
  });

  it('returns 404 for an unknown conversation', async () => {
    const ws = await createWorkspace('UnknownConv');
    const r = await listFactsForConversation(ws, 'conv-does-not-exist');
    expect(r.status).toBe(404);
  });

  it('deduplicates a fact corroborated multiple times from the same conversation', async () => {
    const ws = await createWorkspace('DedupList');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'A', ['x', 'y']);
    // Same statement, two quotes — should produce one fact with two provenance rows.
    await extract(ws, conversationId, {
      area: 'a',
      statement: 'shared',
      quote_id: quoteIds[0],
    });
    await extract(ws, conversationId, {
      area: 'a',
      statement: 'shared',
      quote_id: quoteIds[1],
    });
    const r = await listFactsForConversation(ws, conversationId);
    expect(r.body.total).toBe(1);
  });
});

// ────────── 8. provenance reads ──────────

describe('8 — provenance reads', () => {
  it('returns full provenance metadata per source', async () => {
    const ws = await createWorkspace('ProvRead');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, {
      area: 'a',
      statement: 's',
      quote_id: quoteIds[0],
    });
    const factId = (r.body.fact as { id: string }).id;

    const prov = await getProvenance(ws, factId);
    expect(prov.status).toBe(200);
    expect(prov.body.fact_id).toBe(factId);
    expect(prov.body.total).toBe(1);
    const source = (prov.body.provenance as Array<Record<string, unknown>>)[0];
    expect(source?.kind).toBe('quote');
    expect(source?.source_id).toBe(quoteIds[0]);
    expect(source?.extractor).toBe('manual');
    expect(typeof source?.extracted_at).toBe('string');
    expect(source?.degraded_at).toBeNull();
    expect(source?.degraded_reason).toBeNull();
  });

  it('shows degraded sources after the source conversation is tombstoned', async () => {
    const ws = await createWorkspace('ProvDegraded');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, { area: 'a', statement: 's' });
    const factId = (r.body.fact as { id: string }).id;
    await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    const prov = await getProvenance(ws, factId);
    const source = (prov.body.provenance as Array<Record<string, unknown>>)[0];
    expect(typeof source?.degraded_at).toBe('string');
    expect(source?.degraded_reason).toBe('source_conversation_tombstoned');
  });

  it('empty array for fact with no provenance (directly created)', async () => {
    const ws = await createWorkspace('ProvNone');
    // Create a fact via the direct fact route, not via extraction.
    const r = await handle.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws}/facts`,
      headers: { host: '127.0.0.1' },
      payload: { area: 'a', statement: 'no-provenance' },
    });
    const factId = (r.json() as { id: string }).id;
    const prov = await getProvenance(ws, factId);
    expect(prov.status).toBe(200);
    expect(prov.body.total).toBe(0);
    expect(prov.body.provenance).toEqual([]);
  });

  it('returns 404 for unknown fact id', async () => {
    const ws = await createWorkspace('ProvUnknown');
    const r = await getProvenance(ws, 'fact-does-not-exist');
    expect(r.status).toBe(404);
  });
});

// ────────── 9. workspace isolation ──────────

describe('9 — workspace isolation', () => {
  it('extracting in wsB targeting wsA conversation returns 404', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const { conversationId } = await seedConversationWithQuotes(wsA, 'A', ['x']);
    const r = await extract(wsB, conversationId, { area: 'a', statement: 's' });
    expect(r.status).toBe(404);
  });

  it('GET facts-for-conversation respects workspace boundaries', async () => {
    const wsA = await createWorkspace('IsoLA');
    const wsB = await createWorkspace('IsoLB');
    const { conversationId } = await seedConversationWithQuotes(wsA, 'A', ['x']);
    await extract(wsA, conversationId, { area: 'a', statement: 's' });
    const r = await listFactsForConversation(wsB, conversationId);
    expect(r.status).toBe(404);
  });

  it('GET provenance respects workspace boundaries', async () => {
    const wsA = await createWorkspace('IsoPA');
    const wsB = await createWorkspace('IsoPB');
    const { conversationId } = await seedConversationWithQuotes(wsA, 'A', ['x']);
    const r = await extract(wsA, conversationId, { area: 'a', statement: 's' });
    const factId = (r.body.fact as { id: string }).id;
    const cross = await getProvenance(wsB, factId);
    expect(cross.status).toBe(404);
  });
});

// ────────── 10. audit-chain participation ──────────

describe('10 — audit-chain participation', () => {
  it('new-fact extraction emits fact.create with an extraction_source payload field', async () => {
    const ws = await createWorkspace('AuditNew');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, {
      area: 'a',
      statement: 's',
      quote_id: quoteIds[0],
    });
    const factId = (r.body.fact as { id: string }).id;

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    // Find the seq for the fact.create event corresponding to this fact.
    // (There's only one fact.create in this workspace.)
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
          WHERE workspace_id = ? AND action = 'fact.create'`,
      )
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
    expect(payload.fact_id).toBe(factId);
    const source = payload.extraction_source as Record<string, unknown> | undefined;
    expect(source).toBeDefined();
    expect(source?.conversation_id).toBe(conversationId);
    expect(source?.quote_id).toBe(quoteIds[0]);
  });

  it('corroboration emits fact.corroborate with conversation_id', async () => {
    const ws = await createWorkspace('AuditCorro');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);
    await extract(ws, convA, { area: 'a', statement: 's' });
    await extract(ws, convB, { area: 'a', statement: 's' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
          WHERE workspace_id = ? AND action = 'fact.corroborate'`,
      )
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
    expect(payload.conversation_id).toBe(convB);
    expect(payload.extractor).toBe('manual');
    expect(typeof payload.corroborated_at).toBe('string');
  });

  it('audit events appear in chronological order: create, corroborate, corroborate', async () => {
    const ws = await createWorkspace('AuditOrder');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);
    const { conversationId: convC } = await seedConversationWithQuotes(ws, 'C', ['z']);
    await extract(ws, convA, { area: 'a', statement: 's' });
    await extract(ws, convB, { area: 'a', statement: 's' });
    await extract(ws, convC, { area: 'a', statement: 's' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT action FROM audit_events
          WHERE workspace_id = ? AND action LIKE 'fact.%'
          ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ action: string }>;
    expect(events.map((e) => e.action)).toEqual([
      'fact.create',
      'fact.corroborate',
      'fact.corroborate',
    ]);
  });
});

// ────────── 11. body validation ──────────

describe('11 — body validation', () => {
  it('400 when area is missing', async () => {
    const ws = await createWorkspace('VA');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, { statement: 's' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('area');
  });

  it('400 when statement is missing', async () => {
    const ws = await createWorkspace('VS');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, { area: 'a' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('statement');
  });

  it('400 when area is empty or whitespace', async () => {
    const ws = await createWorkspace('VAE');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    expect((await extract(ws, conversationId, { area: '', statement: 's' })).status).toBe(400);
    expect((await extract(ws, conversationId, { area: '  ', statement: 's' })).status).toBe(400);
  });

  it('400 when statement is empty or whitespace', async () => {
    const ws = await createWorkspace('VSE');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    expect((await extract(ws, conversationId, { area: 'a', statement: '' })).status).toBe(400);
    expect((await extract(ws, conversationId, { area: 'a', statement: '  ' })).status).toBe(400);
  });

  it('400 when tier is not a valid FactTier', async () => {
    const ws = await createWorkspace('VT');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, { area: 'a', statement: 's', tier: 'T+2' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('tier');
  });

  it('400 when quote_id is wrong type', async () => {
    const ws = await createWorkspace('VQ');
    const { conversationId } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const r = await extract(ws, conversationId, { area: 'a', statement: 's', quote_id: 42 });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('quote_id');
  });
});
