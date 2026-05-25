// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.5 — contract/route tests for the suggest-extractions endpoint.
// Read-only: asserts the { candidates } envelope, candidate shape, 404s,
// and the advisory duplicate annotation. No persistence assertions beyond
// the pre-existing extract mutation used to set up the duplicate case.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-suggest-'));
  handle = await createDaemon({
    config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot },
    noListen: true,
  });
});

afterEach(async () => {
  await handle.shutdown().catch(() => undefined);
  await rm(workspaceRoot, { recursive: true, force: true });
});

// biome-ignore lint/suspicious/noExplicitAny: test helper reads dynamic JSON bodies
async function post(url: string, payload?: unknown): Promise<{ status: number; body: any }> {
  const r = await handle.app.inject({
    method: 'POST',
    url,
    headers: { host: '127.0.0.1' },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { status: r.statusCode, body: r.json() };
}

async function setupConversation(): Promise<{ ws: string; conv: string; quoteId: string }> {
  const ws = (await post('/api/v1/workspaces', { name: 'Suggest WS' })).body.id as string;
  const convRes = await post(`/api/v1/workspaces/${ws}/conversations`, {
    person_name: 'Reg',
    occurred_at: '2026-05-24T10:00:00.000Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'inconclusive',
    verbatim_quotes: [
      { text: 'pricing is the blocker' },
      { text: 'customers want monthly billing options' },
    ],
  });
  const conv = convRes.body.id as string;
  const quoteId = convRes.body.verbatim_quotes[0].id as string;
  return { ws, conv, quoteId };
}

describe('POST .../suggest-extractions', () => {
  it('returns a { candidates } envelope (not a bare array) with enriched candidates', async () => {
    const { ws, conv } = await setupConversation();
    const r = await post(`/api/v1/workspaces/${ws}/conversations/${conv}/suggest-extractions`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(Array.isArray(r.body.candidates)).toBe(true);
    expect(r.body.candidates.length).toBe(2);

    const c = r.body.candidates[0];
    expect(typeof c.area).toBe('string');
    expect(typeof c.statement).toBe('string');
    expect(typeof c.confidence_score).toBe('number');
    expect(c.confidence_score).toBeGreaterThanOrEqual(0);
    expect(c.confidence_score).toBeLessThanOrEqual(1);
    expect(Array.isArray(c.confidence_reasons)).toBe(true);
    expect(c.provenance_preview.source).toBe('conversation');
    expect(c.provenance_preview.model_used).toBeNull();
    expect(c.provenance_preview.extractor_version).toBe('det-1');
  });

  it('returns 404 for a missing workspace', async () => {
    const r = await post('/api/v1/workspaces/ws-missing/conversations/conv-x/suggest-extractions');
    expect(r.status).toBe(404);
  });

  it('returns 404 for a missing conversation', async () => {
    const ws = (await post('/api/v1/workspaces', { name: 'W' })).body.id as string;
    const r = await post(`/api/v1/workspaces/${ws}/conversations/conv-missing/suggest-extractions`);
    expect(r.status).toBe(404);
  });

  it('advisory-flags an exact duplicate of an already-extracted fact', async () => {
    const { ws, conv, quoteId } = await setupConversation();
    // Create a fact whose statement matches the first quote.
    const ex = await post(`/api/v1/workspaces/${ws}/conversations/${conv}/extract`, {
      area: 'pricing',
      statement: 'pricing is the blocker',
      quote_id: quoteId,
    });
    expect(ex.status).toBe(201);

    const r = await post(`/api/v1/workspaces/${ws}/conversations/${conv}/suggest-extractions`);
    expect(r.status).toBe(200);
    const match = r.body.candidates.find(
      (c: { statement: string }) => c.statement === 'pricing is the blocker',
    );
    expect(match).toBeDefined();
    expect(match.duplicate.kind).toBe('exact');
    expect(match.duplicate.fact_id).toBeTruthy();
    expect(match.confidence_reasons).toContain('possible_duplicate');
  });
});
