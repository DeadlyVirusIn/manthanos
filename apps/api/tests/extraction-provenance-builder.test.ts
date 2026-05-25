// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.3 — tests for the pure extraction provenance builder.
// No DB, no IO; the timestamp is always supplied by the caller.

import { describe, expect, it } from 'vitest';
import { EXTRACTOR_VERSION } from '../src/services/extraction/extractor.js';
import { buildExtractionProvenance } from '../src/services/extraction/provenanceBuilder.js';

const TS = '2026-05-24T12:00:00.000Z';

describe('buildExtractionProvenance', () => {
  it('builds quote-backed deterministic provenance with the passed-in timestamp', () => {
    const p = buildExtractionProvenance({
      conversationId: 'conv-1',
      candidate: { source_quote_id: 'q1' },
      confidence: { score: 0.82, reason_flags: ['quote_backed', 'has_clear_claim'] },
      extractorVersion: EXTRACTOR_VERSION,
      createdAt: TS,
    });
    expect(p).toEqual({
      source: 'conversation',
      conversation_id: 'conv-1',
      source_quote_id: 'q1',
      created_at: TS,
      extraction_confidence: 0.82,
      reason_flags: ['quote_backed', 'has_clear_claim'],
      extractor_version: 'det-1',
      model_used: null,
    });
  });

  it('uses null source_quote_id for summary-backed candidates', () => {
    const p = buildExtractionProvenance({
      conversationId: 'conv-2',
      candidate: {},
      confidence: { score: 0.6, reason_flags: ['has_subject'] },
      extractorVersion: EXTRACTOR_VERSION,
      createdAt: TS,
    });
    expect(p.source_quote_id).toBeNull();
    expect(p.source).toBe('conversation');
    expect(p.model_used).toBeNull();
  });

  it('marks source ai_assisted and records the model when modelUsed is set', () => {
    const p = buildExtractionProvenance({
      conversationId: 'conv-3',
      candidate: { source_quote_id: 'q9' },
      confidence: { score: 0.5, reason_flags: [] },
      extractorVersion: 'det+llm-1',
      createdAt: TS,
      modelUsed: 'test-model',
    });
    expect(p.source).toBe('ai_assisted');
    expect(p.model_used).toBe('test-model');
  });

  it('clamps an out-of-range confidence score defensively', () => {
    const hi = buildExtractionProvenance({
      conversationId: 'c',
      candidate: {},
      confidence: { score: 1.7, reason_flags: [] },
      extractorVersion: 'det-1',
      createdAt: TS,
    });
    const lo = buildExtractionProvenance({
      conversationId: 'c',
      candidate: {},
      confidence: { score: -0.5, reason_flags: [] },
      extractorVersion: 'det-1',
      createdAt: TS,
    });
    expect(hi.extraction_confidence).toBe(1);
    expect(lo.extraction_confidence).toBe(0);
  });

  it('sanitizes reason flags (drops unknowns, enum-drift safe)', () => {
    const p = buildExtractionProvenance({
      conversationId: 'c',
      candidate: {},
      // intentionally dirty input cast through never
      confidence: {
        score: 0.5,
        reason_flags: ['quote_backed', 'bogus_flag', 'ambiguous'] as never,
      },
      extractorVersion: 'det-1',
      createdAt: TS,
    });
    expect(p.reason_flags).toEqual(['quote_backed', 'ambiguous']);
  });

  it('does not mutate the input candidate', () => {
    const candidate = { source_quote_id: 'q1' };
    const snapshot = JSON.stringify(candidate);
    buildExtractionProvenance({
      conversationId: 'c',
      candidate,
      confidence: { score: 0.5, reason_flags: [] },
      extractorVersion: 'det-1',
      createdAt: TS,
    });
    expect(JSON.stringify(candidate)).toBe(snapshot);
  });
});
