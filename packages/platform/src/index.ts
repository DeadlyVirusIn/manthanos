// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// PAL-v0 — the only OS seam for ManthanOS.
// Per PLATFORM_LAYER.md §2b, this module exposes:
//   PlatformInfo, PathOps, ProcessOps (spawn + which), FsOps,
//   TerminalOps, SignalOps, LockOps.
// Deferred (PAL-full): watchers, runInShell, named pipes, ACL helpers,
// sandbox primitives.

import { fsOps } from './fs.js';
import { createPlatformInfo } from './info.js';
import { lockOps } from './lock.js';
import { pathOps } from './path.js';
import { processOps } from './process.js';
import { signalOps } from './signals.js';
import { terminalOps } from './terminal.js';
import type { Platform } from './types.js';

export type {
  Arch,
  FsOps,
  LockInfo,
  LockOps,
  OsName,
  PathOps,
  Platform,
  PlatformInfo,
  ProcessOps,
  SignalOps,
  SpawnOptions,
  SpawnResult,
  TerminalOps,
} from './types.js';

export {
  acquireWorkspaceLock,
  DEFAULTS as WORKSPACE_LOCK_DEFAULTS,
  inspectWorkspaceLock,
  LOCK_FILE_NAME,
  LOCK_FILE_VERSION,
  MANTHAN_DIR_NAME,
  withWorkspaceLock,
  WorkspaceLockedError,
  workspaceLockPath,
} from './workspace-lock.js';
export type {
  WorkspaceLockActor,
  WorkspaceLockFailureReason,
  WorkspaceLockHandle,
  WorkspaceLockInfo,
  WorkspaceLockOptions,
} from './workspace-lock.js';

let cached: Platform | undefined;

export function getPlatform(): Platform {
  if (!cached) {
    cached = Object.freeze<Platform>({
      info: createPlatformInfo(),
      path: pathOps,
      process: processOps,
      fs: fsOps,
      terminal: terminalOps,
      signals: signalOps,
      lock: lockOps,
    });
  }
  return cached;
}
