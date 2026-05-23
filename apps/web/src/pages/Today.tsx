// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Today page — Sprint 2 M2 C2.4 (read-only).
//
// "What happened recently and what's worth looking at next." This
// page is intentionally a thin honest surface over the daemon's
// existing endpoints — we do NOT compute or fabricate derived
// metrics. Three real data sources:
//
//   1. Activity timeline   ← listAuditEvents (last 10)
//   2. Conversation total  ← listConversations({ limit: 1 }).total
//   3. Fact total          ← listFacts({ limit: 1 }).total
//
// Quick actions (J.5): Capture Conversation, Extract Facts, Review
// Evidence — all visible-but-disabled (mutations are M2.5/M3).
//
// Hidden-not-faked rule:
//   - If a section's query failed but the page is otherwise OK, we
//     still show the page (with that section's error inline).
//   - If all three core queries fail, surface a single PageErrorBanner.
//   - Loading state shows skeletons in place of the real sections.
//   - Empty state: when audit chain has 0 events, render the empty
//     copy + the disabled quick actions (so founders see the future
//     composition without misleading numbers).

import type { AuditEventSummary } from '../api/index.js';
import { PageErrorBanner, TextSkeleton } from '../components/index.js';
import {
  useConversationTotal,
  useFactTotal,
  useRecentAuditEvents,
  useWorkspaceContext,
} from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

