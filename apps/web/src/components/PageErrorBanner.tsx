// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// PageErrorBanner — Sprint 2 M2 C2.1.
//
// Inline error banner used by page-level data hooks. Distinct from the
// top-level ErrorBoundary's ErrorFallback (which replaces the whole
// page) — this keeps the page chrome and nav, and shows a recoverable
// "we couldn't load X" with a retry control.
//
// Pages call it like:
//   if (query.isError) return <PageErrorBanner error={query.error} onRetry={() => query.refetch()} />;
//
// Uses role="alert" so screen readers announce the error immediately
// on appearance.

export interface PageErrorBannerProps {
  readonly error: Error;
  readonly onRetry?: () => void;
  // Default headline: "Something went wrong".
  readonly headline?: string;
  // Default retry button label: "Try again".
  readonly retryLabel?: string;
}

export function PageErrorBanner({
  error,
  onRetry,
  headline = 'Something went wrong',
  retryLabel = 'Try again',
}: PageErrorBannerProps): JSX.Element {
  return (
    <div
      role="alert"
      data-testid="page-error-banner"
      style={{
        padding: '1rem',
        border: '1px solid #f5c2c7',
        backgroundColor: '#fff4f4',
        borderRadius: '0.5rem',
        color: '#842029',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <strong>{headline}</strong>
      <p data-testid="page-error-banner-message" style={{ margin: 0 }}>
        {error.message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="page-error-banner-retry"
          style={{
            alignSelf: 'flex-start',
            padding: '0.375rem 0.75rem',
            borderRadius: '0.25rem',
            border: '1px solid #842029',
            backgroundColor: 'transparent',
            color: '#842029',
            cursor: 'pointer',
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
