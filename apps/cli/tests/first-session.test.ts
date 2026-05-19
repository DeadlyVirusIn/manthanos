// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX-2D — first-session guided flow.
//
// These tests pin the wording, structure, and copy-paste safety of the
// two first-session orientation blocks (first plan, first review) and
// confirm the wording does not drift into anthropomorphism.
//
// They are pure-function tests of the format helpers. The detection
// helpers (checkIsFirstPlan, checkIsFirstReview) are exercised by the
// e2e golden path and brain-review integration tests; we do not
// duplicate that coverage here.

import { describe, expect, it } from 'vitest';
import { formatFirstReviewIntro } from '../src/commands/brain-review.js';
import { formatFirstPlanGuidance } from '../src/commands/plan.js';

// Words that mean "the system did something cognitive" — banned by
// charter so the operator never confuses substrate machinery with an
// agent. Match case-insensitively.
const BANNED_VOCAB = [
  'intelligent',
  'smart',
  'remembered',
  'understood',
  'guaranteed',
  'magical',
  'magic',
  'ai is',
  'ai will',
  'best',
  'optimal',
  'recommended by ai',
  'thinks',
  'learned',
  'trusted ai',
];

function assertNoBannedVocab(lines: readonly string[]): void {
  const joined = lines.join('\n').toLowerCase();
  for (const banned of BANNED_VOCAB) {
    expect(joined, `banned vocab "${banned}" appeared in:\n${lines.join('\n')}`).not.toContain(
      banned,
    );
  }
}

describe('UX-2D first-plan guidance — formatFirstPlanGuidance()', () => {
  it('zero facts captured: names the empty case without alarming the operator', () => {
    const lines = formatFirstPlanGuidance(0);
    const joined = lines.join('\n');
    expect(joined).toContain('First plan complete in this workspace.');
    expect(joined).toContain('No new facts');
    expect(joined).toContain('manthan next');
    // No promotion-required call-to-action when there is nothing to promote.
    expect(joined).not.toContain('brain review');
    assertNoBannedVocab(lines);
  });

  it('one fact captured: uses singular "fact" / "was" agreement', () => {
    const lines = formatFirstPlanGuidance(1);
    const joined = lines.join('\n');
    expect(joined).toContain('1 fact was captured');
    expect(joined).not.toContain('1 facts');
    expect(joined).not.toContain('1 fact were');
    assertNoBannedVocab(lines);
  });

  it('multiple facts captured: uses plural "facts" / "were" agreement', () => {
    const lines = formatFirstPlanGuidance(3);
    const joined = lines.join('\n');
    expect(joined).toContain('3 facts were captured');
    expect(joined).not.toContain('3 fact was');
    assertNoBannedVocab(lines);
  });

  it('names quarantine as held-aside, not as rejection', () => {
    const lines = formatFirstPlanGuidance(2);
    const joined = lines.join('\n');
    expect(joined).toContain('quarantine');
    expect(joined.toLowerCase()).toContain('held aside');
    // "rejected" / "blocked" / "wrong" framing would mislead — these
    // facts are pending review, not failures.
    expect(joined.toLowerCase()).not.toContain('rejected');
    expect(joined.toLowerCase()).not.toContain('blocked');
  });

  it('makes the operator-agency boundary explicit', () => {
    const lines = formatFirstPlanGuidance(2);
    const joined = lines.join('\n');
    // Two load-bearing statements: nothing is in continuity yet, and
    // the operator is the one who decides.
    expect(joined).toContain('Nothing has been added to continuity yet.');
    // The recommended command must appear as a literal, indented line
    // (UX-2B copy-paste-safety discipline).
    const reviewLine = lines.find((l) => l.trim() === 'manthan brain review');
    expect(reviewLine).toBeDefined();
  });

  it('the review command line is a copy-paste-safe shell command', () => {
    const lines = formatFirstPlanGuidance(2);
    const reviewLine = lines.find((l) => l.trim() === 'manthan brain review');
    expect(reviewLine).toBeDefined();
    // Trimmed line is a complete, executable command — no surrounding
    // prose or punctuation that would break if copied verbatim.
    expect(reviewLine?.trim()).toBe('manthan brain review');
  });

  it('zero-facts variant points the operator at `manthan next`', () => {
    const lines = formatFirstPlanGuidance(0);
    const nextLine = lines.find((l) => l.includes('manthan next'));
    expect(nextLine).toBeDefined();
    expect(nextLine).toContain('`manthan next`');
  });

  it('deterministic output: same input produces identical output', () => {
    const a = formatFirstPlanGuidance(2);
    const b = formatFirstPlanGuidance(2);
    expect(a).toEqual(b);
    const c = formatFirstPlanGuidance(0);
    const d = formatFirstPlanGuidance(0);
    expect(c).toEqual(d);
  });

  it('returns plain strings with no ANSI escape codes', () => {
    for (const fc of [0, 1, 5]) {
      const lines = formatFirstPlanGuidance(fc);
      const joined = lines.join('\n');
      // biome-ignore lint/suspicious/noControlCharactersInRegex: testing for ANSI codes
      expect(joined).not.toMatch(/\x1b\[/);
    }
  });
});

describe('UX-2D first-review intro — formatFirstReviewIntro()', () => {
  it('names what promote / skip / demote actually mean', () => {
    const lines = formatFirstReviewIntro();
    const joined = lines.join('\n');
    expect(joined).toContain('promote');
    expect(joined).toContain('skip');
    expect(joined).toContain('demote');
    // Each verb is explained in task-oriented language, not by
    // tier symbols alone.
    expect(joined).toContain('trusted context');
    expect(joined).toContain('quarantine');
    expect(joined).toContain('contradicted');
  });

  it('names the operator-agency boundary', () => {
    const lines = formatFirstReviewIntro();
    const joined = lines.join('\n');
    expect(joined).toContain('Nothing is in your continuity yet.');
    expect(joined).toContain('You decide what to keep.');
  });

  it('mentions the 7-day undo window', () => {
    const lines = formatFirstReviewIntro();
    const joined = lines.join('\n');
    expect(joined).toContain('undo');
    expect(joined).toContain('7 days');
  });

  it('points at `?` for the full grammar instead of inlining it', () => {
    // Progressive disclosure: the full command grammar already lives
    // in the interactive HELP_TEXT. The intro should not duplicate it.
    const lines = formatFirstReviewIntro();
    const joined = lines.join('\n');
    expect(joined).toContain('?');
    // None of the longhand command names from HELP_TEXT should appear
    // — those are deferred until the operator presses `?`.
    expect(joined).not.toContain('p <range>');
    expect(joined).not.toContain('P <range>');
  });

  it('uses no banned vocabulary', () => {
    assertNoBannedVocab(formatFirstReviewIntro());
  });

  it('deterministic output: pure function returns identical lines on each call', () => {
    expect(formatFirstReviewIntro()).toEqual(formatFirstReviewIntro());
  });

  it('returns plain strings with no ANSI escape codes', () => {
    const joined = formatFirstReviewIntro().join('\n');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: testing for ANSI codes
    expect(joined).not.toMatch(/\x1b\[/);
  });

  it('keeps the abstract trust-ladder vocabulary out of the first impression', () => {
    // T+1 / T+2 / T-1 / T0 etc. are exposed later (in the candidate
    // list and HELP_TEXT). The first-review intro should orient the
    // operator in task-oriented language, not tier symbols.
    const lines = formatFirstReviewIntro();
    const joined = lines.join('\n');
    for (const tier of ['T+1', 'T+2', 'T+3', 'T-1', 'T-2', 'T0']) {
      expect(joined).not.toContain(tier);
    }
  });
});
