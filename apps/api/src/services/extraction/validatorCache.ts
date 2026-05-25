// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8C — content-hash cache for validator verdicts.
//
// Caches ONLY the sanitized verdict (abstain | clamped score | filtered
// flags) keyed by a SHA-256 of (normalized statement + escaped data block +
// model id + prompt version + schema version). Identical re-runs are free.
//
// Privacy/safety (threat model + plan §5):
//   • the key is a hash, never plaintext — no quote text/PII in the key;
//   • the value is the parsed verdict only — never raw model output, never
//     the prompt, never conversation text;
//   • only SUCCESSFUL parsed verdicts are cached (callers must not cache
//     timeout/error/malformed);
//   • bumping PROMPT_VERSION / VALIDATOR_SCHEMA_VERSION invalidates all keys;
//     entries also expire by TTL and evict by LRU capacity.
// In-memory + local only; no external cache service.

import { createHash } from 'node:crypto';
import type { ValidatorVerdict } from './validator.js';

/** Bump to invalidate every cached verdict when the prompt changes. */
export const PROMPT_VERSION = 'v1';
/** Bump to invalidate every cached verdict when the verdict schema changes. */
export const VALIDATOR_SCHEMA_VERSION = 'v1';

export interface CacheKeyInput {
  readonly statement: string;
  /** The escaped, capped untrusted data block actually sent to the model. */
  readonly block: string;
  readonly model: string;
}

export function makeValidatorCacheKey(input: CacheKeyInput): string {
  const normStatement = input.statement.trim().replace(/\s+/g, ' ').toLowerCase();
  const material = [
    normStatement,
    input.block,
    input.model,
    PROMPT_VERSION,
    VALIDATOR_SCHEMA_VERSION,
  ].join(' ');
  return createHash('sha256').update(material).digest('hex');
}

export interface ValidatorCache {
  get(key: string): ValidatorVerdict | undefined;
  set(key: string, value: ValidatorVerdict): void;
  readonly size: number;
}

export interface ValidatorCacheOptions {
  /** Time-to-live per entry. Default 7 days. */
  readonly ttlMs?: number;
  /** Max entries before LRU eviction. Default 1000. */
  readonly maxEntries?: number;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 1000;

interface Entry {
  readonly value: ValidatorVerdict;
  readonly expiresAt: number;
}

/**
 * A bounded TTL + LRU cache. Map preserves insertion order; on `get` a live
 * entry is re-inserted (most-recently-used last); on `set` over capacity the
 * oldest key is evicted. Expired entries are dropped lazily on read.
 */
export function createValidatorCache(opts: ValidatorCacheOptions = {}): ValidatorCache {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = opts.now ?? Date.now;
  const store = new Map<string, Entry>();

  return {
    get(key: string): ValidatorVerdict | undefined {
      const entry = store.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      // LRU: mark most-recently-used.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key: string, value: ValidatorVerdict): void {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expiresAt: now() + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    get size(): number {
      return store.size;
    },
  };
}
