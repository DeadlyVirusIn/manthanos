// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { nonceCollidesWithText, unwrapNonce, wrapWithNonce } from '../src/nonce.js';

describe('wrapWithNonce', () => {
  it('produces matching BEGIN/END markers containing the nonce', () => {
    const { wrapped, nonce, beginMarker, endMarker } = wrapWithNonce('hello');
    expect(beginMarker).toContain(nonce);
    expect(endMarker).toContain(nonce);
    expect(wrapped.startsWith(beginMarker)).toBe(true);
    expect(wrapped.endsWith(endMarker)).toBe(true);
    expect(wrapped).toContain('\nhello\n');
  });

  it('round-trips through unwrapNonce', () => {
    const text = 'plan { steps: [...] }';
    const { wrapped, nonce } = wrapWithNonce(text);
    expect(unwrapNonce(wrapped, nonce)).toBe(text);
  });

  it('emits a fresh nonce per call (32 hex chars, no collisions across 100 calls)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { nonce } = wrapWithNonce('x');
      expect(/^[0-9a-f]{32}$/.test(nonce)).toBe(true);
      seen.add(nonce);
    }
    expect(seen.size).toBe(100);
  });

  it('unwrap returns null when nonce is wrong', () => {
    const { wrapped } = wrapWithNonce('payload');
    expect(unwrapNonce(wrapped, 'cafebabe'.repeat(4))).toBeNull();
  });

  it('detects nonce collision against arbitrary text', () => {
    const collidingNonce = 'a'.repeat(32);
    const text = `MANTHAN_UNTRUSTED_BEGIN_${collidingNonce} oops`;
    expect(nonceCollidesWithText(text, collidingNonce)).toBe(true);
    expect(nonceCollidesWithText(text, 'b'.repeat(32))).toBe(false);
  });

  it('preserves multi-line content verbatim through round-trip', () => {
    const text = 'line one\nline two\n  indented\n';
    const { wrapped, nonce } = wrapWithNonce(text);
    expect(unwrapNonce(wrapped, nonce)).toBe(text);
  });
});
