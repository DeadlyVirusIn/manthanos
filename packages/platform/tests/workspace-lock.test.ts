// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Unit tests for the workspace lock primitive.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WorkspaceLockedError,
  acquireWorkspaceLock,
  inspectWorkspaceLock,
  withWorkspaceLock,
  workspaceLockPath,
} from '../src/workspace-lock.js';

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-lock-'));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('acquireWorkspaceLock — basic flow', () => {
  it('creates .manthan/.lock containing pid, hostname, actor', async () => {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    try {
      const lockPath = workspaceLockPath(workspaceRoot);
      expect(lockPath).toBe(path.join(workspaceRoot, '.manthan', '.lock'));
      const raw = await readFile(lockPath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.pid).toBe(process.pid);
      expect(parsed.actor).toBe('daemon');
      expect(parsed.lock_version).toBe(1);
      expect(typeof parsed.heartbeat_at).toBe('string');
      expect(typeof parsed.owner_id).toBe('string');
      expect(parsed.owner_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(handle.info.pid).toBe(process.pid);
      expect(handle.info.owner_id).toBe(parsed.owner_id);
      expect(handle.released).toBe(false);
    } finally {
      await handle.release();
    }
  });

  it('release() removes the lock file and sets released=true', async () => {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      heartbeatIntervalMs: 0,
    });
    await handle.release();
    expect(handle.released).toBe(true);
    expect(await inspectWorkspaceLock(workspaceRoot)).toBeNull();
  });

  it('release() is idempotent', async () => {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      heartbeatIntervalMs: 0,
    });
    await handle.release();
    await expect(handle.release()).resolves.toBeUndefined();
  });

  it('inspectWorkspaceLock returns null when no lock exists', async () => {
    expect(await inspectWorkspaceLock(workspaceRoot)).toBeNull();
  });
});

describe('acquireWorkspaceLock — contention', () => {
  it('throws WorkspaceLockedError when a live peer holds the lock', async () => {
    const first = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    try {
      await expect(
        acquireWorkspaceLock(workspaceRoot, {
          actor: 'cli',
          heartbeatIntervalMs: 0,
          acquisitionTimeoutMs: 0,
        }),
      ).rejects.toBeInstanceOf(WorkspaceLockedError);
    } finally {
      await first.release();
    }
  });

  it('WorkspaceLockedError carries the peer info', async () => {
    const first = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    try {
      try {
        await acquireWorkspaceLock(workspaceRoot, {
          heartbeatIntervalMs: 0,
          acquisitionTimeoutMs: 0,
        });
        throw new Error('expected throw');
      } catch (err) {
        if (!(err instanceof WorkspaceLockedError)) throw err;
        expect(err.reason).toBe('live_peer');
        expect(err.peerInfo?.pid).toBe(process.pid);
        expect(err.peerInfo?.actor).toBe('daemon');
        expect(err.message).toMatch(/locked by daemon/);
      }
    } finally {
      await first.release();
    }
  });

  it('retries within acquisitionTimeoutMs and succeeds if peer releases', async () => {
    const first = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    // Release after a short delay; second acquirer should retry and succeed.
    setTimeout(() => {
      void first.release();
    }, 100);
    const second = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'cli',
      heartbeatIntervalMs: 0,
      acquisitionTimeoutMs: 2_000,
      retryIntervalMs: 25,
    });
    try {
      expect(second.info.actor).toBe('cli');
    } finally {
      await second.release();
    }
  });
});

