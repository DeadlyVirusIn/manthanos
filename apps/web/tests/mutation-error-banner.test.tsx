// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for MutationErrorBanner. Sprint 2 M2.5 C25.1.
//
// SSR-only — no DOM interaction needed. The banner is a pure
// render of an Error/ApiError discriminator → translated copy.

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ApiError, asFactTier } from '../src/api/index.js';
import { MutationErrorBanner } from '../src/components/index.js';

function apiError(status: number, body: Record<string, unknown>): ApiError {
  return new ApiError(status, `${status}`, '/api/v1/test', body);
}

describe('MutationErrorBanner — empty / null', () => {
  it('renders nothing when error is null', () => {
    const html = renderToString(<MutationErrorBanner error={null} />);
    expect(html).toBe('');
  });
});

describe('MutationErrorBanner — typed envelopes', () => {
  it('categorises validation and renders the details string', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(400, {
          error: 'validation',
          field: 'statement',
          details: 'Statement is required.',
        })}
      />,
    );
    expect(html).toContain('data-testid="mutation-error-banner"');
    expect(html).toContain('data-category="validation"');
    expect(html).toContain('Statement is required.');
  });

  it('categorises not_found with translated copy', () => {
    const html = renderToString(
      <MutationErrorBanner error={apiError(404, { error: 'not_found' })} />,
    );
    expect(html).toContain('data-category="not_found"');
    expect(html).toContain('This is no longer here.');
  });

  it('categorises invalid_lifecycle and translates the state via lifecycle_state', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(409, {
          error: 'invalid_lifecycle',
          state: 'tombstoned',
          fact_id: 'f-1',
          details: 'Cannot promote a tombstoned fact.',
        })}
      />,
    );
    expect(html).toContain('data-category="invalid_lifecycle"');
    // 'tombstoned' → 'Erased' from LIFECYCLE_STATE_LABELS
    expect(html).toContain('erased');
    expect(html).not.toMatch(/\btombstoned\b/);
  });

  it('categorises duplicate_fact', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(409, {
          error: 'duplicate_fact',
          existing_fact_id: 'f-existing',
          details: 'duplicate',
        })}
      />,
    );
    expect(html).toContain('data-category="duplicate_fact"');
    expect(html).toContain('We already have this.');
  });

  it('categorises invalid_tier_transition with translated tier labels', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(409, {
          error: 'invalid_tier_transition',
          from: asFactTier('T+1'),
          to: 'beyond-the-top',
          direction: 'promote',
          details: 'cannot promote past T+1',
        })}
      />,
    );
    expect(html).toContain('data-category="invalid_tier_transition"');
    // T+1 translates via FACT_TIER_LABELS — the raw letter should
    // never appear in visible text.
    expect(html).not.toMatch(/>T\+1</);
  });
});

describe('MutationErrorBanner — link slot', () => {
  it('renders a link built by linkBuilder when provided', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(409, {
          error: 'duplicate_fact',
          existing_fact_id: 'f-existing-id',
          details: 'duplicate',
        })}
        linkBuilder={(body) => {
          if (body.error !== 'duplicate_fact') return null;
          const existing = (body as { existing_fact_id?: unknown }).existing_fact_id;
          if (typeof existing !== 'string') return null;
          return { href: `/projects/proj-1/facts/${existing}`, label: 'Open the existing fact' };
        }}
      />,
    );
    expect(html).toContain('data-testid="mutation-error-link"');
    expect(html).toContain('href="/projects/proj-1/facts/f-existing-id"');
    expect(html).toContain('Open the existing fact');
  });

  it('omits the link when linkBuilder returns null', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(409, { error: 'duplicate_fact', existing_fact_id: 'f', details: 'd' })}
        linkBuilder={() => null}
      />,
    );
    expect(html).not.toContain('data-testid="mutation-error-link"');
  });
});

describe('MutationErrorBanner — network and unknown', () => {
  it('categorises a generic Error with network-shaped message as network', () => {
    const html = renderToString(<MutationErrorBanner error={new Error('Failed to fetch')} />);
    expect(html).toContain('data-category="network"');
    // React's renderToString HTML-encodes apostrophes ('→&#x27;), so
    // assert a substring without the apostrophe.
    expect(html).toContain('reach ManthanOS');
  });

  it('falls back to unknown for plain Errors', () => {
    const html = renderToString(<MutationErrorBanner error={new Error('boom')} />);
    expect(html).toContain('data-category="unknown"');
    expect(html).toContain('Something unexpected happened.');
  });

  it('falls back to unknown for unrecognised ApiError envelope codes', () => {
    const html = renderToString(
      <MutationErrorBanner error={apiError(500, { error: 'something_else_entirely' })} />,
    );
    expect(html).toContain('data-category="unknown"');
  });
});

describe('MutationErrorBanner — dismiss button', () => {
  it('renders a dismiss button when onDismiss is provided', () => {
    const html = renderToString(
      <MutationErrorBanner
        error={apiError(404, { error: 'not_found' })}
        onDismiss={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="mutation-error-dismiss"');
  });

  it('omits the dismiss button when onDismiss is not provided', () => {
    const html = renderToString(
      <MutationErrorBanner error={apiError(404, { error: 'not_found' })} />,
    );
    expect(html).not.toContain('data-testid="mutation-error-dismiss"');
  });
});
