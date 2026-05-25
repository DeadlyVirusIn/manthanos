// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.4 — tests for the deterministic, advisory duplicate detector.
// Pure function under test: no DB, no network, no LLM, no embeddings, no IO.

import { describe, expect, it } from 'vitest';
import {
  type ExistingFactLike,
  LIKELY_SIMILARITY_THRESHOLD,
  MIN_TOKENS_FOR_LIKELY,
  detectDuplicates,
  duplicateReasonFlags,
} from '../src/services/extraction/duplicates.js';

function fact(
  partial: Partial<ExistingFactLike> & { id: string; statement: string },
): ExistingFactLike {
  return partial;
}

describe('detectDuplicates — exact', () => {
  it('detects an exact duplicate by statement_hash even when text differs', () => {
    const out = detectDuplicates(
      [{ statement: 'totally different wording', statement_hash: 'H1' }],
      [fact({ id: 'f1', statement: 'pricing is the blocker', statement_hash: 'H1' })],
    );
    expect(out[0]).toEqual({ kind: 'exact', fact_id: 'f1', similarity: 1 });
  });

  it('detects an exact duplicate by normalized text (case/punct/whitespace)', () => {
    const out = detectDuplicates(
      [{ statement: '  Pricing,  IS the   Blocker!! ' }],
      [fact({ id: 'f1', statement: 'pricing is the blocker' })],
    );
    expect(out[0]?.kind).toBe('exact');
    expect(out[0]?.fact_id).toBe('f1');
  });

  it('exact match picks the lexicographically lowest fact id deterministically', () => {
    const out = detectDuplicates(
      [{ statement: 'pricing is the blocker' }],
      [
        fact({ id: 'f-b', statement: 'Pricing is the blocker' }),
        fact({ id: 'f-a', statement: 'pricing is the blocker' }),
      ],
    );
    expect(out[0]?.fact_id).toBe('f-a');
  });
});

describe('detectDuplicates — corroborates', () => {
  const existing = [
    fact({ id: 'f1', statement: 'pricing is the blocker', source_conversation_ids: ['conv-1'] }),
  ];

  it('corroborates when the same claim comes from a different conversation', () => {
    const out = detectDuplicates(
      [{ statement: 'Pricing is the blocker', source_conversation_id: 'conv-2' }],
      existing,
    );
    expect(out[0]).toEqual({ kind: 'corroborates', fact_id: 'f1', similarity: 1 });
  });

  it('stays exact when the candidate comes from a conversation already feeding the fact', () => {
    const out = detectDuplicates(
      [{ statement: 'Pricing is the blocker', source_conversation_id: 'conv-1' }],
      existing,
    );
    expect(out[0]?.kind).toBe('exact');
  });

  it('stays exact when no source information is available', () => {
    const out = detectDuplicates(
      [{ statement: 'Pricing is the blocker', source_conversation_id: 'conv-9' }],
      [fact({ id: 'f1', statement: 'pricing is the blocker' })],
    );
    expect(out[0]?.kind).toBe('exact');
  });
});

describe('detectDuplicates — likely', () => {
  it('flags a likely duplicate at/above the threshold and reports similarity', () => {
    // {customers,want,monthly,billing,options} vs {customers,want,monthly,billing}
    // inter=4 union=5 → 0.8
    const out = detectDuplicates(
      [{ statement: 'customers want monthly billing options' }],
      [fact({ id: 'f1', statement: 'customers want monthly billing' })],
    );
    expect(out[0]?.kind).toBe('likely');
    expect(out[0]?.fact_id).toBe('f1');
    expect(out[0]?.similarity).toBeCloseTo(0.8, 5);
    expect(out[0]?.similarity).toBeGreaterThanOrEqual(LIKELY_SIMILARITY_THRESHOLD);
  });

  it('returns none below the similarity threshold', () => {
    // {customers,prefer,annual,billing} vs {customers,want,monthly,billing}
    // inter=2 union=6 → 0.333 < 0.6
    const out = detectDuplicates(
      [{ statement: 'customers prefer annual billing' }],
      [fact({ id: 'f1', statement: 'customers want monthly billing' })],
    );
    expect(out[0]).toEqual({ kind: 'none' });
  });

  it('best (highest-similarity) match wins; ties break to the lower id', () => {
    const out = detectDuplicates(
      [{ statement: 'customers want monthly billing options' }],
      [
        fact({ id: 'f-low', statement: 'customers want weekly billing' }),
        fact({ id: 'f-high', statement: 'customers want monthly billing' }), // 0.8
      ],
    );
    expect(out[0]?.fact_id).toBe('f-high');
  });
});

