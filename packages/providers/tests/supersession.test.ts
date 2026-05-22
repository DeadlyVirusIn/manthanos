// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { applySupersession } from '../src/health.js';
import { getProvider } from '../src/registry.js';
import type { ProviderEntry, ProviderHealth } from '../src/types.js';

function mustProvider(id: string): ProviderEntry {
  const p = getProvider(id);
  if (!p) throw new Error(`registry missing ${id}`);
  return p;
}

function rawHealth(runnable: boolean, providerId: string): ProviderHealth {
  return {
    providerId,
    binaryFound: runnable,
    auth: { source: runnable ? 'oauth' : 'none', detail: '' },
    runnable,
    nextAction: runnable ? '' : 'sign in',
  };
}

describe('applySupersession', () => {
  it('flags openai as supersededBy codex-cli when codex is runnable', () => {
    const openai = mustProvider('openai');
    const baseline = rawHealth(false, 'openai');
    const others = new Map<string, ProviderHealth>([['codex-cli', rawHealth(true, 'codex-cli')]]);
    const out = applySupersession(baseline, openai, others);
    expect(out.supersededBy).toBeTruthy();
    expect(out.supersededBy?.providerId).toBe('codex-cli');
    expect(out.supersededBy?.displayName).toContain('Codex');
  });

  it('does not flag openai when codex-cli is not runnable', () => {
    const openai = mustProvider('openai');
    const baseline = rawHealth(false, 'openai');
    const others = new Map<string, ProviderHealth>([['codex-cli', rawHealth(false, 'codex-cli')]]);
    const out = applySupersession(baseline, openai, others);
    expect(out.supersededBy).toBeUndefined();
  });

  it('preserves the original health.runnable value (does not lie about reachability)', () => {
    // openai HTTP API is still not directly runnable just because codex is;
    // applySupersession only annotates the supersededBy field, leaving
    // raw runnable unchanged. cpt-probe / runtime callers consult
    // health.runnable, not supersededBy.
    const openai = mustProvider('openai');
    const baseline = rawHealth(false, 'openai');
    const others = new Map<string, ProviderHealth>([['codex-cli', rawHealth(true, 'codex-cli')]]);
    const out = applySupersession(baseline, openai, others);
    expect(out.runnable).toBe(false);
  });

  it('no-ops when the entry has no supersededBy field', () => {
    const codex = mustProvider('codex-cli');
    const baseline = rawHealth(true, 'codex-cli');
    const out = applySupersession(baseline, codex, new Map());
    expect(out.supersededBy).toBeUndefined();
    expect(out).toEqual(baseline);
  });
});
