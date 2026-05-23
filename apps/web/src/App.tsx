// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Root React component for ManthanOS web.
//
// Sprint 2 M2 C2.1 migrates the route table from M1's flat paths to the
// nested project-scoped shape mandated by the roadmap (J.1 resolution).
//
// Three components are exported:
//   - App         — production root (BrowserRouter + boundaries + routes)
//   - AppRoutes   — the route table alone (router-agnostic). Tests render
//                   this inside a MemoryRouter so paths can be controlled
//                   without a real browser.
//   - queryClient — exported so tests can inspect / reset cache state.
//
// The nested route table:
//   /                                              Home (project picker)
//   /projects/:projectId                           WorkspaceHome
//   /projects/:projectId/today                     Today
//   /projects/:projectId/validation                Validation
//   /projects/:projectId/conversations/:id         ConversationDetail
//   /projects/:projectId/facts/:id                 FactDetail
//   *                                              NotFound (no shell)
//
// Every route except the catch-all renders inside <AppShell>, which
// derives its nav targets from useParams() — see AppShell.tsx for the
// disabled-when-no-projectId behaviour required by J.3 / J.5.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell, ErrorBoundary, LoadingFallback } from './layout/index.js';
import {
  ConversationDetail,
  FactDetail,
  Home,
  NotFound,
  Today,
  Validation,
  WorkspaceHome,
} from './pages/index.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** The route table, router-agnostic. Render inside whatever Router the
 *  caller chooses (BrowserRouter in prod, MemoryRouter in tests). */
export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/projects/:projectId" element={<WorkspaceHome />} />
        <Route path="/projects/:projectId/today" element={<Today />} />
        <Route path="/projects/:projectId/validation" element={<Validation />} />
        <Route path="/projects/:projectId/conversations/:id" element={<ConversationDetail />} />
        <Route path="/projects/:projectId/facts/:id" element={<FactDetail />} />
      </Route>
      {/* NotFound renders outside the shell — no nav, no chrome. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
