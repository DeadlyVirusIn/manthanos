// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// MutationDialog — Sprint 2 M2.5 C25.1.
//
// Modal chrome shared by every M2.5 mutation form. Renders as
// <div role="dialog" aria-modal="true"> (not the native <dialog>
// element — jsdom's showModal support is incomplete and we want one
// rendering path that works identically under SSR, jsdom, and real
// browsers).
//
// Per F.1 (framework resolution): rendered via ReactDOM.createPortal
// to document.body so the dialog escapes any ancestor stacking
// context. Under SSR (where document is absent) the dialog renders
// nothing; mutation forms are client-only.
//
// The component owns the chrome: backdrop, focus management, ESC and
// backdrop-click dismissal, submit/cancel buttons. It does NOT own
// the field tree (children), the network call, the success message,
// or the error display.

import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

export interface MutationDialogProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly submitLabel?: string;
  readonly cancelLabel?: string;
  readonly isSubmitting?: boolean;
  readonly submitDisabled?: boolean;
  readonly destructive?: boolean;
  readonly errorSlot?: ReactNode;
  readonly children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MutationDialog(props: MutationDialogProps): JSX.Element | null {
  const {
    title,
    isOpen,
    onCancel,
    onSubmit,
    submitLabel = 'Save',
    cancelLabel = 'Cancel',
    isSubmitting = false,
    submitDisabled = false,
    destructive = false,
    errorSlot = null,
    children,
  } = props;

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Store the element that had focus before the dialog opened so we
  // can return focus to it on close.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const root = dialogRef.current;
    if (root === null) return;
    const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const firstFocusable = focusables.item(0);
    if (firstFocusable !== null) firstFocusable.focus();
    return () => {
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [isOpen]);

  // ESC dismissal mounted on document so it fires regardless of focus.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  const handleFocusTrap = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (root === null) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const submitButtonStyle = destructive
    ? {
        padding: '0.5rem 1rem',
        borderRadius: '0.375rem',
        border: '1px solid #842029',
        backgroundColor: '#842029',
        color: 'white',
        cursor: submitDisabled || isSubmitting ? 'not-allowed' : 'pointer',
        opacity: submitDisabled || isSubmitting ? 0.6 : 1,
      }
    : {
        padding: '0.5rem 1rem',
        borderRadius: '0.375rem',
        border: '1px solid #0066cc',
        backgroundColor: '#0066cc',
        color: 'white',
        cursor: submitDisabled || isSubmitting ? 'not-allowed' : 'pointer',
        opacity: submitDisabled || isSubmitting ? 0.6 : 1,
      };

  return createPortal(
    <div
      data-testid="mutation-dialog-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleFocusTrap}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4rem 1rem',
        zIndex: 1000,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        ref={dialogRef}
        // biome-ignore lint/a11y/useSemanticElements: jsdom's native <dialog> showModal() is incomplete; M2.5 framework uses role="dialog" on a div so SSR + jsdom + browsers share one rendering path (framework spec §1.1)
        role="dialog"
        aria-modal="true"
        aria-labelledby="mutation-dialog-title"
        data-testid="mutation-dialog"
        data-destructive={destructive ? 'true' : 'false'}
        style={{
          width: '100%',
          maxWidth: '32rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '1.25rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
      >
        <h2
          id="mutation-dialog-title"
          data-testid="mutation-dialog-title"
          style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}
        >
          {title}
        </h2>
        {errorSlot !== null ? (
          <div data-testid="mutation-dialog-error-slot" style={{ marginTop: '0.75rem' }}>
            {errorSlot}
          </div>
        ) : null}
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div data-testid="mutation-dialog-fields">{children}</div>
          <div
            style={{
              marginTop: '1.25rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              data-testid="mutation-dialog-cancel"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #ccc',
                backgroundColor: 'transparent',
                color: '#444',
                cursor: 'pointer',
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={submitDisabled || isSubmitting}
              data-testid="mutation-dialog-submit"
              style={submitButtonStyle}
            >
              {isSubmitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
