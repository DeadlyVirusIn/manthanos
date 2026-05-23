// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Skeleton primitives — Sprint 2 M2 C2.1.
//
// Three building blocks for per-element loading state. The top-level
// <Suspense> fallback (LoadingFallback) remains the page-spanning
// "loading…" indicator; these primitives are the in-place placeholders
// that keep the page chrome stable while individual sections fetch.
//
// All three render with role="status" + aria-busy="true" so screen
// readers announce them as live regions.

export interface LineSkeletonProps {
  readonly width?: string;
  readonly height?: string;
  readonly ariaLabel?: string;
}

// Single horizontal bar — stand-in for one line of text. Width is a
// CSS length (default "100%") so callers can taper successive lines.
export function LineSkeleton({
  width = '100%',
  height = '0.75rem',
  ariaLabel = 'Loading',
}: LineSkeletonProps): JSX.Element {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      data-testid="line-skeleton"
      style={{
        display: 'inline-block',
        width,
        height,
        backgroundColor: '#eee',
        borderRadius: '0.25rem',
        verticalAlign: 'middle',
      }}
    />
  );
}

export interface TextSkeletonProps {
  readonly lines?: number;
  readonly ariaLabel?: string;
}

// Paragraph stand-in: N stacked LineSkeletons, last line shorter for
// visual rhythm. Default lines = 3.
//
// Uses <output> (implicit role="status") instead of <div role="status">
// for a11y compliance with the useSemanticElements rule. Stable
// per-row keys avoid the noArrayIndexKey warning without suppressions.
export function TextSkeleton({
  lines = 3,
  ariaLabel = 'Loading text',
}: TextSkeletonProps): JSX.Element {
  const count = Math.max(1, lines);
  return (
    <output
      aria-label={ariaLabel}
      aria-busy="true"
      data-testid="text-skeleton"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      {Array.from({ length: count }).map((_, idx) => {
        const stableKey = `text-skeleton-line-${idx}-of-${count}`;
        return <LineSkeleton key={stableKey} width={idx === count - 1 ? '60%' : '100%'} />;
      })}
    </output>
  );
}

export interface CardSkeletonProps {
  readonly ariaLabel?: string;
}

// Card stand-in: rectangular tile with two interior lines. Used as the
// loading state for the conversation / fact / project cards rendered
// in later C2.x commits. Uses <output> for the same a11y reason as
// TextSkeleton above.
export function CardSkeleton({ ariaLabel = 'Loading card' }: CardSkeletonProps): JSX.Element {
  return (
    <output
      aria-label={ariaLabel}
      aria-busy="true"
      data-testid="card-skeleton"
      style={{
        padding: '1rem',
        border: '1px solid #eee',
        borderRadius: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <LineSkeleton width="40%" />
      <LineSkeleton width="80%" />
    </output>
  );
}
