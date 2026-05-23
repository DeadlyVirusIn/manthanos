// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Skip-extraction route tests for Sprint 2 M1 C1.2.
// Covers: pending → skipped, extracted → skipped, double-skip 409,
// tombstoned 409, audit payload shape, reverse path (extract after skip),
// workspace isolation, unknown conversation 404, reason length cap.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-skip-'));
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

async function skipExtraction(
  workspaceId: string,
  conversationId: string,
  body: object = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/skip-extraction`,
    headers: { host: '127.0.0.1' },
    payload: body,
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

function validConvBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    person_name: 'Alex',
    occurred_at: '2026-05-20T15:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'inconclusive',
    ...overrides,
  };
}

describe('skip-extraction (M1 C1.2)', () => {
  // ────────── 1. pending → skipped (no reason) ──────────
  it('1 — happy path: pending → skipped (no reason)', async () => {
    const ws = await createWorkspace('Skip pending');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;
    expect(created.body.fact_extraction_status).toBe('pending');

    const r = await skipExtraction(ws, cid);
    expect(r.status).toBe(200);
    expect(r.body.previous_status).toBe('pending');
    const conv = r.body.conversation as Record<string, unknown>;
    expect(conv.fact_extraction_status).toBe('skipped');
    // last_extracted_at unchanged (still null, since never extracted).
    expect(conv.last_extracted_at).toBeNull();
  });

  // ────────── 2. pending → skipped (with reason) ──────────
  it('2 — happy path: pending → skipped (with reason)', async () => {
    const ws = await createWorkspace('Skip with reason');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;

    const r = await skipExtraction(ws, cid, { reason: 'off-topic chat' });
    expect(r.status).toBe(200);
    expect(r.body.previous_status).toBe('pending');

    // Verify reason landed in the audit payload.
    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq FROM audit_events
          WHERE workspace_id = ? AND action = 'conversation.skip_extraction'`,
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
    expect(payload.reason).toBe('off-topic chat');
  });

  // ────────── 3. extracted → skipped (changed mind) ──────────
  it('3 — extracted → skipped: changed mind after pulling facts', async () => {
    const ws = await createWorkspace('Skip after extract');
    const created = await postConversation(
      ws,
      validConvBody({ verbatim_quotes: [{ text: 'they use Toggl' }] }),
    );
    const cid = created.body.id as string;

    // Extract a fact first — flips status to 'extracted'.
    const extractResp = await extract(ws, cid, {
      area: 'tools',
      statement: 'They use Toggl for time tracking.',
    });
    expect(extractResp.status).toBe(201);
    const afterExtract = await getConversation(ws, cid);
    expect(afterExtract.body.fact_extraction_status).toBe('extracted');
    const factId = (extractResp.body.fact as { id: string }).id;

    // Now skip. previous_status should reflect 'extracted'.
    const r = await skipExtraction(ws, cid, { reason: 'reconsidered' });
    expect(r.status).toBe(200);
    expect(r.body.previous_status).toBe('extracted');
    expect((r.body.conversation as Record<string, unknown>).fact_extraction_status).toBe('skipped');

    // The extracted fact persists with active provenance.
    const factResp = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws}/facts/${factId}`,
      headers: { host: '127.0.0.1' },
    });
    expect(factResp.statusCode).toBe(200);
    expect((factResp.json() as Record<string, unknown>).active_source_count).toBe(1);
  });

  // ────────── 4. skipped → skipped: 409 already_skipped ──────────
  it('4 — skipped → skipped returns 409 already_skipped', async () => {
    const ws = await createWorkspace('Double skip');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;

    const first = await skipExtraction(ws, cid);
    expect(first.status).toBe(200);

    const second = await skipExtraction(ws, cid, { reason: 'just trying again' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('invalid_lifecycle');
    expect(second.body.state).toBe('already_skipped');
    expect(second.body.conversation_id).toBe(cid);
  });

  // ────────── 5. tombstoned → skipped: 409 tombstoned ──────────
  it('5 — tombstoned → skipped returns 409 tombstoned', async () => {
    const ws = await createWorkspace('Skip tombstoned');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;
    await tombstoneConversation(ws, cid, { reason: 'erase' });

    const r = await skipExtraction(ws, cid, { reason: 'too late' });
    expect(r.status).toBe(409);
    expect(r.body.state).toBe('tombstoned');
  });

  // ────────── 6. audit event payload shape ──────────
  it('6 — audit event payload includes conversation_id, previous_status, skipped_at, reason', async () => {
    const ws = await createWorkspace('Audit shape');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;
    await skipExtraction(ws, cid, { reason: 'not relevant to my audience' });

    const substrate = handle.substrate;
    if (!substrate) throw new Error('substrate not initialised');
    const row = substrate.db.handle
      .prepare(
        `SELECT seq, action, kind FROM audit_events
          WHERE workspace_id = ? AND action = 'conversation.skip_extraction'`,
      )
      .get(ws) as { seq: number; action: string; kind: string };
    expect(row.action).toBe('conversation.skip_extraction');
    expect(row.kind).toBe('conversation');

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
    expect(payload.previous_status).toBe('pending');
    expect(typeof payload.skipped_at).toBe('string');
    expect(payload.reason).toBe('not relevant to my audience');
  });

  // ────────── 7. reverse path: extract after skip restores status ──────────
  it('7 — after skipping, calling extract restores status to extracted', async () => {
    const ws = await createWorkspace('Skip then extract');
    const created = await postConversation(
      ws,
      validConvBody({ verbatim_quotes: [{ text: 'they ship every Friday' }] }),
    );
    const cid = created.body.id as string;

    // Skip first.
    await skipExtraction(ws, cid, { reason: 'changed mind preemptively' });
    const afterSkip = await getConversation(ws, cid);
    expect(afterSkip.body.fact_extraction_status).toBe('skipped');

    // Now extract. The existing extract path should flip status back to extracted.
    const extractResp = await extract(ws, cid, {
      area: 'behavior',
      statement: 'They ship every Friday.',
    });
    expect(extractResp.status).toBe(201);
    const afterExtract = await getConversation(ws, cid);
    expect(afterExtract.body.fact_extraction_status).toBe('extracted');
    expect(typeof afterExtract.body.last_extracted_at).toBe('string');
  });

  // ────────── 8. workspace isolation ──────────
  it('8 — workspace isolation: skipping from wsB targeting wsA returns 404', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const created = await postConversation(wsA, validConvBody());
    const cid = created.body.id as string;

    const cross = await skipExtraction(wsB, cid, { reason: 'cross' });
    expect(cross.status).toBe(404);

    // Original is untouched.
    const original = await getConversation(wsA, cid);
    expect(original.body.fact_extraction_status).toBe('pending');
  });

  // ────────── 9. unknown conversation: 404 ──────────
  it('9 — unknown conversation returns 404', async () => {
    const ws = await createWorkspace('Unknown conv');
    const r = await skipExtraction(ws, 'conv-does-not-exist', { reason: 'nope' });
    expect(r.status).toBe(404);
  });

  // ────────── 10. reason length cap ──────────
  it('10 — reason longer than 2000 chars returns 400', async () => {
    const ws = await createWorkspace('Long reason');
    const created = await postConversation(ws, validConvBody());
    const cid = created.body.id as string;

    const tooLong = 'x'.repeat(2001);
    const r = await skipExtraction(ws, cid, { reason: tooLong });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('reason');
  });
});
