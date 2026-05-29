// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// SkipExtractionDialog — Sprint 2 M2.5 C25.4.
//
// Confirmation modal for the Conversation Detail "Mark as not useful"
// flow. Composes:
//   - MutationDialog (chrome)
//   - MutationErrorBanner (typed error display — already_skipped and
//     tombstoned land here as invalid_lifecycle with the corresponding
//     state, which the banner translates via lifecycle_state)
//   - useSkipExtraction (mutation + invalidation)
//
// Per F.3: dialog reset on open. The reason field is optional.

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import type { SkipExtractionInput, SkipExtractionResponse } from '../api/index.js';
import type { MutationStatus } from '../hooks/useMutationStatus.js';
import { useSkipExtraction } from '../hooks/useSkipExtraction.js';
import { MutationDialog } from './MutationDialog.js';
import { MutationErrorBanner } from './MutationErrorBanner.js';

export interface SkipExtractionDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly status?: MutationStatus<SkipExtractionInput, SkipExtractionResponse>;
}

export function SkipExtractionDialog(props: SkipExtractionDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId, conversationId } = props;
  const ownStatus = useSkipExtraction(workspaceId, conversationId);
  const status = (props.status ?? ownStatus) as MutationStatus<
    SkipExtractionInput,
    SkipExtractionResponse
  >;

  const [reason, setReason] = useState('');

  // F.3: reset on open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.reset is referentially stable via useCallback; effect intentionally fires on isOpen transition only (framework spec §1.4 / F.3).
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setReason('');
  }, [isOpen]);

  // Close on success.
  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = reason.trim();
      const input: SkipExtractionInput = trimmed.length > 0 ? { reason: trimmed } : {};
      status.mutate(input);
    },
    [reason, status],
  );

  const errorBanner: ReactNode =
    status.error !== null ? <MutationErrorBanner error={status.error} /> : null;

  return (
    <MutationDialog
      title="Mark this conversation as not useful?"
      isOpen={isOpen}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Mark as not useful"
      cancelLabel="Cancel"
      isSubmitting={status.isSubmitting}
      errorSlot={errorBanner}
    >
      <p
        data-testid="skip-extraction-explainer"
        style={{ margin: '0 0 0.75rem 0', color: '#444', fontSize: '0.95rem' }}
      >
        The conversation will stay, but no findings will be pulled from it. You can still capture
        another conversation later.
      </p>
      <div data-testid="skip-extraction-field-reason" style={{ marginBottom: '0.25rem' }}>
        <label
          htmlFor="skip-extraction-reason"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.25rem',
            color: '#333',
          }}
        >
          Anything worth noting? (optional)
        </label>
        <textarea
          id="skip-extraction-reason"
          data-testid="skip-extraction-input-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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
