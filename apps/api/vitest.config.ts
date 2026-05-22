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
    // The concurrency test uses child_process.fork() to spawn worker
    // subprocesses. Vitest's default 'threads' pool runs tests in
    // worker_threads, which inherit some IPC quirks that intermittently
    // truncate child.send/message events under concurrent fork() use.
    // Running tests under the 'forks' pool (each test file in a separate
    // child_process) gives the workers a clean IPC parent and resolves it.
    pool: 'forks',
  },
});
