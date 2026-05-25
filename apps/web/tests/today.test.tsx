// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Today page. Sprint 2 M2 C2.4.
//
// Three queries back the page: useRecentAuditEvents, useConversationTotal,
// useFactTotal. Each is seeded independently to exercise the loading,
// empty, populated, and error states (including all-three-errored).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type AuditEventSummary,
  type ListAuditEventsResult,
  type ListConversationsResult,
  type ListFactsResult,
  auditKeys,
  conversationsKeys,
  factsKeys,
} from '../src/api/index.js';
import { Today } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c24-test';
const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const TWO_DAYS_AGO = '2026-05-21T12:00:00Z';

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

function makeAuditResult(events: readonly AuditEventSummary[] = []): ListAuditEventsResult {
  return { events, total: events.length, has_more: false };
}

function makeConvResult(total = 0): ListConversationsResult {
  return {
    conversations: [],
    total,
    returned: 0,
    limit: 1,
    offset: 0,
    has_more: total > 0,
  };
}

function makeFactResult(total = 0): ListFactsResult {
  return {
    facts: [],
    total,
    returned: 0,
    limit: 1,
    offset: 0,
    has_more: total > 0,
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
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/today`]}>
        <Routes>
          <Route path="/projects/:projectId/today" element={<Today />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedAudit(client: QueryClient, result: ListAuditEventsResult): void {
  client.setQueryData(auditKeys.list(PROJECT_ID, { limit: 10 }), result);
}

function seedConvs(client: QueryClient, result: ListConversationsResult): void {
  client.setQueryData(conversationsKeys.list(PROJECT_ID, { limit: 1 }), result);
}

function seedFacts(client: QueryClient, result: ListFactsResult): void {
  client.setQueryData(factsKeys.list(PROJECT_ID, { limit: 1 }), result);
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

describe('Today — loading state', () => {
  it('renders the loading skeletons when all queries are pending', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="today-loading"');
    expect(html).toContain('data-testid="today-counts-loading"');
    expect(html).toContain('data-testid="today-timeline-loading"');
  });

  it('still renders the Quick Actions section during loading (J.5 visible-but-disabled)', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="today-quick-actions"');
    expect(html).toContain('data-testid="quick-action-capture-conversation"');
    expect(html).toContain('data-testid="quick-action-extract-facts"');
    expect(html).toContain('data-testid="quick-action-review-evidence"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error state — all three queries failed
// ─────────────────────────────────────────────────────────────────

describe('Today — all-errored state', () => {
  it('surfaces a single PageErrorBanner when all three queries fail', () => {
    const client = makeClient();
    const err = new Error('daemon-unreachable');
    seedQueryError(client, auditKeys.list(PROJECT_ID, { limit: 10 }), err);
    seedQueryError(client, conversationsKeys.list(PROJECT_ID, { limit: 1 }), err);
    seedQueryError(client, factsKeys.list(PROJECT_ID, { limit: 1 }), err);
    const html = render(client);
    expect(html).toContain('data-testid="today-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load Today');
    expect(html).toContain('daemon-unreachable');
  });

  it('keeps the Today header visible during the all-errored state', () => {
    const client = makeClient();
    const err = new Error('boom');
    seedQueryError(client, auditKeys.list(PROJECT_ID, { limit: 10 }), err);
    seedQueryError(client, conversationsKeys.list(PROJECT_ID, { limit: 1 }), err);
    seedQueryError(client, factsKeys.list(PROJECT_ID, { limit: 1 }), err);
    const html = render(client);
    expect(html).toContain('What happened recently');
  });
});

// ─────────────────────────────────────────────────────────────────
// Partial error — one query failed, page still renders
// ─────────────────────────────────────────────────────────────────

describe('Today — partial error (hidden-not-faked rule)', () => {
  it('renders the audit-timeline error inline when only the audit query fails', () => {
    const client = makeClient();
    seedQueryError(client, auditKeys.list(PROJECT_ID, { limit: 10 }), new Error('audit-down'));
    seedConvs(client, makeConvResult(3));
    seedFacts(client, makeFactResult(5));
    const html = render(client);
    expect(html).not.toContain('data-testid="today-error"');
    expect(html).toContain('data-testid="today-timeline-error"');
    expect(html).toContain('Could not load recent activity');
    expect(html).toContain('audit-down');
    expect(html).toContain('data-testid="today-count-conversations"');
    expect(html).toContain('data-testid="today-count-facts"');
  });

  it('replaces a failed conversation count with an inline note', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedQueryError(
      client,
      conversationsKeys.list(PROJECT_ID, { limit: 1 }),
      new Error('conv-down'),
    );
    seedFacts(client, makeFactResult(2));
    const html = render(client);
    expect(html).not.toContain('data-testid="today-error"');
    expect(html).toContain('data-testid="today-count-conversations-error"');
    expect(html).toContain('Could not load conversation count');
    expect(html).toContain('data-testid="today-count-facts"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Empty state (no audit events yet)
// ─────────────────────────────────────────────────────────────────

describe('Today — empty state', () => {
  it('flags the page as empty when audit events length is 0', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('data-testid="today-empty"');
    expect(html).toContain('data-testid="today-timeline-empty"');
    expect(html).toContain('No activity yet');
  });

  it('renders 0-totals honestly in the counts row', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('data-testid="today-count-conversations"');
    expect(html).toContain('0');
    expect(html).toContain('conversations');
    expect(html).toContain('data-testid="today-count-facts"');
    expect(html).toContain('facts');
  });

  it('still shows Quick Actions in the empty state', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('data-testid="today-quick-actions"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state
// ─────────────────────────────────────────────────────────────────

describe('Today — populated state', () => {
  it('renders one timeline row per audit event', () => {
    const client = makeClient();
    seedAudit(
      client,
      makeAuditResult([
        makeEvent({ seq: 1, action: 'workspace.create', ts: TWO_DAYS_AGO }),
        makeEvent({ seq: 2, action: 'conversation.create', ts: TEN_MIN_AGO }),
        makeEvent({ seq: 3, action: 'fact.promote', ts: NOW_ISO }),
      ]),
    );
    seedConvs(client, makeConvResult(1));
    seedFacts(client, makeFactResult(1));
    const html = render(client);
    expect(html).toContain('data-testid="today-populated"');
    expect(html.split('data-testid="today-timeline-item"').length - 1).toBe(3);
  });

  it('singularises counts when total is 1', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(1));
    seedFacts(client, makeFactResult(1));
    const html = render(client);
    const visible = visibleText(html);
    expect(visible).toContain('1');
    expect(visible).toMatch(/\bconversation\b/);
    expect(visible).toMatch(/\bfact\b/);
    expect(visible).not.toMatch(/\b1 conversations\b/);
    expect(visible).not.toMatch(/\b1 facts\b/);
  });

  it('pluralises counts when total is not 1', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(4));
    seedFacts(client, makeFactResult(7));
    const html = render(client);
    expect(html).toContain('conversations');
    expect(html).toContain('facts');
  });
});

// ─────────────────────────────────────────────────────────────────
// Disabled quick actions (J.5 invariant)
// ─────────────────────────────────────────────────────────────────

describe('Today — quick actions disabled / enabled posture', () => {
  // Sprint 2 M2.5 C25.1 enabled Capture Conversation; the other two
  // remain disabled until later commits.
  it('renders extract-facts and review-evidence as aria-disabled (not buttons, not links)', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(1));
    seedFacts(client, makeFactResult(1));
    const html = render(client);
    for (const id of ['quick-action-extract-facts', 'quick-action-review-evidence']) {
      expect(html).toMatch(new RegExp(`<div[^>]*aria-disabled="true"[^>]*data-testid="${id}"`));
      expect(html).not.toMatch(new RegExp(`<a[^>]*data-testid="${id}"`));
      expect(html).not.toMatch(new RegExp(`<button[^>]*data-testid="${id}"`));
    }
  });

  it('renders capture-conversation as an enabled button (M2.5 C25.1)', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(1));
    seedFacts(client, makeFactResult(1));
    const html = render(client);
    expect(html).toMatch(/<button[^>]*data-testid="quick-action-capture-conversation"/);
    expect(html).not.toMatch(
      /<div[^>]*aria-disabled="true"[^>]*data-testid="quick-action-capture-conversation"/,
    );
  });

  it('includes explanatory copy that the actions arrive in the next milestone', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('arrive in the next milestone');
  });

  it('renders the action labels: Capture Conversation, Extract Facts, Review Evidence', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent()]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('Capture Conversation');
    expect(html).toContain('Extract Facts');
    expect(html).toContain('Review Evidence');
  });
});

// ─────────────────────────────────────────────────────────────────
// Translation correctness
// ─────────────────────────────────────────────────────────────────

describe('Today — translation correctness', () => {
  it('renders audit actions through the translation map (workspace.create → "Started this project.")', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent({ seq: 1, action: 'workspace.create' })]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('Started this project.');
  });

  it('renders fact.promote with the translated phrase', () => {
    const client = makeClient();
    seedAudit(
      client,
      makeAuditResult([makeEvent({ seq: 1, action: 'fact.promote', ts: NOW_ISO })]),
    );
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).toContain('Raised confidence on');
  });

  it('renders fact.contest as "Marked X to double-check" (the rename, not "contest")', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent({ seq: 1, action: 'fact.contest' })]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const visible = visibleText(render(client));
    expect(visible).toContain('double-check');
    expect(visible).not.toContain('contest');
    expect(visible).not.toContain('Contest');
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw substrate vocabulary
// ─────────────────────────────────────────────────────────────────

describe('Today — no raw substrate vocabulary', () => {
  it('never renders raw audit action keys ("workspace.create", "fact.promote", etc.)', () => {
    const client = makeClient();
    seedAudit(
      client,
      makeAuditResult([
        makeEvent({ seq: 1, action: 'workspace.create' }),
        makeEvent({ seq: 2, action: 'fact.promote' }),
        makeEvent({ seq: 3, action: 'conversation.tombstone' }),
      ]),
    );
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const visible = visibleText(render(client));
    expect(visible).not.toContain('workspace.create');
    expect(visible).not.toContain('fact.promote');
    expect(visible).not.toContain('conversation.tombstone');
    expect(visible).not.toContain('tombstone');
    expect(visible).not.toContain('Workspace');
  });

  it('never renders raw tier letters from any incidental rendering', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent({ action: 'fact.promote' })]));
    seedConvs(client, makeConvResult(1));
    seedFacts(client, makeFactResult(1));
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

describe('Today — no raw ISO timestamps', () => {
  it('never renders the event ts as a raw ISO string', () => {
    const client = makeClient();
    seedAudit(
      client,
      makeAuditResult([
        makeEvent({ seq: 1, ts: TWO_DAYS_AGO }),
        makeEvent({ seq: 2, ts: TEN_MIN_AGO }),
        makeEvent({ seq: 3, ts: NOW_ISO }),
      ]),
    );
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toContain('2026-05-23T11:50:00Z');
    expect(html).not.toContain('2026-05-23T12:00:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('renders a relative-time phrase next to each event', () => {
    const client = makeClient();
    seedAudit(
      client,
      makeAuditResult([
        makeEvent({ seq: 1, ts: TWO_DAYS_AGO }),
        makeEvent({ seq: 2, ts: TEN_MIN_AGO }),
      ]),
    );
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html.split('data-testid="today-timeline-item-time"').length - 1).toBe(2);
    const phrase = /just now|\d+ (?:second|minute|hour|day|week|month|year)s? ago/;
    expect(html).toMatch(phrase);
  });

  it('omits the time line entirely when ts is empty', () => {
    const client = makeClient();
    seedAudit(client, makeAuditResult([makeEvent({ ts: '' })]));
    seedConvs(client, makeConvResult(0));
    seedFacts(client, makeFactResult(0));
    const html = render(client);
    expect(html).not.toContain('data-testid="today-timeline-item-time"');
  });
});
