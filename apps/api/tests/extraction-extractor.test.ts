// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.2 — golden-fixture tests for the deterministic extractor.
// Pure function under test: no DB, no network, no LLM, no persistence.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CANDIDATE_AREA,
  EXTRACTOR_VERSION,
  extractCandidateFacts,
} from '../src/services/extraction/extractor.js';

interface Quote {
  id: string;
  position: number;
  text: string;
}
function conv(opts: {
  is_tombstoned?: boolean;
  summary?: string | null;
  verbatim_quotes?: Quote[];
}): { is_tombstoned: boolean; summary: string | null; verbatim_quotes: Quote[] } {
  return {
    is_tombstoned: opts.is_tombstoned ?? false,
    summary: opts.summary ?? null,
    verbatim_quotes: opts.verbatim_quotes ?? [],
  };
}

describe('extractCandidateFacts — quote extraction', () => {
  it('produces one quote-backed candidate per meaningful quote, in position order', () => {
    const out = extractCandidateFacts(
      conv({
        verbatim_quotes: [
          { id: 'q1', position: 0, text: 'I would never pay $100 for this' },
          { id: 'q2', position: 1, text: '$50 would be fine' },
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      area: DEFAULT_CANDIDATE_AREA,
      statement: 'I would never pay $100 for this',
      source_quote_id: 'q1',
      source_context: 'I would never pay $100 for this',
    });
    expect(out[1]?.source_quote_id).toBe('q2');
  });

  it('sorts by quote position regardless of array order', () => {
    const out = extractCandidateFacts(
      conv({
        verbatim_quotes: [
          { id: 'q2', position: 1, text: 'second point here' },
          { id: 'q1', position: 0, text: 'first point here' },
        ],
      }),
    );
    expect(out.map((c) => c.source_quote_id)).toEqual(['q1', 'q2']);
  });
});

describe('extractCandidateFacts — noise filtering', () => {
  it('drops empty, whitespace-only, and too-short quotes', () => {
    const out = extractCandidateFacts(
      conv({
        verbatim_quotes: [
          { id: 'q1', position: 0, text: '   ' },
          { id: 'q2', position: 1, text: '' },
          { id: 'q3', position: 2, text: 'ok' }, // 2 chars < MIN (3)
          { id: 'q4', position: 3, text: 'pricing is the blocker' },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source_quote_id).toBe('q4');
  });

  it('normalizes whitespace in the statement but keeps source_context raw', () => {
    const out = extractCandidateFacts(
      conv({ verbatim_quotes: [{ id: 'q1', position: 0, text: '  too   many   spaces  ' }] }),
    );
    expect(out[0]?.statement).toBe('too many spaces');
    expect(out[0]?.source_context).toBe('  too   many   spaces  ');
  });
});

describe('extractCandidateFacts — dedupe', () => {
  it('dedupes case/whitespace-insensitively, keeping the first quote', () => {
    const out = extractCandidateFacts(
      conv({
        verbatim_quotes: [
          { id: 'q1', position: 0, text: 'Customers want monthly billing' },
          { id: 'q2', position: 1, text: 'customers   want monthly billing' },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source_quote_id).toBe('q1');
  });
});

describe('extractCandidateFacts — summary as light secondary source', () => {
  it('produces a summary candidate (no source_quote_id) when there are no quotes', () => {
    const out = extractCandidateFacts(conv({ summary: 'Pricing was the main objection.' }));
    expect(out).toHaveLength(1);
    expect(out[0]?.statement).toBe('Pricing was the main objection.');
    expect(out[0]?.source_quote_id).toBeUndefined();
    expect(out[0]?.source_context).toBe('Pricing was the main objection.');
  });

  it('quote-backed candidate wins when summary duplicates a quote', () => {
    const out = extractCandidateFacts(
      conv({
        summary: 'pricing is the blocker',
        verbatim_quotes: [{ id: 'q1', position: 0, text: 'Pricing is the blocker' }],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source_quote_id).toBe('q1');
  });

  it('ignores an empty/too-short summary', () => {
    expect(extractCandidateFacts(conv({ summary: '' }))).toEqual([]);
    expect(extractCandidateFacts(conv({ summary: '   ' }))).toEqual([]);
    expect(extractCandidateFacts(conv({ summary: null }))).toEqual([]);
  });
});

describe('extractCandidateFacts — tombstoned + determinism + purity', () => {
  it('returns [] for a tombstoned conversation (erased content is never mined)', () => {
    const out = extractCandidateFacts(
      conv({
        is_tombstoned: true,
        summary: 'should be ignored',
        verbatim_quotes: [{ id: 'q1', position: 0, text: 'ignored quote' }],
      }),
    );
    expect(out).toEqual([]);
  });

  it('is deterministic: identical input → identical output', () => {
    const input = conv({
      summary: 'a summary',
      verbatim_quotes: [
        { id: 'q1', position: 0, text: 'one claim' },
        { id: 'q2', position: 1, text: 'another claim' },
      ],
    });
    expect(extractCandidateFacts(input)).toEqual(extractCandidateFacts(input));
  });

  it('does not mutate its input (pure)', () => {
    const quotes = [
      { id: 'q2', position: 1, text: 'b' },
      { id: 'q1', position: 0, text: 'first claim long enough' },
    ];
    const input = conv({ verbatim_quotes: quotes });
    extractCandidateFacts(input);
    // original array order preserved (we sorted a copy, not in place)
    expect(input.verbatim_quotes.map((q) => q.id)).toEqual(['q2', 'q1']);
  });

  it('exposes a stable extractor version', () => {
    expect(EXTRACTOR_VERSION).toBe('det-1');
  });
});
