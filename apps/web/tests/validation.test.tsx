// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the flagship Validation page. Sprint 2 M2 C2.7.
//
// Ten queries back the page (4 tier counts, 2 fact totals for the
// follow-up math, conversations total, pending review, follow-up
// sample, audit events). Cache seeding follows the established
// pattern; see home-picker.test.tsx for the rationale behind
// retryOnMount: false + manual setState for error states.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type AuditEventSummary,
  type ConversationView,
  type FactView,
  type ListAuditEventsResult,
  type ListConversationsResult,
  type ListFactsResult,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  asFactTier,
  auditKeys,
  conversationsKeys,
  factsKeys,
} from '../src/api/index.js';
import { Validation } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c27-test';
const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const TWO_DAYS_AGO = '2026-05-21T12:00:00Z';

function makeConv(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'conv-x',
    workspace_id: PROJECT_ID,
    person_name: 'Sam Founder',
    occurred_at: TWO_DAYS_AGO,
    audience_fit: asAudienceFit('target'),
    conversation_type: asConversationType('discovery'),
    outcome: asConversationOutcome('inconclusive'),
    summary: null,
    created_at: TEN_MIN_AGO,
    audit_seq: 1,
    tombstoned_at: null,
    tombstone_reason: null,
    fact_extraction_status: asFactExtractionStatus('pending'),
    last_extracted_at: null,
    is_tombstoned: false,
    verbatim_quotes: [],
    ...overrides,
  };
}

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: 'fact-x',
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'Founders abandon tools when onboarding feels heavy.',
    statement_hash: 'h-1',
    tier: asFactTier('T0'),
    confidence: 0.7,
    last_corroborated: TEN_MIN_AGO,
    last_administratively_touched: TEN_MIN_AGO,
    audit_seq: 1,
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

function makeEvent(overrides: Partial<AuditEventSummary> = {}): AuditEventSummary {
  return {
    seq: 1,
    workspace_id: PROJECT_ID,
    ts: TEN_MIN_AGO,
    actor: 'user',
    action: 'workspace.create',
    kind: 'workspace',
    decision: 'created',
    payload_hash: null,
    self_hash: 'deadbeef',
    ...overrides,
  };
}

function convsResult(
  conversations: readonly ConversationView[] = [],
  total: number = conversations.length,
): ListConversationsResult {
  return {
    conversations,
    total,
    returned: conversations.length,
    limit: 10,
    offset: 0,
    has_more: total > conversations.length,
  };
}

function factsResult(
  facts: readonly FactView[] = [],
  total: number = facts.length,
  hasMore = false,
): ListFactsResult {
  return {
    facts,
    total,
    returned: facts.length,
    limit: 20,
    offset: 0,
    has_more: hasMore,
  };
}

