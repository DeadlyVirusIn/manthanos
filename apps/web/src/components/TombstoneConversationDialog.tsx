// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// TombstoneConversationDialog — Sprint 2 M2.5 C25.5.
//
// Two-gate confirmation modal for the Conversation Detail "Erase this
// conversation" flow. Composes:
//   - MutationDialog (chrome)
//   - MutationErrorBanner (typed error display — already-erased and
//     not-found land here with translated copy)
//   - useTombstoneConversation (mutation + invalidation)
//
// Per F.3: dialog reset on open. The reason is required and the
// acknowledgement checkbox must be ticked before the submit button
// becomes enabled — the two gates that distinguish this from skip.

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import type { TombstoneConversationInput, TombstoneConversationResponse } from '../api/index.js';
import type { MutationStatus } from '../hooks/useMutationStatus.js';
import { useTombstoneConversation } from '../hooks/useTombstoneConversation.js';
import { MutationDialog } from './MutationDialog.js';
import { MutationErrorBanner } from './MutationErrorBanner.js';

export interface TombstoneConversationDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly status?: MutationStatus<TombstoneConversationInput, TombstoneConversationResponse>;
}

const ACK_COPY = 'I understand this cannot be undone';

export function TombstoneConversationDialog(props: TombstoneConversationDialogProps): JSX.Element {
  const { isOpen, onClose, workspaceId, conversationId } = props;
  const ownStatus = useTombstoneConversation(workspaceId, conversationId);
  const status = (props.status ?? ownStatus) as MutationStatus<
    TombstoneConversationInput,
    TombstoneConversationResponse
  >;

  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  // F.3: reset on open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status.reset is referentially stable via useCallback; effect intentionally fires on isOpen transition only (framework spec §1.4 / F.3).
  useEffect(() => {
    if (!isOpen) return;
    status.reset();
    setReason('');
    setAcknowledged(false);
  }, [isOpen]);

  useEffect(() => {
    if (status.isSuccess) onClose();
  }, [status.isSuccess, onClose]);

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && acknowledged;

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      status.mutate({ reason: trimmedReason });
    },
    [canSubmit, status, trimmedReason],
  );

  const errorBanner: ReactNode =
    status.error !== null ? <MutationErrorBanner error={status.error} /> : null;

  return (
    <MutationDialog
      title="Erase this conversation?"
      isOpen={isOpen}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel="Erase this conversation"
      cancelLabel="Cancel"
      isSubmitting={status.isSubmitting}
      submitDisabled={!canSubmit}
      errorSlot={errorBanner}
    >
      <p
        data-testid="tombstone-conversation-explainer"
        style={{ margin: '0 0 0.75rem 0', color: '#444', fontSize: '0.95rem' }}
      >
        Erasing removes this conversation and the quotes it contained. Any captured insights that
        drew only from this conversation will be flagged. This cannot be undone.
      </p>
      <div data-testid="tombstone-conversation-field-reason" style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="tombstone-conversation-reason"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.25rem',
            color: '#333',
          }}
        >
          Why are you erasing it?
        </label>
        <textarea
          id="tombstone-conversation-reason"
          data-testid="tombstone-conversation-input-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
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
      <div
        data-testid="tombstone-conversation-field-ack"
        style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}
      >
        <input
          type="checkbox"
          id="tombstone-conversation-ack"
          data-testid="tombstone-conversation-input-ack"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ marginTop: '0.2rem' }}
        />
        <label
          htmlFor="tombstone-conversation-ack"
          style={{ fontSize: '0.9rem', color: '#333', cursor: 'pointer' }}
        >
          {ACK_COPY}
        </label>
      </div>
    </MutationDialog>
  );
}
