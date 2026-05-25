// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — contract-drift guard (web side).
//
// The extraction enums and confidence thresholds are hand-mirrored between
// @manthanos/web (this package) and @manthanos/api. The packages cannot
// import each other here, so each pins its tuples to the SAME canonical
// literals; a divergence on either side fails that side's test. Keep
// CANONICAL_* identical to apps/api/tests/extraction-contract-drift.test.ts.

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CANDIDATE_DUPLICATE_KIND,
  ALLOWED_CONFIDENCE_BUCKET,
  ALLOWED_EXTRACTION_REASON,
  ALLOWED_EXTRACTION_SOURCE,
} from '../src/api/types.js';
import { confidenceBucketKey } from '../src/lib/confidence.js';

// ── Canonical source of truth (mirror in the API drift test) ──────
const CANONICAL_REASON_FLAGS = [
  'has_clear_claim',
  'has_subject',
  'has_source_context',
  'quote_backed',
  'ambiguous',
  'short_statement',
  'possible_duplicate',
  'needs_human_review',
];
const CANONICAL_SOURCES = ['conversation', 'manual', 'ai_assisted'];
const CANONICAL_DUPLICATE_KINDS = ['exact', 'likely', 'corroborates'];
const CANONICAL_BUCKET_KEYS = ['needs_review', 'tentative', 'solid', 'strong'];

describe('contract drift — web tuples match the canonical source of truth', () => {
  it('reason flags', () => {
    expect([...ALLOWED_EXTRACTION_REASON]).toEqual(CANONICAL_REASON_FLAGS);
  });

  it('extraction sources', () => {
    expect([...ALLOWED_EXTRACTION_SOURCE]).toEqual(CANONICAL_SOURCES);
  });

  it('duplicate kinds', () => {
    expect([...ALLOWED_CANDIDATE_DUPLICATE_KIND]).toEqual(CANONICAL_DUPLICATE_KINDS);
  });

  it('confidence bucket keys', () => {
    expect([...ALLOWED_CONFIDENCE_BUCKET]).toEqual(CANONICAL_BUCKET_KEYS);
  });
});

describe('contract drift — web bucket thresholds match the API thresholds', () => {
  // Behavioral pin of the [min, maxExclusive) boundaries: 0.4 / 0.7 / 0.9.
  it('maps boundary scores to the same buckets the API thresholds imply', () => {
    expect(confidenceBucketKey(0.39)).toBe('needs_review');
    expect(confidenceBucketKey(0.4)).toBe('tentative');
    expect(confidenceBucketKey(0.69)).toBe('tentative');
    expect(confidenceBucketKey(0.7)).toBe('solid');
    expect(confidenceBucketKey(0.89)).toBe('solid');
    expect(confidenceBucketKey(0.9)).toBe('strong');
    expect(confidenceBucketKey(1)).toBe('strong');
  });
});
