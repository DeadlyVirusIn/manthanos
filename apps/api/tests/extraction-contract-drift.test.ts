// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — contract-drift + duplicate-reachability guards (API side).
//
// The extraction enums and confidence thresholds are hand-mirrored between
// @manthanos/api (this package) and @manthanos/web. The two packages cannot
// import each other here, so each pins its tuples to the SAME canonical
// literals below; a divergence on either side fails that side's test. Keep
// CANONICAL_* identical to the copy in apps/web/tests/contract-drift.test.ts.

import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_BUCKETS,
  CONFIDENCE_REASON_FLAGS,
  EXTRACTION_SOURCES,
} from '../src/services/extraction/confidence.js';
import { type ExistingFactLike, detectDuplicates } from '../src/services/extraction/duplicates.js';

// ── Canonical source of truth (mirror in the web drift test) ──────
const CANONICAL_REASON_FLAGS = [
  'has_clear_claim',
  'has_subject',
  'has_source_context',
  'quote_backed',
  'ambiguous',
  'short_statement',
  'possible_duplicate',
  'needs_human_review',
];
const CANONICAL_SOURCES = ['conversation', 'manual', 'ai_assisted'];
const CANONICAL_DUPLICATE_KINDS = ['exact', 'likely', 'corroborates'];
// Display-bucket thresholds: [min, maxExclusive) by key.
const CANONICAL_BUCKETS = [
  { key: 'needs_review', min: 0.0, maxExclusive: 0.4 },
  { key: 'tentative', min: 0.4, maxExclusive: 0.7 },
  { key: 'solid', min: 0.7, maxExclusive: 0.9 },
  { key: 'strong', min: 0.9, maxExclusive: Number.POSITIVE_INFINITY },
];

describe('contract drift — API tuples match the canonical source of truth', () => {
  it('reason flags', () => {
    expect([...CONFIDENCE_REASON_FLAGS]).toEqual(CANONICAL_REASON_FLAGS);
  });

  it('extraction sources', () => {
    expect([...EXTRACTION_SOURCES]).toEqual(CANONICAL_SOURCES);
  });

  it('confidence bucket thresholds (label + [min, maxExclusive))', () => {
    const got = CONFIDENCE_BUCKETS.map((b) => ({ min: b.min, maxExclusive: b.maxExclusive }));
    const want = CANONICAL_BUCKETS.map((b) => ({ min: b.min, maxExclusive: b.maxExclusive }));
    expect(got).toEqual(want);
  });

  it('canonical duplicate kinds are the three advisory relationships', () => {
    // The API DuplicateKind union additionally has the internal 'none';
    // the web-exposed set is exactly these three.
    expect(CANONICAL_DUPLICATE_KINDS).toEqual(['exact', 'likely', 'corroborates']);
  });
});

// ── Duplicate reachability (closure plan §8 — option C: defer + document)
//
// `detectDuplicates` supports four outcomes, but as wired through the HTTP
// route only a subset is reachable today:
//   • candidates carry NO statement_hash → the hash-exact branch never
//     fires; "exact" collapses to normalized-text equality.
//   • FactView (the ExistingFactLike passed by the route) carries NO
//     source_conversation_ids → the "corroborates" branch can never fire.
// These tests pin that CURRENT behavior so the next reviewer does not
// assume corroborates/hash-exact work end-to-end. Full wiring is scheduled
// into 3B.7's own design.
describe('duplicate reachability — current wired behavior', () => {
  it('corroborates IS reachable in the pure function when source ids are supplied', () => {
    const existing: ExistingFactLike[] = [
      {
        id: 'f1',
        statement: 'Founders abandon discovery tools.',
        source_conversation_ids: ['other-conv'],
      },
    ];
    const ann = detectDuplicates(
      [{ statement: 'Founders abandon discovery tools.', source_conversation_id: 'this-conv' }],
      existing,
    );
    expect(ann[0]?.kind).toBe('corroborates');
  });

  it('but the WIRED shape (no source_conversation_ids on the fact) downgrades to exact', () => {
    // This mirrors what the route passes: FactView has statement_hash but
    // not source_conversation_ids, and candidates have no statement_hash.
    const existing: ExistingFactLike[] = [
      { id: 'f1', statement: 'Founders abandon discovery tools.' },
    ];
    const ann = detectDuplicates(
      [{ statement: 'Founders abandon discovery tools.', source_conversation_id: 'this-conv' }],
      existing,
    );
    expect(ann[0]?.kind).toBe('exact'); // NOT corroborates — unreachable as wired
  });
});
