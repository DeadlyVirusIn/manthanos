// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8 follow-up 2 — approval-time model_used stamping.
//
// On approving an LLM-validated candidate (validated_by_llm:true), the extract
// route stamps model_used from the SERVER's configured provider — never from
// the request body, never from model output. Without a provider, or without
// validated_by_llm, model_used stays NULL. Human approval + audit unchanged.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

const MODEL = 'claude-haiku-4-5';
let workspaceRoot: string;
let handle: DaemonHandle | null = null;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-approval-model-'));
  for (const k of ['MANTHANOS_VALIDATOR_API_KEY', 'MANTHANOS_VALIDATOR_MODEL']) {
    savedEnv[k] = process.env[k];
  }
});

afterEach(async () => {
  await handle?.shutdown().catch(() => undefined);
  handle = null;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(workspaceRoot, { recursive: true, force: true });
});

async function boot(withProvider: boolean): Promise<DaemonHandle> {
  if (withProvider) {
    process.env.MANTHANOS_VALIDATOR_API_KEY = 'sk-test-secret';
    process.env.MANTHANOS_VALIDATOR_MODEL = MODEL;
  } else {
    // `delete` is required to truly unset an env var; assigning `undefined`
    // coerces to the string "undefined" and would not clear it.
    // biome-ignore lint/performance/noDelete: process.env must be unset, not assigned undefined
    delete process.env.MANTHANOS_VALIDATOR_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env must be unset, not assigned undefined
    delete process.env.MANTHANOS_VALIDATOR_MODEL;
  }
  return createDaemon({
    config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot },
    noListen: true,
  });
}

async function createWorkspace(h: DaemonHandle): Promise<string> {
  const r = await h.app.inject({
    method: 'POST',
    url: '/api/v1/workspaces',
    headers: { host: '127.0.0.1' },
    payload: { name: 'w' },
  });
  return (r.json() as { id: string }).id;
}

async function seedConversation(h: DaemonHandle, ws: string): Promise<string> {
  const r = await h.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${ws}/conversations`,
    headers: { host: '127.0.0.1' },
    payload: {
      person_name: 'Alex',
      occurred_at: '2026-05-20T15:00:00Z',
      audience_fit: 'target',
      conversation_type: 'discovery',
      outcome: 'validated',
      verbatim_quotes: [{ text: 'we dropped the tool' }],
    },
  });
  return (r.json() as { id: string }).id;
}

async function extract(
  h: DaemonHandle,
  ws: string,
  conv: string,
  payload: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await h.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${ws}/conversations/${conv}/extract`,
    headers: { host: '127.0.0.1' },
    payload,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

function modelUsedFor(h: DaemonHandle, ws: string, factId: string): string | null {
  const db = h.substrate?.db.handle;
  if (db === undefined) throw new Error('substrate not open');
  const row = db
    .prepare(
      'SELECT model_used FROM fact_provenance_sources WHERE workspace_id = ? AND fact_id = ?',
    )
    .get(ws, factId) as { model_used: string | null };
  return row.model_used;
}

describe('approval-time model_used stamping', () => {
  it('stamps the SERVER model on an LLM-validated approval', async () => {
    handle = await boot(true);
    const ws = await createWorkspace(handle);
    const conv = await seedConversation(handle, ws);
    const r = await extract(handle, ws, conv, {
      area: 'pricing',
      statement: 'Founders drop tools that feel like research software.',
      extraction_confidence: 0.55,
      extractor_version: 'det+llm-1',
      reason_flags: ['has_clear_claim'],
      validated_by_llm: true,
    });
    expect(r.status).toBe(201);
    expect(modelUsedFor(handle, ws, (r.body.fact as { id: string }).id)).toBe(MODEL);
  });

  it('does NOT trust model_used from the request body (only validated_by_llm + server provider)', async () => {
    handle = await boot(true);
    const ws = await createWorkspace(handle);
    const conv = await seedConversation(handle, ws);
    const r = await extract(handle, ws, conv, {
      area: 'a',
      statement: 'body cannot inject an arbitrary model id',
      validated_by_llm: true,
      model_used: 'evil-model-from-client', // must be ignored
    });
    expect(r.status).toBe(201);
    // Stamped value is the SERVER model, never the body's injected string.
    expect(modelUsedFor(handle, ws, (r.body.fact as { id: string }).id)).toBe(MODEL);
  });

  it('leaves model_used NULL when validated_by_llm is absent (deterministic approval)', async () => {
    handle = await boot(true);
    const ws = await createWorkspace(handle);
    const conv = await seedConversation(handle, ws);
    const r = await extract(handle, ws, conv, {
      area: 'a',
      statement: 'deterministic candidate, no llm',
      extraction_confidence: 0.4,
      extractor_version: 'det-1',
    });
    expect(modelUsedFor(handle, ws, (r.body.fact as { id: string }).id)).toBeNull();
  });

  it('leaves model_used NULL when no provider is configured, even with validated_by_llm', async () => {
    handle = await boot(false);
    const ws = await createWorkspace(handle);
    const conv = await seedConversation(handle, ws);
    const r = await extract(handle, ws, conv, {
      area: 'a',
      statement: 'no provider configured',
      validated_by_llm: true,
    });
    expect(modelUsedFor(handle, ws, (r.body.fact as { id: string }).id)).toBeNull();
  });
});
