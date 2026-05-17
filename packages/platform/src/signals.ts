// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import type { SignalOps } from './types.js';

export const signalOps: SignalOps = {
  onTermination(handler: () => void): () => void {
    let fired = false;
    const wrapped = () => {
      if (fired) return;
      fired = true;
      try {
        handler();
      } catch {
        // intentionally swallow — the user handler should not crash shutdown
      }
    };
    // POSIX
    process.on('SIGINT', wrapped);
    process.on('SIGTERM', wrapped);
    // Windows equivalent for Ctrl-Break / console close.
    process.on('SIGBREAK', wrapped);
    // Returns an unsubscribe function.
    return () => {
      process.off('SIGINT', wrapped);
      process.off('SIGTERM', wrapped);
      process.off('SIGBREAK', wrapped);
    };
  },
};
