// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation API tests for Sprint 1 Task 6A.
// Scenarios:
//   1. create conversation (happy path)
//   2. create with multiple verbatim quotes
//   3. validation errors
//   4. list pagination + filtering
//   5. get single conversation
//   6. workspace isolation
//   7. audit-chain participation
//
// Migration schema tests live in packages/memory/tests/migration-0007.test.ts.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-conv-'));
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

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    person_name: 'Alex Smith',
    occurred_at: '2026-05-20T15:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'validated',
    ...overrides,
  };
}

// ────────── 1. create conversation (happy path) ──────────

describe('1 — create conversation (happy path)', () => {
  it('creates a minimal conversation and returns 201 with the full view', async () => {
    const ws = await createWorkspace('Conv create');
    const r = await postConversation(ws, validBody());
    expect(r.status).toBe(201);
    expect(typeof r.body.id).toBe('string');
    expect((r.body.id as string).startsWith('conv-')).toBe(true);
    expect(r.body.workspace_id).toBe(ws);
    expect(r.body.person_name).toBe('Alex Smith');
    expect(r.body.audience_fit).toBe('target');
    expect(r.body.conversation_type).toBe('discovery');
    expect(r.body.outcome).toBe('validated');
    expect(r.body.summary).toBeNull();
    expect(r.body.verbatim_quotes).toEqual([]);
    expect(typeof r.body.created_at).toBe('string');
    expect(typeof r.body.audit_seq).toBe('number');
  });

  it('normalizes occurred_at to canonical ISO 8601 (UTC)', async () => {
    const ws = await createWorkspace('Iso normalize');
    const r = await postConversation(ws, validBody({ occurred_at: '2026-05-20T15:00:00+04:00' }));
    expect(r.status).toBe(201);
    // 15:00 in +04:00 == 11:00 UTC.
    expect(r.body.occurred_at).toBe('2026-05-20T11:00:00.000Z');
  });

  it('accepts an optional summary and trims whitespace', async () => {
    const ws = await createWorkspace('Summary');
    const r = await postConversation(ws, validBody({ summary: '  fits target audience  ' }));
    expect(r.status).toBe(201);
    expect(r.body.summary).toBe('fits target audience');
  });

  it('returns 404 against an unknown workspace', async () => {
    const r = await postConversation('ws-does-not-exist', validBody());
    expect(r.status).toBe(404);
  });
});

// ────────── 2. create with multiple verbatim quotes ──────────

describe('2 — create with multiple verbatim quotes', () => {
  it('persists quotes in submission order with stable ids and positions', async () => {
    const ws = await createWorkspace('Quotes order');
    const r = await postConversation(
      ws,
      validBody({
        verbatim_quotes: [
          { text: 'I switched from Harvest to Toggl.' },
          { text: 'The team uses a shared spreadsheet for invoicing.' },
          { text: 'I would pay $20/mo for less manual work.' },
        ],
      }),
    );
    expect(r.status).toBe(201);
    const quotes = r.body.verbatim_quotes as Array<{
      id: string;
      position: number;
      text: string;
    }>;
    expect(quotes).toHaveLength(3);
    expect(quotes.map((q) => q.position)).toEqual([0, 1, 2]);
    expect(quotes[0]?.text).toBe('I switched from Harvest to Toggl.');
    expect(quotes[2]?.text).toBe('I would pay $20/mo for less manual work.');
    for (const q of quotes) {
      expect(q.id.startsWith('quote-')).toBe(true);
    }
  });

  it('accepts an empty quotes array as equivalent to omitting the field', async () => {
    const ws = await createWorkspace('Empty quotes');
    const r = await postConversation(ws, validBody({ verbatim_quotes: [] }));
    expect(r.status).toBe(201);
    expect(r.body.verbatim_quotes).toEqual([]);
  });

  it('subsequent GET returns the same quote ids and order', async () => {
    const ws = await createWorkspace('GET quote roundtrip');
    const created = await postConversation(
      ws,
      validBody({
        verbatim_quotes: [{ text: 'first' }, { text: 'second' }],
      }),
    );
    const fetched = await getConversation(ws, created.body.id as string);
    expect(fetched.status).toBe(200);
    const fetchedQuotes = fetched.body.verbatim_quotes as Array<{
      id: string;
      position: number;
      text: string;
    }>;
    const createdQuotes = created.body.verbatim_quotes as Array<{ id: string }>;
    expect(fetchedQuotes.map((q) => q.id)).toEqual(createdQuotes.map((q) => q.id));
    expect(fetchedQuotes.map((q) => q.text)).toEqual(['first', 'second']);
  });
});