export function Today(): JSX.Element {
  const { projectId } = useWorkspaceContext();
  const auditQuery = useRecentAuditEvents(projectId);
  const conversationQuery = useConversationTotal(projectId);
  const factQuery = useFactTotal(projectId);

  if (projectId === undefined) {
    return (
      <section data-testid="today-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Today</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>
          No project id in the URL. Pick one from the project picker.
        </p>
      </section>
    );
  }

  const anyPending = auditQuery.isPending || conversationQuery.isPending || factQuery.isPending;
  const allErrored = auditQuery.isError && conversationQuery.isError && factQuery.isError;

  if (anyPending && !allErrored) {
    return (
      <section data-testid="today-loading">
        <PageHeader />
        <div data-testid="today-counts-loading" style={{ marginTop: '1rem' }}>
          <TextSkeleton lines={2} ariaLabel="Loading counts" />
        </div>
        <div data-testid="today-timeline-loading" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Recent activity</h2>
          <TextSkeleton lines={4} ariaLabel="Loading activity" />
        </div>
        <QuickActions />
      </section>
    );
  }

  if (allErrored) {
    const err = auditQuery.error ?? conversationQuery.error ?? factQuery.error;
    return (
      <section data-testid="today-error">
        <PageHeader />
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={err ?? new Error('Could not load Today')}
            onRetry={() => {
              auditQuery.refetch();
              conversationQuery.refetch();
              factQuery.refetch();
            }}
            headline="Could not load Today"
          />
        </div>
      </section>
    );
  }

  const conversationTotal = conversationQuery.data?.total;
  const factTotal = factQuery.data?.total;
  const events = auditQuery.data?.events ?? [];
  const hasAnyActivity = events.length > 0;

  return (
    <section data-testid={hasAnyActivity ? 'today-populated' : 'today-empty'}>
      <PageHeader />

      {/* Counts row: only the two totals the API actually returns. */}
      <div
        data-testid="today-counts"
        style={{
          marginTop: '1rem',
          display: 'flex',
          gap: '2rem',
          fontSize: '0.95rem',
          color: '#444',
        }}
      >
        {conversationQuery.isSuccess && conversationTotal !== undefined ? (
          <span data-testid="today-count-conversations">
            <strong>{conversationTotal}</strong>{' '}
            {conversationTotal === 1 ? 'conversation' : 'conversations'}
          </span>
        ) : null}
        {factQuery.isSuccess && factTotal !== undefined ? (
          <span data-testid="today-count-facts">
            <strong>{factTotal}</strong> {factTotal === 1 ? 'fact' : 'facts'}
          </span>
        ) : null}
        {/* Per-section error fallback: when one count fails but the
            page is otherwise OK, show inline note instead of the count. */}
        {conversationQuery.isError ? (
          <span data-testid="today-count-conversations-error" style={{ color: '#a00' }}>
            Could not load conversation count
          </span>
        ) : null}
        {factQuery.isError ? (
          <span data-testid="today-count-facts-error" style={{ color: '#a00' }}>
            Could not load fact count
          </span>
        ) : null}
      </div>

      {/* Activity timeline: only render the section if the audit query
          succeeded. If it errored, surface inline. */}
      {auditQuery.isSuccess ? (
        <section data-testid="today-timeline" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Recent activity</h2>
          {hasAnyActivity ? (
            <ul
              data-testid="today-timeline-list"
              style={{
                marginTop: '0.5rem',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {events.map((event) => (
                <li key={event.seq}>
                  <AuditEventRow event={event} />
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="today-timeline-empty" style={{ color: '#666', marginTop: '0.5rem' }}>
              No activity yet. Start by capturing your first conversation.
            </p>
          )}
        </section>
      ) : null}
      {auditQuery.isError ? (
        <div data-testid="today-timeline-error" style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={auditQuery.error}
            onRetry={() => auditQuery.refetch()}
            headline="Could not load recent activity"
          />
        </div>
      ) : null}

      <QuickActions />
    </section>
  );
}

function PageHeader(): JSX.Element {
  return (
    <header>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Today</h1>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        What happened recently and what is worth looking at next.
      </p>
    </header>
  );
}

interface AuditEventRowProps {
  readonly event: AuditEventSummary;
}

function AuditEventRow({ event }: AuditEventRowProps): JSX.Element {
  // The audit_action label table accepts a payload, but listAuditEvents
  // returns only the summary (no payload). getEnumLabel handles the
  // missing-payload case via coerce() fallbacks.
  const label = getEnumLabel('audit_action', event.action);
  const relTime = formatRelativeTime(event.ts);
  return (
    <article
      data-testid="today-timeline-item"
      style={{
        padding: '0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
      }}
    >
      <p data-testid="today-timeline-item-label" style={{ margin: 0, fontSize: '0.95rem' }}>
        {label}
      </p>
      {relTime !== '' ? (
        <p
          data-testid="today-timeline-item-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#888' }}
        >
          {relTime}
        </p>
      ) : null}
    </article>
  );
}

function QuickActions(): JSX.Element {
  return (
    <section data-testid="today-quick-actions" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Quick actions</h2>
      <p style={{ color: '#999', marginTop: '0.25rem', fontSize: '0.875rem' }}>
        These actions arrive in the next milestone.
      </p>
      <div
        style={{
          marginTop: '0.75rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: '0.75rem',
        }}
      >
        <QuickActionCard
          testId="quick-action-capture-conversation"
          label="Capture Conversation"
          description="Record a chat with a person you talked to."
        />
        <QuickActionCard
          testId="quick-action-extract-facts"
          label="Extract Facts"
          description="Pull facts from a conversation transcript."
        />
        <QuickActionCard
          testId="quick-action-review-evidence"
          label="Review Evidence"
          description="Walk the evidence behind a fact."
        />
      </div>
    </section>
  );
}

interface QuickActionCardProps {
  readonly testId: string;
  readonly label: string;
  readonly description: string;
}

function QuickActionCard({ testId, label, description }: QuickActionCardProps): JSX.Element {
  return (
    <div
      aria-disabled="true"
      data-testid={testId}
      title="This action arrives in the next milestone"
      style={{
        padding: '1rem',
        border: '1px dashed #ddd',
        borderRadius: '0.5rem',
        color: '#888',
        cursor: 'not-allowed',
        backgroundColor: '#fafafa',
      }}
    >
      <strong style={{ fontSize: '1rem' }}>{label}</strong>
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>{description}</p>
    </div>
  );
}
