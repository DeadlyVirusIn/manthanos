// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Smoke tests for skeleton loading primitives. Sprint 2 M2 C2.1.
//
// The primitives are presentational — we assert they render at all,
// expose role="status" + aria-busy for screen readers, and honour the
// configurable shape (line count, custom widths).

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CardSkeleton, LineSkeleton, TextSkeleton } from '../src/components/index.js';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('LineSkeleton', () => {
  it('renders with role="status" and aria-busy', () => {
    const html = renderToString(<LineSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="line-skeleton"');
  });

  it('exposes "Loading" as the default accessible label', () => {
    const html = renderToString(<LineSkeleton />);
    expect(html).toContain('aria-label="Loading"');
  });

  it('honours a custom aria-label', () => {
    const html = renderToString(<LineSkeleton ariaLabel="Loading name" />);
    expect(html).toContain('aria-label="Loading name"');
  });
});

describe('TextSkeleton', () => {
  it('renders the default 3 lines', () => {
    const html = renderToString(<TextSkeleton />);
    expect(countOccurrences(html, 'data-testid="line-skeleton"')).toBe(3);
    expect(html).toContain('data-testid="text-skeleton"');
  });

  it('renders exactly N lines when lines={N}', () => {
    const html = renderToString(<TextSkeleton lines={5} />);
    expect(countOccurrences(html, 'data-testid="line-skeleton"')).toBe(5);
  });

  it('clamps zero/negative lines to a single line', () => {
    expect(countOccurrences(renderToString(<TextSkeleton lines={0} />), 'line-skeleton')).toBe(1);
    expect(countOccurrences(renderToString(<TextSkeleton lines={-3} />), 'line-skeleton')).toBe(1);
  });

  it('uses <output> (implicit role=status) with aria-busy', () => {
    const html = renderToString(<TextSkeleton />);
    expect(html).toContain('<output');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('CardSkeleton', () => {
  it('renders two interior lines', () => {
    const html = renderToString(<CardSkeleton />);
    expect(countOccurrences(html, 'data-testid="line-skeleton"')).toBe(2);
  });

  it('uses <output> (implicit role=status) with aria-busy', () => {
    const html = renderToString(<CardSkeleton />);
    expect(html).toContain('<output');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="card-skeleton"');
  });
});
