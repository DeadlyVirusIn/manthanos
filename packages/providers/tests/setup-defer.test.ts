// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProvider } from '../src/registry.js';
import { type DeferredItem, emitDeferredScript } from '../src/setup/defer.js';
import type { ProviderEntry } from '../src/types.js';

function mustProvider(id: string): ProviderEntry {
  const p = getProvider(id);
  if (!p) throw new Error(`registry missing ${id}`);
  return p;
}

describe('emitDeferredScript', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mnth-defer-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a runnable bash script with one block per provider', async () => {
    const items: DeferredItem[] = [
      {
        providerId: 'qwen',
        displayName: 'Alibaba Qwen',
        entry: mustProvider('qwen'),
        reasons: ['interactive shell required'],
      },
      {
        providerId: 'openai',
        displayName: 'OpenAI (HTTP API)',
        entry: mustProvider('openai'),
        reasons: ['key paste needs a real terminal'],
      },
    ];
    const file = await emitDeferredScript(items, { scriptDir: dir });
    const body = await readFile(file, 'utf8');
    expect(body.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(body).toContain('Alibaba Qwen');
    expect(body).toContain('npm install -g @qwen-code/qwen-code');
    expect(body).toContain('qwen'); // sign-in command
    expect(body).toContain('OpenAI (HTTP API)');
    expect(body).toContain('https://platform.openai.com/api-keys');
    expect(body).toContain('Run: manthan doctor');
  });

  it('emits manual-only steps when present', async () => {
    const items: DeferredItem[] = [
      {
        providerId: 'claude-cli',
        displayName: 'Claude',
        entry: mustProvider('claude-cli'),
        reasons: ['manual flow'],
      },
    ];
    const file = await emitDeferredScript(items, { scriptDir: dir });
    const body = await readFile(file, 'utf8');
    expect(body).toContain('complete sign-in there');
  });
});
