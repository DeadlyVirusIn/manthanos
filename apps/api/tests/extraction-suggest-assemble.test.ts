// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.5 — pipeline integration tests for the pure candidate
// assembler (extract → score → detectDuplicates → buildProvenance).
// No DB, no IO; createdAt is supplied.

import { describe, expect, it } from 'vitest';
import type { ConversationView } from '../src/services/conversations.js';
import type { ExistingFactLike } from '../src/services/extraction/duplicates.js';
import { assembleSuggestedCandidates } from '../src/services/extraction/suggest.js';

const TS = '2026-05-24T12:00:00.000Z';

function conversation(opts: {
  id?: string;
  is_tombstoned?: boolean;
  summary?: string | null;
  quotes?: Array<{ id: string; position: number; text: string }>;
}): ConversationView {
  return {
    id: opts.id ?? 'conv-x',
    is_tombstoned: opts.is_tombstoned ?? false,
    summary: opts.summary ?? null,
    verbatim_quotes: opts.quotes ?? [],
  } as unknown as ConversationView;
}

describe('assembleSuggestedCandidates', () => {
  it('returns the { candidates } wrapper with enriched fields', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation({
        quotes: [
          { id: 'q1', position: 0, text: 'I would never pay one hundred dollars' },
          { id: 'q2', position: 1, text: 'customers want monthly billing options' },
        ],
      }),
      conversationId: 'conv-x',
      existingFacts: [],
      createdAt: TS,
    });
    expect(result.candidates).toHaveLength(2);
    const c0 = result.candidates[0];
    expect(c0?.area).toBe('general');
    expect(c0?.source_quote_id).toBe('q1');
    expect(typeof c0?.confidence_score).toBe('number');
    expect(Array.isArray(c0?.confidence_reasons)).toBe(true);
    expect(c0?.duplicate).toBeUndefined();
    expect(c0?.provenance_preview).toMatchObject({
      source: 'conversation',
      conversation_id: 'conv-x',
      source_quote_id: 'q1',
      created_at: TS,
      extractor_version: 'det-1',
      model_used: null,
    });
    expect(c0?.provenance_preview.extraction_confidence).toBe(c0?.confidence_score);
  });

  it('annotates an exact duplicate and adds possible_duplicate to reasons', () => {
    const facts: ExistingFactLike[] = [{ id: 'f1', statement: 'Pricing is the blocker' }];
    const result = assembleSuggestedCandidates({
      conversation: conversation({
        quotes: [{ id: 'q1', position: 0, text: 'pricing is the blocker' }],
      }),
      conversationId: 'conv-x',
      existingFacts: facts,
      createdAt: TS,
    });
    const c = result.candidates[0];
    expect(c?.duplicate).toEqual({ kind: 'exact', fact_id: 'f1', similarity: 1 });
    expect(c?.confidence_reasons).toContain('possible_duplicate');
    expect(c?.provenance_preview.reason_flags).toContain('possible_duplicate');
  });

  it('returns no candidates for a tombstoned conversation', () => {
    const result = assembleSuggestedCandidates({
      conversation: conversation({
        is_tombstoned: true,
        quotes: [{ id: 'q1', position: 0, text: 'ignored content' }],
      }),
      conversationId: 'conv-x',
      existingFacts: [],
      createdAt: TS,
    });
    expect(result.candidates).toEqual([]);
  });

  it('is deterministic given identical inputs', () => {
    const args = {
      conversation: conversation({
        quotes: [{ id: 'q1', position: 0, text: 'customers want monthly billing options' }],
      }),
      conversationId: 'conv-x',
      existingFacts: [] as ExistingFactLike[],
      createdAt: TS,
    };
    expect(assembleSuggestedCandidates(args)).toEqual(assembleSuggestedCandidates(args));
  });
});
