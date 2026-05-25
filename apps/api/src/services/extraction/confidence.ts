// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.1 — confidence/provenance data model (constants + types only).
//
// This module is the single source of truth for:
//   • the extraction-confidence score model (numeric 0.0–1.0)
//   • the confidence reason-flag vocabulary (+ enum-drift-safe parsing)
//   • the display bucket thresholds and labels
//   • the provenance extraction-metadata shape (mirrors migration 0009)
//
// It contains NO extractor, NO scorer algorithm, NO duplicate detector,
// NO AI/provider code, and NO UI. Those land in later phases (3B.2+).
// Buckets are a *view* over the stored numeric score — labels are never
// persisted (storing only a label would re-introduce the DEFECT-001
// class of contract drift).

// ── confidence score ──────────────────────────────────────────────
/** Extraction-confidence score. Always in the closed interval [0, 1]. */
export type ConfidenceScore = number;

/** Clamp an arbitrary number into the valid [0, 1] confidence range. */
export function clampConfidence(value: number): ConfidenceScore {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0; // includes -Infinity
  if (value > 1) return 1; // includes +Infinity
  return value;
}

// ── reason flags ──────────────────────────────────────────────────
/** Structural reasons that explain/qualify a candidate's confidence. */
export const CONFIDENCE_REASON_FLAGS = [
  'has_clear_claim',
  'has_subject',
  'has_source_context',
  'quote_backed',
  'ambiguous',
  'short_statement',
  'possible_duplicate',
  'needs_human_review',
] as const;

export type ConfidenceReasonFlag = (typeof CONFIDENCE_REASON_FLAGS)[number];

const REASON_FLAG_SET: ReadonlySet<string> = new Set(CONFIDENCE_REASON_FLAGS);

export function isConfidenceReasonFlag(value: unknown): value is ConfidenceReasonFlag {
  return typeof value === 'string' && REASON_FLAG_SET.has(value);
}

/**
 * Parse a stored/received reason-flags value into a clean list.
 * Enum-drift safe (Multica discipline): non-arrays yield `[]`, unknown
 * flag strings are dropped rather than throwing, and duplicates are
 * removed while preserving first-seen order.
 */
export function parseReasonFlags(value: unknown): ConfidenceReasonFlag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ConfidenceReasonFlag>();
  for (const item of value) {
    if (isConfidenceReasonFlag(item)) seen.add(item);
  }
  return [...seen];
}

// ── display buckets (view over the numeric score) ─────────────────
export type ConfidenceBucketLabel = 'Needs Review' | 'Tentative' | 'Solid' | 'Strong';

export interface ConfidenceBucket {
  readonly label: ConfidenceBucketLabel;
  /** Inclusive lower bound. */
  readonly min: number;
  /** Exclusive upper bound (except the top bucket, which includes 1.0). */
  readonly maxExclusive: number;
}

/**
 * Bucket thresholds (single source of truth). Ranges, per Sprint 3B.1:
 *   0.00–0.39 Needs Review · 0.40–0.69 Tentative ·
 *   0.70–0.89 Solid        · 0.90–1.00 Strong
 * Expressed as [min, maxExclusive) so float scores map cleanly; the top
 * bucket's maxExclusive is > 1 so 1.0 is included.
 */
export const CONFIDENCE_BUCKETS: readonly ConfidenceBucket[] = [
  { label: 'Needs Review', min: 0.0, maxExclusive: 0.4 },
  { label: 'Tentative', min: 0.4, maxExclusive: 0.7 },
  { label: 'Solid', min: 0.7, maxExclusive: 0.9 },
  { label: 'Strong', min: 0.9, maxExclusive: Number.POSITIVE_INFINITY },
] as const;

/** Map a numeric score to its display bucket. Pure; clamps out-of-range input. */
export function bucketForScore(score: number): ConfidenceBucket {
  const s = clampConfidence(score);
  for (const bucket of CONFIDENCE_BUCKETS) {
    if (s >= bucket.min && s < bucket.maxExclusive) return bucket;
  }
  // Unreachable given the table covers [0, ∞); kept for total-function safety.
  return CONFIDENCE_BUCKETS[CONFIDENCE_BUCKETS.length - 1] as ConfidenceBucket;
}

/** Convenience: just the label for a score. */
export function bucketLabelForScore(score: number): ConfidenceBucketLabel {
  return bucketForScore(score).label;
}

// ── provenance source kinds ───────────────────────────────────────
/** How a fact's provenance row originated. Stored in provenance metadata. */
export const EXTRACTION_SOURCES = ['conversation', 'manual', 'ai_assisted'] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

// ── provenance extraction metadata (mirrors migration 0009 columns) ──
/**
 * Optional extraction metadata persisted alongside a provenance row.
 * Every field is nullable/optional to match the additive 0009 columns;
 * reads/writes are wired in later phases (3B.3/3B.5).
 */
export interface ProvenanceExtractionMeta {
  readonly extraction_confidence?: ConfidenceScore | null;
  readonly extractor_version?: string | null;
  readonly model_used?: string | null;
  readonly reason_flags?: readonly ConfidenceReasonFlag[] | null;
}
