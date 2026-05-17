// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import type { TerminalOps } from './types.js';

export const terminalOps: TerminalOps = {
  width(): number {
    return process.stdout.columns ?? 80;
  },
  height(): number {
    return process.stdout.rows ?? 24;
  },
  isInteractive(): boolean {
    return Boolean(process.stdout.isTTY);
  },
};
