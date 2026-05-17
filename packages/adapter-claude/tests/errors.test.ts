// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { mapAnthropicError } from '../src/errors.js';

describe('mapAnthropicError', () => {
  it('maps 401 to auth', () => {
    const err = mapAnthropicError({ status: 401, message: 'invalid key' });
    expect(err.code).toBe('auth');
    expect(err.retriable).toBe(false);
  });

  it('maps 429 to rate_limited, retriable', () => {
    const err = mapAnthropicError({
      status: 429,
      headers: { 'retry-after': '7' },
      error: { message: 'slow down' },
    });
    expect(err.code).toBe('rate_limited');
    expect(err.retriable).toBe(true);
    expect(err.retryAfterMs).toBe(7000);
  });

  it('maps 500 to overloaded', () => {
    const err = mapAnthropicError({ status: 500 });
    expect(err.code).toBe('overloaded');
    expect(err.retriable).toBe(true);
  });

  it('maps context_window error in body', () => {
    const err = mapAnthropicError({
      status: 400,
      error: { type: 'invalid_request_error: context_window_exceeded' },
    });
    expect(err.code).toBe('context_window');
  });

  it('maps AbortError to cancelled', () => {
    const err = mapAnthropicError({ name: 'AbortError' });
    expect(err.code).toBe('cancelled');
    expect(err.retriable).toBe(false);
  });

  it('maps network errors to network', () => {
    const err = mapAnthropicError({ code: 'ECONNRESET' });
    expect(err.code).toBe('network');
    expect(err.retriable).toBe(true);
  });

  it('unknown error maps to internal', () => {
    const err = mapAnthropicError(new Error('something broke'));
    expect(err.code).toBe('internal');
    expect(err.retriable).toBe(false);
  });
});
