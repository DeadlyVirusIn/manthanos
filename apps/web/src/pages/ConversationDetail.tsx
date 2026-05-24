// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation detail — Sprint 2 M2 C2.5 (read-only) + M2.5 C25.2
// (Extract Fact wired into the facts section).
//
// Reached via /projects/:projectId/conversations/:id. Shows the full
// ConversationView the daemon returns, plus the facts that were
// extracted from this conversation (separate endpoint).
//
// Tombstoned conversations use sentinel-safe copy: the page renders a
// banner explaining the conversation was erased and HIDES the
// substrate fields (person_name, summary, quotes). Facts already
// extracted from this conversation are still listed — they live on
// independently. The extract button is NOT shown on tombstoned
// conversations.
//
// C25.2: when the conversation is live, the facts section header
// surfaces a "Pull a fact from this conversation" button that opens
// ExtractFactDialog. Success messages survive across the dialog's
// mount/unmount via the MutationSuccessMessage primitive.
//
// All enum values flow through getEnumLabel; every timestamp through
// formatRelativeTime. No raw ISO or substrate vocabulary in the DOM.

import { type Dispatch, type SetStateAction, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type {
  ConversationQuoteView,
  ConversationView,
  ExtractFactInput,
  ExtractFactResponse,
  FactView,
  SkipExtractionInput,
  SkipExtractionResponse,
} from '../api/index.js';
import {
  ExtractFactDialog,
  MutationSuccessMessage,
  PageErrorBanner,
  SkipExtractionDialog,
  TextSkeleton,
  TrustLevelIndicator,
} from '../components/index.js';
import {
  type MutationStatus,
  useConversation,
  useConversationFacts,
  useExtractFact,
  useSkipExtraction,
} from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

type ExtractStatus = MutationStatus<ExtractFactInput, ExtractFactResponse>;
type SkipStatus = MutationStatus<SkipExtractionInput, SkipExtractionResponse>;

export function ConversationDetail(): JSX.Element {
  const { projectId, id: conversationId } = useParams<{ projectId: string; id: string }>();
  const conversationQuery = useConversation(projectId, conversationId);
  const factsQuery = useConversationFacts(projectId, conversationId);

  // M2.5 C25.2: lift extract-mutation state to the page so the success
  // message survives the dialog's mount/unmount lifecycle.
  const extractStatus = useExtractFact(projectId, conversationId) as ExtractStatus;
  const [isExtractOpen, setIsExtractOpen] = useState(false);

  // M2.5 C25.4: same pattern for the skip-extraction flow.
  const skipStatus = useSkipExtraction(projectId, conversationId) as SkipStatus;
  const [isSkipOpen, setIsSkipOpen] = useState(false);

  if (projectId === undefined || conversationId === undefined) {
    return (
      <section data-testid="conversation-detail-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Conversation</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>No conversation id in the URL.</p>
      </section>
    );
  }

  if (conversationQuery.isPending) {
    return renderConversationShell(
      projectId,
      conversationId,
      [],
      <section data-testid="conversation-detail-loading">
        <PageHeader />
        <div style={{ marginTop: '1rem' }}>
          <TextSkeleton lines={3} ariaLabel="Loading conversation" />
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <TextSkeleton lines={5} ariaLabel="Loading transcript" />
        </div>
      </section>,
      {
        extractStatus,
        isExtractOpen,
        setIsExtractOpen,
        skipStatus,
        isSkipOpen,
        setIsSkipOpen,
      },
    );
  }

  if (conversationQuery.isError) {
    return renderConversationShell(
      projectId,
      conversationId,
      [],
      <section data-testid="conversation-detail-error">
        <PageHeader />
        <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          ID: <span data-testid="conv-id">{conversationId}</span>
        </p>
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={conversationQuery.error}
            onRetry={() => conversationQuery.refetch()}
            headline="Could not load this conversation"
          />
        </div>
      </section>,
      {
        extractStatus,
        isExtractOpen,
        setIsExtractOpen,
        skipStatus,
        isSkipOpen,
        setIsSkipOpen,
      },
    );
  }

  const conversation = conversationQuery.data;
  if (conversation === undefined) {
    return renderConversationShell(
      projectId,
      conversationId,
      [],
      <section data-testid="conversation-detail-error">
        <PageHeader />
        <p>This conversation has no data.</p>
      </section>,
      {
        extractStatus,
        isExtractOpen,
        setIsExtractOpen,
        skipStatus,
        isSkipOpen,
        setIsSkipOpen,
      },
    );
  }

  if (conversation.is_tombstoned) {
    // Tombstoned conversations: NO extract button (you cannot pull
    // facts from an erased transcript). The mutation state still lives
    // here so any earlier success message stays visible while the
    // user is on this page.
    return renderConversationShell(
      projectId,
      conversationId,
      [],
      <section data-testid="conversation-detail-tombstoned">
        <PageHeader />
        <TombstoneBanner conversation={conversation} />
        <ExtractedFactsSection
          projectId={projectId}
          factsQueryState={factsQueryStateOf(factsQuery)}
        />
      </section>,
      {
        extractStatus,
        isExtractOpen,
        setIsExtractOpen,
        skipStatus,
        isSkipOpen,
        setIsSkipOpen,
      },
    );
  }

  const openExtract = (): void => setIsExtractOpen(true);
  const openSkip = (): void => setIsSkipOpen(true);

  // C25.4: the "Mark as not useful" button is visible ONLY when the
  // conversation is in the pending extraction state. Extracted /
  // skipped conversations don't need it; tombstoned conversations
  // never reach this branch.
  const showSkipButton = conversation.fact_extraction_status === 'pending';

  return renderConversationShell(
    projectId,
    conversationId,
    conversation.verbatim_quotes,
    <section data-testid="conversation-detail-populated">
      <PageHeader />
      <MetaSection conversation={conversation} />
      {showSkipButton ? (
        <div data-testid="conversation-skip-row" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={openSkip}
            data-testid="conversation-skip-button"
            style={{
              padding: '0.375rem 0.625rem',
              fontSize: '0.875rem',
              borderRadius: '0.25rem',
              border: '1px solid #ccc',
              backgroundColor: 'transparent',
              color: '#555',
              cursor: 'pointer',
            }}
          >
            Mark as not useful
          </button>
        </div>
      ) : null}
      <SummarySection summary={conversation.summary} />
      <QuotesSection quotes={conversation.verbatim_quotes} />
      <ExtractedFactsSection
        projectId={projectId}
        factsQueryState={factsQueryStateOf(factsQuery)}
        onExtractClick={openExtract}
      />
    </section>,
    {
      extractStatus,
      isExtractOpen,
      setIsExtractOpen,
      skipStatus,
      isSkipOpen,
      setIsSkipOpen,
    },
  );
}

interface ConversationShellBundle {
  readonly extractStatus: ExtractStatus;
  readonly isExtractOpen: boolean;
  readonly setIsExtractOpen: Dispatch<SetStateAction<boolean>>;
  readonly skipStatus: SkipStatus;
  readonly isSkipOpen: boolean;
  readonly setIsSkipOpen: Dispatch<SetStateAction<boolean>>;
}

// Shared chrome wrapper: mounts the success message + both dialogs
// above the page body so they survive across body-state transitions.
// The `quotes` param feeds ExtractFactDialog's quote_id picker —
// only the populated branch passes a non-empty list; loading /
// error / tombstoned all pass []. SkipExtractionDialog ignores the
// quotes param.
function renderConversationShell(
  projectId: string,
  conversationId: string,
  quotes: readonly ConversationQuoteView[],
  body: JSX.Element,
  bundle: ConversationShellBundle,
): JSX.Element {
  // Combined success message — at most one of the two mutations is
  // in its success window at any moment. Priority: extract > skip
  // (extract is the more common success path).
  const combinedSuccess = bundle.extractStatus.successMessage ?? bundle.skipStatus.successMessage;
  const dismissAllSuccess = (): void => {
    bundle.extractStatus.dismissSuccess();
    bundle.skipStatus.dismissSuccess();
  };
  return (
    <>
      <MutationSuccessMessage
        message={combinedSuccess}
        onDismiss={dismissAllSuccess}
        testId="conversation-mutation-success"
      />
      {body}
      <ExtractFactDialog
        isOpen={bundle.isExtractOpen}
        onClose={() => bundle.setIsExtractOpen(false)}
        workspaceId={projectId}
        conversationId={conversationId}
        quotes={quotes}
        status={bundle.extractStatus}
      />
      <SkipExtractionDialog
        isOpen={bundle.isSkipOpen}
        onClose={() => bundle.setIsSkipOpen(false)}
        workspaceId={projectId}
        conversationId={conversationId}
        status={bundle.skipStatus}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function PageHeader(): JSX.Element {
  return (
    <header>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Conversation</h1>
    </header>
  );
}

interface MetaSectionProps {
  readonly conversation: ConversationView;
}

function MetaSection({ conversation }: MetaSectionProps): JSX.Element {
  const occurredAgo = formatRelativeTime(conversation.occurred_at);
  const createdAgo = formatRelativeTime(conversation.created_at);
  return (
    <section
      data-testid="conversation-meta"
      style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
    >
      <p data-testid="conversation-person" style={{ margin: 0, fontSize: '1rem' }}>
        With <strong>{conversation.person_name}</strong>
      </p>
      {occurredAgo !== '' ? (
        <p
          data-testid="conversation-occurred"
          style={{ margin: 0, fontSize: '0.875rem', color: '#666' }}
        >
          Happened {occurredAgo}
        </p>
      ) : null}
      {createdAgo !== '' ? (
        <p
          data-testid="conversation-created"
          style={{ margin: 0, fontSize: '0.875rem', color: '#888' }}
        >
          Captured {createdAgo}
        </p>
      ) : null}
      <p
        data-testid="conversation-meta-row"
        style={{
          marginTop: '0.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.875rem',
          color: '#444',
        }}
      >
        <MetaPill
          testId="conversation-audience"
          label="Audience"
          value={getEnumLabel('audience_fit', conversation.audience_fit)}
        />
        <MetaPill
          testId="conversation-type"
          label="Type"
          value={getEnumLabel('conversation_type', conversation.conversation_type)}
        />
        <MetaPill
          testId="conversation-outcome"
          label="Outcome"
          value={getEnumLabel('outcome', conversation.outcome)}
        />
        <MetaPill
          testId="conversation-extraction-status"
          label="Extraction"
          value={getEnumLabel('fact_extraction_status', conversation.fact_extraction_status)}
        />
      </p>
    </section>
  );
}

interface MetaPillProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
}

function MetaPill({ testId, label, value }: MetaPillProps): JSX.Element {
  return (
    <span
      data-testid={testId}
      style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '0.375rem',
        backgroundColor: '#f4f4f4',
        color: '#333',
      }}
    >
      {label}: <strong>{value}</strong>
    </span>
  );
}

