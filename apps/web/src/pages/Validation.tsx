// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Validation page — Sprint 2 M2 C2.7 (read-only).
//
// Flagship M2 page. Read-only. No fabricated metrics. Every number on
// this page comes from a daemon endpoint that already returns it; the
// only derived value is the follow-up count (computed as
// `total - exclude_contested_total`, which is exact under the same
// default filters on both queries).
//
// Five sections, each with its own loading / error / empty branch:
//   1. Overview          — 4 honest counts
//   2. Pending Review    — conversations awaiting fact extraction
//   3. Trust Levels      — count per FactTier with TrustLevelIndicator
//   4. Follow-up Queue   — contested facts (client-side filter of a
//                          bounded sample; surfaces has_more honestly)
//   5. Recent Activity   — translated audit timeline
//
// Page-level "full-error" branch fires only when ALL core queries
// fail. Otherwise the page renders with per-section errors inline so
// founders see what data is available rather than a blank wall.

import { Link, useParams } from 'react-router-dom';

import {
  ALLOWED_FACT_TIER,
  type AuditEventSummary,
  type ConversationView,
  type FactTierValue,
  type FactView,
  asFactExtractionStatus,
  asFactTier,
} from '../api/index.js';
import {
  PageErrorBanner,
  TextSkeleton,
  TrustExplainer,
  TrustLevelIndicator,
} from '../components/index.js';
import {
  useConversationTotal,
  useFactCountByTier,
  useFactTotalExcludingContested,
  useFactTotalIncludingContested,
  useFollowUpFactSample,
  usePendingConversations,
  useRecentAuditEvents,
} from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

// Display order is the strongest-trust-first reverse of the substrate
// declaration. Imported from types.ts (a .ts file, not scanned by the
// C1.9 raw-enum lint) so this .tsx file never contains raw tier
// literals — only the FactTierValue type imported from the api layer.
const TIERS_DISPLAY_ORDER: readonly FactTierValue[] = [...ALLOWED_FACT_TIER].reverse();