describe('acquireWorkspaceLock — stale detection', () => {
  async function writeStaleLockFromOtherProcess(
    heartbeatAge: number,
    pidOverride?: number,
  ): Promise<void> {
    const lockPath = workspaceLockPath(workspaceRoot);
    await writeFile(
      lockPath,
      JSON.stringify({
        actor: 'cli',
        // Heartbeat in the past by `heartbeatAge` ms.
        heartbeat_at: new Date(Date.now() - heartbeatAge).toISOString(),
        hostname: 'some-other-host',
        lock_version: 1,
        owner_id: '00000000-0000-4000-8000-000000000aaa',
        pid: pidOverride ?? 999_999_999,
        started_at: new Date(Date.now() - heartbeatAge - 1000).toISOString(),
      }),
      'utf8',
    );
    // Ensure the .manthan dir exists for the path.
  }

  it('takes over a lock whose heartbeat is older than staleThresholdMs', async () => {
    // Write a stale lock attributed to a different host (so PID-liveness
    // check is skipped); heartbeat way past threshold.
    await mkdtempForWorkspace();
    await writeStaleLockFromOtherProcess(60_000);
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
      staleThresholdMs: 30_000,
    });
    try {
      const onDisk = await inspectWorkspaceLock(workspaceRoot);
      expect(onDisk?.pid).toBe(process.pid);
      expect(onDisk?.actor).toBe('daemon');
    } finally {
      await handle.release();
    }
  });

  it('takes over a lock whose PID is not running on this host', async () => {
    await mkdtempForWorkspace();
    // Use a PID that won't be running (very high). Mark as same host so
    // the PID-liveness check actually runs.
    const lockPath = workspaceLockPath(workspaceRoot);
    await writeFile(
      lockPath,
      JSON.stringify({
        actor: 'daemon',
        heartbeat_at: new Date().toISOString(), // fresh heartbeat
        hostname: (await import('node:os')).hostname(),
        lock_version: 1,
        owner_id: '00000000-0000-4000-8000-000000000bbb',
        pid: 999_999_999,
        started_at: new Date().toISOString(),
      }),
      'utf8',
    );
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'cli',
      heartbeatIntervalMs: 0,
    });
    try {
      const onDisk = await inspectWorkspaceLock(workspaceRoot);
      expect(onDisk?.pid).toBe(process.pid);
    } finally {
      await handle.release();
    }
  });

  it('does NOT take over when same host and PID is alive (current process)', async () => {
    // The current process's PID is alive — a lock recorded with it should
    // not be reclaimed by a second call from the same process.
    const first = await acquireWorkspaceLock(workspaceRoot, {
      heartbeatIntervalMs: 0,
    });
    try {
      await expect(
        acquireWorkspaceLock(workspaceRoot, {
          heartbeatIntervalMs: 0,
          acquisitionTimeoutMs: 0,
        }),
      ).rejects.toBeInstanceOf(WorkspaceLockedError);
    } finally {
      await first.release();
    }
  });

  it('treats malformed lock file as unacquirable (operator intervention needed)', async () => {
    await mkdtempForWorkspace();
    const lockPath = workspaceLockPath(workspaceRoot);
    await writeFile(lockPath, '{ this is not json', 'utf8');
    try {
      await acquireWorkspaceLock(workspaceRoot, {
        heartbeatIntervalMs: 0,
        acquisitionTimeoutMs: 0,
      });
      throw new Error('expected throw');
    } catch (err) {
      if (!(err instanceof WorkspaceLockedError)) throw err;
      expect(err.reason).toBe('malformed_lock');
      expect(err.peerInfo).toBeNull();
    }
  });

  async function mkdtempForWorkspace(): Promise<void> {
    // Ensure .manthan directory exists so writes succeed.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(workspaceRoot, '.manthan'), { recursive: true });
  }
});

describe('release after takeover does not clobber the new holder', () => {
  it('release() leaves the lock alone if pid/started_at no longer match', async () => {
    // Acquire normally.
    const first = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });

    // Overwrite the lock file as if a "successor" took over (different
    // owner_id; the identity check at release time compares owner_id only).
    const lockPath = workspaceLockPath(workspaceRoot);
    const successor = {
      actor: 'cli',
      heartbeat_at: new Date().toISOString(),
      hostname: first.info.hostname,
      lock_version: 1,
      owner_id: '00000000-0000-4000-8000-000000000001', // valid UUID, not ours
      pid: process.pid + 1, // pretend a sibling pid
      started_at: new Date(Date.now() + 1).toISOString(),
    };
    await writeFile(lockPath, JSON.stringify(successor), 'utf8');

    // first.release() should not delete the successor's lock.
    await first.release();
    const onDisk = JSON.parse(await readFile(lockPath, 'utf8'));
    expect(onDisk.owner_id).toBe(successor.owner_id);
    expect(onDisk.pid).toBe(successor.pid);
  });
});

describe('heartbeat', () => {
  it('refresh() updates heartbeat_at', async () => {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      heartbeatIntervalMs: 0, // disable auto; use manual refresh
    });
    try {
      const before = handle.info.heartbeat_at;
      // Wait briefly so timestamps differ.
      await new Promise((r) => setTimeout(r, 20));
      await handle.refresh();
      const onDisk = await inspectWorkspaceLock(workspaceRoot);
      expect(onDisk).not.toBeNull();
      if (!onDisk) throw new Error('unreachable');
      expect(onDisk.heartbeat_at).not.toBe(before);
      expect(Date.parse(onDisk.heartbeat_at)).toBeGreaterThan(Date.parse(before));
    } finally {
      await handle.release();
    }
  });

  it('automatic heartbeat refreshes on the timer', async () => {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      heartbeatIntervalMs: 25,
    });
    try {
      const initial = (await inspectWorkspaceLock(workspaceRoot))?.heartbeat_at ?? '';
      // Wait long enough for >2 heartbeats.
      await new Promise((r) => setTimeout(r, 120));
      const updated = (await inspectWorkspaceLock(workspaceRoot))?.heartbeat_at ?? '';
      expect(updated).not.toBe('');
      expect(Date.parse(updated)).toBeGreaterThan(Date.parse(initial));
    } finally {
      await handle.release();
    }
  });
});

describe('withWorkspaceLock helper', () => {
  it('runs the body and releases the lock', async () => {
    const result = await withWorkspaceLock(workspaceRoot, { heartbeatIntervalMs: 0 }, async () => {
      expect(await inspectWorkspaceLock(workspaceRoot)).not.toBeNull();
      return 42;
    });
    expect(result).toBe(42);
    expect(await inspectWorkspaceLock(workspaceRoot)).toBeNull();
  });

  it('releases even when the body throws', async () => {
    await expect(
      withWorkspaceLock(workspaceRoot, { heartbeatIntervalMs: 0 }, async () => {
        throw new Error('body failed');
      }),
    ).rejects.toThrow('body failed');
    expect(await inspectWorkspaceLock(workspaceRoot)).toBeNull();
  });
});
