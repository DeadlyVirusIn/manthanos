// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6 — web-side extraction-confidence bucketing.
//
// The numeric extraction-confidence score is the source of truth; the
// display bucket is a pure VIEW over it (no label is ever persisted —
// storing a label would re-create the DEFECT-001-class score/label
// drift). This mirrors the backend thresholds in
// apps/api/src/services/extraction/confidence.ts (CONFIDENCE_BUCKETS):
//   0.00–0.39 needs_review · 0.40–0.69 tentative ·
//   0.70–0.89 solid        · 0.90–1.00 strong
// The friendly copy for each key lives in i18n/labels.ts
// (confidence_bucket) so no raw token reaches the DOM.

import { ALLOWED_CONFIDENCE_BUCKET, type ConfidenceBucketValue } from '../api/types.js';

interface BucketRange {
  readonly key: ConfidenceBucketValue;
  readonly min: number;
  /** Exclusive upper bound; the top bucket uses +Infinity so 1.0 is included. */
  readonly maxExclusive: number;
}

const BUCKET_RANGES: readonly BucketRange[] = [
  { key: 'needs_review', min: 0.0, maxExclusive: 0.4 },
  { key: 'tentative', min: 0.4, maxExclusive: 0.7 },
  { key: 'solid', min: 0.7, maxExclusive: 0.9 },
  { key: 'strong', min: 0.9, maxExclusive: Number.POSITIVE_INFINITY },
];

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Map a numeric extraction-confidence score to its display-bucket key.
 *  Pure; clamps out-of-range input. Returns the lowest bucket for NaN /
 *  negative input so a malformed score never renders as "Strong". */
export function confidenceBucketKey(score: number): ConfidenceBucketValue {
  const s = clamp01(score);
  for (const range of BUCKET_RANGES) {
    if (s >= range.min && s < range.maxExclusive) return range.key;
  }
  // Unreachable (table covers [0, ∞)); kept for total-function safety.
  return ALLOWED_CONFIDENCE_BUCKET[ALLOWED_CONFIDENCE_BUCKET.length - 1] as ConfidenceBucketValue;
}
