// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Conversation Detail page. Sprint 2 M2 C2.5.
//
// Two queries back the page: useConversation (full ConversationView)
// and useConversationFacts (FactView[]). Cache seeding follows the
// established pattern (see home-picker.test.tsx for the rationale
// behind retryOnMount: false + manual setState for error states).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type ConversationFactsResponse,
  type ConversationQuoteView,
  type ConversationView,
  type FactView,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  asFactTier,
  conversationsKeys,
} from '../src/api/index.js';
import { ConversationDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-test';
const CONVERSATION_ID = 'conv-c25-test';
const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const TWO_DAYS_AGO = '2026-05-21T12:00:00Z';

function makeQuote(overrides: Partial<ConversationQuoteView> = {}): ConversationQuoteView {
  return {
    id: 'quote-1',
    position: 0,
    text: 'I tried three other tools last month and gave up on them.',
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: CONVERSATION_ID,
    workspace_id: PROJECT_ID,
    person_name: 'Alex Founder',
    occurred_at: TWO_DAYS_AGO,
    audience_fit: asAudienceFit('target'),
    conversation_type: asConversationType('discovery'),
    outcome: asConversationOutcome('validated'),
    summary: 'Alex confirmed the discovery loop pain.',
    created_at: TEN_MIN_AGO,
    audit_seq: 12,
    tombstoned_at: null,
    tombstone_reason: null,
    fact_extraction_status: asFactExtractionStatus('extracted'),
    last_extracted_at: TEN_MIN_AGO,
    is_tombstoned: false,
    verbatim_quotes: [makeQuote()],
    ...overrides,
  };
}

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: 'fact-1',
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'Founders abandon discovery tools when they feel like research software.',
    statement_hash: 'hash-1',
    tier: asFactTier('T0'),
    confidence: 0.7,
    last_corroborated: TEN_MIN_AGO,
    last_administratively_touched: TEN_MIN_AGO,
    audit_seq: 13,
    version_chain_root_id: null,
    superseded_by_fact_id: null,
    contested_at: null,
    contested_reason: null,
    tombstoned_at: null,
    tombstone_reason: null,
    is_head: true,
    is_contested: false,
    is_tombstoned: false,
    active_source_count: 1,
    degraded_source_count: 0,
    provenance_degraded: false,
    ...overrides,
  };
}

