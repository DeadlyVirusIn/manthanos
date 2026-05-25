// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.3 — table-driven tests for the deterministic confidence scorer.
// Pure function under test: no DB, no network, no LLM, no IO.

import { describe, expect, it } from 'vitest';
import { bucketLabelForScore, scoreConfidence } from '../src/services/extraction/confidence.js';
import type { ExtractedCandidate } from '../src/services/extraction/extractor.js';

function candidate(partial: Partial<ExtractedCandidate>): ExtractedCandidate {
  return {
    area: 'general',
    statement: partial.statement ?? 'placeholder statement here',
    source_quote_id: partial.source_quote_id,
    source_context: partial.source_context,
  };
}

interface Case {
  name: string;
  candidate: ExtractedCandidate;
  score: number;
  bucket: string;
  flags: string[];
}

const CASES: Case[] = [
  {
    name: 'quote-backed, clear multi-word claim → Strong',
    candidate: candidate({
      statement: 'I would never pay $100 for this',
      source_quote_id: 'q1',
      source_context: 'I would never pay $100 for this',
    }),
    score: 1.0,
    bucket: 'Strong',
    flags: ['has_clear_claim', 'has_subject', 'has_source_context', 'quote_backed'],
  },
  {
    name: 'summary-backed clear claim (no quote) → Solid',
    candidate: candidate({
      statement: 'Pricing was the main objection.',
      source_context: 'Pricing was the main objection.',
    }),
    score: 0.75,
    bucket: 'Solid',
    flags: ['has_clear_claim', 'has_subject', 'has_source_context'],
  },
  {
    name: 'quote-backed but short → Tentative + needs review',
    candidate: candidate({
      statement: '$50 fine',
      source_quote_id: 'q2',
      source_context: '$50 fine',
    }),
    score: 0.45,
    bucket: 'Tentative',
    flags: [
      'has_subject',
      'has_source_context',
      'quote_backed',
      'ambiguous',
      'short_statement',
      'needs_human_review',
    ],
  },
  {
    name: 'question quote → ambiguous, Tentative + needs review',
    candidate: candidate({
      statement: 'Would you pay one hundred dollars?',
      source_quote_id: 'q3',
      source_context: 'Would you pay one hundred dollars?',
    }),
    score: 0.65,
    bucket: 'Tentative',
    flags: ['has_subject', 'has_source_context', 'quote_backed', 'ambiguous', 'needs_human_review'],
  },
  {
    name: 'tiny summary → Needs Review',
    candidate: candidate({ statement: 'All good here', source_context: 'All good here' }),
    score: 0.2,
    bucket: 'Needs Review',
    flags: ['has_subject', 'has_source_context', 'ambiguous', 'short_statement', 'needs_human_review'],
  },
];

describe('scoreConfidence — table-driven', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = scoreConfidence(c.candidate);
      expect(r.score).toBeCloseTo(c.score, 5);
      expect(bucketLabelForScore(r.score)).toBe(c.bucket);
      expect(r.reason_flags).toEqual(c.flags);
    });
  }

  it('never emits possible_duplicate (owned by the duplicate detector, 3B.4)', () => {
    for (const c of CASES) {
      expect(scoreConfidence(c.candidate).reason_flags).not.toContain('possible_duplicate');
    }
  });

  it('returns a 0–1 score and never uses fact-tier labels', () => {
    const r = scoreConfidence(candidate({ statement: 'a clear and complete claim about pricing' }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(bucketLabelForScore(r.score)).not.toBe('Noted');
    expect(bucketLabelForScore(r.score)).not.toBe('Well-evidenced');
  });

  it('does not mutate the input candidate', () => {
    const c = candidate({ statement: 'pricing is the blocker', source_quote_id: 'q9' });
    const snapshot = JSON.stringify(c);
    scoreConfidence(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('is deterministic across repeated calls', () => {
    const c = candidate({ statement: 'customers prefer monthly billing', source_quote_id: 'q1' });
    expect(scoreConfidence(c)).toEqual(scoreConfidence(c));
  });
});
