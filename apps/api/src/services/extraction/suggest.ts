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
import { EXTRACTOR_VERSION, extractCandidateFacts } from './extractor.js';
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

export interface SuggestExtractionsResult {
  readonly candidates: SuggestedCandidate[];
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
}

/**
 * Assemble enriched suggestion candidates for a conversation. Pure and
 * deterministic given its inputs. Returns the house-convention wrapper
 * `{ candidates }`.
 */
export function assembleSuggestedCandidates(
  args: AssembleSuggestedCandidatesArgs,
): SuggestExtractionsResult {
  const candidates = extractCandidateFacts(args.conversation);

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

  return { candidates: out };
}
