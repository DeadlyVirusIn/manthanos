// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation tombstone + provenance degradation tests for Task 6B
// commit 2. Scenarios:
//   1. tombstone happy path (sentinel replacement + IDs preserved)
//   2. double tombstone → 409
//   3. tombstone validation (reason missing / empty / whitespace / wrong type)
//   4. workspace isolation
//   5. include_tombstoned list filter (default hides, opt-in reveals)
//   6. provenance degradation cascade
//   7. facts survive degradation with derived counters flipped
//   8. audit-event payload shape
//   9. affected_fact_ids_sample capped at 20

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-conv-tomb-'));
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

async function listConversations(
  workspaceId: string,
  query = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/conversations${query}`,
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

function validConvBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    person_name: 'Alex Smith',
    occurred_at: '2026-05-20T15:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'validated',
    ...overrides,
  };
}

// Helper: seed a conversation with N quotes and return its ids.
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

// Helper: insert a fact + a provenance row directly via SQL. The
// extraction service lands in commit 3; until then this is the
// minimal setup needed to exercise the degradation cascade.
function seedFactWithProvenance(
  ws: string,
  factId: string,
  area: string,
  statement: string,
  link: { quoteId?: string; conversationId?: string },
): void {
  const substrate = handle.substrate;
  if (!substrate) throw new Error('substrate not initialised');
  const now = new Date().toISOString();
  substrate.db.handle
    .prepare(
      `INSERT INTO semantic_facts (
         id, workspace_id, area, statement, statement_hash,
         provenance_workflow_id, tier, last_corroborated, confidence,
         audit_seq, last_administratively_touched
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(factId, ws, area, statement, `hash-${factId}`, 'T0', now, 0.3, 0, now);
  substrate.db.handle
    .prepare(
      `INSERT INTO fact_provenance_sources (
         id, workspace_id, fact_id, quote_id, conversation_id,
         extracted_at, extractor
       ) VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
    )
    .run(`prov-${factId}`, ws, factId, link.quoteId ?? null, link.conversationId ?? null, now);
}

// ────────── 1. tombstone happy path ──────────

describe('1 — tombstone happy path', () => {
  it('sentinel-replaces person_name, summary, and quote texts; preserves IDs and positions', async () => {
    const ws = await createWorkspace('Happy');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'Alex', [
      'first quote',
      'second quote',
      'third quote',
    ]);
    // Sanity: pre-tombstone state.
    const pre = await getConversation(ws, conversationId);
    expect(pre.body.person_name).toBe('Alex');
    expect(pre.body.is_tombstoned).toBe(false);
    expect(pre.body.tombstoned_at).toBeNull();
    expect(pre.body.fact_extraction_status).toBe('pending');

    const r = await tombstoneConversation(ws, conversationId, { reason: 'GDPR erasure' });
    expect(r.status).toBe(200);

    const tombstoned = r.body.conversation as Record<string, unknown>;
    expect(tombstoned.id).toBe(conversationId);
    expect(tombstoned.person_name).toBe('[tombstoned]');
    expect(tombstoned.summary).toBe('[tombstoned]');
    expect(tombstoned.tombstone_reason).toBe('GDPR erasure');
    expect(typeof tombstoned.tombstoned_at).toBe('string');
    expect(tombstoned.is_tombstoned).toBe(true);

    const quotes = tombstoned.verbatim_quotes as Array<{
      id: string;
      position: number;
      text: string;
    }>;
    expect(quotes).toHaveLength(3);
    expect(quotes.map((q) => q.id)).toEqual(quoteIds);
    expect(quotes.map((q) => q.position)).toEqual([0, 1, 2]);
    expect(quotes.every((q) => q.text === '[tombstoned]')).toBe(true);
  });

  it('subsequent GET returns the sentinel state', async () => {
    const ws = await createWorkspace('Persists');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Bob', ['x']);
    await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    const r = await getConversation(ws, conversationId);
    expect(r.status).toBe(200);
    expect(r.body.person_name).toBe('[tombstoned]');
    expect(r.body.is_tombstoned).toBe(true);
    expect((r.body.verbatim_quotes as Array<{ text: string }>)[0]?.text).toBe('[tombstoned]');
  });

  it('returns affected counts in the response body', async () => {
    const ws = await createWorkspace('Counts');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Carol', ['a', 'b', 'c']);
    const r = await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    expect(r.body.affected_quote_count).toBe(3);
    expect(r.body.affected_provenance_count).toBe(0);
    expect(r.body.affected_fact_ids_sample).toEqual([]);
  });
});

// ────────── 2. double tombstone returns 409 ──────────

describe('2 — double tombstone returns 409', () => {
  it('a tombstoned conversation cannot be tombstoned again', async () => {
    const ws = await createWorkspace('Double');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Dana', ['x']);
    await tombstoneConversation(ws, conversationId, { reason: 'first' });
    const r = await tombstoneConversation(ws, conversationId, { reason: 'second' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('tombstoned');
  });
});

// ────────── 3. tombstone validation ──────────

describe('3 — tombstone validation', () => {
  it('requires a string reason', async () => {
    const ws = await createWorkspace('NoReason');
    const { conversationId } = await seedConversationWithQuotes(ws, 'E', ['x']);
    const r = await tombstoneConversation(ws, conversationId, {});
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('reason');
  });

  it('rejects empty or whitespace-only reason', async () => {
    const ws = await createWorkspace('EmptyReason');
    const { conversationId } = await seedConversationWithQuotes(ws, 'F', ['x']);
    expect((await tombstoneConversation(ws, conversationId, { reason: '' })).status).toBe(400);
    expect((await tombstoneConversation(ws, conversationId, { reason: '  ' })).status).toBe(400);
  });

  it('rejects non-string reason', async () => {
    const ws = await createWorkspace('TypeReason');
    const { conversationId } = await seedConversationWithQuotes(ws, 'G', ['x']);
    const r = await tombstoneConversation(ws, conversationId, { reason: 42 });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('reason');
  });

  it('returns 404 for unknown conversation id', async () => {
    const ws = await createWorkspace('Unknown');
    const r = await tombstoneConversation(ws, 'conv-does-not-exist', { reason: 'r' });
    expect(r.status).toBe(404);
  });
});

// ────────── 4. workspace isolation ──────────

describe('4 — workspace isolation', () => {
  it('tombstone against another workspace returns 404 and leaves the original untouched', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const { conversationId } = await seedConversationWithQuotes(wsA, 'Henry', ['x']);
    const cross = await tombstoneConversation(wsB, conversationId, { reason: 'cross' });
    expect(cross.status).toBe(404);
    const stillAlive = await getConversation(wsA, conversationId);
    expect(stillAlive.body.is_tombstoned).toBe(false);
    expect(stillAlive.body.person_name).toBe('Henry');
  });
});

// ────────── 5. include_tombstoned list filter ──────────

describe('5 — include_tombstoned list filter', () => {
  it('default list hides tombstoned conversations', async () => {
    const ws = await createWorkspace('DefaultHide');
    const { conversationId: alive } = await seedConversationWithQuotes(ws, 'Alive', ['x']);
    const { conversationId: dead } = await seedConversationWithQuotes(ws, 'Dead', ['y']);
    await tombstoneConversation(ws, dead, { reason: 'erase' });
    const r = await listConversations(ws);
    expect(r.body.total).toBe(1);
    expect((r.body.conversations as Array<{ id: string }>)[0]?.id).toBe(alive);
  });

  it('?include_tombstoned=true reveals tombstoned conversations with sentinel content', async () => {
    const ws = await createWorkspace('Reveal');
    const { conversationId: alive } = await seedConversationWithQuotes(ws, 'Alive', ['x']);
    const { conversationId: dead } = await seedConversationWithQuotes(ws, 'Dead', ['y']);
    await tombstoneConversation(ws, dead, { reason: 'erase' });
    const r = await listConversations(ws, '?include_tombstoned=true');
    expect(r.body.total).toBe(2);
    const ids = (r.body.conversations as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids.sort()).toEqual([alive, dead].sort());
    const deadRow = (r.body.conversations as Array<Record<string, unknown>>).find(
      (c) => c.id === dead,
    );
    expect(deadRow?.person_name).toBe('[tombstoned]');
    expect(deadRow?.is_tombstoned).toBe(true);
  });
});

// ────────── 6. provenance degradation cascade ──────────

describe('6 — provenance degradation cascade', () => {
  it('tombstoning a conversation degrades every linked provenance row', async () => {
    const ws = await createWorkspace('Cascade');
    const { conversationId, quoteIds } = await seedConversationWithQuotes(ws, 'I', [
      'quote a',
      'quote b',
    ]);

    // Two facts: one linked to quote 0, one linked at conversation-level.
    seedFactWithProvenance(ws, 'fact-q', 'audience', 'they use Toggl', {
      quoteId: quoteIds[0],
    });
    seedFactWithProvenance(ws, 'fact-c', 'audience', 'spreadsheet for invoicing', {
      conversationId,
    });

    const r = await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    expect(r.body.affected_quote_count).toBe(2);
    expect(r.body.affected_provenance_count).toBe(2);
    const sample = r.body.affected_fact_ids_sample as string[];
    expect(sample.sort()).toEqual(['fact-c', 'fact-q'].sort());

    // Inspect the provenance rows directly to confirm degraded_at is set.
    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const rows = substrate.db.handle
      .prepare(
        `SELECT fact_id, degraded_at, degraded_reason
           FROM fact_provenance_sources
          WHERE workspace_id = ?
          ORDER BY fact_id`,
      )
      .all(ws) as Array<{
      fact_id: string;
      degraded_at: string | null;
      degraded_reason: string | null;
    }>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(typeof row.degraded_at).toBe('string');
      expect(row.degraded_reason).toBe('source_conversation_tombstoned');
    }
  });

  it('only provenance rows linked to THIS conversation are degraded; unrelated rows untouched', async () => {
    const ws = await createWorkspace('Targeted');
    const { conversationId: target } = await seedConversationWithQuotes(ws, 'T', ['x']);
    const { conversationId: other } = await seedConversationWithQuotes(ws, 'O', ['y']);

    seedFactWithProvenance(ws, 'fact-tgt', 'a', 'target fact', { conversationId: target });
    seedFactWithProvenance(ws, 'fact-otr', 'a', 'other fact', { conversationId: other });

    await tombstoneConversation(ws, target, { reason: 'erase target only' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const targetRow = substrate.db.handle
      .prepare('SELECT degraded_at FROM fact_provenance_sources WHERE fact_id = ?')
      .get('fact-tgt') as { degraded_at: string | null };
    const otherRow = substrate.db.handle
      .prepare('SELECT degraded_at FROM fact_provenance_sources WHERE fact_id = ?')
      .get('fact-otr') as { degraded_at: string | null };
    expect(typeof targetRow.degraded_at).toBe('string');
    expect(otherRow.degraded_at).toBeNull();
  });
});

// ────────── 7. facts survive degradation with derived counters flipped ──────────

describe('7 — facts survive degradation with derived counters', () => {
  it('fact remains alive after its source conversation is tombstoned', async () => {
    const ws = await createWorkspace('FactSurvives');
    const { conversationId } = await seedConversationWithQuotes(ws, 'P', ['x']);
    seedFactWithProvenance(ws, 'fact-survivor', 'audience', 'they ship weekly', {
      conversationId,
    });

    // Pre-tombstone: fact exists, active_source_count = 1, degraded = 0.
    const pre = await getFact(ws, 'fact-survivor');
    expect(pre.status).toBe(200);
    expect(pre.body.active_source_count).toBe(1);
    expect(pre.body.degraded_source_count).toBe(0);
    expect(pre.body.provenance_degraded).toBe(false);
    expect(pre.body.is_tombstoned).toBe(false);

    await tombstoneConversation(ws, conversationId, { reason: 'erase' });

    const post = await getFact(ws, 'fact-survivor');
    expect(post.status).toBe(200);
    // Fact itself is unchanged in tier / statement.
    expect(post.body.statement).toBe('they ship weekly');
    expect(post.body.tier).toBe('T0');
    expect(post.body.is_tombstoned).toBe(false);
    // Provenance counters flipped.
    expect(post.body.active_source_count).toBe(0);
    expect(post.body.degraded_source_count).toBe(1);
    expect(post.body.provenance_degraded).toBe(true);
  });

  it('multi-source fact: only the degraded portion flips; active sources persist', async () => {
    const ws = await createWorkspace('Multi');
    const { conversationId: convA } = await seedConversationWithQuotes(ws, 'A', ['x']);
    const { conversationId: convB } = await seedConversationWithQuotes(ws, 'B', ['y']);

    // One fact, two provenance rows.
    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const now = new Date().toISOString();
    substrate.db.handle
      .prepare(
        `INSERT INTO semantic_facts (
           id, workspace_id, area, statement, statement_hash,
           provenance_workflow_id, tier, last_corroborated, confidence,
           audit_seq, last_administratively_touched
         ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run('fact-multi', ws, 'a', 'corroborated claim', 'hash-multi', 'T0', now, 0.3, 0, now);
    substrate.db.handle
      .prepare(
        `INSERT INTO fact_provenance_sources (
           id, workspace_id, fact_id, quote_id, conversation_id, extracted_at, extractor
         ) VALUES (?, ?, ?, NULL, ?, ?, 'manual')`,
      )
      .run('prov-1', ws, 'fact-multi', convA, now);
    substrate.db.handle
      .prepare(
        `INSERT INTO fact_provenance_sources (
           id, workspace_id, fact_id, quote_id, conversation_id, extracted_at, extractor
         ) VALUES (?, ?, ?, NULL, ?, ?, 'manual')`,
      )
      .run('prov-2', ws, 'fact-multi', convB, now);

    // Tombstone only convA — leaves convB as a live source.
    await tombstoneConversation(ws, convA, { reason: 'erase A' });

    const post = await getFact(ws, 'fact-multi');
    expect(post.body.active_source_count).toBe(1);
    expect(post.body.degraded_source_count).toBe(1);
    expect(post.body.provenance_degraded).toBe(true);
  });
});

