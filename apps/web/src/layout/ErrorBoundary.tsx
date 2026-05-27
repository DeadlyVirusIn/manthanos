// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// App-wide error boundary. Sprint 2 M1 C1.10.
//
// React's error boundary contract requires a class component (no hook
// equivalent exists at the time of writing). The boundary catches any
// render-time error in its children and renders the fallback instead.
//
// Two responsibilities:
//   1. Stop the React tree from unmounting on a render error.
//   2. Show the user a non-substrate-jargon recovery affordance.
//
// The fallback is intentionally minimal at M1 — M2+ can replace it with
// a richer recovery page once we know the failure shapes that matter.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Optional override; defaults to <ErrorFallback />. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    if (hasError && error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return <ErrorFallback error={error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

export interface ErrorFallbackProps {
  readonly error: Error;
  readonly onRetry: () => void;
}

export function ErrorFallback({ onRetry }: ErrorFallbackProps): JSX.Element {
  // The raw error is logged to the console by componentDidCatch. We never
  // render error.message here: it can carry stack frames, file paths,
  // ports, or IDs that confuse a novice and leak internals.
  return (
    <div role="alert" style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 500 }}>Something went wrong.</h2>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        Try again. If it keeps happening, save a feedback report.
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#0066cc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
