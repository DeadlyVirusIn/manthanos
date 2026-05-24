// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ExtractFactDialog — Sprint 2 M2.5 C25.2.
//
// Modal form for the Conversation Detail "Pull a fact from this
// conversation" flow. Composes:
//   - MutationDialog (chrome)
//   - MutationErrorBanner (typed error display + duplicate_fact link)
//   - useExtractFact (mutation + invalidation)
//
// Per F.2 (framework resolution): on a duplicate_fact envelope the
// banner stays in-place with a link to the existing fact — no
// auto-navigate.
//
// Per F.3: when the dialog opens it calls status.reset() so a
// previous error/success doesn't bleed into the new attempt.
//
// Vocabulary discipline: every field label flows through
// getEnumLabel('field_label', …); the tier select flows through
// getEnumLabel('tier', …); no raw substrate / ISO ever reaches DOM.

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ALLOWED_FACT_TIER,
  type ConversationQuoteView,
  type ExtractFactInput,
  type ExtractFactResponse,
  type FactTierValue,
  asFactTier,
} from '../api/index.js';
import { useExtractFact } from '../hooks/useExtractFact.js';
import type { MutationStatus } from '../hooks/useMutationStatus.js';
import { getEnumLabel } from '../i18n/labels.js';
import { MutationDialog } from './MutationDialog.js';
import { MutationErrorBanner } from './MutationErrorBanner.js';
import { TrustLevelIndicator } from './TrustLevelIndicator.js';

export interface ExtractFactDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly quotes: readonly ConversationQuoteView[];
  // Exposed for tests + the host page to read the success message.
  readonly status?: MutationStatus<ExtractFactInput, ExtractFactResponse>;
}

export function ExtractFactDialog(props: ExtractFactDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId, conversationId, quotes } = props;
  const ownStatus = useExtractFact(workspaceId, conversationId);
  const status = (props.status ?? ownStatus) as MutationStatus<
    ExtractFactInput,
    ExtractFactResponse
  >;

  const [area, setArea] = useState('');
  const [statement, setStatement] = useState('');
  const [tier, setTier] = useState<FactTierValue | ''>('');
  const [quoteId, setQuoteId] = useState('');

  // F.3: clear prior error / success + form state when dialog opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.reset is referentially stable via useCallback; effect fires only on isOpen transition (see SPRINT2_M2.5_MUTATION_FRAMEWORK.md §1.4 / F.3).
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setArea('');
    setStatement('');
    setTier('');
    setQuoteId('');
  }, [isOpen]);

  // Close the dialog once the mutation succeeds.
  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const areaValid = area.trim().length > 0;
  const statementValid = statement.trim().length > 0;
  const isValid = areaValid && statementValid;

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isValid) return;
      const input: ExtractFactInput = {
        area: area.trim(),
        statement: statement.trim(),
        ...(tier.length > 0 ? { tier: asFactTier(tier) } : {}),
        ...(quoteId.length > 0 ? { quote_id: quoteId } : {}),
      };
      status.mutate(input);
    },
    [isValid, area, statement, tier, quoteId, status],
  );

  // F.2: duplicate_fact → link to the existing fact, dialog stays open.
  const linkBuilder = useCallback(
    (body: { error: string; existing_fact_id?: unknown }) => {
      if (body.error !== 'duplicate_fact') return null;
      const existing = body.existing_fact_id;
      if (typeof existing !== 'string' || existing.length === 0) return null;
      return {
        href: `/projects/${workspaceId}/facts/${existing}`,
        label: 'Open the existing fact',
      };
    },
    [workspaceId],
  );

  const errorBanner: ReactNode =
    status.error !== null ? (
      <MutationErrorBanner
        error={status.error}
        linkBuilder={linkBuilder}
        LinkComponent={LinkAdapter}
      />
    ) : null;

  const orderedQuotes = [...quotes].sort((a, b) => a.position - b.position);

  return (
    <MutationDialog
      title="Pull a fact from this conversation"
      isOpen={isOpen}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Pull fact"
      cancelLabel="Cancel"
      isSubmitting={status.isSubmitting}
      submitDisabled={!isValid}
      errorSlot={errorBanner}
    >
      <FormRow labelKey="area" htmlFor="extract-area" testId="extract-field-area">
        <input
          id="extract-area"
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          required
          data-testid="extract-input-area"
          style={inputStyle}
        />
      </FormRow>

      <FormRow labelKey="statement" htmlFor="extract-statement" testId="extract-field-statement">
        <textarea
          id="extract-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={3}
          required
          data-testid="extract-input-statement"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </FormRow>

      <div data-testid="extract-field-tier" style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="extract-tier" style={labelStyle}>
          Trust level (optional)
        </label>
        <select
          id="extract-tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as FactTierValue | '')}
          data-testid="extract-input-tier"
          style={inputStyle}
        >
          <option value="">— leave default —</option>
          {ALLOWED_FACT_TIER.map((v) => (
            <option key={v} value={v}>
              {getEnumLabel('tier', v)}
            </option>
          ))}
        </select>
        {tier.length > 0 ? (
          <div data-testid="extract-tier-preview" style={{ marginTop: '0.375rem' }}>
            <TrustLevelIndicator tier={asFactTier(tier)} />
          </div>
        ) : null}
      </div>

      {orderedQuotes.length > 0 ? (
        <div data-testid="extract-field-quote" style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="extract-quote" style={labelStyle}>
            Tie this fact to a specific quote? (optional)
          </label>
          <select
            id="extract-quote"
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            data-testid="extract-input-quote"
            style={inputStyle}
          >
            <option value="">— not tied to a single quote —</option>
            {orderedQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {truncateForOption(q.text)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </MutationDialog>
  );
}

function truncateForOption(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1)}…`;
}

const labelStyle = {
  display: 'block',
  fontSize: '0.875rem',
  fontWeight: 500,
  marginBottom: '0.25rem',
  color: '#333',
};

const inputStyle = {
  width: '100%',
  padding: '0.4rem 0.5rem',
  borderRadius: '0.25rem',
  border: '1px solid #ccc',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};

interface FormRowProps {
  readonly labelKey: Parameters<typeof getEnumLabel>[1];
  readonly htmlFor: string;
  readonly testId: string;
  readonly children: ReactNode;
}

function FormRow({ labelKey, htmlFor, testId, children }: FormRowProps): JSX.Element {
  return (
    <div data-testid={testId} style={{ marginBottom: '0.75rem' }}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {getEnumLabel('field_label', labelKey)}
      </label>
      {children}
    </div>
  );
}

interface LinkAdapterProps {
  readonly to: string;
  readonly children: ReactNode;
  readonly 'data-testid': string;
}

function LinkAdapter(props: LinkAdapterProps): JSX.Element {
  return (
    <Link
      to={props.to}
      data-testid={props['data-testid']}
      style={{ color: '#0066cc', fontSize: '0.875rem' }}
    >
      {props.children}
    </Link>
  );
}
