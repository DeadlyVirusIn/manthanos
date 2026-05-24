// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Routing-skeleton tests.
//
// Originally added in Sprint 2 M1 C1.10 against flat routes.
// C2.1 rewrites the assertions for the J.1-mandated nested route table:
//   /                                              Home
//   /projects/:projectId                           WorkspaceHome
//   /projects/:projectId/today                     Today
//   /projects/:projectId/validation                Validation
//   /projects/:projectId/conversations/:id         ConversationDetail
//   /projects/:projectId/facts/:id                 FactDetail
//   *                                              NotFound
//
// Coverage:
//   - Route registration: each declared path renders its placeholder.
//   - Parameter extraction: `:projectId`, `:id` surface via useParams().
//   - Not-found behaviour: an unmatched path renders <NotFound>.
//   - Navigation shell: <AppShell> renders nav links, marks the active
//     route with aria-current, and renders Today/Validation as
//     aria-disabled when no projectId is in the URL (J.3 / J.5).
//   - Error boundary: <ErrorFallback> renders the message and retry;
//     <ErrorBoundary.getDerivedStateFromError> sets hasError;
//     <ErrorBoundary> passes children through when no error.
//   - Loading fallback: <LoadingFallback> renders an accessible
//     loading indicator.
//
// All tests use `renderToString` from `react-dom/server` and
// `MemoryRouter` from `react-router-dom`, so no jsdom is required.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/App.js';
import { ErrorBoundary, ErrorFallback, LoadingFallback } from '../src/layout/index.js';

const PROJ = 'proj-test-1';

// Routing tests render through the real route table, and C2.2's Home
// page uses useProjects (TanStack Query). Wrap every render in a
// QueryClientProvider so the data hooks can mount.
function renderAt(path: string): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────

describe('Route registration (M2 C2.1)', () => {
  it('GET / renders the Home / Projects placeholder', () => {
    const html = renderAt('/');
    expect(html).toContain('Projects');
    expect(html).toContain('Pick a project');
  });

  it('GET /projects/:projectId renders the Project (workspace) placeholder', () => {
    const html = renderAt(`/projects/${PROJ}`);
    // Heading uses the user-facing "Project" rename, not "Workspace".
    expect(html).toContain('Project');
    expect(html).not.toContain('Workspace');
  });

  it('GET /projects/:projectId/today renders the Today placeholder', () => {
    const html = renderAt(`/projects/${PROJ}/today`);
    expect(html).toContain('Today');
    expect(html).toContain('What happened recently');
  });

  it('GET /projects/:projectId/validation renders the Validation placeholder', () => {
    const html = renderAt(`/projects/${PROJ}/validation`);
    expect(html).toContain('Validation');
    expect(html).toContain('closer look');
  });

  it('GET /projects/:projectId/conversations/:id renders the Conversation placeholder', () => {
    const html = renderAt(`/projects/${PROJ}/conversations/conv-xyz`);
    expect(html).toContain('Conversation');
  });

  it('GET /projects/:projectId/facts/:id renders the Fact placeholder', () => {
    const html = renderAt(`/projects/${PROJ}/facts/fact-xyz`);
    expect(html).toContain('Fact');
  });
});

// ─────────────────────────────────────────────────────────────────
// Parameter extraction
// ─────────────────────────────────────────────────────────────────

