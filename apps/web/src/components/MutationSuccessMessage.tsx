// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// MutationSuccessMessage — Sprint 2 M2.5 C25.1.
//
// Transient inline confirmation banner. Renders at the top of the
// page section that hosted the mutation. Auto-dismisses after a
// configurable duration (default 3000 ms). No global toast system
// (per J.3 resolution).
//
// A11y: <output> element (implicit role="status") with
// aria-live="polite" so screen readers announce the change without
// stealing focus. Consistent with the LoadingFallback chrome.
//
// Timer ownership: the hook (useMutationStatus) is the source of
// truth for *whether* there's a message; this component is the source
// of truth for *how long* it stays. Pages clear via
// status.dismissSuccess().

import { useEffect } from 'react';

export interface MutationSuccessMessageProps {
  readonly message: string | null;
  readonly onDismiss: () => void;
  readonly durationMs?: number;
  readonly testId?: string;
}

export function MutationSuccessMessage({
  message,
  onDismiss,
  durationMs = 3000,
  testId = 'mutation-success-message',
}: MutationSuccessMessageProps): JSX.Element | null {
  useEffect(() => {
    if (message === null) return;
    const handle = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(handle);
  }, [message, durationMs, onDismiss]);

  if (message === null) return null;

  return (
    <output
      aria-live="polite"
      data-testid={testId}
      style={{
        display: 'block',
        marginTop: '0.5rem',
        marginBottom: '0.5rem',
        padding: '0.5rem 0.75rem',
        border: '1px solid #bcd9bd',
        backgroundColor: '#eef7ef',
        borderRadius: '0.375rem',
        color: '#1f4d1f',
        fontSize: '0.95rem',
      }}
    >
      <span data-testid={`${testId}-text`}>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        data-testid={`${testId}-dismiss`}
        style={{
          marginLeft: '0.5rem',
          padding: '0 0.25rem',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#1f4d1f',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </output>
  );
}
