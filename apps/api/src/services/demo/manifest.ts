// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Demo workspace manifest — C4.4-E1 (design: C4_1_DEMO_WORKSPACE_SEED).
//
// Static, declarative description of the onboarding demo: a founder doing
// customer discovery for "Tally", a late-payment / invoicing helper. The
// replay engine (seedDemo.ts) turns this into REAL substrate state by
// issuing the same audited service calls a user would — never raw inserts.
//
// Determinism contract (C4.1 §9, approved Approach A):
//   - IDs here are FIXED LOGICAL keys used only to wire quotes ↔ facts
//     during replay. The persisted substrate ids stay service-generated;
//     a logical→real map is maintained at seed time.
//   - Timestamps are RELATIVE offsets (whole days ago) resolved against an
//     injected `now`. The audit/created_at timestamps remain wall-clock.
//   - "Identical" means identical content, relationships, trust
//     distribution, follow-up state, and relative recency — NOT
//     byte-identical ids or absolute timestamps.
//
// No `Date.now()` and no randomness in this module: the replay engine
// injects the clock. This keeps the manifest a pure value.

import type { AudienceFit, ConversationOutcome, ConversationType } from '../conversations.js';
import type { FactTier } from '../facts.js';

/** Reserved display name for the demo workspace. Combined with the durable
 *  demo marker (see resetDemo.ts), this identifies the demo workspace for
 *  the isolation guard. Never shown as a raw token — the UI labels it. */
export const DEMO_WORKSPACE_NAME = 'Demo — Customer discovery';

/** Extractor version stamped on demo provenance (mirrors the deterministic
 *  pipeline's version, so the demo reads as engine-true). */
export const DEMO_EXTRACTOR_VERSION = 'det-1';

/** Manifest schema version — bumped if the demo content changes, so a
 *  stale demo can be detected and re-seeded. */
export const DEMO_MANIFEST_VERSION = 1;

export interface DemoQuote {
  /** Fixed logical key, unique within the manifest (e.g. 'q1'). */
  readonly key: string;
  readonly text: string;
}

export interface DemoConversation {
  /** Fixed logical key (e.g. 'demo-conv-1'). */
  readonly key: string;
  readonly person_name: string;
  readonly conversation_type: ConversationType;
  readonly outcome: ConversationOutcome;
  readonly audience_fit: AudienceFit;
  /** Whole days before the injected `now` that this conversation occurred. */
  readonly occurred_days_ago: number;
  readonly summary: string | null;
  readonly quotes: readonly DemoQuote[];
}

/** One evidence pointer for a fact: a conversation, optionally a quote. The
 *  FIRST source mints the fact (create); the rest corroborate it. A source
 *  without a `quote` records conversation-level provenance (used for F6,
 *  the "early hunch" with no verbatim quote). */
export interface DemoFactSource {
  readonly conv: string;
  readonly quote?: string;
}

export interface DemoFact {
  /** Fixed logical key (e.g. 'demo-fact-1'). */
  readonly key: string;
  readonly area: string;
  readonly statement: string;
  /** At-rest trust tier. Set directly on the minting extract (sources[0])
   *  via ExtractFactInput.tier; corroboration by later sources preserves it. */
  readonly target_tier: FactTier;
  /** Evidence pointers; sources[0] creates, sources[1..] corroborate. */
  readonly sources: readonly DemoFactSource[];
  /** If present, the fact is flagged "to double-check" with this reason. */
  readonly double_check_reason?: string;
}

export interface DemoManifest {
  readonly workspace_name: string;
  readonly extractor_version: string;
  readonly manifest_version: number;
  readonly conversations: readonly DemoConversation[];
  readonly facts: readonly DemoFact[];
}

// ─────────────────────────────────────────────────────────────────
// Conversations (C4.1 §2–§3, with the C4.1.1 §7 content fixes:
// bookkeeper renamed Theo Alvarez; q1/q4 diverged so they read as two
// real people while still corroborating F1).
// ─────────────────────────────────────────────────────────────────

