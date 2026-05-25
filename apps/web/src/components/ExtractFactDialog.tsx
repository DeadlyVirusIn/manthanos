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
  // Sprint 3B.6: when the dialog opens to APPROVE a suggested candidate,
  // the host seeds these so the human reviews/edits a pre-filled draft
  // rather than re-typing. Omitted (→ empty) for the blank "Pull a fact"
  // flow. Read once on open; the human stays in full control of the
  // final submitted values (the only write path is still this audited,
  // human-approved extract mutation).
  readonly initialArea?: string;
  readonly initialStatement?: string;
  readonly initialQuoteId?: string;
  // 3B.6.5: pass-through extraction metadata from an approved candidate.
  // These are NOT editable form fields — they ride alongside the human's
  // edited area/statement into the audited extract so provenance can
  // persist the candidate's score/reasons/version. Absent for the blank
  // "Pull a fact" flow.
  readonly extractionConfidence?: number;
  readonly extractorVersion?: string;
  readonly reasonFlags?: readonly string[];
  // Exposed for tests + the host page to read the success message.
  readonly status?: MutationStatus<ExtractFactInput, ExtractFactResponse>;
}

export function ExtractFactDialog(props: ExtractFactDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId, conversationId, quotes } = props;
  const { initialArea = '', initialStatement = '', initialQuoteId = '' } = props;
  const ownStatus = useExtractFact(workspaceId, conversationId);
  const status = (props.status ?? ownStatus) as MutationStatus<
    ExtractFactInput,
    ExtractFactResponse
  >;

  const [area, setArea] = useState('');
  const [statement, setStatement] = useState('');
  const [tier, setTier] = useState<FactTierValue | ''>('');
  const [quoteId, setQuoteId] = useState('');
  // 3B.6.5 (a11y F-05): tracks whether a submit has been attempted, so the
  // validation messages can appear on submit as well as on input.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // F.3: clear prior error / success when dialog opens, then seed the
  // form. For the blank flow the initial* props default to '' (a fresh
  // empty form); for candidate approval the host passes the candidate's
  // area / statement / quote so the human edits a draft. Tier is always
  // left to the human — extraction confidence is a different axis from
  // fact trust and must not auto-pick a trust level.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.reset is referentially stable via useCallback; the initial* values are read intentionally at open-time only, so the effect fires on the isOpen transition (see SPRINT2_M2.5_MUTATION_FRAMEWORK.md §1.4 / F.3).
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setArea(initialArea);
    setStatement(initialStatement);
    setTier('');
    setQuoteId(initialQuoteId);
    setSubmitAttempted(false);
  }, [isOpen]);

  // Close the dialog once the mutation succeeds.
  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const areaValid = area.trim().length > 0;
  const statementValid = statement.trim().length > 0;
  const isValid = areaValid && statementValid;

  // 3B.6.5 (a11y F-05): surface WHY submit is blocked. An error shows once
  // the user has typed into a field (catches whitespace-only input) or has
  // attempted to submit. Submit itself still hard-blocks on !isValid.
  const showAreaError = (submitAttempted || area.length > 0) && !areaValid;
  const showStatementError = (submitAttempted || statement.length > 0) && !statementValid;

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitAttempted(true);
      if (!isValid) return;
      const input: ExtractFactInput = {
        area: area.trim(),
        statement: statement.trim(),
        ...(tier.length > 0 ? { tier: asFactTier(tier) } : {}),
        ...(quoteId.length > 0 ? { quote_id: quoteId } : {}),
        // 3B.6.5: pass-through candidate metadata (only when approving a
        // suggestion). Persisted into provenance by the audited mutation.
        ...(props.extractionConfidence !== undefined
          ? { extraction_confidence: props.extractionConfidence }
          : {}),
        ...(props.extractorVersion !== undefined && props.extractorVersion.length > 0
          ? { extractor_version: props.extractorVersion }
          : {}),
        ...(props.reasonFlags !== undefined ? { reason_flags: props.reasonFlags } : {}),
      };
      status.mutate(input);
    },
    [
      isValid,
      area,
      statement,
      tier,
      quoteId,
      status,
      props.extractionConfidence,
      props.extractorVersion,
      props.reasonFlags,
    ],
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
          aria-invalid={showAreaError}
          aria-describedby={showAreaError ? 'extract-area-error' : undefined}
          data-testid="extract-input-area"
          style={inputStyle}
        />
        {showAreaError ? (
          <FieldError id="extract-area-error" testId="extract-area-error">
            Add a short topic — it can’t be blank or only spaces.
          </FieldError>
        ) : null}
      </FormRow>

      <FormRow labelKey="statement" htmlFor="extract-statement" testId="extract-field-statement">
        <textarea
          id="extract-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={3}
          required
          aria-invalid={showStatementError}
          aria-describedby={showStatementError ? 'extract-statement-error' : undefined}
          data-testid="extract-input-statement"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        {showStatementError ? (
          <FieldError id="extract-statement-error" testId="extract-statement-error">
            Write the fact — it can’t be blank or only spaces.
          </FieldError>
        ) : null}
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

interface FieldErrorProps {
  readonly id: string;
  readonly testId: string;
  readonly children: ReactNode;
}

/** Inline validation message. role="alert" so assistive tech announces it
 *  when it appears; linked to its input via aria-describedby (3B.6.5 F-05). */
function FieldError({ id, testId, children }: FieldErrorProps): JSX.Element {
  return (
    <p
      id={id}
      role="alert"
      data-testid={testId}
      style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#a33' }}
    >
      {children}
    </p>
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
