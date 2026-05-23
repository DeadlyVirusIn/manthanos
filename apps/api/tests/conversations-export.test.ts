// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation Markdown-export tests for Sprint 2 M1 C1.5.
// Covers happy path, empty-state sections, quote ordering, tombstoned
// rendering, workspace isolation, 404 paths, format-param validation,
// Content-Type header, and deterministic output.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-export-'));
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

interface RawExportResponse {
  status: number;
  contentType: string | string[] | undefined;
  body: string;
}

async function exportConversation(
  workspaceId: string,
  conversationId: string,
  query = '',
): Promise<RawExportResponse> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/export${query}`,
    headers: { host: '127.0.0.1' },
  });
  return {
    status: r.statusCode,
    contentType: r.headers['content-type'],
    body: r.body,
  };
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    person_name: 'Alex Smith',
    occurred_at: '2026-05-20T15:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'inconclusive',
    ...overrides,
  };
}

describe('GET /conversations/:cid/export (M1 C1.5)', () => {
  // ────────── 1. happy path: all sections render with correct content ──────────
  it('1 — happy path: renders header, metadata block, summary, quotes, facts, footer', async () => {
    const ws = await createWorkspace('Happy export');
    const created = await postConversation(
      ws,
      validBody({
        person_name: 'Maya Sharma',
        summary: 'Strong fit; uses Toggl daily.',
        verbatim_quotes: [
          { text: 'I switched from Harvest to Toggl.' },
          { text: 'Team uses a shared spreadsheet for invoicing.' },
        ],
      }),
    );
    const cid = created.body.id as string;
    // Extract one fact so the "Facts pulled" section is populated.
    await extract(ws, cid, {
      area: 'tools',
      statement: 'They switched from Harvest to Toggl.',
    });

    const r = await exportConversation(ws, cid);
    expect(r.status).toBe(200);
    expect(r.body).toContain('# Conversation with Maya Sharma');
    expect(r.body).toContain('**When:** 2026-05-20T15:00:00.000Z');
    expect(r.body).toContain('**Audience fit:** Exact match');
    expect(r.body).toContain('**Conversation type:** First conversation');
    expect(r.body).toContain('**Outcome:** Mixed signal');
    expect(r.body).toContain('**Extraction status:** Facts pulled');
    expect(r.body).toContain('## Summary');
    expect(r.body).toContain('Strong fit; uses Toggl daily.');
    expect(r.body).toContain('## Quotes');
    expect(r.body).toContain('1. "I switched from Harvest to Toggl."');
    expect(r.body).toContain('## Facts pulled from this conversation');
    expect(r.body).toContain(
      '**They switched from Harvest to Toggl.** (Noted, supported by 1 conversation)',
    );
    expect(r.body).toContain('Topic: tools');
    expect(r.body).toContain(`conversation_id: ${cid}`);
    expect(r.body).toContain(`workspace_id: ${ws}`);
  });

  // ────────── 2. Content-Type header is text/markdown; charset=utf-8 ──────────
  it('2 — Content-Type header is text/markdown; charset=utf-8', async () => {
    const ws = await createWorkspace('Content type');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    const r = await exportConversation(ws, cid);
    expect(r.contentType).toContain('text/markdown');
    expect(r.contentType).toContain('charset=utf-8');
  });

  // ────────── 3. quote ordering preserved ──────────
  it('3 — quotes render in their original position order, even after extraction reshuffles state', async () => {
    const ws = await createWorkspace('Quote order');
    const created = await postConversation(
      ws,
      validBody({
        verbatim_quotes: [
          { text: 'first' },
          { text: 'second' },
          { text: 'third' },
          { text: 'fourth' },
        ],
      }),
    );
    const cid = created.body.id as string;
    // Pull a fact from the third quote to ensure extraction doesn't perturb ordering.
    const quoteIds = (created.body.verbatim_quotes as Array<{ id: string }>).map((q) => q.id);
    await extract(ws, cid, {
      area: 'a',
      statement: 'fact from the third quote',
      quote_id: quoteIds[2],
    });

    const r = await exportConversation(ws, cid);
    // Quotes appear with 1-based numbering and the right text in the right slot.
    const lines = r.body.split('\n');
    const q1 = lines.findIndex((l) => l === '1. "first"');
    const q2 = lines.findIndex((l) => l === '2. "second"');
    const q3 = lines.findIndex((l) => l === '3. "third"');
    const q4 = lines.findIndex((l) => l === '4. "fourth"');
    expect(q1).toBeGreaterThanOrEqual(0);
    expect(q2).toBeGreaterThan(q1);
    expect(q3).toBeGreaterThan(q2);
    expect(q4).toBeGreaterThan(q3);
  });

  // ────────── 4. empty-state sections ──────────
  it('4 — empty summary, empty quotes, no facts each render their friendly empty-state', async () => {
    const ws = await createWorkspace('Empty sections');
    const created = await postConversation(
      ws,
      validBody({ summary: undefined, verbatim_quotes: [] }),
    );
    const cid = created.body.id as string;

    const r = await exportConversation(ws, cid);
    expect(r.body).toContain('_No summary captured._');
    expect(r.body).toContain('_No quotes captured._');
    expect(r.body).toContain('_No facts have been pulled from this conversation yet._');
  });

  // ────────── 5. tombstoned conversation exports with sentinel content ──────────
  it('5 — tombstoned conversation renders sentinel content and erasure metadata', async () => {
    const ws = await createWorkspace('Tomb export');
    const created = await postConversation(
      ws,
      validBody({
        person_name: 'Sensitive Subject',
        summary: 'Contains PII',
        verbatim_quotes: [{ text: 'PII content' }, { text: 'more PII' }],
      }),
    );
    const cid = created.body.id as string;
    await tombstoneConversation(ws, cid, { reason: 'GDPR erasure request' });

    const r = await exportConversation(ws, cid);
    expect(r.status).toBe(200);
    // Sentinel content everywhere PII was.
    expect(r.body).toContain('# Conversation with [tombstoned]');
    expect(r.body).toContain('[tombstoned]'); // also in summary + quotes
    // Quote texts replaced with sentinel.
    expect(r.body).toContain('1. "[tombstoned]"');
    expect(r.body).toContain('2. "[tombstoned]"');
    // Erasure metadata visible.
    expect(r.body).toContain('**Erased on:**');
    expect(r.body).toContain('**Reason:** GDPR erasure request');
    // Real PII strings absent.
    expect(r.body).not.toContain('Sensitive Subject');
    expect(r.body).not.toContain('Contains PII');
    expect(r.body).not.toContain('PII content');
    expect(r.body).not.toContain('more PII');
  });

  // ────────── 6. workspace isolation ──────────
  it('6 — exporting from wsB targeting wsA conversation returns 404', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    const created = await postConversation(wsA, validBody());
    const cid = created.body.id as string;

    const cross = await exportConversation(wsB, cid);
    expect(cross.status).toBe(404);
  });

  // ────────── 7. unknown conversation returns 404 ──────────
  it('7 — unknown conversation returns 404', async () => {
    const ws = await createWorkspace('Unknown conv');
    const r = await exportConversation(ws, 'conv-does-not-exist');
    expect(r.status).toBe(404);
  });

  // ────────── 8. unknown workspace returns 404 ──────────
  it('8 — unknown workspace returns 404', async () => {
    const r = await exportConversation('ws-does-not-exist', 'conv-anything');
    expect(r.status).toBe(404);
  });

  // ────────── 9. unsupported format returns 400 ──────────
  it('9 — unsupported format returns 400 with field=format', async () => {
    const ws = await createWorkspace('Bad format');
    const created = await postConversation(ws, validBody());
    const cid = created.body.id as string;

    const r = await exportConversation(ws, cid, '?format=pdf');
    expect(r.status).toBe(400);
    const body = JSON.parse(r.body) as Record<string, unknown>;
    expect(body.field).toBe('format');
  });

  // ────────── 10. deterministic output ──────────
  it('10 — repeated exports of the same conversation return byte-identical Markdown', async () => {
    const ws = await createWorkspace('Determinism');
    const created = await postConversation(
      ws,
      validBody({
        person_name: 'Deterministic',
        summary: 'Stable output check',
        verbatim_quotes: [{ text: 'q1' }, { text: 'q2' }, { text: 'q3' }],
      }),
    );
    const cid = created.body.id as string;
    await extract(ws, cid, { area: 'a', statement: 'a-stmt' });
    await extract(ws, cid, { area: 'b', statement: 'b-stmt' });

    const r1 = await exportConversation(ws, cid);
    const r2 = await exportConversation(ws, cid);
    const r3 = await exportConversation(ws, cid);
    expect(r2.body).toBe(r1.body);
    expect(r3.body).toBe(r1.body);
  });

  // ────────── 11. extraction status reflects current state ──────────
  it('11 — extraction status label reflects current state (Facts pulled vs Marked as not useful)', async () => {
    const ws = await createWorkspace('Status reflected');
    // One conversation that has been extracted.
    const extractedConv = await postConversation(
      ws,
      validBody({ person_name: 'Extracted', verbatim_quotes: [{ text: 'q' }] }),
    );
    await extract(ws, extractedConv.body.id as string, {
      area: 'a',
      statement: 'x',
    });

    // One conversation that has been skipped.
    const skipped = await postConversation(ws, validBody({ person_name: 'Skipped' }));
    await handle.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws}/conversations/${skipped.body.id}/skip-extraction`,
      headers: { host: '127.0.0.1' },
      payload: {},
    });

    const rExtracted = await exportConversation(ws, extractedConv.body.id as string);
    const rSkipped = await exportConversation(ws, skipped.body.id as string);
    expect(rExtracted.body).toContain('**Extraction status:** Facts pulled');
    expect(rSkipped.body).toContain('**Extraction status:** Marked as not useful');
  });

  // ────────── 12. Markdown ends with a single newline (formatting validation) ──────────
  it('12 — Markdown ends with a trailing newline and does not contain raw substrate jargon outside intended places', async () => {
    const ws = await createWorkspace('Formatting');
    const created = await postConversation(ws, validBody({ verbatim_quotes: [{ text: 'q' }] }));
    const cid = created.body.id as string;

    const r = await exportConversation(ws, cid);
    // Ends with a newline (POSIX-friendly).
    expect(r.body.endsWith('\n')).toBe(true);
    // No raw tier letters in the output (none rendered yet because no
    // facts; but the document still references "Noted" / "Well-evidenced"
    // labels indirectly. The forbidden-substring check here only
    // targets the raw enum forms that should never reach the user.)
    expect(r.body).not.toContain('T+1');
    expect(r.body).not.toContain('T-1');
    expect(r.body).not.toContain('T-2');
    // The literal string 'T0' is fine to appear elsewhere as a substring
    // (e.g. inside a workspace id or UUID), so we don't assert against it.
    // No raw audience_fit / outcome enum names.
    expect(r.body).not.toContain('audience_fit');
    expect(r.body).not.toContain('conversation_type');
    expect(r.body).not.toContain('fact_extraction_status');
  });
});
