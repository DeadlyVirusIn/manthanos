// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// BATCH1 validation regression fix: the static `p 1 3-5` example in
// brain-review HELP_TEXT failed when the queue had fewer than 5
// facts. This test pins the queue-size-aware behavior — the inline
// example must always reference indices that exist.

import { describe, expect, it } from 'vitest';
import { buildHelpText } from '../src/commands/brain-review.js';

describe('brain-review buildHelpText (queue-size-aware)', () => {
  it('empty queue: no promote example, instructs the operator to quit', () => {
    const out = buildHelpText(0);
    expect(out).toContain('no facts pending');
    expect(out).toContain('`q`');
    // Inline example should not promise an index that does not exist.
    expect(out).toContain('(e.g. "p 1")');
  });

  it('1-fact queue: example is `p 1`', () => {
    const out = buildHelpText(1);
    expect(out).toContain('Example:  `p 1` to promote the only fact');
    expect(out).toContain('(e.g. "p 1")');
    // No range example that would fail.
    expect(out).not.toContain('p 1-2');
    expect(out).not.toContain('p 1 3');
  });

  it('2-fact queue: example is `p 1-2`', () => {
    const out = buildHelpText(2);
    expect(out).toContain('Example:  `p 1-2` to promote both facts');
    expect(out).toContain('(e.g. "p 1-2")');
    expect(out).not.toContain('p 1 3');
  });

  it('3-fact queue: example references indices 1 and 3 (real indices)', () => {
    const out = buildHelpText(3);
    expect(out).toContain('p 1 3-3');
    expect(out).toContain('(e.g. "p 1 3")');
    // Critically — no '3-5' or anything beyond the queue size.
    expect(out).not.toMatch(/3-[4-9]/);
  });

  it('5-fact queue: full-range example fits the queue', () => {
    const out = buildHelpText(5);
    expect(out).toContain('p 1 3-5');
    expect(out).toContain('(e.g. "p 1 3")');
  });

  it('large queue (20 facts): example fits actual queue size', () => {
    const out = buildHelpText(20);
    expect(out).toContain('p 1 3-20');
    expect(out).toContain('(e.g. "p 1 3")');
  });

  it('regression: no static `p 1 3-5` example appears for any queue size below 5', () => {
    // The literal BATCH1 failure mode.
    for (const n of [0, 1, 2, 3, 4]) {
      const out = buildHelpText(n);
      expect(out).not.toMatch(/`p 1 3-5`/);
    }
  });

  it('every queue size produces an example whose indices are all in [1, n]', () => {
    // Property: any range like "a-b" in the example must satisfy
    // 1 <= a <= b <= n. Any single index "a" must satisfy 1 <= a <= n.
    for (const n of [1, 2, 3, 4, 5, 7, 10]) {
      const out = buildHelpText(n);
      const ranges = [...out.matchAll(/(\d+)-(\d+)/g)];
      for (const [, a, b] of ranges) {
        expect(Number(a)).toBeGreaterThanOrEqual(1);
        expect(Number(a)).toBeLessThanOrEqual(n);
        expect(Number(b)).toBeGreaterThanOrEqual(Number(a));
        expect(Number(b)).toBeLessThanOrEqual(n);
      }
    }
  });
});
