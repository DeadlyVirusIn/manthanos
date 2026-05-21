// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import {
  PROVIDER_REGISTRY,
  cptProbeAdapterIds,
  getProvider,
  listProviderIds,
} from '../src/registry.js';

describe('PROVIDER_REGISTRY', () => {
  it('contains the expected provider ids', () => {
    const ids = new Set(listProviderIds());
    for (const expected of [
      'claude-cli',
      'openai',
      'codex-cli',
      'gemini-cli',
      'copilot',
      'qwen',
      'ollama',
      'perplexity',
      'openrouter',
      'opencode',
      'cursor-agent',
      'vibe',
    ]) {
      expect(ids.has(expected), `missing provider id: ${expected}`).toBe(true);
    }
  });

  it('has no duplicate provider ids', () => {
    const ids = listProviderIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('CLI providers declare an executable; API providers do not', () => {
    for (const p of PROVIDER_REGISTRY) {
      if (p.integrationType === 'cli') {
        expect(p.executable, `CLI ${p.id} missing executable`).toBeTruthy();
      } else if (p.integrationType === 'api') {
        expect(p.executable).toBeUndefined();
      }
    }
  });

  it('local providers declare a localEndpoint', () => {
    for (const p of PROVIDER_REGISTRY.filter((q) => q.integrationType === 'local')) {
      expect(p.localEndpoint, `local ${p.id} missing endpoint`).toBeTruthy();
    }
  });

  it('cptProbeAdapterIds returns only implemented providers with supportsCptProbe', () => {
    const expected = new Set(['claude-cli', 'openai', 'codex-cli', 'gemini-cli']);
    expect(new Set(cptProbeAdapterIds())).toEqual(expected);
  });

  it('every supportsCptProbe entry has an adapterPackage AND status=implemented', () => {
    for (const p of PROVIDER_REGISTRY.filter((q) => q.supportsCptProbe)) {
      expect(p.adapterPackage, `${p.id} cpt-probe but no adapter`).not.toBeNull();
      expect(p.status).toBe('implemented');
    }
  });

  it('every implemented provider has a non-null adapterPackage', () => {
    for (const p of PROVIDER_REGISTRY.filter((q) => q.status === 'implemented')) {
      expect(p.adapterPackage, `implemented ${p.id} missing adapter package`).not.toBeNull();
    }
  });

  it('detected-only and planned providers have adapterPackage === null', () => {
    for (const p of PROVIDER_REGISTRY.filter((q) => q.status !== 'implemented')) {
      expect(p.adapterPackage).toBeNull();
      expect(p.supportsCptProbe).toBe(false);
    }
  });

  it('getProvider resolves known + unknown ids', () => {
    expect(getProvider('codex-cli')?.executable).toBe('codex');
    expect(getProvider('does-not-exist')).toBeUndefined();
  });
});
