// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Root React component for ManthanOS web. Sprint 2 M1 C1.10 wires the
// full routing skeleton on top of C1.6's chrome (QueryClientProvider +
// BrowserRouter) and C1.7's API layer.
//
// Three components are exported:
//   - App         — production root (BrowserRouter + boundaries + routes)
//   - AppRoutes   — the route table alone (router-agnostic). Tests render
//                   this inside a MemoryRouter so paths can be controlled
//                   without a real browser.
//   - queryClient — exported so tests can inspect / reset cache state.
//
// The route table:
//   /                       Home (project picker)        ┐
//   /today                  Today                        │ all rendered
//   /validation             Validation                   │ inside <AppShell>
//   /conversations/:id      ConversationDetail           │ (nav + outlet)
//   /facts/:id              FactDetail                   │
//   /workspaces/:id         WorkspaceHome                ┘
//   *                       NotFound                       (no shell)
//
// Real page logic lands in M2+. M1 ships placeholders so the routing,
// navigation, and boundaries can be exercised end-to-end.

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

// Shared QueryClient. M2 may refine defaults per-query; the global
// defaults below are fine for the placeholder pages M1 ships.
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
        <Route path="/today" element={<Today />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/conversations/:id" element={<ConversationDetail />} />
        <Route path="/facts/:id" element={<FactDetail />} />
        <Route path="/workspaces/:id" element={<WorkspaceHome />} />
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
