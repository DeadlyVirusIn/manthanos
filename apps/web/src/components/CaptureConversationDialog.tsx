// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// CaptureConversationDialog — Sprint 2 M2.5 C25.1.
//
// Modal form for Today's Capture Conversation flow. Composes:
//   - MutationDialog (chrome)
//   - MutationErrorBanner (typed error display)
//   - useCaptureConversation (mutation + invalidation)
//
// Per F.3: when the dialog opens it calls status.reset() so a previous
// error/success doesn't bleed into the new attempt.
//
// Future-timestamp warning (J.4): if occurred_at is in the future, the
// form renders a soft warning under the field. Submission is NOT blocked.
//
// Vocabulary discipline: every field label flows through
// getEnumLabel('field_label', …); every select option flows through
// the matching enum label map. No raw substrate / ISO ever reaches DOM.

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import {
  ALLOWED_AUDIENCE_FIT,
  ALLOWED_CONVERSATION_OUTCOME,
  ALLOWED_CONVERSATION_TYPE,
  type AudienceFitValue,
  type ConversationOutcomeValue,
  type ConversationTypeValue,
  type CreateConversationInput,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
} from '../api/index.js';
import { useCaptureConversation } from '../hooks/useCaptureConversation.js';
import type { MutationStatus } from '../hooks/useMutationStatus.js';
import { getEnumLabel } from '../i18n/labels.js';
import { MutationDialog } from './MutationDialog.js';
import { MutationErrorBanner } from './MutationErrorBanner.js';

export interface CaptureConversationDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  // Exposed for tests + Today.tsx to read the success message.
  readonly status?: MutationStatus<CreateConversationInput, unknown>;
}

interface QuoteRow {
  readonly id: string;
  readonly text: string;
}

