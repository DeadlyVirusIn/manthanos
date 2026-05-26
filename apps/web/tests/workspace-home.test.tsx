// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the WorkspaceHome (project home) page. Sprint 2 M2 C2.3.
//
// Uses the same cache-seeding pattern as the C2.2 picker tests:
//   - loading:   no seed → useQuery starts in pending
//   - populated: setQueryData(workspacesKeys.detail(id), workspace)
//   - empty:     setQueryData with audit_chain_seq_high === 0
//   - error:     direct setState on the cache entry with
//                retryOnMount: false to dodge v5's optimistic-pending
//                override (see home-picker.test.tsx for the detailed
//                trace of why this matters under SSR).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type WorkspaceStatus,
  type WorkspaceView,
  asWorkspaceStatus,
  workspacesKeys,
} from '../src/api/index.js';
import { WorkspaceHome } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c23-test';
const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const TWO_DAYS_AGO = '2026-05-21T12:00:00Z';

function makeWorkspace(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    id: PROJECT_ID,
    name: 'Discovery for indie founders',
    root_path: '/var/data/manthanos/proj-c23',
    status: asWorkspaceStatus('active'),
    status_changed_at: TEN_MIN_AGO,
    status_reason: null,
    stage_at_open: null,
    portfolio_mode_enabled: 0,
    discovery_archive_ref: null,
    schema_version: 1,
    audit_chain_seq_high: 7,
    created_at: TWO_DAYS_AGO,
    ...overrides,
  };
}

function makeClient(): QueryClient {
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

function render(client: QueryClient, projectId: string = PROJECT_ID): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
        <Routes>
          <Route path="/projects/:projectId" element={<WorkspaceHome />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — loading state', () => {
  it('renders skeletons for the header and the four summary cards', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="workspace-home-loading"');
    expect(html).toContain('data-testid="summary-card-today-loading"');
    expect(html).toContain('data-testid="summary-card-validation-loading"');
    expect(html).toContain('data-testid="summary-card-conversations-loading"');
    expect(html).toContain('data-testid="summary-card-facts-loading"');
  });

  it('does not render populated content while loading', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).not.toContain('data-testid="workspace-home-populated"');
    expect(html).not.toContain('data-testid="workspace-home-error"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — error state', () => {
  function seedError(client: QueryClient, error: Error): void {
    const now = Date.now();
    const q = client.getQueryCache().build(client, {
      queryKey: workspacesKeys.detail(PROJECT_ID),
      queryFn: () => Promise.reject(error),
    });
    q.setState({
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

  it('renders the PageErrorBanner with the headline and retry control', () => {
    const client = makeClient();
    seedError(client, new Error('daemon-unreachable'));
    const html = render(client);
    expect(html).toContain('data-testid="workspace-home-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load this project');
    expect(html).toContain('daemon-unreachable');
    expect(html).toContain('Try again');
  });

  it('still surfaces the project id while the lookup is errored', () => {
    const client = makeClient();
    seedError(client, new Error('boom'));
    const html = render(client);
    expect(html).toContain('data-testid="workspace-id"');
    expect(html).toContain(PROJECT_ID);
  });

  it('does not render summary cards when the load failed', () => {
    const client = makeClient();
    seedError(client, new Error('boom'));
    const html = render(client);
    expect(html).not.toContain('data-testid="summary-cards"');
    expect(html).not.toContain('data-testid="summary-card-today"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — populated state', () => {
  it('renders the project name with relative timestamps', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ name: 'My founder project' }),
    );
    const html = render(client);
    expect(html).toContain('data-testid="workspace-home-populated"');
    expect(html).toContain('My founder project');
    expect(html).toContain('data-testid="workspace-home-created"');
    expect(html).toContain('Created ');
    expect(html).toContain('data-testid="workspace-home-updated"');
    expect(html).toContain('Status changed ');
  });

  it('falls back to "Untitled project" when name is null', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace({ name: null }));
    const html = render(client);
    expect(html).toContain('Untitled project');
  });

  it('renders all four summary cards with the correct routing posture', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    // Two are live links to nested routes.
    expect(html).toContain(`href="/projects/${PROJECT_ID}/today"`);
    expect(html).toContain(`href="/projects/${PROJECT_ID}/validation"`);
    expect(html).toContain('data-testid="summary-card-today"');
    expect(html).toContain('data-testid="summary-card-validation"');
    // Two are visible-but-disabled (no list pages in M2).
    expect(html).toContain('data-testid="summary-card-conversations"');
    expect(html).toContain('data-testid="summary-card-facts"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Empty / no-data project
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — empty project', () => {
  it('flags the project as empty when audit_chain_seq_high is 0', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ audit_chain_seq_high: 0 }),
    );
    const html = render(client);
    expect(html).toContain('data-testid="workspace-home-empty"');
    expect(html).toContain('data-testid="workspace-home-empty-copy"');
    expect(html.toLowerCase()).toContain('no activity yet');
  });

  it('still renders the four summary cards in the empty state', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ audit_chain_seq_high: 0 }),
    );
    const html = render(client);
    expect(html).toContain('data-testid="summary-cards"');
    expect(html).toContain('data-testid="summary-card-today"');
    expect(html).toContain('data-testid="summary-card-conversations"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Status label translation (M2 invariant)
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — status label translation', () => {
  it.each<[WorkspaceStatus, string]>([
    [asWorkspaceStatus('active'), 'Active'],
    [asWorkspaceStatus('paused'), 'Paused'],
    [asWorkspaceStatus('killed'), 'Archived'],
  ])('renders the translated label for status %o', (status, label) => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace({ status }));
    const html = render(client);
    expect(html).toContain(label);
    // The raw substrate value must never reach the DOM as visible text.
    expect(html).not.toMatch(new RegExp(`>${String(status)}<`));
  });

  it('never renders the substrate word "killed" anywhere', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ status: asWorkspaceStatus('killed') }),
    );
    const html = render(client);
    expect(html).not.toContain('killed');
    expect(html).not.toContain('Killed');
  });
});