const CONVERSATIONS: readonly DemoConversation[] = [
  {
    key: 'demo-conv-1',
    person_name: 'Maya Chen',
    conversation_type: 'discovery',
    outcome: 'validated',
    audience_fit: 'target',
    occurred_days_ago: 9,
    summary: 'Freelance designer; chases invoices manually, wants gentle nudges.',
    quotes: [
      { key: 'q1', text: 'I lose half a day every month chasing overdue invoices.' },
      { key: 'q2', text: 'I gave up on my last tool because it felt like accounting software.' },
      { key: 'q3', text: 'I just want a nudge sent before the due date, not a lecture.' },
    ],
  },
  {
    key: 'demo-conv-2',
    person_name: 'Devon Park',
    conversation_type: 'validation',
    outcome: 'inconclusive',
    audience_fit: 'target',
    occurred_days_ago: 5,
    // Left un-extracted on load so the tour can say "try Suggest findings here".
    summary: 'Studio owner; mixed signal. Cares about QuickBooks sync and pricing clarity.',
    quotes: [
      { key: 'q4', text: 'We probably waste five or six hours a month on payment follow-ups.' },
      { key: 'q5', text: "I'd switch in a heartbeat if it synced with QuickBooks." },
      { key: 'q6', text: 'Could you remind clients automatically before the due date?' },
      { key: 'q7', text: 'Pricing felt confusing.' },
      { key: 'q8', text: 'Customers abandon onboarding when it feels like accounting software.' },
    ],
  },
  {
    key: 'demo-conv-3',
    person_name: 'Priya Rao',
    conversation_type: 'discovery',
    outcome: 'follow_up',
    audience_fit: 'adjacent',
    occurred_days_ago: 3,
    summary: 'Solo consultant; price-sensitive, wary of anything that feels aggressive.',
    quotes: [
      { key: 'q9', text: 'Honestly, late fees would just push my clients away.' },
      { key: 'q10', text: 'Maybe?' },
      {
        key: 'q11',
        text: "I'd expect to pay under fifteen dollars a month for something like this.",
      },
    ],
  },
  {
    key: 'demo-conv-4',
    person_name: 'Theo Alvarez',
    conversation_type: 'support',
    outcome: 'validated',
    audience_fit: 'target',
    occurred_days_ago: 2,
    summary: 'Bookkeeper; confirms most late payments are simple forgetfulness.',
    quotes: [
      { key: 'q12', text: 'Most of my clients are late because they simply forget.' },
      { key: 'q13', text: 'A friendly reminder a few days early fixes ninety percent of it.' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// Facts (C4.1 §4–§8). Spans all four trust tiers; F5 flagged to
// double-check; F3 is the duplicate target for C2.q8 (corroboration
// demo); F6 is the contradicted "Doubted" hunch.
//
// sources[0] mints the fact at target_tier (tier set on the extract);
// later sources corroborate (tier preserved). F6 has a conversation-level
// source (no quote) — the "early hunch" — minted directly at the bottom tier.
// ─────────────────────────────────────────────────────────────────

const FACTS: readonly DemoFact[] = [
  {
    key: 'demo-fact-1',
    area: 'discovery_pain',
    statement: 'Freelancers lose several hours a month chasing late invoices.',
    target_tier: 'T+1',
    sources: [
      { conv: 'demo-conv-1', quote: 'q1' },
      { conv: 'demo-conv-2', quote: 'q4' },
      { conv: 'demo-conv-4', quote: 'q12' },
    ],
  },
  {
    key: 'demo-fact-2',
    area: 'integrations',
    statement: 'Studios want the tool to sync with QuickBooks.',
    target_tier: 'T0',
    sources: [{ conv: 'demo-conv-2', quote: 'q5' }],
  },
  {
    key: 'demo-fact-3',
    area: 'onboarding',
    statement: 'Customers abandon onboarding when it feels like accounting software.',
    target_tier: 'T0',
    // Minted from C1.q2; C2.q8 (identical statement) corroborates it later,
    // demonstrating the advisory-duplicate / corroboration path.
    sources: [
      { conv: 'demo-conv-1', quote: 'q2' },
      { conv: 'demo-conv-2', quote: 'q8' },
    ],
  },
  {
    key: 'demo-fact-4',
    area: 'pricing',
    statement: 'Buyers expect to pay under $15/month.',
    target_tier: 'T-1',
    sources: [{ conv: 'demo-conv-3', quote: 'q11' }],
  },
  {
    key: 'demo-fact-5',
    area: 'pricing',
    statement: 'Late fees would push customers away.',
    target_tier: 'T-1',
    sources: [{ conv: 'demo-conv-3', quote: 'q9' }],
    double_check_reason: 'Want to confirm how sensitive clients really are to late fees.',
  },
  {
    key: 'demo-fact-6',
    area: 'messaging',
    statement: 'Nobody wants automated reminder emails.',
    target_tier: 'T-2',
    // An early hunch with no verbatim quote (conversation-level provenance),
    // contradicted by C1.q3 and C4.q13 — hence Doubted.
    sources: [{ conv: 'demo-conv-2' }],
  },
];

export const DEMO_MANIFEST: DemoManifest = {
  workspace_name: DEMO_WORKSPACE_NAME,
  extractor_version: DEMO_EXTRACTOR_VERSION,
  manifest_version: DEMO_MANIFEST_VERSION,
  conversations: CONVERSATIONS,
  facts: FACTS,
};

// ─────────────────────────────────────────────────────────────────
// Golden expectation — the normalized shape tests assert after a seed.
// Content/structure/trust-distribution only; never literal ids/timestamps.
// ─────────────────────────────────────────────────────────────────

export interface DemoGoldenSummary {
  readonly conversationCount: number;
  readonly quoteCount: number;
  readonly factCount: number;
  /** Count of facts per trust tier (at rest). */
  readonly tierCounts: Readonly<Record<FactTier, number>>;
  /** Number of facts flagged to double-check. */
  readonly doubleCheckCount: number;
}

export const DEMO_GOLDEN: DemoGoldenSummary = {
  conversationCount: 4,
  quoteCount: 13,
  factCount: 6,
  tierCounts: { 'T+1': 1, T0: 2, 'T-1': 2, 'T-2': 1 },
  doubleCheckCount: 1,
};