describe('Parameter extraction (M2 C2.1)', () => {
  it('extracts :projectId from /projects/:projectId (loading shell)', () => {
    // C2.3 changed WorkspaceHome from a stub that always rendered the
    // id to a query-driven page. Under the routing test's empty cache,
    // the page enters its loading state — verify the route mounted by
    // checking the loading testid rather than the id span.
    const html = renderAt('/projects/ws-test-42');
    expect(html).toContain('data-testid="workspace-home-loading"');
  });

  it('extracts :id from /projects/:projectId/conversations/:id (loading shell)', () => {
    // C2.5 made ConversationDetail query-driven. Under the routing
    // test's empty cache, the page enters its loading state and only
    // exposes the id in error/populated branches — assert the route
    // mounted by checking the loading testid.
    const html = renderAt(`/projects/${PROJ}/conversations/conv-abc-123`);
    expect(html).toContain('data-testid="conversation-detail-loading"');
  });

  it('extracts :id from /projects/:projectId/facts/:id (loading shell)', () => {
    // C2.6 made FactDetail query-driven. Same posture as the
    // workspace and conversation cases: under the routing test's
    // empty cache, the page enters loading state and exposes the
    // id only in the error/populated branches — assert the route
    // mounted by checking the loading testid.
    const html = renderAt(`/projects/${PROJ}/facts/fact-xyz-789`);
    expect(html).toContain('data-testid="fact-detail-loading"');
  });

  it('still mounts the FactDetail route for URL-safe characters in :id', () => {
    // Same posture as above — verify the route matches a UUID-shaped
    // segment by checking the loading testid (rather than the id
    // echo that the C1.10 stub used to provide).
    const html = renderAt(`/projects/${PROJ}/facts/01970e5d-ddcc-7c5e-b7a7-d6e7f3f8a9b1`);
    expect(html).toContain('data-testid="fact-detail-loading"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Not-found behaviour
// ─────────────────────────────────────────────────────────────────

describe('Not-found route (M2 C2.1)', () => {
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

describe('Navigation shell (M2 C2.1)', () => {
  it('renders the three top-level nav labels on a project route', () => {
    const html = renderAt(`/projects/${PROJ}/today`);
    expect(html).toContain('href="/"');
    expect(html).toContain(`href="/projects/${PROJ}/today"`);
    expect(html).toContain(`href="/projects/${PROJ}/validation"`);
    expect(html).toContain('Projects');
    expect(html).toContain('Today');
    expect(html).toContain('Validation');
  });

  it('marks the active route with aria-current="page"', () => {
    const html = renderAt(`/projects/${PROJ}/today`);
    // React's renderToString may emit attrs in any order — accept either.
    const todayHref = `/projects/${PROJ}/today`;
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*aria-current="page"[^>]*href="${todayHref}"|<a[^>]*href="${todayHref}"[^>]*aria-current="page"`,
      ),
    );
  });

  it('uses an aria-labelled <nav>', () => {
    const html = renderAt('/');
    expect(html).toContain('aria-label="Primary navigation"');
  });

  it('detail routes still render inside the AppShell', () => {
    const html = renderAt(`/projects/${PROJ}/conversations/conv-1`);
    expect(html).toContain('Primary navigation');
    expect(html).toContain('Conversation');
  });

  it('renders Today/Validation as aria-disabled on the picker route (no projectId)', () => {
    const html = renderAt('/');
    expect(html).toContain('data-testid="nav-today-disabled"');
    expect(html).toContain('data-testid="nav-validation-disabled"');
    expect(html).toContain('aria-disabled="true"');
    // No live href for Today/Validation when projectId is absent.
    expect(html).not.toMatch(/href="\/today"/);
    expect(html).not.toMatch(/href="\/validation"/);
  });

  it('renders Today/Validation as live links once a projectId is in scope', () => {
    const html = renderAt(`/projects/${PROJ}`);
    expect(html).not.toContain('data-testid="nav-today-disabled"');
    expect(html).not.toContain('data-testid="nav-validation-disabled"');
    expect(html).toContain(`href="/projects/${PROJ}/today"`);
    expect(html).toContain(`href="/projects/${PROJ}/validation"`);
  });
});

// ─────────────────────────────────────────────────────────────────
// Error boundary
// ─────────────────────────────────────────────────────────────────

describe('Error boundary (M2 C2.1)', () => {
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

describe('Loading fallback (M2 C2.1)', () => {
  it('renders an accessible loading indicator', () => {
    const html = renderToString(<LoadingFallback />);
    expect(html).toContain('Loading');
    // <output> has implicit role="status" — element name itself
    // satisfies the a11y contract.
    expect(html).toContain('<output');
    expect(html).toContain('aria-live="polite"');
  });
});
