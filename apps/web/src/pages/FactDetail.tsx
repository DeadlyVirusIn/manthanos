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

import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  ALLOWED_FACT_TIER,
  type FactHistoryEntry,
  type FactTierValue,
  type FactView,
  type LifecycleStateValue,
  type ProvenanceSourceView,
} from '../api/index.js';
import {
  MutationErrorBanner,
  MutationSuccessMessage,
  PageErrorBanner,
  TextSkeleton,
  TrustLevelIndicator,
} from '../components/index.js';
import {
  type MutationStatus,
  useDemoteFact,
  useFact,
  useFactHistory,
  useFactProvenance,
  useMarkFactForFollowUp,
  usePromoteFact,
  useResolveFactFollowUp,
} from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

interface LifecycleMutationBundle {
  readonly promote: MutationStatus<unknown, unknown>;
  readonly demote: MutationStatus<unknown, unknown>;
  readonly mark: MutationStatus<{ reason: string }, unknown>;
  readonly resolve: MutationStatus<{ resolution: string }, unknown>;
}

export function FactDetail(): JSX.Element {
  const { projectId, id: factId } = useParams<{ projectId: string; id: string }>();
  const factQuery = useFact(projectId, factId);
  const provenanceQuery = useFactProvenance(projectId, factId);
  const historyQuery = useFactHistory(projectId, factId);

  // M2.5 C25.3: lifecycle mutation state lives at the page level so
  // success messages survive across body re-renders. The four hooks
  // are mounted unconditionally; gating happens in the controls
  // component based on the fact's lifecycle.
  const promoteStatus = usePromoteFact(projectId, factId);
  const demoteStatus = useDemoteFact(projectId, factId);
  const markStatus = useMarkFactForFollowUp(projectId, factId);
  const resolveStatus = useResolveFactFollowUp(projectId, factId);
  const mutationBundle = {
    promote: promoteStatus as MutationStatus<unknown, unknown>,
    demote: demoteStatus as MutationStatus<unknown, unknown>,
    mark: markStatus as MutationStatus<{ reason: string }, unknown>,
    resolve: resolveStatus as MutationStatus<{ resolution: string }, unknown>,
  } satisfies LifecycleMutationBundle;

  // Picks the most-recent (or first non-null) success message. At most
  // one is typically non-null at a time; if two coexist, priority is
  // promote > demote > mark > resolve.
  const combinedSuccess =
    promoteStatus.successMessage ??
    demoteStatus.successMessage ??
    markStatus.successMessage ??
    resolveStatus.successMessage;
  const dismissAllSuccess = (): void => {
    promoteStatus.dismissSuccess();
    demoteStatus.dismissSuccess();
    markStatus.dismissSuccess();
    resolveStatus.dismissSuccess();
  };

  // Shell wrapper used across every render branch so the success
  // message survives transient query refetches (e.g. when a mutation
  // invalidates the fact query and the refetch is in flight).
  const withShell = (body: JSX.Element): JSX.Element => (
    <>
      <MutationSuccessMessage
        message={combinedSuccess}
        onDismiss={dismissAllSuccess}
        testId="fact-mutation-success"
      />
      {body}
    </>
  );

  if (projectId === undefined || factId === undefined) {
    return (
      <section data-testid="fact-detail-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Fact</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>No fact id in the URL.</p>
      </section>
    );
  }

  if (factQuery.isPending) {
    return withShell(
      <section data-testid="fact-detail-loading">
        <PageHeader />
        <div style={{ marginTop: '1rem' }}>
          <TextSkeleton lines={3} ariaLabel="Loading fact" />
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <TextSkeleton lines={4} ariaLabel="Loading evidence" />
        </div>
      </section>,
    );
  }

  if (factQuery.isError) {
    return withShell(
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
      </section>,
    );
  }

  const fact = factQuery.data;
  if (fact === undefined) {
    return withShell(
      <section data-testid="fact-detail-error">
        <PageHeader />
        <p>This fact has no data.</p>
      </section>,
    );
  }

  if (fact.is_tombstoned) {
    return withShell(
      <section data-testid="fact-detail-tombstoned">
        <PageHeader />
        <TombstoneBanner fact={fact} />
      </section>,
    );
  }

  return withShell(
    <section data-testid="fact-detail-populated">
      <PageHeader />
      {fact.is_contested ? <ContestedBanner fact={fact} /> : null}
      <StatementSection fact={fact} />
      <MetaSection fact={fact} />
      <FactLifecycleControls fact={fact} bundle={mutationBundle} />
      <TimestampsSection fact={fact} />
      <ProvenanceSection state={provenanceQueryState(provenanceQuery)} />
      <HistorySection state={historyQueryState(historyQuery)} />
    </section>,
  );
}

