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

  it('renders friendly recovery copy, never the raw error message', () => {
    const html = renderToString(<PageErrorBanner error={new Error('specific-failure-text')} />);
    expect(html).toContain('data-testid="page-error-banner-message"');
    expect(html).toContain('Try again. If it keeps happening, save a feedback report.');
    // The raw error message must never reach the DOM.
    expect(html).not.toContain('specific-failure-text');
  });

  it('does not leak internal paths, ports, stack frames, or IDs', () => {
    const leaky = new Error(
      'ECONNREFUSED 127.0.0.1:7717 at /home/kunal/manthanos/apps/api/src/server.ts:42 conv_01HXYZ',
    );
    const html = renderToString(<PageErrorBanner error={leaky} />);
    expect(html).not.toContain('127.0.0.1');
    expect(html).not.toContain('7717');
    expect(html).not.toContain('/home/kunal');
    expect(html).not.toContain('server.ts');
    expect(html).not.toContain('conv_01HXYZ');
    expect(html).not.toContain('ECONNREFUSED');
  });

  it('honours a caller-supplied friendly message', () => {
    const html = renderToString(
      <PageErrorBanner error={new Error('boom')} message="We could not load this yet." />,
    );
    expect(html).toContain('We could not load this yet.');
    expect(html).not.toContain('boom');
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
