// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace lock — high-level single-writer guarantee for a workspace
// directory. Builds on the low-level `lockOps` primitive in lock.ts.
//
// Used by:
//   - apps/api daemon (long-lived; holds the lock for its lifetime)
//   - apps/cli (short-lived; acquires-and-releases per command)
//   - future workers (same contract as CLI)
//
// Mechanism: PID + heartbeat. The lock file lives at
// <workspace_root>/.manthan/.lock. Owners refresh `heartbeat_at`
// every N seconds; acquirers consider a lock stale if (a) the
// recorded PID is no longer running on this host, OR (b) the
// heartbeat is older than the staleness threshold.
//
// Out of scope (per Audit Engine §0): adversarial lock theft.
// A malicious local process can still clobber the lock file.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

export const LOCK_FILE_VERSION = 1;
export const LOCK_FILE_NAME = '.lock';
export const MANTHAN_DIR_NAME = '.manthan';

export const DEFAULTS = {
  acquisitionTimeoutMs: 0,
  heartbeatIntervalMs: 5_000,
  staleThresholdMs: 30_000,
  retryIntervalMs: 100,
} as const;

export type WorkspaceLockActor = 'daemon' | 'cli' | 'worker' | 'test';

export interface WorkspaceLockInfo {
  readonly lock_version: number;
  /** Crypto-random per-acquisition ownership token. Used for release-time identity. */
  readonly owner_id: string;
  readonly pid: number;
  readonly hostname: string;
  readonly started_at: string;
  readonly heartbeat_at: string;
  readonly actor: WorkspaceLockActor;
}

export interface WorkspaceLockOptions {
  /** Actor identity recorded in the lock file. */
  readonly actor?: WorkspaceLockActor;
  /** How long to retry before throwing. 0 = single attempt. */
  readonly acquisitionTimeoutMs?: number;
  /** How often to refresh heartbeat_at. 0 = disabled (tests). */
  readonly heartbeatIntervalMs?: number;
  /** A peer is stale when its heartbeat_at is older than this. */
  readonly staleThresholdMs?: number;
  /** Backoff between acquisition retries. */
  readonly retryIntervalMs?: number;
  /** Inject a clock (for tests). */
  readonly now?: () => number;
}

export interface WorkspaceLockHandle {
  readonly info: WorkspaceLockInfo;
  readonly lockPath: string;
  release(): Promise<void>;
  /** Force a heartbeat write (test affordance). */
  refresh(): Promise<void>;
  /** True once release() has been called. */
  readonly released: boolean;
}

export type WorkspaceLockFailureReason = 'live_peer' | 'malformed_lock';

export class WorkspaceLockedError extends Error {
  readonly reason: WorkspaceLockFailureReason;
  readonly peerInfo: WorkspaceLockInfo | null;
  readonly lockPath: string;

  constructor(
    reason: WorkspaceLockFailureReason,
    lockPath: string,
    peerInfo: WorkspaceLockInfo | null,
  ) {
    const msg =
      reason === 'live_peer' && peerInfo
        ? `Workspace is locked by ${peerInfo.actor} (pid ${peerInfo.pid} on ${peerInfo.hostname}). Stop it before continuing.`
        : reason === 'malformed_lock'
          ? `Workspace lock file is malformed at ${lockPath}; inspect and remove manually if you are sure nothing is running.`
          : 'Workspace is locked.';
    super(msg);
    this.name = 'WorkspaceLockedError';
    this.reason = reason;
    this.peerInfo = peerInfo;
    this.lockPath = lockPath;
  }
}

export function workspaceLockPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, MANTHAN_DIR_NAME, LOCK_FILE_NAME);
}

/**
 * Acquire the workspace lock. Throws WorkspaceLockedError if a live
 * peer holds it.
 */
