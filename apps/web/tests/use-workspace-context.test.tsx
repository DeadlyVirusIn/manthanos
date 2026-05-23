// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the useWorkspaceContext hook. Sprint 2 M2 C2.1.
//
// The hook extracts :projectId from useParams() and wires a workspace
// query keyed on that id. These tests exercise:
//   - projectId is undefined on a route with no :projectId segment;
//     the query is disabled (fetchStatus === 'idle');
//   - projectId is populated under /projects/:projectId/...; the
//     query is enabled.
//
// We render a tiny probe component that surfaces the hook's state as
// DOM attributes, then assert on renderToString output.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useWorkspaceContext } from '../src/hooks/index.js';

function Probe(): JSX.Element {
  const { projectId, query } = useWorkspaceContext();
  return (
    <div
      data-testid="probe"
      data-project-id={projectId ?? ''}
      data-status={query.status}
      data-fetch-status={query.fetchStatus}
    />
  );
}

function harness(path: string): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Probe />} />
          <Route path="/projects/:projectId" element={<Probe />} />
          <Route path="/projects/:projectId/today" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('useWorkspaceContext — no projectId in URL', () => {
  it('returns projectId === undefined on `/`', () => {
    const html = harness('/');
    expect(html).toContain('data-project-id=""');
  });

  it('leaves the query disabled (status=pending, fetchStatus=idle) on `/`', () => {
    const html = harness('/');
    // TanStack Query v5: enabled=false → status starts as 'pending'
    // with fetchStatus 'idle' (no in-flight request).
    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-fetch-status="idle"');
  });
});

describe('useWorkspaceContext — projectId present', () => {
  it('extracts projectId from /projects/:projectId', () => {
    const html = harness('/projects/proj-abc-123');
    expect(html).toContain('data-project-id="proj-abc-123"');
  });

  it('extracts projectId from deeper /projects/:projectId/today', () => {
    const html = harness('/projects/proj-deep/today');
    expect(html).toContain('data-project-id="proj-deep"');
  });

  it('enables the query when projectId is present (fetchStatus=fetching)', () => {
    const html = harness('/projects/proj-active');
    // With enabled=true and no fetch resolved yet, fetchStatus is
    // 'fetching' at the synchronous render boundary.
    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-fetch-status="fetching"');
  });
});
