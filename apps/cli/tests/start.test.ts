// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E3 — `manthan start` orchestration tests. All side effects are
// injected, so no real process/browser/HTTP is exercised.

import { describe, expect, it, vi } from 'vitest';

import {
  type StartDeps,
  browserOpenCommand,
  resolveWebCommand,
  resolveWebUrl,
  runStart,
  waitForHealth,
} from '../src/commands/start.js';

const DEMO_NAME = 'Demo — Customer discovery';

function makeDeps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    checkHealth: vi.fn(async () => true),
    listWorkspaceNames: vi.fn(async () => [DEMO_NAME]),
    seedDemo: vi.fn(async () => undefined),
    spawnDaemon: vi.fn(),
    checkWebReachable: vi.fn(async () => true),
    spawnWeb: vi.fn(),
    openUrl: vi.fn(),
    sleep: vi.fn(async () => undefined),
    log: vi.fn(),
    logErr: vi.fn(),
    webUrl: 'http://web.test',
    healthAttempts: 5,
    healthIntervalMs: 0,
    ...over,
  };
}

describe('browserOpenCommand', () => {
  it('maps each platform to its opener', () => {
    expect(browserOpenCommand('darwin', 'u')).toEqual({ cmd: 'open', args: ['u'] });
    expect(browserOpenCommand('win32', 'u')).toEqual({
      cmd: 'cmd',
      args: ['/c', 'start', '', 'u'],
    });
    expect(browserOpenCommand('linux', 'u')).toEqual({ cmd: 'xdg-open', args: ['u'] });
  });
});

describe('waitForHealth', () => {
  it('resolves true once the check passes', async () => {
    let n = 0;
    const ok = await waitForHealth(
      async () => {
        n += 1;
        return n >= 2;
      },
      { attempts: 5, intervalMs: 0, sleep: async () => undefined },
    );
    expect(ok).toBe(true);
  });

  it('resolves false after exhausting attempts', async () => {
    const ok = await waitForHealth(async () => false, {
      attempts: 3,
      intervalMs: 0,
      sleep: async () => undefined,
    });
    expect(ok).toBe(false);
  });
});

describe('runStart', () => {
  it('already running + demo present: no spawn, no seed, opens the app', async () => {
    const deps = makeDeps();
    const code = await runStart(deps);
    expect(code).toBe(0);
    expect(deps.spawnDaemon).not.toHaveBeenCalled();
    expect(deps.seedDemo).not.toHaveBeenCalled();
    expect(deps.openUrl).toHaveBeenCalledWith('http://web.test');
  });

  it('engine down: spawns it and polls /health until ready', async () => {
    let n = 0;
    const checkHealth = vi.fn(async () => {
      n += 1;
      return n >= 3; // 1: initial (down) → spawn; 2: down; 3: up
    });
    const deps = makeDeps({ checkHealth });
    const code = await runStart(deps);
    expect(code).toBe(0);
    expect(deps.spawnDaemon).toHaveBeenCalledOnce();
    expect(checkHealth.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(deps.openUrl).toHaveBeenCalledOnce();
  });

  it('demo absent: seeds it', async () => {
    const deps = makeDeps({ listWorkspaceNames: vi.fn(async () => ['Some other project']) });
    const code = await runStart(deps);
    expect(code).toBe(0);
    expect(deps.seedDemo).toHaveBeenCalledOnce();
  });

  it('health never comes up: friendly failure, no seed, no open, exit 1', async () => {
    const deps = makeDeps({ checkHealth: vi.fn(async () => false), healthAttempts: 3 });
    const code = await runStart(deps);
    expect(code).toBe(1);
    expect(deps.logErr).toHaveBeenCalled();
    expect(deps.seedDemo).not.toHaveBeenCalled();
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it('demo seed failure: friendly failure, no open, exit 1', async () => {
    const deps = makeDeps({
      listWorkspaceNames: vi.fn(async () => []),
      seedDemo: vi.fn(async () => {
        throw new Error('seed boom');
      }),
    });
    const code = await runStart(deps);
    expect(code).toBe(1);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it('workspace listing failure: friendly failure, exit 1', async () => {
    const deps = makeDeps({
      listWorkspaceNames: vi.fn(async () => {
        throw new Error('list boom');
      }),
    });
    expect(await runStart(deps)).toBe(1);
  });

  it('web already reachable: does not spawn web, opens the app', async () => {
    const deps = makeDeps(); // checkWebReachable → true by default
    const code = await runStart(deps);
    expect(code).toBe(0);
    expect(deps.spawnWeb).not.toHaveBeenCalled();
    expect(deps.openUrl).toHaveBeenCalledWith('http://web.test');
  });

  it('web down: spawns the web server and polls until reachable, then opens', async () => {
    let calls = 0;
    const checkWebReachable = vi.fn(async () => {
      calls += 1;
      return calls >= 3; // false, false, true
    });
    const deps = makeDeps({ checkWebReachable });
    const code = await runStart(deps);
    expect(code).toBe(0);
    expect(deps.spawnWeb).toHaveBeenCalledOnce();
    expect(checkWebReachable.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(deps.openUrl).toHaveBeenCalledOnce();
  });

  it('web never reachable: friendly failure, no browser open, exit 1', async () => {
    const deps = makeDeps({
      checkWebReachable: vi.fn(async () => false),
      healthAttempts: 3,
    });
    const code = await runStart(deps);
    expect(code).toBe(1);
    expect(deps.spawnWeb).toHaveBeenCalledOnce();
    expect(deps.openUrl).not.toHaveBeenCalled();
    expect(deps.logErr).toHaveBeenCalled();
  });

  it('already-running engine: does not spawn a duplicate API', async () => {
    const deps = makeDeps(); // checkHealth → true by default
    await runStart(deps);
    expect(deps.spawnDaemon).not.toHaveBeenCalled();
  });
});

describe('resolveWebUrl', () => {
  it('defaults to the Vite dev port 7374', () => {
    expect(resolveWebUrl({})).toBe('http://127.0.0.1:7374');
  });
  it('honors MANTHANOS_WEB_URL override', () => {
    expect(resolveWebUrl({ MANTHANOS_WEB_URL: 'http://localhost:9999' })).toBe(
      'http://localhost:9999',
    );
  });
});

describe('resolveWebCommand', () => {
  it('defaults to `pnpm --filter @manthanos/web dev`', () => {
    expect(resolveWebCommand({})).toEqual({
      cmd: 'pnpm',
      args: ['--filter', '@manthanos/web', 'dev'],
    });
  });
  it('honors MANTHANOS_WEB_CMD override (space-separated)', () => {
    expect(resolveWebCommand({ MANTHANOS_WEB_CMD: 'npm run web:serve' })).toEqual({
      cmd: 'npm',
      args: ['run', 'web:serve'],
    });
  });
});
