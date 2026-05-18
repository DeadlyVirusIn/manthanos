// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Per-package vitest config.
// Windows CI runners are noticeably slower for tests that touch
// better-sqlite3's native bindings (~3-5× the linux/macos wall
// time). The default 5s vitest timeout is too tight; we set it to
// 30s so a slow runner doesn't fail-then-EBUSY on cleanup.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