function auditResult(events: readonly AuditEventSummary[] = []): ListAuditEventsResult {
  // head_seq is the audit chain head; since seqs are contiguous from 1 it
  // equals the total number of events. The Validation overview derives its
  // "recent events" count from head_seq (DEFECT-002), so the mock must carry
  // it — omitting it left the count at 0 and broke the singular-copy case.
  return {
    events,
    total: events.length,
    has_more: false,
    head_seq: events.length === 0 ? null : events[events.length - 1].seq,
  };
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
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/validation`]}>
        <Routes>
          <Route path="/projects/:projectId/validation" element={<Validation />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CONV_TOTAL_KEY = conversationsKeys.list(PROJECT_ID, { limit: 1 });
const PENDING_KEY = conversationsKeys.list(PROJECT_ID, {
  fact_extraction_status: asFactExtractionStatus('pending'),
  limit: 10,
});
const FACT_INCL_KEY = factsKeys.list(PROJECT_ID, { limit: 1 });
const FACT_EXCL_KEY = factsKeys.list(PROJECT_ID, { limit: 1, exclude_contested: true });
const FOLLOWUP_SAMPLE_KEY = factsKeys.list(PROJECT_ID, { limit: 20 });
const AUDIT_KEY = auditKeys.list(PROJECT_ID, { limit: 10 });
const TIER_KEY = (raw: 'T-2' | 'T-1' | 'T0' | 'T+1') =>
  factsKeys.list(PROJECT_ID, { tier: asFactTier(raw), limit: 1 });

interface SeedOptions {
  readonly convTotal?: ListConversationsResult;
  readonly pending?: ListConversationsResult;
  readonly factIncl?: ListFactsResult;
  readonly factExcl?: ListFactsResult;
  readonly followUp?: ListFactsResult;
  readonly audit?: ListAuditEventsResult;
  readonly tierT2?: ListFactsResult;
  readonly tierT1?: ListFactsResult;
  readonly tierT0?: ListFactsResult;
  readonly tierTPlus1?: ListFactsResult;
}

function seedAll(client: QueryClient, opts: SeedOptions = {}): void {
  client.setQueryData(CONV_TOTAL_KEY, opts.convTotal ?? convsResult([], 0));
  client.setQueryData(PENDING_KEY, opts.pending ?? convsResult([], 0));
  client.setQueryData(FACT_INCL_KEY, opts.factIncl ?? factsResult([], 0));
  client.setQueryData(FACT_EXCL_KEY, opts.factExcl ?? factsResult([], 0));
  client.setQueryData(FOLLOWUP_SAMPLE_KEY, opts.followUp ?? factsResult([], 0));
  client.setQueryData(AUDIT_KEY, opts.audit ?? auditResult([]));
  client.setQueryData(TIER_KEY('T-2'), opts.tierT2 ?? factsResult([], 0));
  client.setQueryData(TIER_KEY('T-1'), opts.tierT1 ?? factsResult([], 0));
  client.setQueryData(TIER_KEY('T0'), opts.tierT0 ?? factsResult([], 0));
  client.setQueryData(TIER_KEY('T+1'), opts.tierTPlus1 ?? factsResult([], 0));
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

const ALL_KEYS: ReadonlyArray<readonly unknown[]> = [
  CONV_TOTAL_KEY,
  PENDING_KEY,
  FACT_INCL_KEY,
  FACT_EXCL_KEY,
  FOLLOWUP_SAMPLE_KEY,
  AUDIT_KEY,
  TIER_KEY('T-2'),
  TIER_KEY('T-1'),
  TIER_KEY('T0'),
  TIER_KEY('T+1'),
];

// ─────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────

describe('Validation — loading state', () => {
  it('renders skeletons for every section when all queries are pending', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="validation-loading"');
    expect(html).toContain('data-testid="validation-overview-loading"');
    expect(html).toContain('data-testid="validation-pending-loading"');
    expect(html).toContain('data-testid="validation-tiers-loading"');
    expect(html).toContain('data-testid="validation-followup-loading"');
    expect(html).toContain('data-testid="validation-activity-loading"');
  });

  it('does not render populated/empty/error testids while loading', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).not.toContain('data-testid="validation-populated"');
    expect(html).not.toContain('data-testid="validation-empty"');
    expect(html).not.toContain('data-testid="validation-error"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Full-error state
// ─────────────────────────────────────────────────────────────────

describe('Validation — full-error state', () => {
  it('renders a single PageErrorBanner when every core query fails', () => {
    const client = makeClient();
    const err = new Error('daemon-unreachable');
    for (const key of ALL_KEYS) seedQueryError(client, key, err);
    const html = render(client);
    expect(html).toContain('data-testid="validation-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load the double-check list');
    expect(html).toContain('daemon-unreachable');
  });

  it('keeps the page header visible in the full-error state', () => {
    const client = makeClient();
    const err = new Error('boom');
    for (const key of ALL_KEYS) seedQueryError(client, key, err);
    const html = render(client);
    expect(html).toContain('Findings that need a closer look');
  });
});

// ─────────────────────────────────────────────────────────────────
// Partial-error state
// ─────────────────────────────────────────────────────────────────

describe('Validation — partial-error state', () => {
  it('renders the page when only pending review fails', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 5),
      factIncl: factsResult([], 7),
      factExcl: factsResult([], 6),
      audit: auditResult([makeEvent()]),
    });
    seedQueryError(client, PENDING_KEY, new Error('pending-down'));
    const html = render(client);
    expect(html).not.toContain('data-testid="validation-error"');
    expect(html).toContain('data-testid="validation-populated"');
    expect(html).toContain('data-testid="validation-pending-error"');
    expect(html).toContain('Could not load conversations awaiting review');
    expect(html).toContain('pending-down');
  });

  it('renders the page when only the activity query fails', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 3),
      factIncl: factsResult([], 2),
      factExcl: factsResult([], 2),
    });
    seedQueryError(client, AUDIT_KEY, new Error('audit-down'));
    const html = render(client);
    expect(html).toContain('data-testid="validation-populated"');
    expect(html).toContain('data-testid="validation-activity-error"');
    expect(html).toContain('Could not load recent activity');
  });

  it('shows the trust-level warning when any tier count fails', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 1),
      factIncl: factsResult([], 1),
      factExcl: factsResult([], 1),
    });
    seedQueryError(client, TIER_KEY('T+1'), new Error('tier-down'));
    const html = render(client);
    expect(html).toContain('data-testid="validation-tiers-warning"');
    expect(html).toContain('Could not load one or more trust-level counts');
  });

  it('shows the per-stat error tile when only the conversation total fails', () => {
    const client = makeClient();
    seedAll(client, { factIncl: factsResult([], 1), factExcl: factsResult([], 1) });
    seedQueryError(client, CONV_TOTAL_KEY, new Error('conv-down'));
    const html = render(client);
    expect(html).toContain('data-testid="validation-overview-conversations-error"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────

describe('Validation — empty state', () => {
  it('flags the page as empty when nothing exists yet', () => {
    const client = makeClient();
    seedAll(client);
    const html = render(client);
    expect(html).toContain('data-testid="validation-empty"');
    expect(html).toContain('data-testid="validation-pending-empty"');
    expect(html).toContain('data-testid="validation-followup-empty"');
    expect(html).toContain('data-testid="validation-activity-empty"');
  });

  it('renders 0-totals honestly in the overview row', () => {
    const client = makeClient();
    seedAll(client);
    const html = render(client);
    expect(html).toContain('data-testid="validation-overview-conversations"');
    expect(html).toContain('data-testid="validation-overview-facts"');
    expect(html).toContain('data-testid="validation-overview-followups"');
    expect(html).toContain('data-testid="validation-overview-activity"');
  });

  it('still renders the four trust-level rows in the empty state', () => {
    const client = makeClient();
    seedAll(client);
    const html = render(client);
    expect(html.split('data-testid="validation-tier-row"').length - 1).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state
// ─────────────────────────────────────────────────────────────────

describe('Validation — populated state', () => {
  it('renders the four overview stats with translated unit copy', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 7),
      factIncl: factsResult([], 12),
      factExcl: factsResult([], 9),
      audit: auditResult([makeEvent({ seq: 1 }), makeEvent({ seq: 2 })]),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-populated"');
    const visible = visibleText(html);
    expect(visible).toContain('conversations');
    expect(visible).toContain('findings');
    expect(visible).toContain('to double-check');
    expect(visible).toContain('recent events');
  });

  it('computes follow-up count as (total - exclude_contested_total)', () => {
    const client = makeClient();
    seedAll(client, { factIncl: factsResult([], 10), factExcl: factsResult([], 7) });
    const html = render(client);
    const match = html.match(/data-testid="validation-overview-followups-value"[^>]*>(\d+)</);
    expect(match?.[1]).toBe('3');
  });

  it('clamps follow-up count to zero when the math would go negative', () => {
    const client = makeClient();
    seedAll(client, { factIncl: factsResult([], 5), factExcl: factsResult([], 8) });
    const html = render(client);
    const match = html.match(/data-testid="validation-overview-followups-value"[^>]*>(\d+)</);
    expect(match?.[1]).toBe('0');
  });

  it('singularises the unit copy when a count is exactly 1', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 1),
      factIncl: factsResult([], 1),
      factExcl: factsResult([], 0),
      audit: auditResult([makeEvent()]),
    });
    const html = render(client);
    const visible = visibleText(html);
    expect(visible).toMatch(/\bconversation\b/);
    expect(visible).toMatch(/\bfinding\b/);
    expect(visible).toMatch(/\bto double-check\b/);
    expect(visible).toMatch(/\brecent event\b/);
  });
});

// ─────────────────────────────────────────────────────────────────
// Trust-level grouping
// ─────────────────────────────────────────────────────────────────

describe('Validation — trust-level grouping', () => {
  it('renders one discoverable trust explainer disclosure (H1)', () => {
    const client = makeClient();
    seedAll(client, {
      tierTPlus1: factsResult([], 1),
      tierT0: factsResult([], 2),
      tierT1: factsResult([], 3),
      tierT2: factsResult([], 4),
    });
    const html = render(client);
    // Native <details> disclosure, rendered once for the trust section.
    expect(html).toContain('data-testid="trust-explainer"');
    expect(html).toContain('What do these levels mean?');
    // §9 trust copy (apostrophe-free span; renderToString encodes quotes).
    expect(html).toContain('How well-backed this finding is. More dots = more evidence.');
    expect(html.match(/data-testid="trust-explainer"/g)?.length).toBe(1);
  });

  it('renders the four tiers in T+1 → T-2 order', () => {
    const client = makeClient();
    seedAll(client, {
      tierTPlus1: factsResult([], 1),
      tierT0: factsResult([], 2),
      tierT1: factsResult([], 3),
      tierT2: factsResult([], 4),
    });
    const html = render(client);
    const order = Array.from(html.matchAll(/data-tier-key="([^"]+)"/g)).map((m) => m[1]);
    expect(order).toEqual(['T+1', 'T0', 'T-1', 'T-2']);
  });

  it('renders translated trust labels (and never raw tier letters as visible text)', () => {
    const client = makeClient();
    seedAll(client, {
      tierTPlus1: factsResult([], 5),
      tierT0: factsResult([], 4),
      tierT1: factsResult([], 3),
      tierT2: factsResult([], 2),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-tier-count"');
    expect(html.split('data-testid="trust-level-indicator"').length - 1).toBeGreaterThanOrEqual(4);
    const visible = visibleText(html);
    expect(visible).not.toMatch(/\bT-2\b/);
    expect(visible).not.toMatch(/\bT-1\b/);
    expect(visible).not.toMatch(/\bT0\b/);
    expect(visible).not.toMatch(/\bT\+1\b/);
  });

  it('renders a placeholder when a tier count is missing', () => {
    const client = makeClient();
    seedAll(client, { tierTPlus1: factsResult([], 5) });
    seedQueryError(client, TIER_KEY('T0'), new Error('t0-down'));
    const html = render(client);
    expect(html).toContain('data-testid="validation-tiers-warning"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Follow-up queue rendering
// ─────────────────────────────────────────────────────────────────

describe('Validation — follow-up queue rendering', () => {
  it('renders only facts where is_contested === true and !is_tombstoned', () => {
    const client = makeClient();
    seedAll(client, {
      followUp: factsResult(
        [
          makeFact({ id: 'f-clean', is_contested: false }),
          makeFact({
            id: 'f-followup',
            is_contested: true,
            contested_at: TWO_DAYS_AGO,
            statement: 'Needs follow-up.',
          }),
          makeFact({
            id: 'f-tombstoned-followup',
            is_contested: true,
            is_tombstoned: true,
            tombstoned_at: TEN_MIN_AGO,
            statement: 'Should not appear (tombstoned).',
          }),
        ],
        3,
      ),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-followup-list"');
    expect(html.split('data-testid="validation-followup-item"').length - 1).toBe(1);
    expect(html).toContain('Needs follow-up.');
    const visible = visibleText(html);
    expect(visible).not.toContain('Should not appear (tombstoned).');
  });

  it('uses "Flagged to double-check" wording (the user-friendly rename)', () => {
    const client = makeClient();
    seedAll(client, {
      followUp: factsResult(
        [makeFact({ id: 'f-fu', is_contested: true, statement: 'Flagged claim.' })],
        1,
      ),
    });
    const visible = visibleText(render(client));
    expect(visible).toContain('Flagged to double-check');
    expect(visible).not.toContain('Contest');
    expect(visible).not.toContain('contest');
  });

  it('links each follow-up row to /projects/:projectId/facts/:id', () => {
    const client = makeClient();
    seedAll(client, {
      followUp: factsResult([makeFact({ id: 'f-link', is_contested: true })], 1),
    });
    const html = render(client);
    expect(html).toContain(`href="/projects/${PROJECT_ID}/facts/f-link"`);
  });

  it('shows the has-more disclosure when the API reports has_more', () => {
    const client = makeClient();
    seedAll(client, {
      followUp: factsResult([makeFact({ id: 'f-1', is_contested: true })], 50, true),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-followup-has-more"');
    expect(html).toContain('More findings may exist');
  });

  it('renders the empty-state when no contested facts are in the sample', () => {
    const client = makeClient();
    seedAll(client, {
      followUp: factsResult([makeFact({ id: 'f-clean', is_contested: false })], 1),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-followup-empty"');
    expect(html).toContain('Nothing to double-check right now.');
  });

  it('renders an inline error when only the follow-up sample query fails', () => {
    const client = makeClient();
    seedAll(client, {
      convTotal: convsResult([], 1),
      factIncl: factsResult([], 1),
      factExcl: factsResult([], 1),
    });
    seedQueryError(client, FOLLOWUP_SAMPLE_KEY, new Error('followup-down'));
    const html = render(client);
    expect(html).toContain('data-testid="validation-followup-error"');
    expect(html).toContain('Could not load the double-check list');
  });
});

// ─────────────────────────────────────────────────────────────────
// Pending review rendering
// ─────────────────────────────────────────────────────────────────

describe('Validation — pending review rendering', () => {
  it('renders one row per conversation awaiting fact extraction', () => {
    const client = makeClient();
    seedAll(client, {
      pending: convsResult([
        makeConv({ id: 'c-1', person_name: 'Alice' }),
        makeConv({ id: 'c-2', person_name: 'Bob' }),
      ]),
    });
    const html = render(client);
    expect(html).toContain('data-testid="validation-pending-list"');
    expect(html.split('data-testid="validation-pending-item"').length - 1).toBe(2);
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('links each pending row to /projects/:projectId/conversations/:id', () => {
    const client = makeClient();
    seedAll(client, { pending: convsResult([makeConv({ id: 'conv-pending' })]) });
    const html = render(client);
    expect(html).toContain(`href="/projects/${PROJECT_ID}/conversations/conv-pending"`);
  });

  it('renders the empty-state with "Nothing to review right now."', () => {
    const client = makeClient();
    seedAll(client);
    const html = render(client);
    expect(html).toContain('data-testid="validation-pending-empty"');
    expect(html).toContain('Nothing to review right now.');
  });
});

// ─────────────────────────────────────────────────────────────────
// Audit translation rendering
// ─────────────────────────────────────────────────────────────────

describe('Validation — audit translation rendering', () => {
  it('renders translated audit phrases (not the raw action keys)', () => {
    const client = makeClient();
    seedAll(client, {
      audit: auditResult([
        makeEvent({ seq: 1, action: 'workspace.create', ts: TWO_DAYS_AGO }),
        makeEvent({ seq: 2, action: 'fact.promote', ts: TEN_MIN_AGO }),
        makeEvent({ seq: 3, action: 'fact.contest', ts: NOW_ISO }),
      ]),
    });
    const html = render(client);
    const visible = visibleText(html);
    expect(visible).toContain('Started this project.');
    expect(visible).toContain('Raised confidence on');
    expect(visible).toContain('Marked');
    expect(visible).toContain('to double-check');
    expect(visible).not.toContain('workspace.create');
    expect(visible).not.toContain('fact.promote');
    expect(visible).not.toContain('fact.contest');
  });

  it('renders one row per event', () => {
    const client = makeClient();
    seedAll(client, {
      audit: auditResult([makeEvent({ seq: 1 }), makeEvent({ seq: 2 }), makeEvent({ seq: 3 })]),
    });
    const html = render(client);
    expect(html.split('data-testid="validation-activity-item"').length - 1).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw substrate vocabulary
// ─────────────────────────────────────────────────────────────────

describe('Validation — no raw substrate vocabulary', () => {
  it('never renders raw lifecycle or audit-action keys in visible text', () => {
    const client = makeClient();
    seedAll(client, {
      audit: auditResult([
        makeEvent({ seq: 1, action: 'workspace.create' }),
        makeEvent({ seq: 2, action: 'conversation.tombstone' }),
        makeEvent({ seq: 3, action: 'fact.contest' }),
      ]),
      followUp: factsResult(
        [makeFact({ id: 'f-fu', is_contested: true, statement: 'Flagged.' })],
        1,
      ),
    });
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\btombstoned\b/);
    expect(visible).not.toMatch(/\bsuperseded\b/);
    expect(visible).not.toMatch(/\bcontested\b/);
    expect(visible).not.toMatch(/\bworkspace\.create\b/);
    expect(visible).not.toMatch(/\bconversation\.tombstone\b/);
    expect(visible).not.toMatch(/\bfact\.contest\b/);
  });

  it('never renders raw tier letters anywhere on the page', () => {
    const client = makeClient();
    seedAll(client, {
      tierTPlus1: factsResult([], 1),
      tierT0: factsResult([], 1),
      tierT1: factsResult([], 1),
      tierT2: factsResult([], 1),
      followUp: factsResult(
        [
          makeFact({ id: 'a', is_contested: true, tier: asFactTier('T-2'), statement: 'a' }),
          makeFact({ id: 'b', is_contested: true, tier: asFactTier('T+1'), statement: 'b' }),
        ],
        2,
      ),
    });
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\bT-2\b/);
    expect(visible).not.toMatch(/\bT-1\b/);
    expect(visible).not.toMatch(/\bT0\b/);
    expect(visible).not.toMatch(/\bT\+1\b/);
  });

  it('never renders the substrate words "workspace" or "tombstone"', () => {
    const client = makeClient();
    seedAll(client, { audit: auditResult([makeEvent({ action: 'conversation.tombstone' })]) });
    const visible = visibleText(render(client));
    expect(visible).not.toContain('workspace');
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toContain('tombstone');
    expect(visible).not.toContain('Tombstone');
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw ISO timestamps
// ─────────────────────────────────────────────────────────────────

describe('Validation — no raw ISO timestamps', () => {
  it('never renders audit event timestamps as ISO', () => {
    const client = makeClient();
    seedAll(client, {
      audit: auditResult([
        makeEvent({ seq: 1, ts: TWO_DAYS_AGO }),
        makeEvent({ seq: 2, ts: TEN_MIN_AGO }),
        makeEvent({ seq: 3, ts: NOW_ISO }),
      ]),
    });
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toContain('2026-05-23T11:50:00Z');
    expect(html).not.toContain('2026-05-23T12:00:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('never renders pending-conversation occurred_at as ISO', () => {
    const client = makeClient();
    seedAll(client, {
      pending: convsResult([makeConv({ id: 'c-1', occurred_at: TWO_DAYS_AGO })]),
    });
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('renders relative phrases where timestamps are present', () => {
    const client = makeClient();
    seedAll(client, {
      audit: auditResult([makeEvent({ seq: 1, ts: TWO_DAYS_AGO })]),
      pending: convsResult([makeConv({ id: 'c-1', occurred_at: TWO_DAYS_AGO })]),
    });
    const html = render(client);
    const phrase = /just now|\d+ (?:second|minute|hour|day|week|month|year)s? ago/;
    expect(html).toMatch(phrase);
  });
});

void NOW_ISO;
