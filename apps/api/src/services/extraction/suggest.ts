// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.5 — candidate assembly pipeline (pure).
//
// Wires the deterministic stages into enriched suggestion candidates:
//   extractCandidateFacts → scoreConfidence → detectDuplicates
//   → buildExtractionProvenance
//
// Pure: the caller supplies `createdAt`, so there is no Date.now/random/IO
// here. It performs NO persistence, NO DB writes, NO audit events, and NO
// mutation. The HTTP route (registerExtractionRoutes) does the read-only
// IO and stamps the timestamp.

import type { ConversationView } from '../conversations.js';
import {
  CONFIDENCE_REASON_FLAGS,
  type ConfidenceReasonFlag,
  type ConfidenceScore,
  scoreConfidence,
} from './confidence.js';
import {
  type DuplicateKind,
  type ExistingFactLike,
  detectDuplicates,
  duplicateReasonFlags,
} from './duplicates.js';
import { EXTRACTOR_VERSION, MAX_QUOTES_PROCESSED, extractCandidateFacts } from './extractor.js';
import { type ExtractionProvenance, buildExtractionProvenance } from './provenanceBuilder.js';

export interface SuggestedCandidateDuplicate {
  readonly kind: Exclude<DuplicateKind, 'none'>;
  readonly fact_id?: string;
  readonly similarity?: number;
}

export interface SuggestedCandidate {
  readonly area: string;
  readonly statement: string;
  readonly source_quote_id?: string;
  readonly confidence_score: ConfidenceScore;
  readonly confidence_reasons: ConfidenceReasonFlag[];
  /** Present only when a duplicate relationship exists (advisory). */
  readonly duplicate?: SuggestedCandidateDuplicate;
  readonly provenance_preview: ExtractionProvenance;
}

/** Sprint 3B.6.5 input bound: at most this many candidates are returned
 *  per suggestion. Caps the response size and (downstream) the per-request
 *  model fan-out once 3B.7 lands. Applied BEFORE duplicate detection so
 *  the O(N·M) scan is bounded too. */
export const MAX_CANDIDATES = 50;

/** Explicit truncation signals so the caller/UI can say "showing the
 *  first N" rather than silently dropping data (Gemini/Codex review). */
export interface SuggestionTruncation {
  /** Conversation had more than MAX_QUOTES_PROCESSED quotes. */
  readonly quotes_truncated: boolean;
  /** More than MAX_CANDIDATES candidates were produced; list was capped. */
  readonly candidates_truncated: boolean;
  /** The existing-fact duplicate scan hit its limit (not all facts compared). */
  readonly duplicate_scan_truncated: boolean;
}

export interface SuggestExtractionsResult {
  readonly candidates: SuggestedCandidate[];
  readonly truncation: SuggestionTruncation;
}

/** Union of two flag lists, returned in CONFIDENCE_REASON_FLAGS order. */
function mergeReasonFlags(
  a: readonly ConfidenceReasonFlag[],
  b: readonly ConfidenceReasonFlag[],
): ConfidenceReasonFlag[] {
  const set = new Set<ConfidenceReasonFlag>([...a, ...b]);
  return CONFIDENCE_REASON_FLAGS.filter((f) => set.has(f));
}

export interface AssembleSuggestedCandidatesArgs {
  readonly conversation: ConversationView;
  readonly conversationId: string;
  readonly existingFacts: readonly ExistingFactLike[];
  /** ISO-8601 timestamp supplied by the caller (keeps this pure). */
  readonly createdAt: string;
  /** 3B.6.5: the route caps the existing-fact scan; pass true when the
   *  workspace had more facts than were compared. Default false. */
  readonly duplicateScanTruncated?: boolean;
}

/**
 * Assemble enriched suggestion candidates for a conversation. Pure and
 * deterministic given its inputs. Returns the house-convention wrapper
 * `{ candidates }`.
 */
export function assembleSuggestedCandidates(
  args: AssembleSuggestedCandidatesArgs,
): SuggestExtractionsResult {
  const allCandidates = extractCandidateFacts(args.conversation);
  // Cap candidates BEFORE duplicate detection so the O(N·M) scan is bounded.
  const candidatesTruncated = allCandidates.length > MAX_CANDIDATES;
  const candidates = candidatesTruncated ? allCandidates.slice(0, MAX_CANDIDATES) : allCandidates;
  const quotesTruncated = (args.conversation.verbatim_quotes?.length ?? 0) > MAX_QUOTES_PROCESSED;

  const dupAnnotations = detectDuplicates(
    candidates.map((c) => ({
      statement: c.statement,
      source_conversation_id: args.conversationId,
    })),
    args.existingFacts,
  );

  const out = candidates.map((candidate, i): SuggestedCandidate => {
    const conf = scoreConfidence(candidate);
    const dup = dupAnnotations[i] ?? { kind: 'none' as const };
    const reasons = mergeReasonFlags(conf.reason_flags, duplicateReasonFlags(dup));
    const provenance = buildExtractionProvenance({
      conversationId: args.conversationId,
      candidate,
      confidence: { score: conf.score, reason_flags: reasons },
      extractorVersion: EXTRACTOR_VERSION,
      createdAt: args.createdAt,
    });

    const base: SuggestedCandidate = {
      area: candidate.area,
      statement: candidate.statement,
      confidence_score: conf.score,
      confidence_reasons: reasons,
      provenance_preview: provenance,
    };
    const withQuote =
      candidate.source_quote_id !== undefined
        ? { ...base, source_quote_id: candidate.source_quote_id }
        : base;
    if (dup.kind === 'none') return withQuote;
    return {
      ...withQuote,
      duplicate: { kind: dup.kind, fact_id: dup.fact_id, similarity: dup.similarity },
    };
  });

  return {
    candidates: out,
    truncation: {
      quotes_truncated: quotesTruncated,
      candidates_truncated: candidatesTruncated,
      duplicate_scan_truncated: args.duplicateScanTruncated ?? false,
    },
  };
}
