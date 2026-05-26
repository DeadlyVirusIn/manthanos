// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — GET /api/v1/ai/capabilities.
//
// Verifies the capability gate is read-only, defaults OFF, and that the
// LLM-validator flag has no effect without a provider (none in 3B).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle | null = null;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-ai-caps-'));
});

afterEach(async () => {
  await handle?.shutdown().catch(() => undefined);
  handle = null;
  await rm(workspaceRoot, { recursive: true, force: true });
});

async function bootWith(flags: {
  extractionAssistEnabled?: boolean;
  llmValidatorEnabled?: boolean;
}): Promise<DaemonHandle> {
  return createDaemon({
    config: {
      port: 0,
      host: '127.0.0.1',
      logLevel: 'silent',
      workspaceRoot,
      ...flags,
    },
    noListen: true,
  });
}

async function getCaps(h: DaemonHandle): Promise<Record<string, unknown>> {
  const r = await h.app.inject({
    method: 'GET',
    url: '/api/v1/ai/capabilities',
    headers: { host: '127.0.0.1' },
  });
  expect(r.statusCode).toBe(200);
  return r.json() as Record<string, unknown>;
}

describe('GET /api/v1/ai/capabilities', () => {
  it('treats explicitly-unset flags as OFF (capability fn is null-safe)', async () => {
    // NB: this passes an explicit config with undefined flags — it exercises
    // computeAiCapabilities' null-safety, NOT the daemon's env default. The
    // env default for extractionAssistEnabled is ON (see config tests in
    // server.test.ts); only an explicit/undefined flag value maps to false here.
    handle = await bootWith({});
    const caps = await getCaps(handle);
    expect(caps).toEqual({
      ai_extraction_available: false,
      provider_configured: false,
      llm_validator_enabled: false,
      model: null,
    });
  });

  it('reports ai_extraction_available when the assist flag is ON', async () => {
    handle = await bootWith({ extractionAssistEnabled: true });
    const caps = await getCaps(handle);
    expect(caps.ai_extraction_available).toBe(true);
    // Still no provider / no LLM in 3B.
    expect(caps.provider_configured).toBe(false);
    expect(caps.llm_validator_enabled).toBe(false);
    expect(caps.model).toBeNull();
  });

  it('does NOT enable the LLM validator without a provider, even with its flag ON', async () => {
    handle = await bootWith({ extractionAssistEnabled: true, llmValidatorEnabled: true });
    const caps = await getCaps(handle);
    // No provider is wired in deterministic 3B → validator stays off.
    expect(caps.provider_configured).toBe(false);
    expect(caps.llm_validator_enabled).toBe(false);
    expect(caps.model).toBeNull();
  });
});