export async function acquireWorkspaceLock(
  workspaceRoot: string,
  options: WorkspaceLockOptions = {},
): Promise<WorkspaceLockHandle> {
  const actor = options.actor ?? 'cli';
  const acquisitionTimeoutMs = options.acquisitionTimeoutMs ?? DEFAULTS.acquisitionTimeoutMs;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULTS.heartbeatIntervalMs;
  const staleThresholdMs = options.staleThresholdMs ?? DEFAULTS.staleThresholdMs;
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULTS.retryIntervalMs;
  const now = options.now ?? Date.now;

  const lockPath = workspaceLockPath(workspaceRoot);
  await mkdir(path.dirname(lockPath), { recursive: true });

  const deadline = now() + Math.max(0, acquisitionTimeoutMs);
  let lastPeer: WorkspaceLockInfo | null = null;
  let lastReason: WorkspaceLockFailureReason = 'live_peer';

  while (true) {
    const attempt = await tryAcquireOnce(lockPath, actor, staleThresholdMs, now);
    if (attempt.acquired) {
      const handle = createHandle(lockPath, attempt.info, heartbeatIntervalMs, now);
      return handle;
    }

    lastPeer = attempt.peerInfo;
    lastReason = attempt.reason;

    if (now() >= deadline) {
      throw new WorkspaceLockedError(lastReason, lockPath, lastPeer);
    }
    await delay(retryIntervalMs);
  }
}

/**
 * Convenience wrapper: acquire, run callback, release (even on throw).
 * Most CLI callers want this shape.
 */
export async function withWorkspaceLock<T>(
  workspaceRoot: string,
  options: WorkspaceLockOptions,
  body: (handle: WorkspaceLockHandle) => Promise<T>,
): Promise<T> {
  const handle = await acquireWorkspaceLock(workspaceRoot, options);
  try {
    return await body(handle);
  } finally {
    await handle.release();
  }
}

/**
 * Read the current lock file. Returns null if absent.
 * Throws nothing for malformed content — returns null and lets the
 * caller decide.
 */
export async function inspectWorkspaceLock(
  workspaceRoot: string,
): Promise<WorkspaceLockInfo | null> {
  const lockPath = workspaceLockPath(workspaceRoot);
  return readLockFile(lockPath);
}

// ─────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────

interface AcquireAttempt {
  readonly acquired: boolean;
  readonly info: WorkspaceLockInfo;
  readonly peerInfo: WorkspaceLockInfo | null;
  readonly reason: WorkspaceLockFailureReason;
}

