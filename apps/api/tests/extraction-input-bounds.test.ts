// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — input bounds for the deterministic suggestion pipeline.
//
// Bounds: at most MAX_QUOTES_PROCESSED quotes are processed and at most
// MAX_CANDIDATES candidates are returned; both, plus the duplicate-scan
// cap, are surfaced as explicit truncation signals rather than silently
// dropping data.

import { describe, expect, it } from 'vitest';
import type { ConversationView } from '../src/services/conversations.js';
import {
  MAX_QUOTES_PROCESSED,
  extractCandidateFacts,
} from '../src/services/extraction/extractor.js';
import { MAX_CANDIDATES, assembleSuggestedCandidates } from '../src/services/extraction/suggest.js';

function manyQuotes(n: number): Array<{ id: string; position: number; text: string }> {
  // Distinct, non-noise statements so none are deduped or dropped.
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    position: i,
    text: `distinct discovery insight number ${i} about the workflow`,
  }));
}

function conversation(
  quotes: Array<{ id: string; position: number; text: string }>,
): ConversationView {
  return {
    id: 'conv-bounds',
    is_tombstoned: false,
    summary: null,
    verbatim_quotes: quotes,
  } as unknown as ConversationView;
}

describe('extractor — quote cap', () => {
  it('processes at most MAX_QUOTES_PROCESSED quotes', () => {
    const out = extractCandidateFacts(conversation(manyQuotes(MAX_QUOTES_PROCESSED + 50)));
    expect(out).toHaveLength(MAX_QUOTES_PROCESSED);
  });

  it('keeps the earliest quotes (position order)', () => {
    const out = extractCandidateFacts(conversation(manyQuotes(MAX_QUOTES_PROCESSED + 10)));
    expect(out[0]?.source_quote_id).toBe('q0');
    expect(out[out.length - 1]?.source_quote_id).toBe(`q${MAX_QUOTES_PROCESSED - 1}`);
  });
});

describe('assemble — candidate cap + truncation signals', () => {
  it('caps candidates at MAX_CANDIDATES and flags candidates_truncated', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation(manyQuotes(MAX_CANDIDATES + 20)),
      conversationId: 'conv-bounds',
      existingFacts: [],
      createdAt: '2026-05-25T00:00:00.000Z',
    });
    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    expect(result.truncation.candidates_truncated).toBe(true);
    expect(result.truncation.quotes_truncated).toBe(false); // 70 < 200
    expect(result.truncation.duplicate_scan_truncated).toBe(false);
  });

  it('flags quotes_truncated when the conversation exceeds the quote cap', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation(manyQuotes(MAX_QUOTES_PROCESSED + 5)),
      conversationId: 'conv-bounds',
      existingFacts: [],
      createdAt: '2026-05-25T00:00:00.000Z',
    });
    expect(result.truncation.quotes_truncated).toBe(true);
    expect(result.truncation.candidates_truncated).toBe(true); // 200 capped to 50
    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it('reports no truncation for a normal-sized conversation', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation(manyQuotes(3)),
      conversationId: 'conv-bounds',
      existingFacts: [],
      createdAt: '2026-05-25T00:00:00.000Z',
    });
    expect(result.candidates).toHaveLength(3);
    expect(result.truncation).toEqual({
      quotes_truncated: false,
      candidates_truncated: false,
      duplicate_scan_truncated: false,
    });
  });

  it('propagates the route-supplied duplicate_scan_truncated signal', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation(manyQuotes(2)),
      conversationId: 'conv-bounds',
      existingFacts: [],
      createdAt: '2026-05-25T00:00:00.000Z',
      duplicateScanTruncated: true,
    });
    expect(result.truncation.duplicate_scan_truncated).toBe(true);
  });
});
