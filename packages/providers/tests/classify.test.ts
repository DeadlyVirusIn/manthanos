// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import {
  GEMINI_FALLBACK_MODELS,
  classifyProviderError,
  isGeminiQuotaExhausted,
} from '../src/classify.js';

describe('classifyProviderError', () => {
  it('classifies auth failures', () => {
    expect(classifyProviderError('Error: 401 Unauthorized').class).toBe('auth');
    expect(classifyProviderError('invalid api key').class).toBe('auth');
    expect(classifyProviderError('token expired refresh required').class).toBe('auth');
  });

  it('classifies quota exhaustion (Gemini-specific patterns)', () => {
    const samples = [
      'QUOTA_EXHAUSTED: free tier limit reached',
      'TerminalQuotaError',
      'RetryableQuotaError: backoff and retry',
      'insufficient_quota',
      'Attempt 3 failed because you have exhausted your capacity',
    ];
    for (const s of samples) {
      const c = classifyProviderError(s);
      expect(c.class, s).toBe('quota_exhausted');
      expect(c.retriable).toBe(true);
      expect(isGeminiQuotaExhausted(s)).toBe(true);
    }
  });

  it('classifies generic rate limiting / 429', () => {
    expect(classifyProviderError('rate-limit exceeded').class).toBe('quota_exhausted');
    expect(classifyProviderError('HTTP 429 Too Many Requests').class).toBe('quota_exhausted');
  });

  it('classifies model-not-found', () => {
    expect(classifyProviderError('model gemini-3.1 not found').class).toBe('model_not_found');
  });

  it('classifies schema rejection', () => {
    expect(classifyProviderError('response_format schema validation failed').class).toBe(
      'schema_rejection',
    );
  });

  it('classifies timeouts', () => {
    expect(classifyProviderError('request timed out').class).toBe('timeout');
    expect(classifyProviderError('ETIMEDOUT after 600s').class).toBe('timeout');
  });

  it('classifies transient network / 5xx', () => {
    expect(classifyProviderError('ECONNRESET').class).toBe('transient');
    expect(classifyProviderError('HTTP 503 Service Unavailable').class).toBe('transient');
  });

  it('falls through to unknown', () => {
    const c = classifyProviderError('something totally unexpected here');
    expect(c.class).toBe('unknown');
    expect(c.retriable).toBe(false);
  });

  it('GEMINI_FALLBACK_MODELS is a non-empty, frozen array', () => {
    expect(GEMINI_FALLBACK_MODELS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(GEMINI_FALLBACK_MODELS)).toBe(true);
  });
});