async function tryAcquireOnce(
  lockPath: string,
  actor: WorkspaceLockActor,
  staleThresholdMs: number,
  now: () => number,
): Promise<AcquireAttempt> {
  const ts = new Date(now()).toISOString();
  const myInfo: WorkspaceLockInfo = {
    lock_version: LOCK_FILE_VERSION,
    owner_id: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    started_at: ts,
    heartbeat_at: ts,
    actor,
  };

  // Attempt 1: atomic create.
  try {
    await writeFile(lockPath, serializeLock(myInfo), { flag: 'wx' });
    return { acquired: true, info: myInfo, peerInfo: null, reason: 'live_peer' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'EEXIST') {
      throw err;
    }
  }

  // Lock exists. Inspect.
  const existing = await readLockFile(lockPath);
  if (!existing) {
    return {
      acquired: false,
      info: myInfo,
      peerInfo: null,
      reason: 'malformed_lock',
    };
  }

  // Check liveness.
  if (!isStale(existing, staleThresholdMs, now)) {
    return {
      acquired: false,
      info: myInfo,
      peerInfo: existing,
      reason: 'live_peer',
    };
  }

  // Stale. Take over: unlink + recreate. Race-window-tolerant
  // (atomic create wins; if a sibling beats us, we report them).
  try {
    await unlink(lockPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    await writeFile(lockPath, serializeLock(myInfo), { flag: 'wx' });
    return { acquired: true, info: myInfo, peerInfo: existing, reason: 'live_peer' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code === 'EEXIST') {
      const newPeer = await readLockFile(lockPath);
      return {
        acquired: false,
        info: myInfo,
        peerInfo: newPeer,
        reason: newPeer ? 'live_peer' : 'malformed_lock',
      };
    }
    throw err;
  }
}

function createHandle(
  lockPath: string,
  info: WorkspaceLockInfo,
  heartbeatIntervalMs: number,
  now: () => number,
): WorkspaceLockHandle {
  let released = false;
  let heartbeatTimer: NodeJS.Timeout | undefined;

  const refresh = async (): Promise<void> => {
    if (released) return;
    const updated: WorkspaceLockInfo = {
      ...info,
      heartbeat_at: new Date(now()).toISOString(),
    };
    // Atomic-replace via temp + rename. Race-safe against ourselves;
    // adversarial peers are out of scope.
    const tmpPath = `${lockPath}.heartbeat.${process.pid}.tmp`;
    try {
      await writeFile(tmpPath, serializeLock(updated));
      await rename(tmpPath, lockPath);
    } catch {
      // Best effort — if the heartbeat write fails (e.g., disk
      // pressure), we let it slide. Worst case: another acquirer
      // marks us stale after staleThresholdMs.
      try {
        await unlink(tmpPath);
      } catch {
        // ignore
      }
    }
  };

  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    const current = await readLockFile(lockPath);
    if (!current) {
      return;
    }
    // Only delete if it's still ours. The owner_id is unique per
    // acquisition; a successor who took over our stale lock has
    // a different owner_id and we leave their file intact.
    if (current.owner_id === info.owner_id) {
      try {
        await unlink(lockPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (code !== 'ENOENT') {
          throw err;
        }
      }
    }
  };

  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      void refresh();
    }, heartbeatIntervalMs);
    if (typeof heartbeatTimer.unref === 'function') {
      heartbeatTimer.unref();
    }
  }

  return {
    info,
    lockPath,
    release,
    refresh,
    get released() {
      return released;
    },
  };
}

function isStale(peer: WorkspaceLockInfo, staleThresholdMs: number, now: () => number): boolean {
  // Same-host PID check: if the recorded PID isn't running, the
  // lock is stale regardless of heartbeat.
  if (peer.hostname === hostname()) {
    if (!isPidAlive(peer.pid)) {
      return true;
    }
  }
  // Heartbeat check.
  const heartbeatAt = Date.parse(peer.heartbeat_at);
  if (Number.isNaN(heartbeatAt)) {
    return true; // malformed timestamp; treat as stale
  }
  return now() - heartbeatAt > staleThresholdMs;
}

function isPidAlive(pid: number): boolean {
  if (pid === process.pid) {
    return true;
  }
  try {
    // Signal 0 tests existence without sending.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLockFile(lockPath: string): Promise<WorkspaceLockInfo | null> {
  let content: string;
  try {
    content = await readFile(lockPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code === 'ENOENT') {
      return null;
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(content) as Partial<WorkspaceLockInfo>;
    if (
      typeof parsed.lock_version === 'number' &&
      typeof parsed.owner_id === 'string' &&
      typeof parsed.pid === 'number' &&
      typeof parsed.hostname === 'string' &&
      typeof parsed.started_at === 'string' &&
      typeof parsed.heartbeat_at === 'string' &&
      typeof parsed.actor === 'string'
    ) {
      return parsed as WorkspaceLockInfo;
    }
    return null;
  } catch {
    return null;
  }
}

function serializeLock(info: WorkspaceLockInfo): string {
  // Stable key order so the on-disk form is deterministic.
  return `${JSON.stringify({
    actor: info.actor,
    heartbeat_at: info.heartbeat_at,
    hostname: info.hostname,
    lock_version: info.lock_version,
    owner_id: info.owner_id,
    pid: info.pid,
    started_at: info.started_at,
  })}\n`;
}

function delay(ms: number): Promise<void> {
  // Intentionally NOT calling .unref() — the retry loop relies on this
  // timer to keep the event loop alive while waiting for the peer to
  // release. Unreffing here caused workers to exit silently mid-retry
  // when no other handles kept the loop alive.
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