// ────────── 3. validation errors ──────────

describe('3 — validation errors', () => {
  it('rejects missing person_name', async () => {
    const ws = await createWorkspace('Missing name');
    const r = await postConversation(ws, validBody({ person_name: undefined }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('person_name');
  });

  it('rejects empty or whitespace person_name', async () => {
    const ws = await createWorkspace('Empty name');
    expect((await postConversation(ws, validBody({ person_name: '' }))).status).toBe(400);
    expect((await postConversation(ws, validBody({ person_name: '   ' }))).status).toBe(400);
  });

  it('rejects an unparseable occurred_at', async () => {
    const ws = await createWorkspace('Bad iso');
    const r = await postConversation(ws, validBody({ occurred_at: 'not-a-date' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('occurred_at');
  });

  it('rejects missing occurred_at', async () => {
    const ws = await createWorkspace('No iso');
    const r = await postConversation(ws, validBody({ occurred_at: undefined }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('occurred_at');
  });

  it('rejects audience_fit outside the enum', async () => {
    const ws = await createWorkspace('Bad af');
    const r = await postConversation(ws, validBody({ audience_fit: 'maybe' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('audience_fit');
  });

  it('rejects conversation_type outside the enum', async () => {
    const ws = await createWorkspace('Bad ct');
    const r = await postConversation(ws, validBody({ conversation_type: 'chitchat' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('conversation_type');
  });

  it('rejects outcome outside the enum', async () => {
    const ws = await createWorkspace('Bad outcome');
    const r = await postConversation(ws, validBody({ outcome: 'unsure' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('outcome');
  });

  it('rejects an empty-string summary when summary is provided', async () => {
    const ws = await createWorkspace('Empty summary');
    const r = await postConversation(ws, validBody({ summary: '   ' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('summary');
  });

  it('rejects non-string summary', async () => {
    const ws = await createWorkspace('Bad summary type');
    const r = await postConversation(ws, validBody({ summary: 42 }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('summary');
  });

  it('rejects verbatim_quotes that is not an array', async () => {
    const ws = await createWorkspace('Bad quotes shape');
    const r = await postConversation(ws, validBody({ verbatim_quotes: 'a single quote' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('verbatim_quotes');
  });

  it('rejects a quote with empty text', async () => {
    const ws = await createWorkspace('Empty quote');
    const r = await postConversation(
      ws,
      validBody({ verbatim_quotes: [{ text: 'ok' }, { text: '   ' }] }),
    );
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('verbatim_quotes[1].text');
  });
});

// ────────── 4. list pagination + filtering ──────────

describe('4 — list pagination + filtering', () => {
  async function seed(ws: string): Promise<void> {
    await postConversation(
      ws,
      validBody({
        person_name: 'Alice',
        occurred_at: '2026-05-01T10:00:00Z',
        audience_fit: 'target',
        conversation_type: 'discovery',
        outcome: 'validated',
      }),
    );
    await postConversation(
      ws,
      validBody({
        person_name: 'Bob',
        occurred_at: '2026-05-10T10:00:00Z',
        audience_fit: 'adjacent',
        conversation_type: 'validation',
        outcome: 'inconclusive',
      }),
    );
    await postConversation(
      ws,
      validBody({
        person_name: 'Carol',
        occurred_at: '2026-05-15T10:00:00Z',
        audience_fit: 'target',
        conversation_type: 'discovery',
        outcome: 'follow_up',
      }),
    );
  }

  it('returns all conversations sorted by occurred_at DESC by default', async () => {
    const ws = await createWorkspace('List sort');
    await seed(ws);
    const r = await listConversations(ws);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.returned).toBe(3);
    const names = (r.body.conversations as Array<{ person_name: string }>).map(
      (c) => c.person_name,
    );
    expect(names).toEqual(['Carol', 'Bob', 'Alice']);
  });

  it('paginates with limit + offset and reports has_more correctly', async () => {
    const ws = await createWorkspace('Pagination');
    await seed(ws);
    const first = await listConversations(ws, '?limit=2&offset=0');
    expect(first.body.total).toBe(3);
    expect(first.body.returned).toBe(2);
    expect(first.body.has_more).toBe(true);
    const second = await listConversations(ws, '?limit=2&offset=2');
    expect(second.body.returned).toBe(1);
    expect(second.body.has_more).toBe(false);
  });

  it('filters by audience_fit', async () => {
    const ws = await createWorkspace('Filter af');
    await seed(ws);
    const r = await listConversations(ws, '?audience_fit=target');
    expect(r.body.total).toBe(2);
    expect(
      (r.body.conversations as Array<{ audience_fit: string }>).every(
        (c) => c.audience_fit === 'target',
      ),
    ).toBe(true);
  });

  it('filters by conversation_type and outcome together', async () => {
    const ws = await createWorkspace('Filter combo');
    await seed(ws);
    const r = await listConversations(ws, '?conversation_type=discovery&outcome=follow_up');
    expect(r.body.total).toBe(1);
    expect((r.body.conversations as Array<{ person_name: string }>)[0]?.person_name).toBe('Carol');
  });

  it('rejects an unknown filter enum value with 400', async () => {
    const ws = await createWorkspace('Bad filter');
    await seed(ws);
    const r = await listConversations(ws, '?audience_fit=maybe');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('audience_fit');
  });

  it('rejects non-integer limit / offset', async () => {
    const ws = await createWorkspace('Bad pagination');
    await seed(ws);
    expect((await listConversations(ws, '?limit=abc')).status).toBe(400);
    expect((await listConversations(ws, '?offset=-1')).status).toBe(400);
  });

  it('returns 404 for an unknown workspace', async () => {
    const r = await listConversations('ws-nope');
    expect(r.status).toBe(404);
  });
});

// ────────── 5. get single conversation ──────────

describe('5 — get single conversation', () => {
  it('returns the full conversation including quotes', async () => {
    const ws = await createWorkspace('Get one');
    const created = await postConversation(
      ws,
      validBody({
        person_name: 'Dana',
        summary: 'Strong signal',
        verbatim_quotes: [{ text: 'I want this yesterday.' }],
      }),
    );
    const r = await getConversation(ws, created.body.id as string);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(created.body.id);
    expect(r.body.person_name).toBe('Dana');
    expect(r.body.summary).toBe('Strong signal');
    const quotes = r.body.verbatim_quotes as Array<{ text: string }>;
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.text).toBe('I want this yesterday.');
  });

  it('returns 404 for an unknown conversation id', async () => {
    const ws = await createWorkspace('Get unknown');
    const r = await getConversation(ws, 'conv-does-not-exist');
    expect(r.status).toBe(404);
  });

  it('returns 404 against an unknown workspace', async () => {
    const r = await getConversation('ws-nope', 'conv-anything');
    expect(r.status).toBe(404);
  });
});

// ────────── 6. workspace isolation ──────────

describe('6 — workspace isolation', () => {
  it('a conversation created in wsA is invisible to wsB', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const a = await postConversation(wsA, validBody({ person_name: 'OnlyInA' }));
    expect(await (await getConversation(wsB, a.body.id as string)).status).toBe(404);

    const list = await listConversations(wsB);
    expect(list.body.total).toBe(0);
  });

  it('the same person_name can exist independently in two workspaces', async () => {
    const wsA = await createWorkspace('SharedA');
    const wsB = await createWorkspace('SharedB');
    await postConversation(wsA, validBody({ person_name: 'Shared' }));
    await postConversation(wsB, validBody({ person_name: 'Shared' }));
    const lA = await listConversations(wsA);
    const lB = await listConversations(wsB);
    expect(lA.body.total).toBe(1);
    expect(lB.body.total).toBe(1);
  });
});

// ────────── 7. audit-chain participation ──────────

describe('7 — audit-chain participation', () => {
  it('every create emits a conversation.create event in order', async () => {
    const ws = await createWorkspace('Audit chain');
    await postConversation(ws, validBody({ person_name: 'First' }));
    await postConversation(ws, validBody({ person_name: 'Second' }));
    await postConversation(ws, validBody({ person_name: 'Third' }));

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT seq, action FROM audit_events
         WHERE workspace_id = ? AND action LIKE 'conversation.%' ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ seq: number; action: string }>;
    expect(events.map((e) => e.action)).toEqual([
      'conversation.create',
      'conversation.create',
      'conversation.create',
    ]);
  });

  it('the conversation.create payload captures person, occurred_at, enums, summary, and quotes', async () => {
    const ws = await createWorkspace('Audit payload');
    const created = await postConversation(
      ws,
      validBody({
        person_name: 'Edith',
        occurred_at: '2026-05-18T09:30:00Z',
        audience_fit: 'adjacent',
        conversation_type: 'sales',
        outcome: 'inconclusive',
        summary: 'mixed signal',
        verbatim_quotes: [{ text: 'maybe later' }, { text: 'budget concerns' }],
      }),
    );

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
         WHERE workspace_id = ? AND action = 'conversation.create'`,
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
    expect(payload.conversation_id).toBe(created.body.id);
    expect(payload.person_name).toBe('Edith');
    expect(payload.occurred_at).toBe('2026-05-18T09:30:00.000Z');
    expect(payload.audience_fit).toBe('adjacent');
    expect(payload.conversation_type).toBe('sales');
    expect(payload.outcome).toBe('inconclusive');
    expect(payload.summary).toBe('mixed signal');
    expect(payload.quote_count).toBe(2);
    const quotes = payload.verbatim_quotes as Array<{ text: string; position: number }>;
    expect(quotes.map((q) => q.text)).toEqual(['maybe later', 'budget concerns']);
    expect(quotes.map((q) => q.position)).toEqual([0, 1]);
  });
});

// ────────── 8. PATCH conversation (M1 C1.1) ──────────

async function patchConversation(
  workspaceId: string,
  conversationId: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'PATCH',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function tombstoneConversationRoute(
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

describe('8 — PATCH conversation (M1 C1.1)', () => {
  it('updates a single field (person_name)', async () => {
    const ws = await createWorkspace('Patch single');
    const created = await postConversation(ws, validBody({ person_name: 'Old Name' }));
    const cid = created.body.id as string;

    const r = await patchConversation(ws, cid, { person_name: 'New Name' });
    expect(r.status).toBe(200);
    expect(r.body.person_name).toBe('New Name');
    // Other fields preserved.
    expect(r.body.audience_fit).toBe('target');
  });

  it('updates multiple fields in a single call', async () => {
    const ws = await createWorkspace('Patch multi');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    const r = await patchConversation(ws, cid, {
      person_name: 'Renamed',
      audience_fit: 'adjacent',
      outcome: 'changed my mind' as never, // wrong on purpose — see below
    });
    // The 'outcome' string is the UI label, not the enum. This test
    // verifies the route rejects it as an invalid outcome.
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('outcome');

    // Now do a real multi-field PATCH.
    const r2 = await patchConversation(ws, cid, {
      person_name: 'Renamed',
      audience_fit: 'adjacent',
      outcome: 'follow_up',
    });
    expect(r2.status).toBe(200);
    expect(r2.body.person_name).toBe('Renamed');
    expect(r2.body.audience_fit).toBe('adjacent');
    expect(r2.body.outcome).toBe('follow_up');
  });

  it('returns 200 without emitting an audit event when no values actually change', async () => {
    const ws = await createWorkspace('Patch noop');
    const created = await postConversation(ws, validBody({ person_name: 'Stable' }));
    const cid = created.body.id as string;

    // Pre-count fact.* / conversation.* events.
    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const before = substrate.db.handle
      .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ?')
      .get(ws) as { n: number };

    const r = await patchConversation(ws, cid, { person_name: 'Stable' });
    expect(r.status).toBe(200);

    const after = substrate.db.handle
      .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ?')
      .get(ws) as { n: number };
    expect(after.n).toBe(before.n); // No new audit event for a no-op.
  });

  it('returns 409 invalid_lifecycle when the conversation is tombstoned', async () => {
    const ws = await createWorkspace('Patch tombstoned');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;
    await tombstoneConversationRoute(ws, cid, { reason: 'erase' });

    const r = await patchConversation(ws, cid, { person_name: 'Too late' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_lifecycle');
    expect(r.body.state).toBe('tombstoned');
  });

  it('rejects an invalid audience_fit value with 400', async () => {
    const ws = await createWorkspace('Patch bad af');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    const r = await patchConversation(ws, cid, { audience_fit: 'maybe' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('audience_fit');
  });

  it('rejects an unparseable occurred_at with 400', async () => {
    const ws = await createWorkspace('Patch bad iso');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    const r = await patchConversation(ws, cid, { occurred_at: 'not-a-date' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('occurred_at');
  });

  it('rejects an empty or whitespace person_name with 400', async () => {
    const ws = await createWorkspace('Patch empty name');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    expect((await patchConversation(ws, cid, { person_name: '' })).status).toBe(400);
    expect((await patchConversation(ws, cid, { person_name: '   ' })).status).toBe(400);
  });

  it('clears summary when explicitly set to null', async () => {
    const ws = await createWorkspace('Patch summary null');
    const created = await postConversation(ws, validBody({ summary: 'initial' }));
    const cid = created.body.id as string;
    expect(created.body.summary).toBe('initial');

    const r = await patchConversation(ws, cid, { summary: null });
    expect(r.status).toBe(200);
    expect(r.body.summary).toBeNull();
  });

  it('updates summary to a new non-empty string', async () => {
    const ws = await createWorkspace('Patch summary update');
    const created = await postConversation(ws, validBody({ summary: 'first take' }));
    const cid = created.body.id as string;

    const r = await patchConversation(ws, cid, { summary: 'better take' });
    expect(r.status).toBe(200);
    expect(r.body.summary).toBe('better take');
  });

  it('rejects unknown fields with 400 (does not silently ignore)', async () => {
    const ws = await createWorkspace('Patch unknown');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    // Try to PATCH an immutable / substrate-managed field.
    const r1 = await patchConversation(ws, cid, { tombstoned_at: '2026-06-01T00:00:00Z' });
    expect(r1.status).toBe(400);
    expect(r1.body.field).toBe('body');
    expect((r1.body.details as string).includes('unknown field')).toBe(true);

    // Try to PATCH a typo / non-existent field.
    const r2 = await patchConversation(ws, cid, { persn_name: 'typo' });
    expect(r2.status).toBe(400);
    expect(r2.body.field).toBe('body');

    // Try the child-table field (verbatim_quotes).
    const r3 = await patchConversation(ws, cid, { verbatim_quotes: [{ text: 'late add' }] });
    expect(r3.status).toBe(400);
    expect(r3.body.field).toBe('body');
  });

  it('respects workspace isolation: PATCH from wsB targeting wsA returns 404', async () => {
    const wsA = await createWorkspace('Patch isoA');
    const wsB = await createWorkspace('Patch isoB');
    const created = await postConversation(wsA, validBody());
    const cid = created.body.id as string;

    const r = await patchConversation(wsB, cid, { person_name: 'Cross' });
    expect(r.status).toBe(404);
    // Original conversation in wsA is unchanged.
    const original = await getConversation(wsA, cid);
    expect(original.body.person_name).toBe('Alex Smith');
  });

  it('audit payload contains only the fields that actually changed', async () => {
    const ws = await createWorkspace('Patch audit shape');
    const created = await postConversation(
      ws,
      validBody({ person_name: 'Audited', audience_fit: 'target', outcome: 'validated' }),
    );
    const cid = created.body.id as string;

    // Change two fields; supply a third unchanged.
    await patchConversation(ws, cid, {
      person_name: 'Audited Renamed',
      audience_fit: 'target', // unchanged
      outcome: 'inconclusive',
    });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
          WHERE workspace_id = ? AND action = 'conversation.update'`,
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
    expect(payload.conversation_id).toBe(cid);
    expect(typeof payload.updated_at).toBe('string');
    const changes = payload.changes as Array<{ field: string; from: unknown; to: unknown }>;
    expect(changes.map((c) => c.field).sort()).toEqual(['outcome', 'person_name']);
    const personChange = changes.find((c) => c.field === 'person_name');
    expect(personChange?.from).toBe('Audited');
    expect(personChange?.to).toBe('Audited Renamed');
    const outcomeChange = changes.find((c) => c.field === 'outcome');
    expect(outcomeChange?.from).toBe('validated');
    expect(outcomeChange?.to).toBe('inconclusive');
  });

  it('emits conversation.update audit action with the right kind and ordering', async () => {
    const ws = await createWorkspace('Patch audit order');
    const created = await postConversation(ws, validBody({ person_name: 'Order' }));
    const cid = created.body.id as string;

    await patchConversation(ws, cid, { person_name: 'Order 2' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const events = substrate.db.handle
      .prepare(
        `SELECT action, kind FROM audit_events
          WHERE workspace_id = ? AND action LIKE 'conversation.%'
          ORDER BY seq ASC`,
      )
      .all(ws) as Array<{ action: string; kind: string }>;
    expect(events.map((e) => e.action)).toEqual(['conversation.create', 'conversation.update']);
    expect(events.every((e) => e.kind === 'conversation')).toBe(true);
  });
});

// ────────── 9. fact_extraction_status filter (M1 C1.4) ──────────

async function skipExtraction(
  workspaceId: string,
  conversationId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/skip-extraction`,
    headers: { host: '127.0.0.1' },
    payload: {},
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

/** Seed a workspace with conversations in all three extraction states.
 *  Returns the ids of pending / extracted / skipped conversations. */
async function seedMixedStatuses(ws: string): Promise<{
  pendingIds: string[];
  extractedIds: string[];
  skippedIds: string[];
}> {
  const pendingIds: string[] = [];
  const extractedIds: string[] = [];
  const skippedIds: string[] = [];

  // 3 pending — fresh, untouched.
  for (let i = 0; i < 3; i++) {
    const c = await postConversation(ws, validBody({ person_name: `Pending-${i}` }));
    pendingIds.push(c.body.id as string);
  }
  // 2 extracted — capture + pull a fact.
  for (let i = 0; i < 2; i++) {
    const c = await postConversation(
      ws,
      validBody({
        person_name: `Extracted-${i}`,
        verbatim_quotes: [{ text: `quote-${i}` }],
      }),
    );
    const cid = c.body.id as string;
    await extract(ws, cid, { area: `topic-${i}`, statement: `statement-${i}` });
    extractedIds.push(cid);
  }
  // 2 skipped — capture + skip.
  for (let i = 0; i < 2; i++) {
    const c = await postConversation(ws, validBody({ person_name: `Skipped-${i}` }));
    const cid = c.body.id as string;
    await skipExtraction(ws, cid);
    skippedIds.push(cid);
  }

  return { pendingIds, extractedIds, skippedIds };
}

describe('9 — fact_extraction_status filter (M1 C1.4)', () => {
  it('?fact_extraction_status=pending returns only pending conversations', async () => {
    const ws = await createWorkspace('Filter pending');
    const { pendingIds } = await seedMixedStatuses(ws);

    const r = await listConversations(ws, '?fact_extraction_status=pending');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    const ids = (r.body.conversations as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids).toEqual([...pendingIds].sort());
    // All returned rows actually have status=pending.
    expect(
      (r.body.conversations as Array<{ fact_extraction_status: string }>).every(
        (c) => c.fact_extraction_status === 'pending',
      ),
    ).toBe(true);
  });

  it('?fact_extraction_status=extracted returns only extracted conversations', async () => {
    const ws = await createWorkspace('Filter extracted');
    const { extractedIds } = await seedMixedStatuses(ws);

    const r = await listConversations(ws, '?fact_extraction_status=extracted');
    expect(r.body.total).toBe(2);
    const ids = (r.body.conversations as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids).toEqual([...extractedIds].sort());
    expect(
      (r.body.conversations as Array<{ fact_extraction_status: string }>).every(
        (c) => c.fact_extraction_status === 'extracted',
      ),
    ).toBe(true);
  });

  it('?fact_extraction_status=skipped returns only skipped conversations', async () => {
    const ws = await createWorkspace('Filter skipped');
    const { skippedIds } = await seedMixedStatuses(ws);

    const r = await listConversations(ws, '?fact_extraction_status=skipped');
    expect(r.body.total).toBe(2);
    const ids = (r.body.conversations as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids).toEqual([...skippedIds].sort());
    expect(
      (r.body.conversations as Array<{ fact_extraction_status: string }>).every(
        (c) => c.fact_extraction_status === 'skipped',
      ),
    ).toBe(true);
  });

  it('mixed workspace isolation — filter does not leak across workspaces', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    await seedMixedStatuses(wsA);
    await seedMixedStatuses(wsB);

    // Each workspace independently sees its own 3 pending.
    const rA = await listConversations(wsA, '?fact_extraction_status=pending');
    const rB = await listConversations(wsB, '?fact_extraction_status=pending');
    expect(rA.body.total).toBe(3);
    expect(rB.body.total).toBe(3);
    // No overlap in ids.
    const idsA = new Set((rA.body.conversations as Array<{ id: string }>).map((c) => c.id));
    const idsB = new Set((rB.body.conversations as Array<{ id: string }>).map((c) => c.id));
    for (const id of idsA) expect(idsB.has(id)).toBe(false);
  });

  it('invalid status returns 400 with field=fact_extraction_status', async () => {
    const ws = await createWorkspace('Bad status');
    await postConversation(ws, validBody());

    expect((await listConversations(ws, '?fact_extraction_status=banana')).status).toBe(400);
    expect((await listConversations(ws, '?fact_extraction_status=')).status).toBe(400);
    expect((await listConversations(ws, '?fact_extraction_status=PENDING')).status).toBe(400);

    const r = await listConversations(ws, '?fact_extraction_status=banana');
    expect(r.body.field).toBe('fact_extraction_status');
  });

  it('combines correctly with audience_fit and conversation_type filters', async () => {
    const ws = await createWorkspace('Combined filters');
    // Seed 4 conversations with varied tags and statuses.
    // (a) target + discovery + pending
    const a = await postConversation(
      ws,
      validBody({
        person_name: 'A',
        audience_fit: 'target',
        conversation_type: 'discovery',
      }),
    );
    // (b) target + discovery + skipped
    const b = await postConversation(
      ws,
      validBody({
        person_name: 'B',
        audience_fit: 'target',
        conversation_type: 'discovery',
      }),
    );
    await skipExtraction(ws, b.body.id as string);
    // (c) adjacent + discovery + pending — should NOT match audience_fit=target
    await postConversation(
      ws,
      validBody({
        person_name: 'C',
        audience_fit: 'adjacent',
        conversation_type: 'discovery',
      }),
    );
    // (d) target + validation + pending — should NOT match conversation_type=discovery
    await postConversation(
      ws,
      validBody({
        person_name: 'D',
        audience_fit: 'target',
        conversation_type: 'validation',
      }),
    );

    // audience_fit=target AND conversation_type=discovery AND fact_extraction_status=pending
    // should match only (a).
    const r = await listConversations(
      ws,
      '?audience_fit=target&conversation_type=discovery&fact_extraction_status=pending',
    );
    expect(r.body.total).toBe(1);
    expect((r.body.conversations as Array<{ id: string }>)[0]?.id).toBe(a.body.id);
  });

  it('returns an empty result set when no conversation matches the filter', async () => {
    const ws = await createWorkspace('Empty filter');
    // Only pending conversations exist.
    await postConversation(ws, validBody({ person_name: 'OnlyPending' }));

    const r = await listConversations(ws, '?fact_extraction_status=extracted');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect(r.body.conversations).toEqual([]);
    expect(r.body.has_more).toBe(false);
  });

  it('preserves the default ordering (occurred_at DESC, id ASC) and pagination semantics', async () => {
    const ws = await createWorkspace('Ordering preserved');
    // 4 pending conversations with explicit increasing occurred_at.
    const c1 = await postConversation(
      ws,
      validBody({ person_name: 'C1', occurred_at: '2026-01-01T10:00:00Z' }),
    );
    const c2 = await postConversation(
      ws,
      validBody({ person_name: 'C2', occurred_at: '2026-02-01T10:00:00Z' }),
    );
    const c3 = await postConversation(
      ws,
      validBody({ person_name: 'C3', occurred_at: '2026-03-01T10:00:00Z' }),
    );
    const c4 = await postConversation(
      ws,
      validBody({ person_name: 'C4', occurred_at: '2026-04-01T10:00:00Z' }),
    );

    // Skip c2 so the pending-filter result excludes it.
    await skipExtraction(ws, c2.body.id as string);

    const r = await listConversations(ws, '?fact_extraction_status=pending&limit=2&offset=0');
    expect(r.body.total).toBe(3); // c1, c3, c4 are pending
    expect(r.body.returned).toBe(2);
    expect(r.body.has_more).toBe(true);
    const firstPageIds = (r.body.conversations as Array<{ id: string }>).map((c) => c.id);
    // Order is occurred_at DESC, so first page is c4, c3.
    expect(firstPageIds).toEqual([c4.body.id, c3.body.id]);

    // Next page returns c1.
    const r2 = await listConversations(ws, '?fact_extraction_status=pending&limit=2&offset=2');
    expect(r2.body.returned).toBe(1);
    expect(r2.body.has_more).toBe(false);
    expect((r2.body.conversations as Array<{ id: string }>)[0]?.id).toBe(c1.body.id);
  });

  it('hides tombstoned conversations from the filtered result by default', async () => {
    const ws = await createWorkspace('Tomb hidden');
    const a = await postConversation(ws, validBody({ person_name: 'A' }));
    await postConversation(ws, validBody({ person_name: 'B' }));
    // Tombstone A. It's still 'pending' as an extraction status but
    // tombstoned. Default list filter should hide it.
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws}/conversations/${a.body.id}/tombstone`,
      headers: { host: '127.0.0.1' },
      payload: { reason: 'erase' },
    });

    const r = await listConversations(ws, '?fact_extraction_status=pending');
    expect(r.body.total).toBe(1);
    // Only B is visible.
    expect((r.body.conversations as Array<{ person_name: string }>)[0]?.person_name).toBe('B');
  });
});
