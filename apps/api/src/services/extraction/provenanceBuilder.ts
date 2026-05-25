// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.3 — extraction provenance builder.
//
// Pure function that assembles the provenance metadata recorded when a
// candidate is approved into a fact (the persistence/route wiring lands
// in 3B.5). It performs NO database writes and NO IO. The caller supplies
// the timestamp, so this function uses no Date.now/random and is fully
// deterministic.
//
// This describes EXTRACTION provenance (how a candidate was produced) and
// its `extraction_confidence` — distinct from a fact's substrate
// `confidence` (corroboration strength), which this module never touches.

import {
  type ConfidenceReasonFlag,
  type ConfidenceResult,
  type ConfidenceScore,
  type ExtractionSource,
  clampConfidence,
  parseReasonFlags,
} from './confidence.js';
import type { ExtractedCandidate } from './extractor.js';

export interface ExtractionProvenance {
  /** 'conversation' for deterministic extraction; 'ai_assisted' when an
   *  LLM validator contributed (later phases). */
  readonly source: ExtractionSource;
  readonly conversation_id: string;
  readonly source_quote_id: string | null;
  /** ISO-8601 timestamp, supplied by the caller. */
  readonly created_at: string;
  readonly extraction_confidence: ConfidenceScore;
  readonly reason_flags: ConfidenceReasonFlag[];
  readonly extractor_version: string;
  /** Set only when an LLM validator ran; null for deterministic-only. */
  readonly model_used: string | null;
}

export interface BuildExtractionProvenanceArgs {
  readonly conversationId: string;
  readonly candidate: Pick<ExtractedCandidate, 'source_quote_id'>;
  readonly confidence: ConfidenceResult;
  readonly extractorVersion: string;
  /** ISO-8601 timestamp — passed in so the builder stays pure. */
  readonly createdAt: string;
  /** Only set when an LLM validator ran (3B.7+); null/undefined for now. */
  readonly modelUsed?: string | null;
}

/**
 * Build extraction provenance metadata. Pure and deterministic: no IO,
 * no Date.now, no input mutation. Defensively clamps the confidence and
 * sanitizes reason flags (enum-drift safe), and normalizes optional
 * fields to `null`.
 */
export function buildExtractionProvenance(
  args: BuildExtractionProvenanceArgs,
): ExtractionProvenance {
  const model_used = args.modelUsed ?? null;
  const rawQuoteId = args.candidate.source_quote_id;
  const source_quote_id =
    typeof rawQuoteId === 'string' && rawQuoteId.length > 0 ? rawQuoteId : null;

  return {
    source: model_used !== null ? 'ai_assisted' : 'conversation',
    conversation_id: args.conversationId,
    source_quote_id,
    created_at: args.createdAt,
    extraction_confidence: clampConfidence(args.confidence.score),
    reason_flags: parseReasonFlags(args.confidence.reason_flags),
    extractor_version: args.extractorVersion,
    model_used,
  };
}