// ─────────────────────────────────────────────────────────────────
// Disabled action cards (J.3 / J.5 principle)
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — disabled action cards', () => {
  it('marks conversations and facts cards as aria-disabled', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).toMatch(
      /<div[^>]*aria-disabled="true"[^>]*data-testid="summary-card-conversations"/,
    );
    expect(html).toMatch(/<div[^>]*aria-disabled="true"[^>]*data-testid="summary-card-facts"/);
  });

  it('does not render anchors for the disabled cards', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).not.toMatch(/<a[^>]*data-testid="summary-card-conversations"/);
    expect(html).not.toMatch(/<a[^>]*data-testid="summary-card-facts"/);
  });

  it('explains the disabled state in helper text', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).toContain('coming soon');
  });
});

// ─────────────────────────────────────────────────────────────────
// Nested navigation links (where allowed)
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — allowed navigation links', () => {
  // React's renderToString emits attributes in component-source order,
  // which puts data-testid before href in the serialised <a>. The
  // regex must accept either ordering.
  function anchorWithTestidAndHref(testid: string, href: string): RegExp {
    return new RegExp(
      `<a[^>]*data-testid="${testid}"[^>]*href="${href.replace(/\//g, '\\/')}"` +
        `|<a[^>]*href="${href.replace(/\//g, '\\/')}"[^>]*data-testid="${testid}"`,
    );
  }

  it('links Today to /projects/:projectId/today', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).toMatch(
      anchorWithTestidAndHref('summary-card-today', `/projects/${PROJECT_ID}/today`),
    );
  });

  it('links Validation to /projects/:projectId/validation', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).toMatch(
      anchorWithTestidAndHref('summary-card-validation', `/projects/${PROJECT_ID}/validation`),
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw substrate vocabulary
// ─────────────────────────────────────────────────────────────────

// Extract the substrings of the rendered HTML that are visible as
// text (between `>` and `<`), excluding attribute payloads. data-testid
// values intentionally use the substrate vocabulary ("workspace-home-*")
// for code clarity, but those are debug attributes — not user-visible.
function visibleText(html: string): string {
  return Array.from(html.matchAll(/>([^<]+)</g))
    .map((m) => m[1])
    .join('\n');
}

describe('WorkspaceHome — no raw substrate vocabulary', () => {
  it('does not render the word "Workspace" anywhere in visible text', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace({ name: 'Project A' }));
    const visible = visibleText(render(client));
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toContain('workspace');
  });

  it('does not render any raw tier letter on the project home', () => {
    const client = makeClient();
    client.setQueryData(workspacesKeys.detail(PROJECT_ID), makeWorkspace());
    const html = render(client);
    expect(html).not.toMatch(/>T-2</);
    expect(html).not.toMatch(/>T-1</);
    expect(html).not.toMatch(/>T0</);
    expect(html).not.toMatch(/>T\+1</);
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw ISO timestamps
// ─────────────────────────────────────────────────────────────────

describe('WorkspaceHome — no raw ISO timestamps', () => {
  it('never renders the created_at ISO directly', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ created_at: TWO_DAYS_AGO, status_changed_at: TEN_MIN_AGO }),
    );
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toContain('2026-05-23T11:50:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('omits Created / Status-changed lines when the timestamps are missing', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ created_at: '', status_changed_at: null }),
    );
    const html = render(client);
    expect(html).not.toContain('data-testid="workspace-home-created"');
    expect(html).not.toContain('data-testid="workspace-home-updated"');
  });

  it('renders relative-time phrases for known timestamps', () => {
    const client = makeClient();
    client.setQueryData(
      workspacesKeys.detail(PROJECT_ID),
      makeWorkspace({ created_at: TWO_DAYS_AGO, status_changed_at: TEN_MIN_AGO }),
    );
    const html = render(client);
    // React's renderToString inserts <!-- --> between adjacent text and
    // expression children, so "Created " and "{createdAgo}" serialise
    // as "Created <!-- -->2 days ago". The regex tolerates that.
    const sep = '(?:<!-- -->)?';
    const phrase = '(?:just now|\\d+ (?:second|minute|hour|day|week|month|year)s? ago)';
    expect(html).toMatch(new RegExp(`Created ${sep}${phrase}`));
    expect(html).toMatch(new RegExp(`Status changed ${sep}${phrase}`));
  });
});

// Sanity check that the test file references NOW_ISO somewhere (kept
// for future use without an unused-var lint complaint).
void NOW_ISO;
