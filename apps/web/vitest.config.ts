// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Vitest config for @manthanos/web. Sprint 2 M2.5 C25.1.
//
// Default test environment is `node` — every M2 SSR-renderToString
// test continues to run in node, unchanged.
//
// jsdom is opted-in *per file* via the docblock at the top of any test
// that needs DOM interaction:
//
//     // @vitest-environment jsdom
//     import ...
//
// The mutation-framework tests (MutationDialog, MutationSuccessMessage,
// useMutationStatus) and per-mutation tests (capture-conversation,
// extract-fact, etc.) use jsdom. The four primitive tests and every
// page render test stay on node.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    passWithNoTests: true,
    globals: false,
  },
});
