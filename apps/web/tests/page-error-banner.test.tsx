// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the PageErrorBanner component. Sprint 2 M2 C2.1.
//
// The banner is an inline recoverable-error UI distinct from the
// boundary's full-page ErrorFallback. SSR-only so no jsdom is needed.

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageErrorBanner } from '../src/components/index.js';

describe('PageErrorBanner — default render', () => {
  it('renders role="alert" and the default headline', () => {
    const html = renderToString(<PageErrorBanner error={new Error('boom')} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('data-testid="page-error-banner"');
  });

  it('renders the error message verbatim', () => {
    const html = renderToString(<PageErrorBanner error={new Error('specific-failure-text')} />);
    expect(html).toContain('specific-failure-text');
    expect(html).toContain('data-testid="page-error-banner-message"');
  });

  it('omits the retry button when no onRetry is provided', () => {
    const html = renderToString(<PageErrorBanner error={new Error('boom')} />);
    expect(html).not.toContain('data-testid="page-error-banner-retry"');
  });
});

describe('PageErrorBanner — retry control', () => {
  it('renders a retry button when onRetry is provided', () => {
    const html = renderToString(
      <PageErrorBanner error={new Error('boom')} onRetry={() => undefined} />,
    );
    expect(html).toContain('data-testid="page-error-banner-retry"');
    expect(html).toContain('Try again');
  });

  it('honours a custom retryLabel', () => {
    const html = renderToString(
      <PageErrorBanner
        error={new Error('boom')}
        onRetry={() => undefined}
        retryLabel="Retry now"
      />,
    );
    expect(html).toContain('Retry now');
  });
});

describe('PageErrorBanner — custom headline', () => {
  it('honours a custom headline', () => {
    const html = renderToString(
      <PageErrorBanner error={new Error('boom')} headline="Could not load project" />,
    );
    expect(html).toContain('Could not load project');
  });
});
