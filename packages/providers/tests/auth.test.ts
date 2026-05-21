// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectAuth } from '../src/auth.js';
import { getProvider } from '../src/registry.js';
import type { ProviderEntry } from '../src/types.js';

const NO_ENV: () => undefined = () => undefined;

function mustProvider(id: string): ProviderEntry {
  const p = getProvider(id);
  if (!p) throw new Error(`registry missing provider ${id} — test fixture out of date`);
  return p;
}

describe('detectAuth', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'mnth-auth-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('Codex: detects OAuth via ~/.codex/auth.json with future expires_at', async () => {
    const codex = mustProvider('codex-cli');
    const dir = path.join(home, '.codex');
    const fs = await import('node:fs/promises');
    await fs.mkdir(dir, { recursive: true });
    const future = Math.floor(Date.now() / 1000) + 3600;
    await writeFile(path.join(dir, 'auth.json'), JSON.stringify({ expires_at: future }));
    const res = await detectAuth(codex, { env: NO_ENV, homeOverride: home });
    expect(res.source).toBe('oauth');
    expect(res.credentialPath).toContain('auth.json');
    expect(res.expired).toBe(false);
    expect(res.expiresAtMs).toBe(future * 1000);
  });

  it('Codex: flags expired OAuth token', async () => {
    const codex = mustProvider('codex-cli');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    const past = Math.floor(Date.now() / 1000) - 3600;
    await writeFile(path.join(home, '.codex', 'auth.json'), JSON.stringify({ expires_at: past }));
    const res = await detectAuth(codex, { env: NO_ENV, homeOverride: home });
    expect(res.source).toBe('oauth');
    expect(res.expired).toBe(true);
  });

  it('Codex: falls back to OPENAI_API_KEY env when no OAuth file', async () => {
    const codex = mustProvider('codex-cli');
    const env = (n: string) => (n === 'OPENAI_API_KEY' ? 'sk-test' : undefined);
    const res = await detectAuth(codex, { env, homeOverride: home });
    expect(res.source).toBe('env');
    expect(res.envVar).toBe('OPENAI_API_KEY');
  });

  it('Codex: reports none when neither file nor env present', async () => {
    const codex = mustProvider('codex-cli');
    const res = await detectAuth(codex, { env: NO_ENV, homeOverride: home });
    expect(res.source).toBe('none');
  });

  it('Gemini: detects OAuth via ~/.gemini/oauth_creds.json', async () => {
    const gemini = mustProvider('gemini-cli');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(home, '.gemini'), { recursive: true });
    await writeFile(path.join(home, '.gemini', 'oauth_creds.json'), '{}');
    const res = await detectAuth(gemini, { env: NO_ENV, homeOverride: home });
    expect(res.source).toBe('oauth');
    expect(res.credentialPath).toContain('oauth_creds.json');
  });

  it('Gemini: falls back to GEMINI_API_KEY, then GOOGLE_API_KEY (in that order)', async () => {
    const gemini = mustProvider('gemini-cli');
    const env1 = (n: string) =>
      n === 'GEMINI_API_KEY' ? 'g1' : n === 'GOOGLE_API_KEY' ? 'g2' : undefined;
    expect((await detectAuth(gemini, { env: env1, homeOverride: home })).envVar).toBe(
      'GEMINI_API_KEY',
    );
    const env2 = (n: string) => (n === 'GOOGLE_API_KEY' ? 'g2' : undefined);
    expect((await detectAuth(gemini, { env: env2, homeOverride: home })).envVar).toBe(
      'GOOGLE_API_KEY',
    );
  });

  it('Perplexity: env-only auth', async () => {
    const perp = mustProvider('perplexity');
    const env = (n: string) => (n === 'PERPLEXITY_API_KEY' ? 'pk' : undefined);
    expect((await detectAuth(perp, { env, homeOverride: home })).source).toBe('env');
    expect((await detectAuth(perp, { env: NO_ENV, homeOverride: home })).source).toBe('none');
  });

  it('Ollama: local probe', async () => {
    const ollama = mustProvider('ollama');
    const probeUp = async () => true;
    expect((await detectAuth(ollama, { env: NO_ENV, probeLocal: probeUp })).source).toBe('local');
    const probeDown = async () => false;
    expect((await detectAuth(ollama, { env: NO_ENV, probeLocal: probeDown })).source).toBe('none');
  });
});