describe('detectDuplicates — short statements + edges', () => {
  it('skips likely matching for statements shorter than MIN_TOKENS_FOR_LIKELY', () => {
    // candidate "monthly billing" = 2 tokens (< 3) → likely skipped; not exact
    const out = detectDuplicates(
      [{ statement: 'monthly billing' }],
      [fact({ id: 'f1', statement: 'monthly billing options' })],
    );
    expect(out[0]).toEqual({ kind: 'none' });
    expect(MIN_TOKENS_FOR_LIKELY).toBe(3);
  });

  it('still detects exact match for very short statements', () => {
    const out = detectDuplicates(
      [{ statement: '$50 fine' }],
      [fact({ id: 'f1', statement: '$50 fine' })],
    );
    expect(out[0]?.kind).toBe('exact');
  });

  it('returns [] for an empty candidate list', () => {
    expect(detectDuplicates([], [fact({ id: 'f1', statement: 'x y z' })])).toEqual([]);
  });

  it('returns none for every candidate when there are no facts', () => {
    const out = detectDuplicates(
      [{ statement: 'one claim here' }, { statement: 'another claim here' }],
      [],
    );
    expect(out).toEqual([{ kind: 'none' }, { kind: 'none' }]);
  });

  it('handles empty/whitespace candidate statements as none', () => {
    const out = detectDuplicates(
      [{ statement: '   ' }, { statement: '' }],
      [fact({ id: 'f1', statement: 'pricing is the blocker' })],
    );
    expect(out).toEqual([{ kind: 'none' }, { kind: 'none' }]);
  });

  it('handles missing/undefined optional fields safely', () => {
    const out = detectDuplicates(
      [{ statement: 'pricing is the blocker' }],
      [fact({ id: 'f1', statement: 'pricing is the blocker' })],
    );
    expect(out[0]?.kind).toBe('exact');
  });
});

describe('detectDuplicates — purity + determinism', () => {
  it('does not mutate its inputs', () => {
    const candidates = [{ statement: 'customers want monthly billing options' }];
    const facts = [fact({ id: 'f1', statement: 'customers want monthly billing' })];
    const candSnap = JSON.stringify(candidates);
    const factSnap = JSON.stringify(facts);
    detectDuplicates(candidates, facts);
    expect(JSON.stringify(candidates)).toBe(candSnap);
    expect(JSON.stringify(facts)).toBe(factSnap);
  });

  it('produces stable output across repeated runs', () => {
    const candidates = [
      { statement: 'customers want monthly billing options' },
      { statement: 'pricing is the blocker' },
      { statement: 'unrelated thought entirely' },
    ];
    const facts = [
      fact({ id: 'f1', statement: 'customers want monthly billing' }),
      fact({ id: 'f2', statement: 'pricing is the blocker' }),
    ];
    expect(detectDuplicates(candidates, facts)).toEqual(detectDuplicates(candidates, facts));
  });
});

describe('duplicateReasonFlags', () => {
  it('attaches possible_duplicate for any match and nothing for none', () => {
    expect(duplicateReasonFlags({ kind: 'exact', fact_id: 'f1', similarity: 1 })).toEqual([
      'possible_duplicate',
    ]);
    expect(duplicateReasonFlags({ kind: 'likely', fact_id: 'f1', similarity: 0.8 })).toEqual([
      'possible_duplicate',
    ]);
    expect(duplicateReasonFlags({ kind: 'corroborates', fact_id: 'f1', similarity: 1 })).toEqual([
      'possible_duplicate',
    ]);
    expect(duplicateReasonFlags({ kind: 'none' })).toEqual([]);
  });
});