function makeFactsResponse(facts: readonly FactView[] = []): ConversationFactsResponse {
  return { conversation_id: CONVERSATION_ID, facts, total: facts.length };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function render(client: QueryClient): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}`]}>
        <Routes>
          <Route path="/projects/:projectId/conversations/:id" element={<ConversationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedConversation(client: QueryClient, conversation: ConversationView): void {
  client.setQueryData(conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID), conversation);
}

function seedFacts(client: QueryClient, facts: ConversationFactsResponse): void {
  client.setQueryData(conversationsKeys.facts(PROJECT_ID, CONVERSATION_ID), facts);
}

function seedQueryError(client: QueryClient, queryKey: readonly unknown[], error: Error): void {
  const now = Date.now();
  const q = client.getQueryCache().build(client, {
    queryKey,
    queryFn: () => Promise.reject(error),
  });
  q.setState({
    data: undefined,
    dataUpdateCount: 0,
    dataUpdatedAt: now,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: now,
    fetchFailureCount: 1,
    fetchFailureReason: error,
    fetchMeta: null,
    isInvalidated: false,
    status: 'error',
    fetchStatus: 'idle',
  });
}

function visibleText(html: string): string {
  return Array.from(html.matchAll(/>([^<]+)</g))
    .map((m) => m[1])
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — loading state', () => {
  it('renders skeletons when the conversation query is pending', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-loading"');
  });

  it('does not render populated content while loading', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).not.toContain('data-testid="conversation-detail-populated"');
    expect(html).not.toContain('data-testid="conversation-detail-tombstoned"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — error state', () => {
  it('renders the PageErrorBanner when the conversation query fails', () => {
    const client = makeClient();
    seedQueryError(
      client,
      conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID),
      new Error('daemon-unreachable'),
    );
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load this conversation');
    expect(html).toContain('daemon-unreachable');
  });

  it('still surfaces the conversation id during the error state', () => {
    const client = makeClient();
    seedQueryError(
      client,
      conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID),
      new Error('boom'),
    );
    const html = render(client);
    expect(html).toContain('data-testid="conv-id"');
    expect(html).toContain(CONVERSATION_ID);
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — populated state', () => {
  it('renders the conversation person + relative timestamps', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(client, makeFactsResponse([makeFact()]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-populated"');
    expect(html).toContain('data-testid="conversation-person"');
    expect(html).toContain('Alex Founder');
    expect(html).toContain('data-testid="conversation-occurred"');
    expect(html).toContain('Happened ');
    expect(html).toContain('data-testid="conversation-created"');
    expect(html).toContain('Captured ');
  });

  it('renders translated audience / type / outcome / extraction pills', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(client, makeFactsResponse([]));
    const visible = visibleText(render(client));
    expect(visible).toContain('Exact match');
    expect(visible).toContain('First conversation');
    expect(visible).toContain('Confirmed what I expected');
    expect(visible).toContain('Findings added');
  });
});

// ─────────────────────────────────────────────────────────────────
// No-summary state
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — no-summary state', () => {
  it('renders the summary empty-state when summary is null', () => {
    const client = makeClient();
    seedConversation(client, makeConversation({ summary: null }));
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-summary-empty"');
    expect(html).toContain('No summary yet');
    expect(html).not.toContain('data-testid="conversation-summary-text"');
  });

  it('renders the summary empty-state when summary is an empty string', () => {
    const client = makeClient();
    seedConversation(client, makeConversation({ summary: '' }));
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-summary-empty"');
  });

  it('renders the summary text when present', () => {
    const client = makeClient();
    seedConversation(client, makeConversation({ summary: 'A pithy summary.' }));
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-summary-text"');
    expect(html).toContain('A pithy summary.');
    expect(html).not.toContain('data-testid="conversation-summary-empty"');
  });
});

// ─────────────────────────────────────────────────────────────────
// No-quotes state
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — no-quotes state', () => {
  it('renders the quotes empty-state when verbatim_quotes is empty', () => {
    const client = makeClient();
    seedConversation(client, makeConversation({ verbatim_quotes: [] }));
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-quotes-empty"');
    expect(html).toContain('No quotes recorded');
    expect(html).not.toContain('data-testid="conversation-quotes-list"');
  });

  it('renders the quotes list when at least one quote is present', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        verbatim_quotes: [makeQuote({ id: 'q-1', position: 0, text: 'First.' })],
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-quotes-list"');
    expect(html).toContain('First.');
  });
});

// ─────────────────────────────────────────────────────────────────
// Quote ordering
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — quote ordering', () => {
  it('renders quotes sorted by position regardless of API order', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        verbatim_quotes: [
          makeQuote({ id: 'q-third', position: 2, text: 'Third.' }),
          makeQuote({ id: 'q-first', position: 0, text: 'First.' }),
          makeQuote({ id: 'q-second', position: 1, text: 'Second.' }),
        ],
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    const firstIdx = html.indexOf('First.');
    const secondIdx = html.indexOf('Second.');
    const thirdIdx = html.indexOf('Third.');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it('annotates each quote element with its position', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        verbatim_quotes: [
          makeQuote({ id: 'q-a', position: 0, text: 'A.' }),
          makeQuote({ id: 'q-b', position: 1, text: 'B.' }),
        ],
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toMatch(/<blockquote[^>]*data-position="0"/);
    expect(html).toMatch(/<blockquote[^>]*data-position="1"/);
  });
});

// ─────────────────────────────────────────────────────────────────
// Extracted facts: rendering + empty state + error
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — extracted facts', () => {
  it('renders one row per fact pulled from this conversation', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(
      client,
      makeFactsResponse([
        makeFact({ id: 'f-1', statement: 'First fact.' }),
        makeFact({ id: 'f-2', statement: 'Second fact.' }),
      ]),
    );
    const html = render(client);
    expect(html).toContain('data-testid="conversation-facts-list"');
    expect(html.split('data-testid="conversation-fact"').length - 1).toBe(2);
    expect(html).toContain('First fact.');
    expect(html).toContain('Second fact.');
  });

  it('links each fact row to /projects/:projectId/facts/:factId', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(client, makeFactsResponse([makeFact({ id: 'f-link', statement: 'Linked.' })]));
    const html = render(client);
    expect(html).toContain(`href="/projects/${PROJECT_ID}/facts/f-link"`);
    expect(html).toContain('Open fact');
  });

  it('renders the facts empty-state when no facts were extracted', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-facts-empty"');
    expect(html).toContain('No findings have been added');
  });

  it('renders an inline error when the facts query fails (page still renders)', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedQueryError(
      client,
      conversationsKeys.facts(PROJECT_ID, CONVERSATION_ID),
      new Error('facts-down'),
    );
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-populated"');
    expect(html).toContain('data-testid="conversation-facts-error"');
    expect(html).toContain('Could not load findings from this conversation');
    expect(html).toContain('facts-down');
  });

  it('renders a loading skeleton in the facts section while facts are pending', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    // Do not seed facts → query stays pending.
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-populated"');
    expect(html).toContain('data-testid="conversation-facts-loading"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Tombstoned conversation rendering (sentinel-safe)
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — tombstoned rendering', () => {
  it('renders the tombstone banner and hides substrate fields', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Spam.',
        person_name: 'Should Not Show',
        summary: 'A summary that should not be rendered.',
        verbatim_quotes: [makeQuote({ id: 'qx', text: 'Should not render.' })],
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-tombstoned"');
    expect(html).toContain('data-testid="conversation-tombstone-banner"');
    expect(html).toContain('This conversation was erased.');
    expect(html).toContain('data-testid="conversation-tombstone-reason"');
    expect(html).toContain('Spam.');
    expect(html).toContain('data-testid="conversation-tombstone-time"');
    const visible = visibleText(html);
    expect(visible).not.toContain('Should Not Show');
    expect(visible).not.toContain('A summary that should not be rendered.');
    expect(visible).not.toContain('Should not render.');
  });

  it('still renders facts extracted from a tombstoned conversation', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: null,
      }),
    );
    seedFacts(
      client,
      makeFactsResponse([makeFact({ id: 'f-persist', statement: 'Persisted fact.' })]),
    );
    const html = render(client);
    expect(html).toContain('data-testid="conversation-detail-tombstoned"');
    expect(html).toContain('data-testid="conversation-facts-list"');
    expect(html).toContain('Persisted fact.');
  });

  it('omits the erased-time line when tombstoned_at is missing', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        is_tombstoned: true,
        tombstoned_at: null,
        tombstone_reason: 'No timestamp recorded.',
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).toContain('data-testid="conversation-tombstone-banner"');
    expect(html).not.toContain('data-testid="conversation-tombstone-time"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Translation correctness — pinned to the actual labels.ts strings
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — translation correctness', () => {
  it('translates audience_fit values across the full enum', () => {
    const cases: Array<[Parameters<typeof asAudienceFit>[0], string]> = [
      ['target', 'Exact match'],
      ['adjacent', 'Adjacent'],
      ['outside', 'Off-target'],
      ['unknown', 'Not sure'],
    ];
    for (const [raw, expected] of cases) {
      const client = makeClient();
      seedConversation(client, makeConversation({ audience_fit: asAudienceFit(raw) }));
      seedFacts(client, makeFactsResponse([]));
      const visible = visibleText(render(client));
      expect(visible).toContain(expected);
    }
  });

  it('translates outcome values across the full enum', () => {
    const cases: Array<[Parameters<typeof asConversationOutcome>[0], string]> = [
      ['validated', 'Confirmed what I expected'],
      ['invalidated', 'Changed my mind'],
      ['inconclusive', 'Mixed signal'],
      ['follow_up', 'Need another talk'],
    ];
    for (const [raw, expected] of cases) {
      const client = makeClient();
      seedConversation(client, makeConversation({ outcome: asConversationOutcome(raw) }));
      seedFacts(client, makeFactsResponse([]));
      const visible = visibleText(render(client));
      expect(visible).toContain(expected);
    }
  });

  it('translates fact_extraction_status values across the full enum', () => {
    const cases: Array<[Parameters<typeof asFactExtractionStatus>[0], string]> = [
      ['pending', 'No findings yet'],
      ['extracted', 'Findings added'],
      ['skipped', 'Marked as not useful'],
    ];
    for (const [raw, expected] of cases) {
      const client = makeClient();
      seedConversation(
        client,
        makeConversation({ fact_extraction_status: asFactExtractionStatus(raw) }),
      );
      seedFacts(client, makeFactsResponse([]));
      const visible = visibleText(render(client));
      expect(visible).toContain(expected);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw substrate vocabulary
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — no raw substrate vocabulary', () => {
  it('never renders the raw substrate enum values in visible text', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(client, makeFactsResponse([makeFact()]));
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\btarget\b/);
    expect(visible).not.toMatch(/\bvalidated\b/);
    expect(visible).not.toMatch(/\bextracted\b/);
    // "discovery" appears in the audit_action labels (M2 doesn't render
    // those on this page), and 'discovery' as a raw enum value should
    // also not be visible.
    expect(visible).not.toMatch(/^discovery$/m);
  });

  it('never renders the substrate words "workspace" or "tombstone"', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Spam.',
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const visible = visibleText(render(client));
    expect(visible).not.toContain('workspace');
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toContain('tombstone');
    expect(visible).not.toContain('Tombstone');
  });

  it('never renders raw tier letters on extracted-fact rows (TrustLevelIndicator translates)', () => {
    const client = makeClient();
    seedConversation(client, makeConversation());
    seedFacts(
      client,
      makeFactsResponse([
        makeFact({ id: 'fT-2', tier: asFactTier('T-2') }),
        makeFact({ id: 'fT-1', tier: asFactTier('T-1') }),
        makeFact({ id: 'fT0', tier: asFactTier('T0') }),
        makeFact({ id: 'fT1', tier: asFactTier('T+1') }),
      ]),
    );
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\bT-2\b/);
    expect(visible).not.toMatch(/\bT-1\b/);
    expect(visible).not.toMatch(/\bT0\b/);
    expect(visible).not.toMatch(/\bT\+1\b/);
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw ISO timestamps
// ─────────────────────────────────────────────────────────────────

describe('ConversationDetail — no raw ISO timestamps', () => {
  it('never renders occurred_at / created_at as raw ISO strings', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({ occurred_at: TWO_DAYS_AGO, created_at: TEN_MIN_AGO }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toContain('2026-05-23T11:50:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('never renders tombstoned_at as a raw ISO string', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({
        is_tombstoned: true,
        tombstoned_at: NOW_ISO,
        tombstone_reason: 'Erased.',
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).not.toContain('2026-05-23T12:00:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('renders relative-time phrases for occurred / captured / erased', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConversation({ occurred_at: TWO_DAYS_AGO, created_at: TEN_MIN_AGO }),
    );
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    const phrase = /just now|\d+ (?:second|minute|hour|day|week|month|year)s? ago/;
    expect(html).toMatch(phrase);
  });

  it('omits the Happened / Captured lines entirely when timestamps are empty', () => {
    const client = makeClient();
    seedConversation(client, makeConversation({ occurred_at: '', created_at: '' }));
    seedFacts(client, makeFactsResponse([]));
    const html = render(client);
    expect(html).not.toContain('data-testid="conversation-occurred"');
    expect(html).not.toContain('data-testid="conversation-created"');
  });
});
