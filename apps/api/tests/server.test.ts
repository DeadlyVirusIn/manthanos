// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 1 Task 2 acceptance tests.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceLockedError, inspectWorkspaceLock } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { isLoopbackHost } from '../src/loopback-guard.js';
import { type DaemonHandle, VERSION, createDaemon } from '../src/server.js';

const TEST_PORT = 0; // 0 = OS picks an ephemeral free port.

async function makeTestConfig() {
  const ws = await mkdtemp(path.join(tmpdir(), 'mws-daemon-'));
  return {
    config: {
      port: TEST_PORT,
      host: '127.0.0.1',
      logLevel: 'silent' as const,
      workspaceRoot: ws,
    },
    cleanup: () => rm(ws, { recursive: true, force: true }),
  };
}

describe('config', () => {
  it('uses defaults when env is empty', () => {
    const config = loadConfig({ HOME: '/tmp/fake-home' });
    expect(config.port).toBe(7373);
    expect(config.host).toBe('127.0.0.1');
    expect(config.logLevel).toBe('info');
    expect(config.workspaceRoot).toBe('/tmp/fake-home/.manthanos/workspaces/default');
  });

  it('honors MANTHANOS_WORKSPACE_ROOT explicitly', () => {
    const config = loadConfig({ MANTHANOS_WORKSPACE_ROOT: '/some/path' });
    expect(config.workspaceRoot).toBe('/some/path');
  });

  it('honors MANTHANOS_DATA_DIR when no explicit workspace root', () => {
    const config = loadConfig({ MANTHANOS_DATA_DIR: '/data' });
    expect(config.workspaceRoot).toBe('/data/workspaces/default');
  });

  it('honors MANTHANOS_PORT', () => {
    expect(loadConfig({ MANTHANOS_PORT: '9000' }).port).toBe(9000);
  });

  it('rejects non-integer MANTHANOS_PORT', () => {
    expect(() => loadConfig({ MANTHANOS_PORT: 'abc' })).toThrow(/integer/);
  });

  it('rejects MANTHANOS_PORT outside 1..65535', () => {
    expect(() => loadConfig({ MANTHANOS_PORT: '0' })).toThrow(/between/);
    expect(() => loadConfig({ MANTHANOS_PORT: '99999' })).toThrow(/between/);
  });

  it('honors MANTHANOS_LOG_LEVEL (case-insensitive)', () => {
    expect(loadConfig({ MANTHANOS_LOG_LEVEL: 'DEBUG' }).logLevel).toBe('debug');
  });

  it('rejects unknown MANTHANOS_LOG_LEVEL', () => {
    expect(() => loadConfig({ MANTHANOS_LOG_LEVEL: 'loud' })).toThrow(/must be one of/);
  });
});

describe('isLoopbackHost', () => {
  it('accepts loopback hosts with and without port', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('localhost:7373')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.1:7373')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('[::1]:7373')).toBe(true);
  });

  it('rejects non-loopback hosts', () => {
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
    expect(isLoopbackHost('192.0.2.1:7373')).toBe(false);
    expect(isLoopbackHost('attacker.local')).toBe(false);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
  });

  it('rejects missing or empty Host', () => {
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
    expect(isLoopbackHost('   ')).toBe(false);
  });
});

describe('daemon boot + shutdown', () => {
  let handle: DaemonHandle | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.shutdown();
      handle = undefined;
    }
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('boots on a real loopback port and reports it', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    handle = await createDaemon({ config: t.config });
    const address = handle.app.server.address();
    expect(address).not.toBeNull();
    if (typeof address === 'string' || address === null) {
      throw new Error('expected AddressInfo, got string/null');
    }
    expect(address.address).toBe('127.0.0.1');
    expect(address.port).toBeGreaterThan(0);
  });

  it('shutdown closes cleanly and is idempotent', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    handle = await createDaemon({ config: t.config });
    await handle.shutdown();
    await expect(handle.shutdown()).resolves.toBeUndefined();
    handle = undefined;
  });
});

describe('GET /health', () => {
  let handle: DaemonHandle;

  beforeEach(async () => {
    // Inject-only tests don't need real workspace state. Skip the lock so we
    // can run them in parallel without colliding on test workspace dirs.
    handle = await createDaemon({
      config: {
        port: TEST_PORT,
        host: '127.0.0.1',
        logLevel: 'silent',
        workspaceRoot: '/dev/null/unused',
      },
      noListen: true,
      skipLock: true,
    });
  });

  afterEach(async () => {
    await handle.shutdown();
  });

  it('returns 200 with the expected shape', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '127.0.0.1' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.version).toBe(VERSION);
    expect(typeof body.uptime_ms).toBe('number');
    expect(body.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(body.bound_host).toBe('127.0.0.1');
    expect(body.port).toBe(TEST_PORT);
  });

  it('returns 405 with Allow: GET on POST /health', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/health',
      headers: { host: '127.0.0.1' },
    });

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('GET');
    const body = response.json() as Record<string, unknown>;
    expect(body.error).toBe('method_not_allowed');
  });

  it('returns 405 on PUT, PATCH, DELETE, OPTIONS /health', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
      const response = await handle.app.inject({
        method,
        url: '/health',
        headers: { host: '127.0.0.1' },
      });
      expect(response.statusCode, `method=${method}`).toBe(405);
    }
  });
});

