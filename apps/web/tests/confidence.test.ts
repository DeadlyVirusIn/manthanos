// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the web-side extraction-confidence bucketing. Sprint 3B.6.
// The bucket is a pure view over the numeric score; these lock the
// thresholds (mirrored from the backend) and the boundary behaviour.

import { describe, expect, it } from 'vitest';

import { confidenceBucketKey } from '../src/lib/confidence.js';

describe('confidenceBucketKey — thresholds', () => {
  it('maps the bottom band to needs_review', () => {
    expect(confidenceBucketKey(0)).toBe('needs_review');
    expect(confidenceBucketKey(0.2)).toBe('needs_review');
    expect(confidenceBucketKey(0.39)).toBe('needs_review');
  });

  it('maps the middle band to tentative', () => {
    expect(confidenceBucketKey(0.4)).toBe('tentative');
    expect(confidenceBucketKey(0.69)).toBe('tentative');
  });

  it('maps the upper band to solid', () => {
    expect(confidenceBucketKey(0.7)).toBe('solid');
    expect(confidenceBucketKey(0.89)).toBe('solid');
  });

  it('maps the top band to strong, including exactly 1.0', () => {
    expect(confidenceBucketKey(0.9)).toBe('strong');
    expect(confidenceBucketKey(1)).toBe('strong');
  });
});

describe('confidenceBucketKey — boundary exactness', () => {
  it('puts each lower bound in the higher bucket', () => {
    expect(confidenceBucketKey(0.4)).toBe('tentative');
    expect(confidenceBucketKey(0.7)).toBe('solid');
    expect(confidenceBucketKey(0.9)).toBe('strong');
  });
});

describe('confidenceBucketKey — malformed input never inflates', () => {
  it('clamps out-of-range and non-finite scores to the lowest bucket', () => {
    expect(confidenceBucketKey(Number.NaN)).toBe('needs_review');
    expect(confidenceBucketKey(-5)).toBe('needs_review');
    expect(confidenceBucketKey(Number.NEGATIVE_INFINITY)).toBe('needs_review');
  });

  it('clamps above-1 scores down into strong rather than off the table', () => {
    expect(confidenceBucketKey(2)).toBe('strong');
    expect(confidenceBucketKey(Number.POSITIVE_INFINITY)).toBe('strong');
  });
});
