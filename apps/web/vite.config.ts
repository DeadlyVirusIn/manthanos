// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Vite config for @manthanos/web.
//
// API base URL discovery (Sprint 2 M1 C1.6 decision):
//   - Dev: a proxy at /api → MANTHANOS_API_URL (default 127.0.0.1:7373)
//     so the browser's fetch('/api/v1/...') reaches the daemon without
//     CORS gymnastics.
//   - Build: callers read `import.meta.env.VITE_API_BASE_URL` at
//     runtime. Defaults to "" (relative paths — relies on the
//     reverse proxy / dev proxy / serving topology).

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEFAULT_API_TARGET = 'http://127.0.0.1:7373';
const apiTarget = process.env.MANTHANOS_API_URL ?? DEFAULT_API_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 7374,
    strictPort: true,
    proxy: {
      // Dev-only: forward /api/* to the daemon. Build artifacts use
      // VITE_API_BASE_URL at runtime instead.
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // Keep the path intact (we want /api/v1/... on both sides).
        rewrite: (p) => p,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