// ────────── 8. audit-event payload shape ──────────

describe('8 — audit-event payload shape', () => {
  it('conversation.tombstone payload carries reason, timestamps, and affected counts', async () => {
    const ws = await createWorkspace('AuditShape');
    const { conversationId } = await seedConversationWithQuotes(ws, 'X', ['q1', 'q2']);
    seedFactWithProvenance(ws, 'fact-audit', 'a', 's', { conversationId });
    await tombstoneConversation(ws, conversationId, { reason: 'final erasure' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
          WHERE workspace_id = ? AND action = 'conversation.tombstone'`,
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
    expect(payload.conversation_id).toBe(conversationId);
    expect(payload.reason).toBe('final erasure');
    expect(typeof payload.tombstoned_at).toBe('string');
    expect(payload.was_extracted).toBe(false);
    expect(payload.previous_person_name).toBe('X');
    expect(payload.affected_quote_count).toBe(2);
    expect(payload.affected_provenance_count).toBe(1);
    expect(payload.affected_fact_ids_sample).toEqual(['fact-audit']);
  });

  it('audit-chain ordering: conversation.create precedes conversation.tombstone', async () => {
    const ws = await createWorkspace('AuditOrder');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Y', ['z']);
    await tombstoneConversation(ws, conversationId, { reason: 'r' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT action FROM audit_events
          WHERE workspace_id = ? AND action LIKE 'conversation.%'
          ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ action: string }>;
    expect(events.map((e) => e.action)).toEqual(['conversation.create', 'conversation.tombstone']);
  });
});

// ────────── 9. affected_fact_ids_sample cap ──────────

describe('9 — affected_fact_ids_sample cap', () => {
  it('caps the sample at 20 distinct fact ids even when more are affected', async () => {
    const ws = await createWorkspace('Cap');
    const { conversationId } = await seedConversationWithQuotes(ws, 'Z', ['quote']);

    // 25 facts, each linked to the single conversation.
    for (let i = 0; i < 25; i++) {
      seedFactWithProvenance(ws, `fact-cap-${String(i).padStart(2, '0')}`, 'a', `s${i}`, {
        conversationId,
      });
    }

    const r = await tombstoneConversation(ws, conversationId, { reason: 'erase' });
    expect(r.body.affected_provenance_count).toBe(25);
    const sample = r.body.affected_fact_ids_sample as string[];
    expect(sample).toHaveLength(20);
    // Sample is a strict subset of the seeded fact ids.
    for (const id of sample) {
      expect(id.startsWith('fact-cap-')).toBe(true);
    }
  });
});
