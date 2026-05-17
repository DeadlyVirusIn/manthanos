// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace lock per CRASH_CONSISTENCY.md §7.
// Single-runtime ownership of a workspace.

import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import type { LockInfo, LockOps } from './types.js';

function isProcessAlive(pid: number, currentHost: string, lockHost: string): boolean {
  // We can only verify liveness on the same host.
  if (lockHost !== currentHost) return true; // assume alive — refuse to reclaim cross-host
  try {
    // Signal 0 tests existence without sending; throws ESRCH if gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLock(lockPath: string): Promise<LockInfo | null> {
  try {
    const content = await readFile(lockPath, 'utf8');
    const parsed = JSON.parse(content) as Partial<LockInfo>;
    if (
      typeof parsed.pid === 'number' &&
      typeof parsed.startedAt === 'string' &&
      typeof parsed.host === 'string'
    ) {
      return { pid: parsed.pid, startedAt: parsed.startedAt, host: parsed.host };
    }
    return null;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeLockAtomically(lockPath: string, info: LockInfo): Promise<void> {
  // Use O_CREAT|O_EXCL for atomic creation; fall back if EEXIST.
  const handle = await open(lockPath, 'wx');
  try {
    await handle.writeFile(JSON.stringify(info));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export const lockOps: LockOps = {
  async tryAcquire(lockPath: string): Promise<boolean> {
    await mkdir(path.dirname(lockPath), { recursive: true });
    const myInfo: LockInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      host: hostname(),
    };
    try {
      await writeLockAtomically(lockPath, myInfo);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code !== 'EEXIST') throw err;
    }

    // Lock exists. Check whether the holder is still alive.
    const existing = await readLock(lockPath);
    if (!existing) {
      // Malformed lock file. Refuse to reclaim — operator must investigate.
      return false;
    }
    const alive = isProcessAlive(existing.pid, hostname(), existing.host);
    if (alive) return false;

    // Stale. Reclaim by deleting + recreating.
    try {
      await unlink(lockPath);
    } catch {
      // race — someone else may have reclaimed; retry once.
    }
    try {
      await writeLockAtomically(lockPath, myInfo);
      return true;
    } catch {
      return false;
    }
  },

  async release(lockPath: string): Promise<void> {
    const existing = await readLock(lockPath);
    if (!existing) return;
    if (existing.pid !== process.pid) return; // not ours; don't touch
    try {
      await unlink(lockPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code !== 'ENOENT') throw err;
    }
  },

  async inspect(lockPath: string): Promise<LockInfo | null> {
    return readLock(lockPath);
  },
};
