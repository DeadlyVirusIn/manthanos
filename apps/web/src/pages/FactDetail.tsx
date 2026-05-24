// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact detail — Sprint 2 M2 C2.6 (read-only).
//
// Reached via /projects/:projectId/facts/:id. Three queries back the
// page:
//   getFact            → FactView (statement, tier, flags, …)
//   getFactProvenance  → ListProvenanceResult (sources behind the fact)
//   getFactHistory     → FactHistoryResult (version chain)
//
// Lifecycle is derived from the FactView flags rather than a single
// substrate field. Display priority (most specific first):
//   is_tombstoned     → 'Erased'
//   superseded_by ≠ ∅ → 'Older version'
//   is_contested      → 'Flagged for follow-up'
//   else              → 'Not flagged'
//
// Tombstoned facts use sentinel-safe copy: a banner explains the fact
// was erased and HIDES statement / topic / provenance / history.
// Contested facts get a less-severe banner that still shows the
// statement and surrounding context.
//
// All enums flow through getEnumLabel; tier through TrustLevelIndicator;
// timestamps through formatRelativeTime. No raw ISO or substrate
// vocabulary in the DOM.

import { useParams } from 'react-router-dom';

import type {
  FactHistoryEntry,
  FactView,
  LifecycleStateValue,
  ProvenanceSourceView,
} from '../api/index.js';
import { PageErrorBanner, TextSkeleton, TrustLevelIndicator } from '../components/index.js';
import { useFact, useFactHistory, useFactProvenance } from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

