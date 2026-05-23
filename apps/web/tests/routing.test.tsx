// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Routing-skeleton tests — Sprint 2 M1 C1.10.
//
// Coverage:
//   - Route registration: each declared path renders its placeholder.
//   - Parameter extraction: `/conversations/:id`, `/facts/:id`,
//     `/workspaces/:id` surface the URL segment via useParams().
//   - Not-found behaviour: an unmatched path renders <NotFound>.
//   - Navigation shell: <AppShell> renders the primary-nav links and
//     marks the active route with aria-current.
//   - Error boundary: <ErrorFallback> renders the error message and a
//     retry control; <ErrorBoundary.getDerivedStateFromError> sets the
//     hasError flag; <ErrorBoundary> passes children through when no
//     error has occurred.
//   - Loading fallback: <LoadingFallback> renders an accessible
//     loading indicator.
//
// All tests use `renderToString` from `react-dom/server` and
// `MemoryRouter` from `react-router-dom`, so no jsdom is required.

import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/App.js';
import { ErrorBoundary, ErrorFallback, LoadingFallback } from '../src/layout/index.js';

function renderAt(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

// ─────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────

describe('Route registration (M1 C1.10)', () => {
  it('GET / renders the Home / Projects placeholder', () => {
    const html = renderAt('/');
    expect(html).toContain('Projects');
    expect(html).toContain('Pick a project');
  });

  it('GET /today renders the Today placeholder', () => {
    const html = renderAt('/today');
    expect(html).toContain('Today');
    expect(html).toContain('What happened recently');
  });

  it('GET /validation renders the Validation placeholder', () => {
    const html = renderAt('/validation');
    expect(html).toContain('Validation');
    expect(html).toContain('closer look');
  });

  it('GET /conversations/:id renders the Conversation placeholder', () => {
    const html = renderAt('/conversations/conv-xyz');
    expect(html).toContain('Conversation');
  });

  it('GET /facts/:id renders the Fact placeholder', () => {
    const html = renderAt('/facts/fact-xyz');
    expect(html).toContain('Fact');
  });

  it('GET /workspaces/:id renders the Project (workspace) placeholder', () => {
    const html = renderAt('/workspaces/ws-xyz');
    // Heading uses the user-facing "Project" rename, not "Workspace".
    expect(html).toContain('Project');
    expect(html).not.toContain('Workspace');
  });
});

// ─────────────────────────────────────────────────────────────────
// Parameter extraction
// ─────────────────────────────────────────────────────────────────

describe('Parameter extraction (M1 C1.10)', () => {
  it('extracts :id from /conversations/:id', () => {
    const html = renderAt('/conversations/conv-abc-123');
    expect(html).toContain('conv-abc-123');
    expect(html).toContain('data-testid="conv-id"');
  });

  it('extracts :id from /facts/:id', () => {
    const html = renderAt('/facts/fact-xyz-789');
    expect(html).toContain('fact-xyz-789');
    expect(html).toContain('data-testid="fact-id"');
  });

  it('extracts :id from /workspaces/:id', () => {
    const html = renderAt('/workspaces/ws-test-42');
    expect(html).toContain('ws-test-42');
    expect(html).toContain('data-testid="workspace-id"');
  });

  it('preserves URL-safe characters in :id', () => {
    const html = renderAt('/facts/01970e5d-ddcc-7c5e-b7a7-d6e7f3f8a9b1');
    expect(html).toContain('01970e5d-ddcc-7c5e-b7a7-d6e7f3f8a9b1');
  });
});

// ─────────────────────────────────────────────────────────────────
// Not-found behaviour
// ─────────────────────────────────────────────────────────────────

describe('Not-found route (M1 C1.10)', () => {
  it('an unmatched path renders the NotFound page', () => {
    const html = renderAt('/totally-unknown-path-that-does-not-exist');
    expect(html).toContain('Page not found');
  });

  it('NotFound renders OUTSIDE the AppShell (no nav links)', () => {
    const html = renderAt('/unknown');
    // The shell's nav would emit aria-label="Primary navigation".
    expect(html).not.toContain('Primary navigation');
  });

  it('NotFound offers a path back to /', () => {
    const html = renderAt('/unknown');
    expect(html).toContain('href="/"');
    expect(html).toContain('Back to projects');
  });
});

// ─────────────────────────────────────────────────────────────────
// Navigation shell
// ─────────────────────────────────────────────────────────────────

describe('Navigation shell (M1 C1.10)', () => {
  it('renders the three top-level nav links on /today', () => {
    const html = renderAt('/today');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/today"');
    expect(html).toContain('href="/validation"');
    expect(html).toContain('Projects');
    expect(html).toContain('Today');
    expect(html).toContain('Validation');
  });

  it('marks the active route with aria-current="page"', () => {
    const html = renderAt('/today');
    // React's renderToString may emit attrs in any order; check that
    // the link whose href is /today carries aria-current="page" (either
    // attribute may come first in the serialised <a> tag).
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/today"|<a[^>]*href="\/today"[^>]*aria-current="page"/,
    );
  });

  it('uses an aria-labelled <nav>', () => {
    const html = renderAt('/');
    expect(html).toContain('aria-label="Primary navigation"');
  });

  it('detail routes still render inside the AppShell', () => {
    const html = renderAt('/conversations/conv-1');
    expect(html).toContain('Primary navigation');
    expect(html).toContain('Conversation');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error boundary
// ─────────────────────────────────────────────────────────────────

describe('Error boundary (M1 C1.10)', () => {
  it('ErrorBoundary passes children through when no error has occurred', () => {
    const html = renderToString(
      <ErrorBoundary>
        <p>healthy child</p>
      </ErrorBoundary>,
    );
    expect(html).toContain('<p>healthy child</p>');
  });

  it('getDerivedStateFromError flips state to hasError', () => {
    const next = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    expect(next.hasError).toBe(true);
    expect(next.error).toBeInstanceOf(Error);
    expect(next.error?.message).toBe('boom');
  });

  it('ErrorFallback renders the error message and a retry control', () => {
    const html = renderToString(
      <ErrorFallback error={new Error('test-boom-message')} onRetry={() => undefined} />,
    );
    expect(html).toContain('Something went wrong');
    expect(html).toContain('test-boom-message');
    expect(html).toContain('Try again');
    expect(html).toContain('role="alert"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Loading fallback
// ─────────────────────────────────────────────────────────────────

describe('Loading fallback (M1 C1.10)', () => {
  it('renders an accessible loading indicator', () => {
    const html = renderToString(<LoadingFallback />);
    expect(html).toContain('Loading');
    // <output> has an implicit ARIA role of "status" — the element name
    // itself satisfies the a11y contract, so the rendered HTML contains
    // <output> rather than the literal role="status" attribute.
    expect(html).toContain('<output');
    expect(html).toContain('aria-live="polite"');
  });
});
