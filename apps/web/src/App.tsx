// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Root React component for ManthanOS web. Sprint 2 M1 C1.6 wires:
//   - <QueryClientProvider>  for Tanstack Query (data fetching, M1 C1.7)
//   - <BrowserRouter>        for client-side routing (real routes land in M1 C1.10)
//
// At C1.6 there are no routes wired yet — the router shell renders a
// placeholder. M1 C1.10 adds the 5 placeholder routes (Today,
// Validation, Conversation, Fact, Workspace Home) + Project Picker.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Shared QueryClient instance. M1 C1.7 (API client layer) will refine
// defaults (stale time, cache time, retry policy). At C1.6 defaults are
// fine — no live queries fire yet.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry aggressively in dev; failures should surface quickly.
      retry: 1,
      // Local daemon is fast; aggressive refetch isn't useful.
      refetchOnWindowFocus: false,
    },
  },
});

/** Placeholder page rendered until M1 C1.10 wires the real route table. */
function M1Placeholder(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '36rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>ManthanOS</h1>
      <p style={{ color: '#666', marginTop: '1rem' }}>
        Sprint 2 M1 — frontend foundation. Pages land starting in M2.
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        ManthanOS is running on your computer. No login needed.
      </p>
    </main>
  );
}

export function App(): JSX.Element {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Real route table lands in M1 C1.10. For now, every path
                resolves to the M1 placeholder so the dev server has
                something to render. */}
            <Route path="*" element={<M1Placeholder />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
