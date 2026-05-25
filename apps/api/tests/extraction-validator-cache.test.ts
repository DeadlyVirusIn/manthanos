// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8C — content-hash cache: key, TTL, LRU, privacy, invalidation,
// and runner integration (hit avoids the client call). No live LLM.

import { describe, expect, it, vi } from 'vitest';
import type { ConfidenceReasonFlag } from '../src/services/extraction/confidence.js';
import {
  createValidatorCache,
  makeValidatorCacheKey,
} from '../src/services/extraction/validatorCache.js';
import {
  type ValidatableCandidate,
  runValidator,
} from '../src/services/extraction/validatorRunner.js';

function candidate(overrides: Partial<ValidatableCandidate> = {}): ValidatableCandidate {
  return {
    statement: 'Founders abandon discovery tools.',
    area: 'general',
    confidence_score: 0.3,
    confidence_reasons: [] as ConfidenceReasonFlag[],
    ...overrides,
  };
}
const untrusted = { quotes: ['we dropped it'], summary: null };

describe('makeValidatorCacheKey', () => {
  it('is a hex SHA-256 (no plaintext / PII)', () => {
    const key = makeValidatorCacheKey({
      statement: 'secret PII alice@x.test',
      block: 'b',
      model: 'm',
    });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('alice@x.test');
  });

  it('is stable under statement whitespace/case but varies by model', () => {
    const a = makeValidatorCacheKey({ statement: 'Hello  World', block: 'b', model: 'm1' });
    const b = makeValidatorCacheKey({ statement: 'hello world', block: 'b', model: 'm1' });
    const c = makeValidatorCacheKey({ statement: 'hello world', block: 'b', model: 'm2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('createValidatorCache — TTL + LRU', () => {
  it('returns a stored verdict, then expires it after TTL', () => {
    let t = 1000;
    const cache = createValidatorCache({ ttlMs: 100, now: () => t });
    cache.set('k', { abstain: false, confidence_score: 0.9 });
    expect(cache.get('k')?.confidence_score).toBe(0.9);
    t = 1101; // past TTL
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least-recently-used entry over capacity', () => {
    const cache = createValidatorCache({ maxEntries: 2 });
    cache.set('a', { abstain: true });
    cache.set('b', { abstain: true });
    cache.get('a'); // 'a' now most-recently-used
    cache.set('c', { abstain: true }); // evicts 'b' (LRU)
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });
});

describe('runValidator — cache integration', () => {
  it('serves a cache hit without calling the client', async () => {
    const cache = createValidatorCache();
    const client = { validate: vi.fn(() => Promise.resolve('{"confidence_score":0.85}')) };
    const opts = { enabled: true, client, cache, model: 'm1' };

    const first = await runValidator(candidate(), untrusted, opts);
    expect(first.candidate.confidence_score).toBe(0.85);
    expect(client.validate).toHaveBeenCalledTimes(1);

    // Identical inputs → cache hit, no second client call.
    const second = await runValidator(candidate(), untrusted, opts);
    expect(second.candidate.confidence_score).toBe(0.85);
    expect(client.validate).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache malformed responses', async () => {
    const cache = createValidatorCache();
    const client = { validate: vi.fn(() => Promise.resolve('not json')) };
    const opts = { enabled: true, client, cache, model: 'm1' };
    await runValidator(candidate(), untrusted, opts);
    await runValidator(candidate(), untrusted, opts);
    // No verdict cached → client called both times.
    expect(client.validate).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });
});