interface SummarySectionProps {
  readonly summary: string | null;
}

function SummarySection({ summary }: SummarySectionProps): JSX.Element {
  const hasSummary = typeof summary === 'string' && summary.length > 0;
  return (
    <section data-testid="conversation-summary" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>Summary</h2>
      {hasSummary ? (
        <p
          data-testid="conversation-summary-text"
          style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}
        >
          {summary}
        </p>
      ) : (
        <p
          data-testid="conversation-summary-empty"
          style={{ marginTop: '0.5rem', color: '#888', fontStyle: 'italic' }}
        >
          No summary yet.
        </p>
      )}
    </section>
  );
}

interface QuotesSectionProps {
  readonly quotes: readonly ConversationQuoteView[];
}

function QuotesSection({ quotes }: QuotesSectionProps): JSX.Element {
  // Sort by position to lock in display order regardless of API order.
  const ordered = [...quotes].sort((a, b) => a.position - b.position);
  return (
    <section data-testid="conversation-quotes" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 500 }}>What they said</h2>
      {ordered.length === 0 ? (
        <p
          data-testid="conversation-quotes-empty"
          style={{ marginTop: '0.5rem', color: '#888', fontStyle: 'italic' }}
        >
          No quotes recorded for this conversation.
        </p>
      ) : (
        <ul
          data-testid="conversation-quotes-list"
          style={{
            marginTop: '0.5rem',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {ordered.map((quote) => (
            <li key={quote.id}>
              <blockquote
                data-testid="conversation-quote"
                data-position={quote.position}
                style={{
                  margin: 0,
                  padding: '0.5rem 0.75rem',
                  borderLeft: '3px solid #ddd',
                  color: '#222',
                }}
              >
                {quote.text}
              </blockquote>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ExtractedFactsSectionProps {
  readonly projectId: string;
  readonly factsQueryState: FactsQueryState;
  // C25.2: when provided, the section renders a "Pull a fact from
  // this conversation" button next to the heading. Tombstoned and
  // loading/error branches pass nothing here.
  readonly onExtractClick?: () => void;
}

interface FactsQueryState {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly facts: readonly FactView[];
  readonly refetch: () => void;
}

function factsQueryStateOf(query: ReturnType<typeof useConversationFacts>): FactsQueryState {
  return {
    isPending: query.isPending,
    isError: query.isError,
    error: query.error ?? null,
    facts: query.data?.facts ?? [],
    refetch: () => {
      query.refetch();
    },
  };
}

function ExtractedFactsSection({
  projectId,
  factsQueryState,
  onExtractClick,
}: ExtractedFactsSectionProps): JSX.Element {
  return (
    <section data-testid="conversation-facts" style={{ marginTop: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>
          Facts from this conversation
        </h2>
        {onExtractClick !== undefined ? (
          <button
            type="button"
            onClick={onExtractClick}
            data-testid="conversation-extract-button"
            style={{
              padding: '0.375rem 0.625rem',
              borderRadius: '0.25rem',
              border: '1px solid #0066cc',
              backgroundColor: '#f6faff',
              color: '#0066cc',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Pull a fact from this conversation
          </button>
        ) : null}
      </header>
      {factsQueryState.isPending ? (
        <div data-testid="conversation-facts-loading" style={{ marginTop: '0.5rem' }}>
          <TextSkeleton lines={2} ariaLabel="Loading facts" />
        </div>
      ) : factsQueryState.isError ? (
        <div data-testid="conversation-facts-error" style={{ marginTop: '0.5rem' }}>
          <PageErrorBanner
            error={factsQueryState.error ?? new Error('Could not load facts')}
            onRetry={factsQueryState.refetch}
            headline="Could not load facts from this conversation"
          />
        </div>
      ) : factsQueryState.facts.length === 0 ? (
        <p
          data-testid="conversation-facts-empty"
          style={{ marginTop: '0.5rem', color: '#888', fontStyle: 'italic' }}
        >
          No facts have been pulled from this conversation yet.
        </p>
      ) : (
        <ul
          data-testid="conversation-facts-list"
          style={{
            marginTop: '0.5rem',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {factsQueryState.facts.map((fact) => (
            <li key={fact.id}>
              <FactRow fact={fact} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface FactRowProps {
  readonly fact: FactView;
  readonly projectId: string;
}

function FactRow({ fact, projectId }: FactRowProps): JSX.Element {
  return (
    <article
      data-testid="conversation-fact"
      data-fact-id={fact.id}
      style={{
        padding: '0.75rem',
        border: '1px solid #eee',
        borderRadius: '0.375rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}
    >
      <p data-testid="conversation-fact-statement" style={{ margin: 0, fontSize: '0.95rem' }}>
        {fact.statement}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <TrustLevelIndicator tier={fact.tier} tombstoned={fact.is_tombstoned} />
        <Link
          to={`/projects/${projectId}/facts/${fact.id}`}
          data-testid="conversation-fact-link"
          style={{ fontSize: '0.875rem', color: '#0066cc' }}
        >
          Open fact
        </Link>
      </div>
    </article>
  );
}

interface TombstoneBannerProps {
  readonly conversation: ConversationView;
}

function TombstoneBanner({ conversation }: TombstoneBannerProps): JSX.Element {
  const erasedAgo = formatRelativeTime(conversation.tombstoned_at);
  const reason = conversation.tombstone_reason;
  return (
    <div
      data-testid="conversation-tombstone-banner"
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
      <strong data-testid="conversation-tombstone-headline">This conversation was erased.</strong>
      {erasedAgo !== '' ? (
        <p
          data-testid="conversation-tombstone-time"
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#666' }}
        >
          Erased {erasedAgo}.
        </p>
      ) : null}
      {typeof reason === 'string' && reason.length > 0 ? (
        <p
          data-testid="conversation-tombstone-reason"
          style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#444' }}
        >
          Reason: {reason}
        </p>
      ) : null}
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#888' }}>
        The transcript and quotes are no longer shown. Facts that were already pulled from this
        conversation remain below.
      </p>
    </div>
  );
}
