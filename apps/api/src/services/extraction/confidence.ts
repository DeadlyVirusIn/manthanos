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
// As of 3B.3 it also holds the deterministic confidence scorer. It still
// contains NO extractor, NO duplicate detector, NO AI/provider code, NO
// persistence, and NO UI — those live elsewhere / land in later phases.
// Buckets are a *view* over the numeric score — labels are never
// persisted (storing only a label would re-introduce the DEFECT-001
// class of contract drift). This score is "extraction confidence" and is
// distinct from a fact's substrate `confidence` (corroboration strength).

import type { ExtractedCandidate } from './extractor.js';

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

// ── deterministic confidence scorer (3B.3) ───────────────────────
export interface ConfidenceResult {
  readonly score: ConfidenceScore;
  /** Active reason flags, in CONFIDENCE_REASON_FLAGS canonical order. */
  readonly reason_flags: ConfidenceReasonFlag[];
}

/** Additive weights / penalties for the deterministic score. */
const SCORING = {
  base: 0.5,
  quoteBacked: 0.25,
  sourceContext: 0.05,
  clearClaim: 0.15,
  subject: 0.05,
  shortPenalty: 0.2,
  ambiguousPenalty: 0.2,
} as const;

const CLEAR_CLAIM_MIN_WORDS = 4;
const SUBJECT_MIN_WORDS = 2;
const SHORT_MAX_WORDS = 3;

/** At or under this score a candidate is flagged needs_human_review. */
export const NEEDS_REVIEW_SCORE_THRESHOLD = 0.5;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Deterministically score a deterministic-extractor candidate.
 *
 * Pure: depends only on the candidate's text/shape — no Date, no random,
 * no IO, no input mutation. Returns a numeric 0–1 score plus reason flags
 * in canonical order. The display bucket is derived via bucketForScore —
 * never stored here. `possible_duplicate` is owned by the duplicate
 * detector (3B.4), not the scorer, so it is never set by this function.
 */
export function scoreConfidence(candidate: ExtractedCandidate): ConfidenceResult {
  const statement = candidate.statement.trim();
  const wordCount = statement.length === 0 ? 0 : statement.split(/\s+/).length;
  const isQuestion = statement.endsWith('?');

  const quoteBacked =
    typeof candidate.source_quote_id === 'string' && candidate.source_quote_id.length > 0;
  const hasSourceContext =
    typeof candidate.source_context === 'string' && candidate.source_context.trim().length > 0;
  const shortStatement = wordCount <= SHORT_MAX_WORDS;
  const hasSubject = wordCount >= SUBJECT_MIN_WORDS;
  const hasClearClaim = !isQuestion && wordCount >= CLEAR_CLAIM_MIN_WORDS;
  const ambiguous = isQuestion || shortStatement;

  let score: number = SCORING.base;
  if (quoteBacked) score += SCORING.quoteBacked;
  if (hasSourceContext) score += SCORING.sourceContext;
  if (hasClearClaim) score += SCORING.clearClaim;
  if (hasSubject) score += SCORING.subject;
  if (shortStatement) score -= SCORING.shortPenalty;
  if (ambiguous) score -= SCORING.ambiguousPenalty;
  score = clampConfidence(round2(score));

  const needsReview = score < NEEDS_REVIEW_SCORE_THRESHOLD || ambiguous;

  const active: Record<ConfidenceReasonFlag, boolean> = {
    has_clear_claim: hasClearClaim,
    has_subject: hasSubject,
    has_source_context: hasSourceContext,
    quote_backed: quoteBacked,
    ambiguous,
    short_statement: shortStatement,
    possible_duplicate: false, // owned by the duplicate detector (3B.4)
    needs_human_review: needsReview,
  };
  const reason_flags = CONFIDENCE_REASON_FLAGS.filter((f) => active[f]);
  return { score, reason_flags };
}
