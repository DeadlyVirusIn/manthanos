// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.2 — deterministic candidate extractor.
//
// Pure function. Given a conversation, it proposes candidate facts from
// the data ManthanOS already stores (verbatim quotes first; the optional
// summary as a light secondary source). It performs NO database writes,
// NO network/LLM calls, NO duplicate detection against existing facts,
// and NO persistence. It returns *candidates only* — confidence scoring
// (3B.3), cross-fact duplicate detection (3B.4), the API (3B.5), and the
// review UI (3B.6) land in later phases.
//
// Determinism: output depends solely on the input conversation. Quotes
// are processed in `position` order; the summary candidate (if any) comes
// last; in-memory dedupe keeps the first occurrence of each normalized
// statement (so a quote-backed candidate wins over a summary-backed one).

import type { ConversationView } from '../conversations.js';

/** Bump when the deterministic extraction logic changes in a way that
 *  should be recorded in provenance (wired in 3B.3/3B.5). */
export const EXTRACTOR_VERSION = 'det-1';

/** Default topical area for a freshly extracted candidate. The human sets
 *  the real area during review; deterministic extraction cannot infer a
 *  topic without heuristics/LLM, so we never guess one here. */
export const DEFAULT_CANDIDATE_AREA = 'general';

/** Statements shorter than this many normalized characters are treated as
 *  noise (e.g. "ok", "hi") and dropped. */
export const MIN_STATEMENT_CHARS = 3;

/** Sprint 3B.6.5 input bound: at most this many quotes are processed per
 *  conversation. Bounds the O(N) quote loop (and, downstream, the O(N·M)
 *  duplicate scan) so a pathologically large conversation cannot stall
 *  the event loop or — once 3B.7 forwards candidates to a model — balloon
 *  spend. Real discovery conversations are far smaller; this is a guard,
 *  not a product limit. Quotes are processed in position order, so the
 *  cap keeps the earliest quotes. */
export const MAX_QUOTES_PROCESSED = 200;

/** A proposed fact derived deterministically from a conversation.
 *  Confidence/reason-flags are added by the scorer in 3B.3. */
export interface ExtractedCandidate {
  /** Suggested area; a placeholder the human edits in review. */
  readonly area: string;
  /** Cleaned statement text (trimmed, whitespace-collapsed). */
  readonly statement: string;
  /** Present when the candidate came from a verbatim quote. */
  readonly source_quote_id?: string;
  /** Raw evidence/source text the candidate was derived from. */
  readonly source_context?: string;
}

/** Minimal structural input — `ConversationView` is assignable to it. */
type ExtractorInput = Pick<ConversationView, 'is_tombstoned' | 'summary' | 'verbatim_quotes'>;

/** Trim and collapse internal whitespace; preserve original casing. */
function normalizeStatement(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Case-insensitive key for in-memory dedupe. */
function dedupeKey(statement: string): string {
  return statement.toLowerCase();
}

function isNoise(normalized: string): boolean {
  return normalized.length < MIN_STATEMENT_CHARS;
}

/**
 * Extract candidate facts from a conversation. Deterministic and pure.
 * Returns `[]` for a tombstoned (erased) conversation — erased content is
 * never mined.
 */
export function extractCandidateFacts(conversation: ExtractorInput): ExtractedCandidate[] {
  if (conversation.is_tombstoned) return [];

  const raw: ExtractedCandidate[] = [];

  // 1) Primary source: verbatim quotes, in stable position order. Capped
  //    at MAX_QUOTES_PROCESSED to bound work on pathological input.
  const quotes = [...(conversation.verbatim_quotes ?? [])]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_QUOTES_PROCESSED);
  for (const quote of quotes) {
    const statement = normalizeStatement(quote.text);
    if (isNoise(statement)) continue;
    raw.push({
      area: DEFAULT_CANDIDATE_AREA,
      statement,
      source_quote_id: quote.id,
      source_context: quote.text,
    });
  }

  // 2) Light secondary source: the conversation summary (current data
  //    already supported). No quote id; lower-priority than quotes.
  if (typeof conversation.summary === 'string') {
    const statement = normalizeStatement(conversation.summary);
    if (!isNoise(statement)) {
      raw.push({
        area: DEFAULT_CANDIDATE_AREA,
        statement,
        source_context: conversation.summary,
      });
    }
  }

  // 3) In-memory dedupe by normalized statement; keep first occurrence
  //    (quotes precede the summary, so quote-backed candidates win).
  const seen = new Set<string>();
  const out: ExtractedCandidate[] = [];
  for (const candidate of raw) {
    const key = dedupeKey(candidate.statement);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
