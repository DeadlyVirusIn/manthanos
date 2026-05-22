// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Per-package vitest config. Bumped timeouts because boot/shutdown
// tests bind a real loopback socket and Windows CI runners are
// slower for that path.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
