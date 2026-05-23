// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Project Picker (Home). Sprint 2 M2 C2.2.
//
// All four states are exercised by seeding the QueryClient cache
// before SSR-rendering the page. SSR avoids the need for jsdom.
//
// Cache-seeding strategy:
//   - loading:   no seed; useProjects starts in pending/fetching
//   - empty:     setQueryData(workspacesKeys.list(), [])
//   - populated: setQueryData(workspacesKeys.list(), [WorkspaceView])
//   - error:     build a query entry and setState({status:'error', ...})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type WorkspaceStatus,
  type WorkspaceView,
  asWorkspaceStatus,
  workspacesKeys,
} from '../src/api/index.js';
import { Home } from '../src/pages/index.js';

const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const ONE_DAY_AGO = '2026-05-22T12:00:00Z';

function makeProject(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    id: 'proj-1',
    name: 'Discovery for indie founders',
    root_path: '/var/data/manthanos/proj-1',
    status: asWorkspaceStatus('active'),
    status_changed_at: TEN_MIN_AGO,
    status_reason: null,
    stage_at_open: null,
    portfolio_mode_enabled: 0,
    discovery_archive_ref: null,
    schema_version: 1,
    audit_chain_seq_high: 0,
    created_at: NOW_ISO,
    ...overrides,
  };
}

function makeClient(): QueryClient {
  // v5's shouldLoadOnMount triggers an optimistic refetch when a query
  // has data===undefined, which resets status to 'pending' inside the
  // observer's optimistic result. The escape hatch is retryOnMount:
  // false combined with a cached error — together they short-circuit
  // shouldLoadOnMount so the error state is reported synchronously.
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function render(client: QueryClient): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────

describe('Home — loading state', () => {
  it('renders the loading skeleton when the query is pending', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="home-loading"');
    expect(html.split('data-testid="card-skeleton"').length - 1).toBe(3);
  });

  it('keeps the Projects heading visible during loading', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('Projects');
  });
});

// ─────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────

describe('Home — empty state', () => {
  it('renders the empty-state copy when no projects exist', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), []);
    const html = render(client);
    expect(html).toContain('data-testid="home-empty"');
    expect(html).toContain('You do not have any projects yet.');
  });

  it('does not render a Create Project button in the empty state', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), []);
    const html = render(client);
    expect(html).not.toMatch(/<button[^>]*>[^<]*Create/i);
    expect(html).not.toContain('Start a new project');
  });

  it('points users to the seed command rather than a UI flow', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), []);
    const html = render(client);
    expect(html).toContain('seed command');
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state
// ─────────────────────────────────────────────────────────────────

describe('Home — populated state', () => {
  it('renders one card per project', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [
      makeProject({ id: 'proj-1', name: 'First project' }),
      makeProject({ id: 'proj-2', name: 'Second project' }),
      makeProject({ id: 'proj-3', name: 'Third project' }),
    ]);
    const html = render(client);
    expect(html).toContain('data-testid="home-populated"');
    expect(html.split('data-testid="project-card"').length - 1).toBe(3);
  });

  it('renders each card with a nested-route Today link', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [
      makeProject({ id: 'proj-alpha' }),
      makeProject({ id: 'proj-beta' }),
    ]);
    const html = render(client);
    expect(html).toContain('href="/projects/proj-alpha/today"');
    expect(html).toContain('href="/projects/proj-beta/today"');
  });

  it('renders the project name (falls back to "Untitled project" when null)', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [
      makeProject({ id: 'proj-named', name: 'Named project' }),
      makeProject({ id: 'proj-anon', name: null }),
    ]);
    const html = render(client);
    expect(html).toContain('Named project');
    expect(html).toContain('Untitled project');
  });

  it('renders a translated status label, never the raw substrate value', () => {
    const client = makeClient();
    const statuses: WorkspaceStatus[] = [
      asWorkspaceStatus('active'),
      asWorkspaceStatus('paused'),
      asWorkspaceStatus('killed'),
    ];
    client.setQueryData(
      workspacesKeys.list(),
      statuses.map((status, idx) => makeProject({ id: `proj-${idx}`, status, name: `P${idx}` })),
    );
    const html = render(client);
    // Translated labels from labels.ts.
    expect(html).toContain('Active');
    expect(html).toContain('Paused');
    expect(html).toContain('Archived');
    // No raw substrate vocabulary in the visible-text positions.
    expect(html).not.toMatch(/>killed</);
    expect(html).not.toMatch(/>paused</);
    expect(html).not.toMatch(/>active</);
  });

  it('renders a relative-time "last activity" line, never a raw ISO', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [
      makeProject({
        id: 'proj-1',
        name: 'Project with activity',
        status_changed_at: ONE_DAY_AGO,
      }),
    ]);
    const html = render(client);
    expect(html).toContain('Last activity');
    expect(html).not.toMatch(/2026-05-2\d/);
    expect(html).not.toContain('T11:50:00Z');
    expect(html).not.toContain('T12:00:00Z');
  });

  it('omits the last-activity line entirely when no timestamp is available', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [
      makeProject({
        id: 'proj-untouched',
        name: 'Untouched project',
        status_changed_at: null,
        created_at: '',
      }),
    ]);
    const html = render(client);
    expect(html).not.toContain('Last activity');
    expect(html).not.toContain('data-testid="project-card-touched"');
  });

  it('uses the "Project" rename — does not surface "Workspace" anywhere', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.list(), [makeProject({ id: 'proj-1', name: 'My project' })]);
    const html = render(client);
    expect(html).not.toContain('Workspace');
    expect(html).not.toContain('workspace');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────

describe('Home — error state', () => {
  // Why this seeding pattern: TanStack Query v5's createResult()
  // overrides `status` to 'pending' inside the observer's optimistic
  // result when shouldFetchOptionally() is true AND dataUpdatedAt is 0,
  // regardless of the cached state. To make useQuery synchronously
  // report status='error' on SSR mount, the cache entry must look
  // "fresh" (non-zero dataUpdatedAt, isInvalidated: false) so the
  // optimistic-pending override does not kick in. We manually write
  // the full QueryState rather than relying on prefetchQuery, which
  // leaves dataUpdatedAt at 0 and isInvalidated true after a rejection.
  function seedError(client: QueryClient, error: Error): void {
    const now = Date.now();
    const query = client.getQueryCache().build(client, {
      queryKey: workspacesKeys.list(),
      queryFn: () => Promise.reject(error),
    });
    query.setState({
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: now,
      error,
      errorUpdateCount: 1,
      errorUpdatedAt: now,
      fetchFailureCount: 1,
      fetchFailureReason: error,
      fetchMeta: null,
      isInvalidated: false,
      status: 'error',
      fetchStatus: 'idle',
    });
  }

  it('renders the PageErrorBanner with the error message and retry control', () => {
    const client = makeClient();
    seedError(client, new Error('daemon-unreachable'));
    const html = render(client);
    expect(html).toContain('data-testid="home-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load your projects');
    expect(html).toContain('daemon-unreachable');
    expect(html).toContain('data-testid="page-error-banner-retry"');
    expect(html).toContain('Try again');
  });

  it('keeps the Projects heading visible when the query errors', () => {
    const client = makeClient();
    seedError(client, new Error('boom'));
    const html = render(client);
    expect(html).toContain('Projects');
  });

  it('does not render the project list in the error state', () => {
    const client = makeClient();
    seedError(client, new Error('boom'));
    const html = render(client);
    expect(html).not.toContain('data-testid="project-list"');
    expect(html).not.toContain('data-testid="project-card"');
  });
});
