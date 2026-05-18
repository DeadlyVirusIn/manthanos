// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Per-package vitest config.
// Tests in this package exercise audit-chain writes through
// better-sqlite3 + JSONL fsync; Windows CI runners can hit 10+ s on
// the larger compound tests. Default 5s timeout is too tight there.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