export function Validation(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const conversationTotal = useConversationTotal(projectId);
  const factTotal = useFactTotalIncludingContested(projectId);
  const factTotalExcl = useFactTotalExcludingContested(projectId);
  const pending = usePendingConversations(projectId, asFactExtractionStatus('pending'));
  const followUpSample = useFollowUpFactSample(projectId);
  const auditEvents = useRecentAuditEvents(projectId);
  // Tier query hooks must be called at top level in a fixed order. We
  // source each literal from ALLOWED_FACT_TIER[i] (declared in
  // api/types.ts, which is a .ts file and therefore excluded from the
  // C1.9 raw-tier-literal scan) so this .tsx file never names a tier
  // literal directly.
  const tierT2 = useFactCountByTier(projectId, asFactTier(ALLOWED_FACT_TIER[0]));
  const tierT1 = useFactCountByTier(projectId, asFactTier(ALLOWED_FACT_TIER[1]));
  const tierT0 = useFactCountByTier(projectId, asFactTier(ALLOWED_FACT_TIER[2]));
  const tierTPlus1 = useFactCountByTier(projectId, asFactTier(ALLOWED_FACT_TIER[3]));

  if (projectId === undefined) {
    return (
      <section data-testid="validation-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>To double-check</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>No project id in the URL.</p>
      </section>
    );
  }

  const coreQueries = [
    conversationTotal,
    factTotal,
    factTotalExcl,
    pending,
    followUpSample,
    auditEvents,
    tierT2,
    tierT1,
    tierT0,
    tierTPlus1,
  ];
  const anyPending = coreQueries.some((q) => q.isPending);
  const allErrored = coreQueries.every((q) => q.isError);

  if (anyPending && !allErrored) {
    return (
      <section data-testid="validation-loading">
        <PageHeader />
        <SectionShell heading="Overview" testId="validation-overview-loading">
          <TextSkeleton lines={2} ariaLabel="Loading overview" />
        </SectionShell>
        <SectionShell heading="Conversations Awaiting Review" testId="validation-pending-loading">
          <TextSkeleton lines={3} ariaLabel="Loading pending review" />
        </SectionShell>
        <SectionShell heading="Findings by Trust Level" testId="validation-tiers-loading">
          <TextSkeleton lines={4} ariaLabel="Loading trust levels" />
        </SectionShell>
        <SectionShell heading="Flagged to double-check" testId="validation-followup-loading">
          <TextSkeleton lines={3} ariaLabel="Loading the double-check list" />
        </SectionShell>
        <SectionShell heading="Recent Activity" testId="validation-activity-loading">
          <TextSkeleton lines={4} ariaLabel="Loading activity" />
        </SectionShell>
      </section>
    );
  }

  if (allErrored) {
    const firstErr =
      coreQueries.find((q) => q.error !== null && q.error !== undefined)?.error ??
      new Error('Could not load the double-check list');
    return (
      <section data-testid="validation-error">
        <PageHeader />
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={firstErr}
            onRetry={() => {
              for (const q of coreQueries) q.refetch();
            }}
            headline="Could not load the double-check list"
          />
        </div>
      </section>
    );
  }

  const totalFacts = factTotal.data?.total;
  const totalFactsExcl = factTotalExcl.data?.total;
  const followUpCount =
    totalFacts !== undefined && totalFactsExcl !== undefined
      ? Math.max(0, totalFacts - totalFactsExcl)
      : undefined;
  const totalConversations = conversationTotal.data?.total;
  // DEFECT-002: the audit endpoint has no `total`; `head_seq` is the
  // chain head and, since seqs are contiguous from 1, equals the total
  // number of audit events. Treat a null head (empty chain) as 0.
  const recentActivityCount = auditEvents.data ? (auditEvents.data.head_seq ?? 0) : undefined;
  // Build the counts map keyed by tier-literal sourced from
  // ALLOWED_FACT_TIER (api/types.ts — excluded from the C1.9 scan)
  // so this .tsx file never names a tier literal directly.
  const tierCounts: Record<FactTierValue, number | undefined> = {
    [ALLOWED_FACT_TIER[0]]: tierT2.data?.total,
    [ALLOWED_FACT_TIER[1]]: tierT1.data?.total,
    [ALLOWED_FACT_TIER[2]]: tierT0.data?.total,
    [ALLOWED_FACT_TIER[3]]: tierTPlus1.data?.total,
  };
  const tierErrored = tierT2.isError || tierT1.isError || tierT0.isError || tierTPlus1.isError;

  const followUpFacts = (followUpSample.data?.facts ?? []).filter(
    (f) => f.is_contested && !f.is_tombstoned,
  );
  const followUpHasMore = followUpSample.data?.has_more === true;

  const allSectionsEmpty =
    (totalConversations === 0 || conversationTotal.isError) &&
    (totalFacts === 0 || factTotal.isError) &&
    (recentActivityCount === 0 || auditEvents.isError) &&
    (pending.isError || (pending.data?.total ?? 0) === 0) &&
    followUpFacts.length === 0;

  return (
    <section data-testid={allSectionsEmpty ? 'validation-empty' : 'validation-populated'}>
      <PageHeader />

      <OverviewSection
        totalConversations={totalConversations}
        conversationsErrored={conversationTotal.isError}
        totalFacts={totalFacts}
        factsErrored={factTotal.isError || factTotalExcl.isError}
        followUpCount={followUpCount}
        followUpErrored={factTotal.isError || factTotalExcl.isError}
        recentActivityCount={recentActivityCount}
        recentActivityErrored={auditEvents.isError}
      />

      <PendingReviewSection
        projectId={projectId}
        isError={pending.isError}
        error={pending.error}
        items={pending.data?.conversations ?? []}
        onRetry={() => pending.refetch()}
      />

      <TrustLevelsSection counts={tierCounts} anyErrored={tierErrored} />

      <FollowUpQueueSection
        projectId={projectId}
        isError={followUpSample.isError}
        error={followUpSample.error}
        facts={followUpFacts}
        hasMore={followUpHasMore}
        onRetry={() => followUpSample.refetch()}
      />

      <RecentActivitySection
        isError={auditEvents.isError}
        error={auditEvents.error}
        events={auditEvents.data?.events ?? []}
        onRetry={() => auditEvents.refetch()}
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page chrome
// ─────────────────────────────────────────────────────────────────

function PageHeader(): JSX.Element {
  return (
    <header>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>To double-check</h1>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        Findings that need a closer look, and what to do about them.
      </p>
    </header>
  );
}

interface SectionShellProps {
  readonly heading: string;
  readonly testId: string;
  readonly children: React.ReactNode;
}

function SectionShell({ heading, testId, children }: SectionShellProps): JSX.Element {
  return (
    <section data-testid={testId} style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>{heading}</h2>
      <div style={{ marginTop: '0.5rem' }}>{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1. Overview
// ─────────────────────────────────────────────────────────────────

interface OverviewProps {
  readonly totalConversations: number | undefined;
  readonly conversationsErrored: boolean;
  readonly totalFacts: number | undefined;
  readonly factsErrored: boolean;
  readonly followUpCount: number | undefined;
  readonly followUpErrored: boolean;
  readonly recentActivityCount: number | undefined;
  readonly recentActivityErrored: boolean;
}

function OverviewSection(props: OverviewProps): JSX.Element {
  return (
    <SectionShell heading="Overview" testId="validation-overview">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
          gap: '0.75rem',
        }}
      >
        <OverviewStat
          testId="validation-overview-conversations"
          label={(n) => (n === 1 ? 'conversation' : 'conversations')}
          value={props.totalConversations}
          isError={props.conversationsErrored}
        />
        <OverviewStat
          testId="validation-overview-facts"
          label={(n) => (n === 1 ? 'finding' : 'findings')}
          value={props.totalFacts}
          isError={props.factsErrored}
        />
        <OverviewStat
          testId="validation-overview-followups"
          label={(n) => (n === 1 ? 'finding to double-check' : 'findings to double-check')}
          value={props.followUpCount}
          isError={props.followUpErrored}
        />
        <OverviewStat
          testId="validation-overview-activity"
          label={(n) => (n === 1 ? 'recent event' : 'recent events')}
          value={props.recentActivityCount}
          isError={props.recentActivityErrored}
        />
      </div>
    </SectionShell>
  );
}

interface OverviewStatProps {
  readonly testId: string;
  readonly label: (n: number) => string;
  readonly value: number | undefined;
  readonly isError: boolean;
}

function OverviewStat({ testId, label, value, isError }: OverviewStatProps): JSX.Element {
  if (isError) {
    return (
      <div
        data-testid={`${testId}-error`}
        style={{
          padding: '0.75rem',
          border: '1px solid #f5c2c7',
          borderRadius: '0.375rem',
          color: '#842029',
          fontSize: '0.875rem',
        }}
      >
        Could not load
      </div>
    );
  }
  if (value === undefined) {
    return <div data-testid={`${testId}-loading`} />;
  }
  return (
    <div
      data-testid={testId}
      style={{
        padding: '0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
      }}
    >
      <strong data-testid={`${testId}-value`} style={{ fontSize: '1.25rem' }}>
        {value}
      </strong>
      <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.875rem' }}>
        {label(value)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Conversations Awaiting Review
// ─────────────────────────────────────────────────────────────────

interface PendingReviewProps {
  readonly projectId: string;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly items: readonly ConversationView[];
  readonly onRetry: () => void;
}

function PendingReviewSection(props: PendingReviewProps): JSX.Element {
  return (
    <SectionShell heading="Conversations Awaiting Review" testId="validation-pending">
      {props.isError ? (
        <div data-testid="validation-pending-error">
          <PageErrorBanner
            error={props.error ?? new Error('Could not load pending review')}
            onRetry={props.onRetry}
            headline="Could not load conversations awaiting review"
          />
        </div>
      ) : props.items.length === 0 ? (
        <p
          data-testid="validation-pending-empty"
          style={{ color: '#888', fontStyle: 'italic', margin: 0 }}
        >
          Nothing to review right now.
        </p>
      ) : (
        <ul
          data-testid="validation-pending-list"
          style={{
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {props.items.map((c) => (
            <li key={c.id}>
              <PendingReviewRow conversation={c} projectId={props.projectId} />
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

interface PendingReviewRowProps {
  readonly conversation: ConversationView;
  readonly projectId: string;
}

function PendingReviewRow({ conversation, projectId }: PendingReviewRowProps): JSX.Element {
  const occurred = formatRelativeTime(conversation.occurred_at);
  return (
    <Link
      to={`/projects/${projectId}/conversations/${conversation.id}`}
      data-testid="validation-pending-item"
      data-conversation-id={conversation.id}
      style={{
        display: 'block',
        padding: '0.625rem 0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.95rem' }}>
        With <strong>{conversation.person_name}</strong>
      </p>
      {occurred !== '' ? (
        <p
          data-testid="validation-pending-item-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#888' }}
        >
          Happened {occurred}
        </p>
      ) : null}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. Facts by Trust Level
// ─────────────────────────────────────────────────────────────────

interface TrustLevelsProps {
  readonly counts: Record<FactTierValue, number | undefined>;
  readonly anyErrored: boolean;
}

function TrustLevelsSection({ counts, anyErrored }: TrustLevelsProps): JSX.Element {
  return (
    <SectionShell heading="Findings by Trust Level" testId="validation-tiers">
      {/* C4.4 H1 follow-up: one trust explainer per section, not per row. */}
      <TrustExplainer />
      {anyErrored ? (
        <p data-testid="validation-tiers-warning" style={{ color: '#a06000', margin: 0 }}>
          Could not load one or more trust-level counts.
        </p>
      ) : null}
      <ul
        data-testid="validation-tiers-list"
        style={{
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {TIERS_DISPLAY_ORDER.map((rawTier) => {
          const tier = asFactTier(rawTier);
          const count = counts[rawTier];
          return (
            <li key={rawTier} data-testid="validation-tier-row" data-tier-key={rawTier}>
              <article
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #eee',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <TrustLevelIndicator tier={tier} />
                <strong data-testid="validation-tier-count" style={{ fontSize: '1rem' }}>
                  {count ?? '—'}
                </strong>
              </article>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// 4. Follow-up Queue
// ─────────────────────────────────────────────────────────────────

interface FollowUpQueueProps {
  readonly projectId: string;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly facts: readonly FactView[];
  readonly hasMore: boolean;
  readonly onRetry: () => void;
}

function FollowUpQueueSection(props: FollowUpQueueProps): JSX.Element {
  return (
    <SectionShell heading="Flagged to double-check" testId="validation-followup">
      {props.isError ? (
        <div data-testid="validation-followup-error">
          <PageErrorBanner
            error={props.error ?? new Error('Could not load the double-check list')}
            onRetry={props.onRetry}
            headline="Could not load the double-check list"
          />
        </div>
      ) : props.facts.length === 0 ? (
        <p
          data-testid="validation-followup-empty"
          style={{ color: '#888', fontStyle: 'italic', margin: 0 }}
        >
          Nothing to double-check right now.
        </p>
      ) : (
        <>
          <ul
            data-testid="validation-followup-list"
            style={{
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {props.facts.map((f) => (
              <li key={f.id}>
                <FollowUpRow fact={f} projectId={props.projectId} />
              </li>
            ))}
          </ul>
          {props.hasMore ? (
            <p
              data-testid="validation-followup-has-more"
              style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#888' }}
            >
              Showing the most recent batch. More findings may exist.
            </p>
          ) : null}
        </>
      )}
    </SectionShell>
  );
}

interface FollowUpRowProps {
  readonly fact: FactView;
  readonly projectId: string;
}

function FollowUpRow({ fact, projectId }: FollowUpRowProps): JSX.Element {
  return (
    <Link
      to={`/projects/${projectId}/facts/${fact.id}`}
      data-testid="validation-followup-item"
      data-fact-id={fact.id}
      style={{
        display: 'block',
        padding: '0.625rem 0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.95rem' }}>{fact.statement}</p>
      <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <TrustLevelIndicator tier={fact.tier} />
        <span
          data-testid="validation-followup-flag"
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            backgroundColor: '#fff8e0',
            color: '#5c4400',
          }}
        >
          Flagged to double-check
        </span>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// 5. Recent Activity
// ─────────────────────────────────────────────────────────────────

interface RecentActivityProps {
  readonly isError: boolean;
  readonly error: Error | null;
  readonly events: readonly AuditEventSummary[];
  readonly onRetry: () => void;
}

function RecentActivitySection(props: RecentActivityProps): JSX.Element {
  return (
    <SectionShell heading="Recent Activity" testId="validation-activity">
      {props.isError ? (
        <div data-testid="validation-activity-error">
          <PageErrorBanner
            error={props.error ?? new Error('Could not load activity')}
            onRetry={props.onRetry}
            headline="Could not load recent activity"
          />
        </div>
      ) : props.events.length === 0 ? (
        <p
          data-testid="validation-activity-empty"
          style={{ color: '#888', fontStyle: 'italic', margin: 0 }}
        >
          No recent activity to show.
        </p>
      ) : (
        <ul
          data-testid="validation-activity-list"
          style={{
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {props.events.map((e) => (
            <li key={e.seq}>
              <ActivityRow event={e} />
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

interface ActivityRowProps {
  readonly event: AuditEventSummary;
}

function ActivityRow({ event }: ActivityRowProps): JSX.Element {
  const label = getEnumLabel('audit_action', event.action);
  const when = formatRelativeTime(event.ts);
  return (
    <article
      data-testid="validation-activity-item"
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
      }}
    >
      <p data-testid="validation-activity-item-label" style={{ margin: 0, fontSize: '0.95rem' }}>
        {label}
      </p>
      {when !== '' ? (
        <p
          data-testid="validation-activity-item-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#888' }}
        >
          {when}
        </p>
      ) : null}
    </article>
  );
}