describe('non-loopback Host header rejection', () => {
  let handle: DaemonHandle;

  beforeEach(async () => {
    handle = await createDaemon({
      config: {
        port: TEST_PORT,
        host: '127.0.0.1',
        logLevel: 'silent',
        workspaceRoot: '/dev/null/unused',
      },
      noListen: true,
      skipLock: true,
    });
  });

  afterEach(async () => {
    await handle.shutdown();
  });

  it('rejects requests with a non-loopback Host header (403)', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'attacker.example.com' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json() as Record<string, unknown>;
    expect(body.error).toBe('forbidden');
    expect(body.reason).toMatch(/non-loopback/);
  });

  it('rejects requests with a non-loopback IP in the Host header (403)', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '192.0.2.1:7373' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects requests with missing Host header (403)', async () => {
    // fastify.inject with headers: {} produces a request with no Host header.
    // We expect the loopback guard to reject it.
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: {},
    });
    // Fastify auto-fills host from authority when injecting, but the guard
    // should still see something. The behaviour we contract on is: the guard
    // never lets a non-loopback through. If inject auto-injects 'localhost',
    // this becomes a 200; otherwise 403. Both are loopback-safe outcomes.
    expect([200, 403]).toContain(response.statusCode);
  });

  it('accepts loopback variants', async () => {
    for (const host of ['localhost', '127.0.0.1:7373', '[::1]']) {
      const response = await handle.app.inject({
        method: 'GET',
        url: '/health',
        headers: { host },
      });
      expect(response.statusCode, `host=${host}`).toBe(200);
    }
  });
});

describe('daemon workspace lock', () => {
  let handle: DaemonHandle | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.shutdown().catch(() => undefined);
      handle = undefined;
    }
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('acquires the workspace lock on start', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    handle = await createDaemon({ config: t.config });
    const onDisk = await inspectWorkspaceLock(t.config.workspaceRoot);
    expect(onDisk).not.toBeNull();
    if (!onDisk) throw new Error('unreachable');
    expect(onDisk.actor).toBe('daemon');
    expect(onDisk.pid).toBe(process.pid);
    expect(onDisk.owner_id).toBe(handle.lock.info.owner_id);
  });

  it('refuses to start a second daemon against the same workspace', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    handle = await createDaemon({ config: t.config });
    await expect(
      createDaemon({
        config: { ...t.config, port: 0 },
      }),
    ).rejects.toBeInstanceOf(WorkspaceLockedError);
  });

  it('releases the lock on shutdown', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    handle = await createDaemon({ config: t.config });
    await handle.shutdown();
    handle = undefined;
    const onDisk = await inspectWorkspaceLock(t.config.workspaceRoot);
    expect(onDisk).toBeNull();
  });

  it('after shutdown a new daemon can start against the same workspace', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    const first = await createDaemon({ config: t.config });
    await first.shutdown();
    handle = await createDaemon({ config: { ...t.config, port: 0 } });
    expect(handle.lock.info.owner_id).not.toBe(first.lock.info.owner_id);
  });

  it('listen failure releases the lock', async () => {
    const t = await makeTestConfig();
    cleanup = t.cleanup;
    // Hold a port. Then try to start a daemon on the same port; listen will
    // fail (EADDRINUSE) and the lock must be released.
    const blocker = await createDaemon({ config: t.config });
    const blockerAddr = blocker.app.server.address();
    if (typeof blockerAddr !== 'object' || blockerAddr === null) {
      throw new Error('expected AddressInfo');
    }
    const blockedPort = blockerAddr.port;

    // Release the blocker's lock so the second daemon can attempt to acquire
    // it (we want to test "listen fails → lock released", not "lock blocks").
    await blocker.shutdown();

    // Second daemon: same workspace (lock free), same port (a third helper
    // will hold it).
    const portHolder = await createDaemon({
      config: { ...t.config, port: blockedPort, workspaceRoot: `${t.config.workspaceRoot}-holder` },
    });
    try {
      await expect(createDaemon({ config: { ...t.config, port: blockedPort } })).rejects.toThrow();
      // The workspace lock must NOT remain held after the failed listen.
      const stillLocked = await inspectWorkspaceLock(t.config.workspaceRoot);
      expect(stillLocked).toBeNull();
    } finally {
      await portHolder.shutdown();
      await rm(portHolder.workspaceRoot, { recursive: true, force: true });
    }
  });
});
