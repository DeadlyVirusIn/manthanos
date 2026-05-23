// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// App smoke test — Sprint 2 M1 C1.6.
//
// At C1.6 we don't yet have jsdom + @testing-library/react wired up
// (those land alongside the placeholder pages in C1.10 or M2 component
// work). This smoke test is the minimum needed to confirm the App
// module loads without throwing — covers syntax errors, broken imports,
// QueryClient construction failures, and BrowserRouter setup.

import { describe, expect, it } from 'vitest';

describe('App module smoke (M1 C1.6)', () => {
  it('imports without throwing and exports a callable React component', async () => {
    const mod = await import('../src/App.js');
    expect(typeof mod.App).toBe('function');
    // React components are functions whose name is conventionally TitleCase.
    expect(mod.App.name).toBe('App');
  });
});