export function FactDetail(): JSX.Element {
  const { projectId, id: factId } = useParams<{ projectId: string; id: string }>();
  const factQuery = useFact(projectId, factId);
  const provenanceQuery = useFactProvenance(projectId, factId);
  const historyQuery = useFactHistory(projectId, factId);

  if (projectId === undefined || factId === undefined) {
    return (
      <section data-testid="fact-detail-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Fact</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>No fact id in the URL.</p>
      </section>
    );
  }

  if (factQuery.isPending) {
    return (
      <section data-testid="fact-detail-loading">
        <PageHeader />
        <div style={{ marginTop: '1rem' }}>
          <TextSkeleton lines={3} ariaLabel="Loading fact" />
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <TextSkeleton lines={4} ariaLabel="Loading evidence" />
        </div>
      </section>
    );
  }

  if (factQuery.isError) {
    return (
      <section data-testid="fact-detail-error">
        <PageHeader />
        <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          ID: <span data-testid="fact-id">{factId}</span>
        </p>
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={factQuery.error}
            onRetry={() => factQuery.refetch()}
            headline="Could not load this fact"
          />
        </div>
      </section>
    );
  }

  const fact = factQuery.data;
  if (fact === undefined) {
    return (
      <section data-testid="fact-detail-error">
        <PageHeader />
        <p>This fact has no data.</p>
      </section>
    );
  }

  if (fact.is_tombstoned) {
    return (
      <section data-testid="fact-detail-tombstoned">
        <PageHeader />
        <TombstoneBanner fact={fact} />
      </section>
    );
  }

  return (
    <section data-testid="fact-detail-populated">
      <PageHeader />
      {fact.is_contested ? <ContestedBanner fact={fact} /> : null}
      <StatementSection fact={fact} />
      <MetaSection fact={fact} />
      <TimestampsSection fact={fact} />
      <ProvenanceSection state={provenanceQueryState(provenanceQuery)} />
      <HistorySection state={historyQueryState(historyQuery)} />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Lifecycle derivation
// ─────────────────────────────────────────────────────────────────

function deriveLifecycle(fact: FactView): LifecycleStateValue {
  if (fact.is_tombstoned) return 'tombstoned';
  if (fact.superseded_by_fact_id !== null) return 'superseded';
  if (fact.is_contested) return 'contested';
  return 'not_contested';
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function PageHeader(): JSX.Element {
  return (
    <header>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Fact</h1>
    </header>
  );
}

interface FactSectionProps {
  readonly fact: FactView;
}

function StatementSection({ fact }: FactSectionProps): JSX.Element {
  return (
    <section data-testid="fact-statement" style={{ marginTop: '1rem' }}>
      <p
        data-testid="fact-statement-text"
        style={{ fontSize: '1.05rem', lineHeight: 1.45, margin: 0 }}
      >
        {fact.statement}
      </p>
    </section>
  );
}

function MetaSection({ fact }: FactSectionProps): JSX.Element {
  const lifecycle = deriveLifecycle(fact);
  const lifecycleLabel = getEnumLabel('lifecycle_state', lifecycle);
  return (
    <section
      data-testid="fact-meta"
      style={{
        marginTop: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.9rem',
        color: '#444',
      }}
    >
      <span data-testid="fact-trust-level">
        <TrustLevelIndicator tier={fact.tier} tombstoned={fact.is_tombstoned} />
      </span>
      <span
        data-testid="fact-topic"
        style={{
          padding: '0.25rem 0.5rem',
          borderRadius: '0.375rem',
          backgroundColor: '#f4f4f4',
        }}
      >
        Topic: <strong>{fact.area}</strong>
      </span>
      <span
        data-testid="fact-lifecycle"
        data-lifecycle={lifecycle}
        style={{
          padding: '0.25rem 0.5rem',
          borderRadius: '0.375rem',
          backgroundColor: '#f4f4f4',
        }}
      >
        Status: <strong>{lifecycleLabel}</strong>
      </span>
    </section>
  );
}

function TimestampsSection({ fact }: FactSectionProps): JSX.Element {
  const corroboratedAgo = formatRelativeTime(fact.last_corroborated);
  const touchedAgo = formatRelativeTime(fact.last_administratively_touched);
  if (corroboratedAgo === '' && touchedAgo === '') {
    return <></>;
  }
  return (
    <section
      data-testid="fact-timestamps"
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
        fontSize: '0.875rem',
        color: '#777',
      }}
    >
      {corroboratedAgo !== '' ? (
        <span data-testid="fact-corroborated">Last heard {corroboratedAgo}</span>
      ) : null}
      {touchedAgo !== '' ? <span data-testid="fact-touched">Last touched {touchedAgo}</span> : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────

interface SectionQueryState<T> {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly data: T;
  readonly refetch: () => void;
}

function provenanceQueryState(
  q: ReturnType<typeof useFactProvenance>,
): SectionQueryState<readonly ProvenanceSourceView[]> {
  return {
    isPending: q.isPending,
    isError: q.isError,
    error: q.error ?? null,
    data: q.data?.provenance ?? [],
    refetch: () => {
      q.refetch();
    },
  };
}

interface ProvenanceSectionProps {
  readonly state: SectionQueryState<readonly ProvenanceSourceView[]>;
}

function ProvenanceSection({ state }: ProvenanceSectionProps): JSX.Element {
  return (
    <section data-testid="fact-provenance" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Where this came from</h2>
      {state.isPending ? (
        <div data-testid="fact-provenance-loading" style={{ marginTop: '0.5rem' }}>
          <TextSkeleton lines={2} ariaLabel="Loading evidence" />
        </div>
      ) : state.isError ? (
        <div data-testid="fact-provenance-error" style={{ marginTop: '0.5rem' }}>
          <PageErrorBanner
            error={state.error ?? new Error('Could not load evidence')}
            onRetry={state.refetch}
            headline="Could not load the evidence for this fact"
          />
        </div>
      ) : state.data.length === 0 ? (
        <p
          data-testid="fact-provenance-empty"
          style={{ marginTop: '0.5rem', color: '#888', fontStyle: 'italic' }}
        >
          No recorded evidence for this fact yet.
        </p>
      ) : (
        <ul
          data-testid="fact-provenance-list"
          style={{
            marginTop: '0.5rem',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {state.data.map((src) => (
            <li key={src.id}>
              <ProvenanceRow source={src} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ProvenanceRowProps {
  readonly source: ProvenanceSourceView;
}

function ProvenanceRow({ source }: ProvenanceRowProps): JSX.Element {
  const kindLabel = getEnumLabel('provenance_kind', source.kind);
  const extractedAgo = formatRelativeTime(source.extracted_at);
  const degraded = source.degraded_at !== null;
  return (
    <article
      data-testid="fact-provenance-item"
      data-source-id={source.id}
      data-degraded={degraded ? 'true' : 'false'}
      style={{
        padding: '0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
      }}
    >
      <p data-testid="fact-provenance-kind" style={{ margin: 0, fontSize: '0.95rem' }}>
        Pulled <strong>{kindLabel}</strong>
        {extractedAgo !== '' ? (
          <>
            {' '}
            <span data-testid="fact-provenance-time" style={{ color: '#888' }}>
              {extractedAgo}
            </span>
          </>
        ) : null}
      </p>
      {degraded ? (
        <p
          data-testid="fact-provenance-degraded"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#a06000' }}
        >
          Source has been weakened
          {typeof source.degraded_reason === 'string' && source.degraded_reason.length > 0
            ? `: ${source.degraded_reason}`
            : '.'}
        </p>
      ) : null}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────

function historyQueryState(
  q: ReturnType<typeof useFactHistory>,
): SectionQueryState<readonly FactHistoryEntry[]> {
  return {
    isPending: q.isPending,
    isError: q.isError,
    error: q.error ?? null,
    data: q.data?.versions ?? [],
    refetch: () => {
      q.refetch();
    },
  };
}

interface HistorySectionProps {
  readonly state: SectionQueryState<readonly FactHistoryEntry[]>;
}

function HistorySection({ state }: HistorySectionProps): JSX.Element {
  return (
    <section data-testid="fact-history" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>How this fact has changed</h2>
      {state.isPending ? (
        <div data-testid="fact-history-loading" style={{ marginTop: '0.5rem' }}>
          <TextSkeleton lines={3} ariaLabel="Loading history" />
        </div>
      ) : state.isError ? (
        <div data-testid="fact-history-error" style={{ marginTop: '0.5rem' }}>
          <PageErrorBanner
            error={state.error ?? new Error('Could not load history')}
            onRetry={state.refetch}
            headline="Could not load the history of this fact"
          />
        </div>
      ) : state.data.length === 0 ? (
        <p
          data-testid="fact-history-empty"
          style={{ marginTop: '0.5rem', color: '#888', fontStyle: 'italic' }}
        >
          No earlier versions of this fact.
        </p>
      ) : (
        <ol
          data-testid="fact-history-list"
          style={{
            marginTop: '0.5rem',
            paddingLeft: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {state.data.map((entry) => (
            <li key={entry.fact.id}>
              <HistoryRow entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface HistoryRowProps {
  readonly entry: FactHistoryEntry;
}

function HistoryRow({ entry }: HistoryRowProps): JSX.Element {
  const ago = formatRelativeTime(entry.fact.last_administratively_touched);
  return (
    <article
      data-testid="fact-history-item"
      data-position={entry.position}
      data-fact-id={entry.fact.id}
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      <p data-testid="fact-history-item-statement" style={{ margin: 0, fontSize: '0.95rem' }}>
        {entry.fact.statement}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <TrustLevelIndicator tier={entry.fact.tier} tombstoned={entry.fact.is_tombstoned} />
        {ago !== '' ? (
          <span data-testid="fact-history-item-time" style={{ fontSize: '0.8rem', color: '#888' }}>
            {ago}
          </span>
        ) : null}
        {entry.fact.is_head ? (
          <span
            data-testid="fact-history-item-head"
            style={{
              fontSize: '0.75rem',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              backgroundColor: '#e6f0ff',
              color: '#0056b3',
            }}
          >
            Current
          </span>
        ) : null}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// Lifecycle banners
// ─────────────────────────────────────────────────────────────────

interface FactBannerProps {
  readonly fact: FactView;
}

function ContestedBanner({ fact }: FactBannerProps): JSX.Element {
  const contestedAgo = formatRelativeTime(fact.contested_at);
  return (
    <div
      data-testid="fact-contested-banner"
      role="alert"
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        border: '1px solid #f0d090',
        backgroundColor: '#fff8e0',
        borderRadius: '0.5rem',
        color: '#5c4400',
      }}
    >
      <strong data-testid="fact-contested-headline">Flagged for follow-up.</strong>
      {contestedAgo !== '' ? (
        <p
          data-testid="fact-contested-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#7a5d00' }}
        >
          Flagged {contestedAgo}.
        </p>
      ) : null}
      {typeof fact.contested_reason === 'string' && fact.contested_reason.length > 0 ? (
        <p
          data-testid="fact-contested-reason"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}
        >
          Reason: {fact.contested_reason}
        </p>
      ) : null}
    </div>
  );
}

function TombstoneBanner({ fact }: FactBannerProps): JSX.Element {
  const erasedAgo = formatRelativeTime(fact.tombstoned_at);
  const reason = fact.tombstone_reason;
  return (
    <div
      data-testid="fact-tombstone-banner"
      role="alert"
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #ddd',
        backgroundColor: '#fafafa',
        borderRadius: '0.5rem',
        color: '#444',
      }}
    >
      <strong data-testid="fact-tombstone-headline">This fact was erased.</strong>
      {erasedAgo !== '' ? (
        <p
          data-testid="fact-tombstone-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#666' }}
        >
          Erased {erasedAgo}.
        </p>
      ) : null}
      {typeof reason === 'string' && reason.length > 0 ? (
        <p
          data-testid="fact-tombstone-reason"
          style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}
        >
          Reason: {reason}
        </p>
      ) : null}
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#888' }}>
        The statement, topic, evidence and history are no longer shown.
      </p>
    </div>
  );
}
