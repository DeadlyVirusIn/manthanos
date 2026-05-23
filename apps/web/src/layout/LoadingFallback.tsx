// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Suspense loading fallback. Sprint 2 M1 C1.10.
//
// Rendered by the top-level <Suspense> boundary while any lazy chunk or
// pending data dependency is still resolving. M1 has no lazy routes
// yet, so this is rarely seen in dev — it exists so M2+ can introduce
// route-level code-splitting without changing App.tsx.

export function LoadingFallback(): JSX.Element {
  return (
    <output
      aria-live="polite"
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#666',
        display: 'block',
      }}
    >
      <p>Loading…</p>
    </output>
  );
}
