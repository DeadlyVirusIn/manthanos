// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// MutationErrorBanner — Sprint 2 M2.5 C25.1.
//
// Typed error display for mutation flows. Distinct from
// PageErrorBanner (which is the read-only page-level inline error).
//
// Discriminates an `ApiError` envelope by `body.error` and routes the
// visible message through getEnumLabel('mutation_error', category,
// payload) — so all user-facing error text lives in labels.ts and
// flows through the same translation discipline as the read-only
// surfaces. Network and unknown errors fall through to their own
// labelled copy.
//
// Per F.2 (framework resolution): on a duplicate_fact envelope the
// banner renders the inline message PLUS an optional link (built by
// the consumer via `linkBuilder`) so the user can navigate to the
// existing fact without auto-redirecting away from their typed input.

import type { ReactNode } from 'react';

import { ApiError, type ApiErrorBody } from '../api/index.js';
import { type MutationErrorCategory, getEnumLabel } from '../i18n/labels.js';

export interface MutationErrorBannerLink {
  readonly href: string;
  readonly label: string;
}

export interface MutationErrorBannerProps {
  readonly error: Error | null;
  readonly linkBuilder?: (body: ApiErrorBody) => MutationErrorBannerLink | null;
  readonly onDismiss?: () => void;
  readonly LinkComponent?: (props: {
    readonly to: string;
    readonly children: ReactNode;
    readonly 'data-testid': string;
  }) => JSX.Element;
}

function categoriseError(err: Error): {
  category: MutationErrorCategory;
  payload: Record<string, unknown>;
  body: ApiErrorBody | null;
} {
  if (err instanceof ApiError && err.body !== null && err.body !== undefined) {
    const body = err.body;
    const known: ReadonlySet<string> = new Set([
      'validation',
      'not_found',
      'invalid_lifecycle',
      'duplicate_fact',
      'invalid_tier_transition',
    ]);
    if (typeof body.error === 'string' && known.has(body.error)) {
      return {
        category: body.error as MutationErrorCategory,
        payload: body as unknown as Record<string, unknown>,
        body,
      };
    }
    return { category: 'unknown', payload: body as unknown as Record<string, unknown>, body };
  }
  const msg = err.message.toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnrefused')
  ) {
    return { category: 'network', payload: { message: err.message }, body: null };
  }
  return { category: 'unknown', payload: { message: err.message }, body: null };
}

export function MutationErrorBanner(props: MutationErrorBannerProps): JSX.Element | null {
  const { error, linkBuilder, onDismiss, LinkComponent } = props;
  if (error === null) return null;

  const { category, payload, body } = categoriseError(error);
  const message = getEnumLabel('mutation_error', category, payload);

  const link = body !== null && linkBuilder !== undefined ? linkBuilder(body) : null;

  return (
    <div
      role="alert"
      data-testid="mutation-error-banner"
      style={{
        padding: '0.75rem 1rem',
        border: '1px solid #f5c2c7',
        backgroundColor: '#fff4f4',
        borderRadius: '0.375rem',
        color: '#842029',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}
    >
      <span
        data-testid="mutation-error-category"
        data-category={category}
        style={{ fontSize: '0.95rem' }}
      >
        {message}
      </span>
      {link !== null ? (
        LinkComponent !== undefined ? (
          <LinkComponent to={link.href} data-testid="mutation-error-link">
            {link.label}
          </LinkComponent>
        ) : (
          <a
            href={link.href}
            data-testid="mutation-error-link"
            style={{ color: '#0066cc', fontSize: '0.875rem' }}
          >
            {link.label}
          </a>
        )
      ) : null}
      {onDismiss !== undefined ? (
        <button
          type="button"
          onClick={onDismiss}
          data-testid="mutation-error-dismiss"
          style={{
            alignSelf: 'flex-start',
            padding: '0.25rem 0.5rem',
            fontSize: '0.875rem',
            borderRadius: '0.25rem',
            border: '1px solid #842029',
            backgroundColor: 'transparent',
            color: '#842029',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