function nowLocalDatetime(): string {
  // Returns YYYY-MM-DDTHH:MM in the local timezone — the format
  // <input type="datetime-local"> expects.
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rowKey(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CaptureConversationDialog(props: CaptureConversationDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId } = props;
  const ownStatus = useCaptureConversation(workspaceId);
  const status = (props.status ?? ownStatus) as MutationStatus<CreateConversationInput, unknown>;

  const [personName, setPersonName] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalDatetime());
  const [audienceFit, setAudienceFit] = useState<AudienceFitValue | ''>('');
  const [conversationType, setConversationType] = useState<ConversationTypeValue | ''>('');
  const [outcome, setOutcome] = useState<ConversationOutcomeValue | ''>('');
  const [summary, setSummary] = useState('');
  const [quotes, setQuotes] = useState<readonly QuoteRow[]>([]);

  // F.3: clear prior error / success and form state whenever the
  // dialog transitions from closed to open. The effect intentionally
  // depends on isOpen alone; status.reset() is referentially stable
  // via useCallback inside useMutationStatus, and re-running this
  // effect on every status change would clobber in-flight form
  // edits. See SPRINT2_M2.5_MUTATION_FRAMEWORK.md §1.4 / F.3.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setPersonName('');
    setOccurredAt(nowLocalDatetime());
    setAudienceFit('');
    setConversationType('');
    setOutcome('');
    setSummary('');
    setQuotes([]);
  }, [isOpen]);

  // Close the dialog once the mutation succeeds. The page keeps the
  // success message visible separately.
  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const personValid = personName.trim().length > 0;
  const dateValid = occurredAt.length > 0;
  // Use length-based gates so the boolean flag is independent of TS's
  // narrowing — keeps handleSubmit's branch readable without TS
  // complaining about "no overlap" comparisons.
  const audienceValid = audienceFit.length > 0;
  const typeValid = conversationType.length > 0;
  const outcomeValid = outcome.length > 0;
  const isValid = personValid && dateValid && audienceValid && typeValid && outcomeValid;

  const occurredDate = occurredAt.length > 0 ? new Date(occurredAt) : null;
  const occurredInFuture = occurredDate !== null && occurredDate.getTime() > Date.now();

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isValid) return;
      if (audienceFit.length === 0 || conversationType.length === 0 || outcome.length === 0) {
        return;
      }
      const input: CreateConversationInput = {
        person_name: personName.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        audience_fit: asAudienceFit(audienceFit),
        conversation_type: asConversationType(conversationType),
        outcome: asConversationOutcome(outcome),
        summary: summary.length > 0 ? summary : undefined,
        verbatim_quotes:
          quotes.length > 0
            ? quotes.filter((q) => q.text.trim().length > 0).map((q) => ({ text: q.text.trim() }))
            : undefined,
      };
      status.mutate(input);
    },
    [
      isValid,
      personName,
      occurredAt,
      audienceFit,
      conversationType,
      outcome,
      summary,
      quotes,
      status,
    ],
  );

  const addQuote = useCallback(() => {
    setQuotes((prev) => [...prev, { id: rowKey(), text: '' }]);
  }, []);

  const updateQuote = useCallback((id: string, text: string) => {
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, text } : q)));
  }, []);

  const removeQuote = useCallback((id: string) => {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const errorBanner: ReactNode =
    status.error !== null ? <MutationErrorBanner error={status.error} /> : null;

  return (
    <MutationDialog
      title="Capture a conversation"
      isOpen={isOpen}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save"
      cancelLabel="Cancel"
      isSubmitting={status.isSubmitting}
      submitDisabled={!isValid}
      errorSlot={errorBanner}
    >
      <FormRow
        labelKey="person_name"
        htmlFor="capture-person-name"
        testId="capture-field-person-name"
      >
        <input
          id="capture-person-name"
          type="text"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          required
          data-testid="capture-input-person-name"
          style={inputStyle}
        />
      </FormRow>

      <FormRow
        labelKey="occurred_at"
        htmlFor="capture-occurred-at"
        testId="capture-field-occurred-at"
      >
        <input
          id="capture-occurred-at"
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          data-testid="capture-input-occurred-at"
          style={inputStyle}
        />
        {occurredInFuture ? (
          <p
            data-testid="capture-warning-future-occurred"
            style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#a06000' }}
          >
            That's in the future — are you sure?
          </p>
        ) : null}
      </FormRow>

      <FormRow
        labelKey="audience_fit"
        htmlFor="capture-audience-fit"
        testId="capture-field-audience-fit"
      >
        <select
          id="capture-audience-fit"
          value={audienceFit}
          onChange={(e) => setAudienceFit(e.target.value as AudienceFitValue | '')}
          required
          data-testid="capture-input-audience-fit"
          style={inputStyle}
        >
          <option value="">— pick one —</option>
          {ALLOWED_AUDIENCE_FIT.map((v) => (
            <option key={v} value={v}>
              {getEnumLabel('audience_fit', v)}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow
        labelKey="conversation_type"
        htmlFor="capture-conversation-type"
        testId="capture-field-conversation-type"
      >
        <select
          id="capture-conversation-type"
          value={conversationType}
          onChange={(e) => setConversationType(e.target.value as ConversationTypeValue | '')}
          required
          data-testid="capture-input-conversation-type"
          style={inputStyle}
        >
          <option value="">— pick one —</option>
          {ALLOWED_CONVERSATION_TYPE.map((v) => (
            <option key={v} value={v}>
              {getEnumLabel('conversation_type', v)}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow labelKey="outcome" htmlFor="capture-outcome" testId="capture-field-outcome">
        <select
          id="capture-outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as ConversationOutcomeValue | '')}
          required
          data-testid="capture-input-outcome"
          style={inputStyle}
        >
          <option value="">— pick one —</option>
          {ALLOWED_CONVERSATION_OUTCOME.map((v) => (
            <option key={v} value={v}>
              {getEnumLabel('outcome', v)}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow labelKey="summary" htmlFor="capture-summary" testId="capture-field-summary">
        <textarea
          id="capture-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          data-testid="capture-input-summary"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </FormRow>

      <div data-testid="capture-field-quotes" style={{ marginTop: '0.5rem' }}>
        <span style={labelStyle}>{getEnumLabel('field_label', 'verbatim_quotes')}</span>
        {quotes.length === 0 ? (
          <p
            data-testid="capture-quotes-empty"
            style={{ margin: '0.25rem 0', color: '#888', fontSize: '0.875rem' }}
          >
            No quotes added yet.
          </p>
        ) : (
          <ul
            data-testid="capture-quote-list"
            style={{
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            {quotes.map((q) => (
              <li
                key={q.id}
                data-testid="capture-quote-row"
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
              >
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => updateQuote(q.id, e.target.value)}
                  data-testid="capture-quote-input"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => removeQuote(q.id)}
                  data-testid="capture-quote-remove"
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '0.25rem',
                    backgroundColor: 'transparent',
                    color: '#555',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addQuote}
          data-testid="capture-quote-add"
          style={{
            marginTop: '0.375rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #ccc',
            borderRadius: '0.25rem',
            backgroundColor: 'transparent',
            color: '#444',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Add a quote
        </button>
      </div>
    </MutationDialog>
  );
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
