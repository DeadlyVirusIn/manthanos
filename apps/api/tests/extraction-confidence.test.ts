// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.1 — unit tests for the confidence/bucket data model.
// Pure module: no extractor, scorer, AI, or UI under test here.

import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_BUCKETS,
  CONFIDENCE_REASON_FLAGS,
  bucketForScore,
  bucketLabelForScore,
  clampConfidence,
  isConfidenceReasonFlag,
  parseReasonFlags,
} from '../src/services/extraction/confidence.js';

describe('clampConfidence', () => {
  it('passes through in-range values', () => {
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(1)).toBe(1);
  });
  it('clamps out-of-range and non-finite values to [0,1]', () => {
    expect(clampConfidence(-0.3)).toBe(0);
    expect(clampConfidence(1.7)).toBe(1);
    expect(clampConfidence(Number.NaN)).toBe(0);
    expect(clampConfidence(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('bucketForScore — Sprint 3B.1 ranges + boundaries', () => {
  const cases: ReadonlyArray<[score: number, label: string]> = [
    [0.0, 'Needs Review'],
    [0.39, 'Needs Review'],
    [0.4, 'Tentative'],
    [0.69, 'Tentative'],
    [0.7, 'Solid'],
    [0.89, 'Solid'],
    [0.9, 'Strong'],
    [1.0, 'Strong'],
  ];
  for (const [score, label] of cases) {
    it(`maps ${score} → ${label}`, () => {
      expect(bucketLabelForScore(score)).toBe(label);
    });
  }

  it('does NOT use tier labels (Noted / Well-evidenced) for confidence', () => {
    const labels = CONFIDENCE_BUCKETS.map((b) => b.label);
    expect(labels).toEqual(['Needs Review', 'Tentative', 'Solid', 'Strong']);
    expect(labels).not.toContain('Noted');
    expect(labels).not.toContain('Well-evidenced');
  });

  it('clamps out-of-range scores before bucketing', () => {
    expect(bucketLabelForScore(-1)).toBe('Needs Review');
    expect(bucketLabelForScore(2)).toBe('Strong');
  });

  it('buckets tile [0,1] with no gap (every score maps somewhere)', () => {
    for (let s = 0; s <= 1.0001; s += 0.01) {
      expect(() => bucketForScore(s)).not.toThrow();
      expect(bucketForScore(s).label).toBeTruthy();
    }
  });
});

describe('reason flags', () => {
  it('recognizes known flags and rejects unknown', () => {
    expect(isConfidenceReasonFlag('quote_backed')).toBe(true);
    expect(isConfidenceReasonFlag('definitely_not_a_flag')).toBe(false);
    expect(isConfidenceReasonFlag(42)).toBe(false);
  });

  it('parseReasonFlags is enum-drift safe: drops unknowns, dedupes, never throws', () => {
    expect(parseReasonFlags(['quote_backed', 'mystery', 'quote_backed', 'ambiguous'])).toEqual([
      'quote_backed',
      'ambiguous',
    ]);
    expect(parseReasonFlags('not-an-array')).toEqual([]);
    expect(parseReasonFlags(null)).toEqual([]);
    expect(parseReasonFlags([1, 2, 3])).toEqual([]);
  });

  it('exposes a stable flag vocabulary', () => {
    expect(CONFIDENCE_REASON_FLAGS).toContain('needs_human_review');
    expect(CONFIDENCE_REASON_FLAGS).toContain('possible_duplicate');
    expect(new Set(CONFIDENCE_REASON_FLAGS).size).toBe(CONFIDENCE_REASON_FLAGS.length);
  });
});
