// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ReviseFactDialog — Sprint 2 M2.5 C25.6.
//
// Modal for the Fact Detail "Make a new version" flow. Composes:
//   - MutationDialog (chrome)
//   - MutationErrorBanner (typed error display)
//   - useReviseFact (mutation + invalidation)
//
// Pre-fills `area` and `statement` from the current head fact. Submit
// stays disabled until at least one of those fields actually differs
// from the initial value (trimmed) AND both fields are non-empty.
// The optional `note` field captures the reviser's rationale.
//
// On success calls `onSuccess(newFactId)` so the page can navigate
// to the new head version.

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import type { ReviseFactInput, ReviseFactResponse } from '../api/index.js';
import type { MutationStatus } from '../hooks/useMutationStatus.js';
import { useReviseFact } from '../hooks/useReviseFact.js';
import { MutationDialog } from './MutationDialog.js';
import { MutationErrorBanner } from './MutationErrorBanner.js';

export interface ReviseFactDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  readonly factId: string;
  readonly initialArea: string;
  readonly initialStatement: string;
  readonly onSuccess?: (newFactId: string) => void;
  readonly status?: MutationStatus<ReviseFactInput, ReviseFactResponse>;
}

export function ReviseFactDialog(props: ReviseFactDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId, factId, initialArea, initialStatement, onSuccess } = props;
  const ownStatus = useReviseFact(workspaceId, factId);
  const status = (props.status ?? ownStatus) as MutationStatus<ReviseFactInput, ReviseFactResponse>;

  const [area, setArea] = useState(initialArea);
  const [statement, setStatement] = useState(initialStatement);
  const [note, setNote] = useState('');

  // F.3: reset on open — re-prime fields from the latest initial
  // values in case the fact was edited elsewhere between mounts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — initial values sampled on the isOpen transition only (framework spec §1.4 / F.3).
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setArea(initialArea);
    setStatement(initialStatement);
    setNote('');
  }, [isOpen]);

  // Close on success. Navigation is fired from handleSubmit via
  // mutateAsync so we have the response in hand at the call site;
  // MutationStatus does not expose `data` by design.
  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const trimmedArea = area.trim();
  const trimmedStatement = statement.trim();
  const trimmedNote = note.trim();
  const areaChanged = trimmedArea !== initialArea.trim();
  const statementChanged = trimmedStatement !== initialStatement.trim();
  const areaPresent = trimmedArea.length > 0;
  const statementPresent = trimmedStatement.length > 0;
  const canSubmit = (areaChanged || statementChanged) && areaPresent && statementPresent;

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      const input: ReviseFactInput = {};
      if (areaChanged) (input as { area?: string }).area = trimmedArea;
      if (statementChanged) (input as { statement?: string }).statement = trimmedStatement;
      if (trimmedNote.length > 0) (input as { note?: string }).note = trimmedNote;
      void (async () => {
        try {
          const result = await status.mutateAsync(input);
          onSuccess?.(result.fact.id);
        } catch {
          // Error already flows into status.error and renders via banner.
        }
      })();
    },
    [
      areaChanged,
      canSubmit,
      onSuccess,
      statementChanged,
      status,
      trimmedArea,
      trimmedNote,
      trimmedStatement,
    ],
  );

  const errorBanner: ReactNode =
    status.error !== null ? <MutationErrorBanner error={status.error} /> : null;

  return (
    <MutationDialog
      title="Make a new version of this finding?"
      isOpen={isOpen}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Make a new version"
      cancelLabel="Cancel"
      isSubmitting={status.isSubmitting}
      submitDisabled={!canSubmit}
      errorSlot={errorBanner}
    >
      <p
        data-testid="revise-fact-explainer"
        style={{ margin: '0 0 0.75rem 0', color: '#444', fontSize: '0.95rem' }}
      >
        The previous version stays in the history as an older version. Edit the topic or the
        statement to save a new version.
      </p>
      <div data-testid="revise-fact-field-area" style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="revise-fact-area"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.25rem',
            color: '#333',
          }}
        >
          Topic
        </label>
        <input
          type="text"
          id="revise-fact-area"
          data-testid="revise-fact-input-area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '0.4rem 0.5rem',
            borderRadius: '0.25rem',
            border: '1px solid #ccc',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div data-testid="revise-fact-field-statement" style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="revise-fact-statement"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.25rem',
            color: '#333',
          }}
        >
          Statement
        </label>
        <textarea
          id="revise-fact-statement"
          data-testid="revise-fact-input-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={4}
          required
          style={{
            width: '100%',
            padding: '0.4rem 0.5rem',
            borderRadius: '0.25rem',
            border: '1px solid #ccc',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>
      <div data-testid="revise-fact-field-note" style={{ marginBottom: '0.25rem' }}>
        <label
          htmlFor="revise-fact-note"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.25rem',
            color: '#333',
          }}
        >
          Why are you updating it? (optional)
        </label>
        <textarea
          id="revise-fact-note"
          data-testid="revise-fact-input-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{
            width: '100%',
            padding: '0.4rem 0.5rem',
            borderRadius: '0.25rem',
            border: '1px solid #ccc',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>
    </MutationDialog>
  );
}