// ─────────────────────────────────────────────────────────────────
// Lifecycle controls (C25.3) — promote / demote / mark / resolve
// ─────────────────────────────────────────────────────────────────
//
// Inline controls rendered between MetaSection and TimestampsSection
// on the populated branch. Tombstoned facts never reach this branch.
//
// Disabled-state reasons (surfaced via title= per the framework
// kickoff §4.2 C25.3):
//   - promote at T+1: 'Trust level is already at the top.'
//   - demote at T-2: 'Trust level is already at the bottom.'
//   - promote/demote when contested: 'Resolve the follow-up first.'
//   - promote/demote on non-head: 'Open the current version to change it.'
//   - mark when already contested: 'This is already flagged for follow-up.'
//   - resolve when not contested: "This isn't flagged for follow-up."

interface FactLifecycleControlsProps {
  readonly fact: FactView;
  readonly bundle: LifecycleMutationBundle;
}

type InlineFormMode = 'none' | 'mark' | 'resolve';

function tierIndex(t: FactTierValue): number {
  return ALLOWED_FACT_TIER.indexOf(t);
}

function FactLifecycleControls({ fact, bundle }: FactLifecycleControlsProps): JSX.Element {
  const [inlineForm, setInlineForm] = useState<InlineFormMode>('none');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');

  // The tier value runs through ALLOWED_FACT_TIER (api/types.ts) so
  // this .tsx file never names a raw tier literal.
  const idx = tierIndex(fact.tier as FactTierValue);
  const atTop = idx === ALLOWED_FACT_TIER.length - 1;
  const atBottom = idx === 0;
  const head = fact.is_head;
  const contested = fact.is_contested;

  const promoteDisabled = atTop || contested || !head || bundle.promote.isSubmitting;
  const demoteDisabled = atBottom || contested || !head || bundle.demote.isSubmitting;
  const markDisabled = contested || !head || bundle.mark.isSubmitting;
  const resolveDisabled = !contested || bundle.resolve.isSubmitting;

  const promoteReason = !head
    ? 'Open the current version to change it.'
    : contested
      ? 'Resolve the follow-up before changing the trust level.'
      : atTop
        ? 'Trust level is already at the top.'
        : '';
  const demoteReason = !head
    ? 'Open the current version to change it.'
    : contested
      ? 'Resolve the follow-up before changing the trust level.'
      : atBottom
        ? 'Trust level is already at the bottom.'
        : '';
  const markReason = !head
    ? 'Open the current version to change it.'
    : contested
      ? 'This is already flagged for follow-up.'
      : '';
  const resolveReason = !contested ? "This isn't flagged for follow-up." : '';

  const onPromote = (): void => {
    if (promoteDisabled) return;
    bundle.promote.mutate({});
  };
  const onDemote = (): void => {
    if (demoteDisabled) return;
    bundle.demote.mutate({});
  };
  const onMarkSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (markDisabled) return;
    if (reason.trim().length === 0) return;
    bundle.mark.mutate({ reason: reason.trim() });
  };
  const onResolveSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (resolveDisabled) return;
    if (resolution.trim().length === 0) return;
    bundle.resolve.mutate({ resolution: resolution.trim() });
  };

  // Close inline forms + clear inputs on successful mutation.
  if (inlineForm === 'mark' && bundle.mark.isSuccess && reason.length > 0) {
    setInlineForm('none');
    setReason('');
  }
  if (inlineForm === 'resolve' && bundle.resolve.isSuccess && resolution.length > 0) {
    setInlineForm('none');
    setResolution('');
  }

  // Error to surface: pick the first non-null. At most one of the four
  // can be in error at a time given the disabled gating, but a stale
  // error could remain after the user retries another action.
  const activeError =
    bundle.promote.error ?? bundle.demote.error ?? bundle.mark.error ?? bundle.resolve.error;

  return (
    <section
      data-testid="fact-lifecycle-controls"
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <LifecycleButton
          testId="fact-promote-button"
          label="Raise confidence"
          disabled={promoteDisabled}
          disabledReason={promoteReason}
          isSubmitting={bundle.promote.isSubmitting}
          onClick={onPromote}
        />
        <LifecycleButton
          testId="fact-demote-button"
          label="Lower confidence"
          disabled={demoteDisabled}
          disabledReason={demoteReason}
          isSubmitting={bundle.demote.isSubmitting}
          onClick={onDemote}
        />
        {!contested ? (
          <LifecycleButton
            testId="fact-mark-button"
            label="Mark for follow-up"
            disabled={markDisabled}
            disabledReason={markReason}
            isSubmitting={false}
            onClick={() => setInlineForm(inlineForm === 'mark' ? 'none' : 'mark')}
            ariaExpanded={inlineForm === 'mark'}
          />
        ) : (
          <LifecycleButton
            testId="fact-resolve-button"
            label="Resolve follow-up"
            disabled={resolveDisabled}
            disabledReason={resolveReason}
            isSubmitting={false}
            onClick={() => setInlineForm(inlineForm === 'resolve' ? 'none' : 'resolve')}
            ariaExpanded={inlineForm === 'resolve'}
          />
        )}
      </div>

      {activeError !== null ? <MutationErrorBanner error={activeError} /> : null}

      {inlineForm === 'mark' ? (
        <form
          data-testid="fact-mark-form"
          onSubmit={onMarkSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            padding: '0.75rem',
            border: '1px solid #f0d090',
            borderRadius: '0.375rem',
            backgroundColor: '#fff8e0',
          }}
        >
          <label
            htmlFor="fact-mark-reason"
            style={{ fontSize: '0.875rem', fontWeight: 500, color: '#5c4400' }}
          >
            Why does this need a closer look?
          </label>
          <textarea
            id="fact-mark-reason"
            data-testid="fact-mark-input-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={2}
            style={inlineInputStyle}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              data-testid="fact-mark-cancel"
              onClick={() => {
                setInlineForm('none');
                setReason('');
              }}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="fact-mark-submit"
              disabled={reason.trim().length === 0 || bundle.mark.isSubmitting}
              style={primaryButtonStyle(reason.trim().length === 0 || bundle.mark.isSubmitting)}
            >
              {bundle.mark.isSubmitting ? 'Saving…' : 'Flag for follow-up'}
            </button>
          </div>
        </form>
      ) : null}

      {inlineForm === 'resolve' ? (
        <form
          data-testid="fact-resolve-form"
          onSubmit={onResolveSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            padding: '0.75rem',
            border: '1px solid #bcd9bd',
            borderRadius: '0.375rem',
            backgroundColor: '#eef7ef',
          }}
        >
          <label
            htmlFor="fact-resolve-resolution"
            style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f4d1f' }}
          >
            What did you find out?
          </label>
          <textarea
            id="fact-resolve-resolution"
            data-testid="fact-resolve-input-resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            required
            rows={2}
            style={inlineInputStyle}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              data-testid="fact-resolve-cancel"
              onClick={() => {
                setInlineForm('none');
                setResolution('');
              }}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="fact-resolve-submit"
              disabled={resolution.trim().length === 0 || bundle.resolve.isSubmitting}
              style={primaryButtonStyle(
                resolution.trim().length === 0 || bundle.resolve.isSubmitting,
              )}
            >
              {bundle.resolve.isSubmitting ? 'Saving…' : 'Mark resolved'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

interface LifecycleButtonProps {
  readonly testId: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly disabledReason: string;
  readonly isSubmitting: boolean;
  readonly onClick: () => void;
  readonly ariaExpanded?: boolean;
}

function LifecycleButton({
  testId,
  label,
  disabled,
  disabledReason,
  isSubmitting,
  onClick,
  ariaExpanded,
}: LifecycleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      data-disabled={disabled ? 'true' : 'false'}
      disabled={disabled}
      title={disabled && disabledReason !== '' ? disabledReason : undefined}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      style={{
        padding: '0.375rem 0.625rem',
        fontSize: '0.875rem',
        borderRadius: '0.25rem',
        border: '1px solid #0066cc',
        backgroundColor: disabled ? '#f4f4f4' : '#f6faff',
        color: disabled ? '#888' : '#0066cc',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {isSubmitting ? 'Saving…' : label}
    </button>
  );
}

const inlineInputStyle = {
  width: '100%',
  padding: '0.4rem 0.5rem',
  borderRadius: '0.25rem',
  border: '1px solid #ccc',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
  resize: 'vertical' as const,
};

const cancelButtonStyle = {
  padding: '0.375rem 0.625rem',
  fontSize: '0.875rem',
  borderRadius: '0.25rem',
  border: '1px solid #ccc',
  backgroundColor: 'transparent',
  color: '#555',
  cursor: 'pointer',
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.375rem 0.625rem',
    fontSize: '0.875rem',
    borderRadius: '0.25rem',
    border: '1px solid #0066cc',
    backgroundColor: '#0066cc',
    color: 'white',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
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
