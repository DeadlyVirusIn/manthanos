// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probeProviderHealth } from '../src/health.js';
import { getProvider } from '../src/registry.js';
import type { ProviderEntry } from '../src/types.js';

const NO_ENV: () => undefined = () => undefined;

function mustProvider(id: string): ProviderEntry {
  const p = getProvider(id);
  if (!p) throw new Error(`registry missing provider ${id} — test fixture out of date`);
  return p;
}

describe('probeProviderHealth', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'mnth-health-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('Claude CLI: runnable when binary present even without on-disk creds (runnableIfBinary)', async () => {
    const claude = mustProvider('claude-cli');
    const health = await probeProviderHealth(claude, {
      which: async () => '/usr/local/bin/claude',
      env: NO_ENV,
      homeOverride: home,
    });
    expect(health.binaryFound).toBe(true);
    expect(health.runnable).toBe(true);
    expect(health.nextAction).toBe('');
  });

  it('Claude CLI: not runnable when binary is missing', async () => {
    const claude = mustProvider('claude-cli');
    const health = await probeProviderHealth(claude, {
      which: async () => null,
      env: NO_ENV,
      homeOverride: home,
    });
    expect(health.binaryFound).toBe(false);
    expect(health.runnable).toBe(false);
    expect(health.nextAction).toContain('install `claude`');
  });

  it('Codex CLI: runnable when binary + OAuth file present', async () => {
    const codex = mustProvider('codex-cli');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    const future = Math.floor(Date.now() / 1000) + 3600;
    await writeFile(path.join(home, '.codex', 'auth.json'), JSON.stringify({ expires_at: future }));
    const health = await probeProviderHealth(codex, {
      which: async () => '/usr/local/bin/codex',
      env: NO_ENV,
      homeOverride: home,
    });
    expect(health.runnable).toBe(true);
    expect(health.auth.source).toBe('oauth');
  });

  it('Codex CLI: expired OAuth is not-runnable, with re-auth next-action', async () => {
    const codex = mustProvider('codex-cli');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    const past = Math.floor(Date.now() / 1000) - 60;
    await writeFile(path.join(home, '.codex', 'auth.json'), JSON.stringify({ expires_at: past }));
    const health = await probeProviderHealth(codex, {
      which: async () => '/usr/local/bin/codex',
      env: NO_ENV,
      homeOverride: home,
    });
    expect(health.runnable).toBe(false);
    expect(health.nextAction).toContain('re-authenticate');
  });

  it('Gemini CLI: env-only auth works when GEMINI_API_KEY is set', async () => {
    const gemini = mustProvider('gemini-cli');
    const env = (n: string) => (n === 'GEMINI_API_KEY' ? 'g' : undefined);
    const health = await probeProviderHealth(gemini, {
      which: async () => '/usr/local/bin/gemini',
      env,
      homeOverride: home,
    });
    expect(health.runnable).toBe(true);
    expect(health.auth.source).toBe('env');
    expect(health.auth.envVar).toBe('GEMINI_API_KEY');
  });

  it('Perplexity (API-only): runnable when env present, not otherwise', async () => {
    const p = mustProvider('perplexity');
    const env = (n: string) => (n === 'PERPLEXITY_API_KEY' ? 'pk' : undefined);
    expect(
      (await probeProviderHealth(p, { which: async () => null, env, homeOverride: home })).runnable,
    ).toBe(true);
    expect(
      (await probeProviderHealth(p, { which: async () => null, env: NO_ENV, homeOverride: home }))
        .runnable,
    ).toBe(false);
  });

  it('Ollama (local): runnable only when local probe succeeds', async () => {
    const o = mustProvider('ollama');
    const up = await probeProviderHealth(o, {
      which: async () => '/usr/local/bin/ollama',
      env: NO_ENV,
      homeOverride: home,
      probeLocal: async () => true,
    });
    expect(up.runnable).toBe(true);
    const down = await probeProviderHealth(o, {
      which: async () => '/usr/local/bin/ollama',
      env: NO_ENV,
      homeOverride: home,
      probeLocal: async () => false,
    });
    expect(down.runnable).toBe(false);
    expect(down.nextAction).toContain('start the local');
  });
});
