// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.4 — deterministic duplicate detector (advisory).
//
// Pure read/model function. Annotates each candidate with its strongest
// duplicate relationship to the existing facts. It performs NO database
// IO, NO writes, NO network, NO embeddings, NO vector search, NO LLM
// semantic comparison, and NO contradiction detection. Output is advisory
// only (no hard errors), deterministic, and never mutates its inputs.
//
// Matching is text-only:
//   • exact        — equal statement_hash (when both present) OR equal
//                    normalized statement text
//   • corroborates — an exact text match whose existing fact is sourced
//                    from different conversation(s) than this candidate
//                    (new evidence for the same claim) — only when that
//                    source information is available
//   • likely       — Jaccard token-set similarity >= threshold
//   • none         — no match
//
// The `possible_duplicate` reason flag is owned by THIS phase (the scorer
// never sets it); use duplicateReasonFlags() to derive it.

import type { ConfidenceReasonFlag } from './confidence.js';

// ── thresholds / constants (named + tested) ──────────────────────
/** Minimum Jaccard token-set similarity to call a pair a likely duplicate. */
export const LIKELY_SIMILARITY_THRESHOLD = 0.6;
/** Statements with fewer normalized tokens than this skip likely matching
 *  (too short for token overlap to be meaningful); exact matching still
 *  applies. */
export const MIN_TOKENS_FOR_LIKELY = 3;

export type DuplicateKind = 'exact' | 'likely' | 'corroborates' | 'none';

export interface DuplicateAnnotation {
  readonly kind: DuplicateKind;
  /** Matched fact id; present for exact / likely / corroborates. */
  readonly fact_id?: string;
  /** Similarity in [0,1]; 1 for exact/corroborates, computed for likely. */
  readonly similarity?: number;
}

/** Minimal candidate shape (ExtractedCandidate is assignable to it). */
export interface DuplicateCandidateLike {
  readonly statement: string;
  readonly statement_hash?: string | null;
  /** The conversation this candidate was extracted from, when known. */
  readonly source_conversation_id?: string | null;
}

/** Minimal existing-fact shape (FactView is assignable to it). */
export interface ExistingFactLike {
  readonly id: string;
  readonly statement: string;
  readonly statement_hash?: string | null;
  /** Conversations already feeding this fact, when known (enables the
   *  corroborates distinction). */
  readonly source_conversation_ids?: readonly string[] | null;
}

// ── normalization + similarity (pure) ─────────────────────────────
/** Lowercase, strip punctuation to spaces, collapse whitespace, trim. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Jaccard index over token *sets*: |A∩B| / |A∪B|. 0 when either empty. */
function jaccard(aTokens: readonly string[], bTokens: readonly string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : round4(inter / union);
}

function hashMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === 'string' && a.length > 0 && a === b;
}

/** True when `nextId` should replace `currentId` as the lexicographically
 *  lower tie-break winner. */
function preferLowerId(currentId: string | undefined, nextId: string): boolean {
  return currentId === undefined || nextId < currentId;
}

/**
 * Annotate each candidate with its strongest duplicate relationship to
 * `existingFacts`. Returns one annotation per candidate, in the same
 * order. Pure and deterministic; inputs are never mutated.
 */
export function detectDuplicates(
  candidates: readonly DuplicateCandidateLike[],
  existingFacts: readonly ExistingFactLike[],
): DuplicateAnnotation[] {
  // Precompute normalized/token forms for facts once (read-only).
  const facts = existingFacts.map((f) => {
    const norm = normalize(f.statement);
    return { fact: f, norm, tokens: tokenize(norm) };
  });

  return candidates.map((candidate): DuplicateAnnotation => {
    const candNorm = normalize(candidate.statement);
    if (candNorm.length === 0) return { kind: 'none' };
    const candTokens = tokenize(candNorm);

    // 1) Exact: hash equality (both present) or normalized-text equality.
    //    Tie-break to the lexicographically lowest fact id for stability.
    let exactId: string | undefined;
    let exactSourceIds: readonly string[] | null | undefined;
    for (const { fact, norm } of facts) {
      const isExact = hashMatch(candidate.statement_hash, fact.statement_hash) || norm === candNorm;
      if (isExact && preferLowerId(exactId, fact.id)) {
        exactId = fact.id;
        exactSourceIds = fact.source_conversation_ids;
      }
    }
    if (exactId !== undefined) {
      const candConv = candidate.source_conversation_id;
      const corroborates =
        typeof candConv === 'string' &&
        candConv.length > 0 &&
        Array.isArray(exactSourceIds) &&
        exactSourceIds.length > 0 &&
        !exactSourceIds.includes(candConv);
      return { kind: corroborates ? 'corroborates' : 'exact', fact_id: exactId, similarity: 1 };
    }

    // 2) Likely: best qualifying Jaccard similarity. Skip when the
    //    candidate is too short for token overlap to be meaningful.
    if (candTokens.length >= MIN_TOKENS_FOR_LIKELY) {
      let bestId: string | undefined;
      let bestSim = 0;
      for (const { fact, tokens } of facts) {
        if (tokens.length < MIN_TOKENS_FOR_LIKELY) continue;
        const sim = jaccard(candTokens, tokens);
        if (sim < LIKELY_SIMILARITY_THRESHOLD) continue;
        if (sim > bestSim || (sim === bestSim && preferLowerId(bestId, fact.id))) {
          bestSim = sim;
          bestId = fact.id;
        }
      }
      if (bestId !== undefined) {
        return { kind: 'likely', fact_id: bestId, similarity: bestSim };
      }
    }

    return { kind: 'none' };
  });
}

/** Reason flags contributed by duplicate detection. Owned by this phase
 *  only — the scorer never sets `possible_duplicate`. */
export function duplicateReasonFlags(annotation: DuplicateAnnotation): ConfidenceReasonFlag[] {
  return annotation.kind === 'none' ? [] : ['possible_duplicate'];
}
