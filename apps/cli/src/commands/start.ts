// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan start` — C4.4-E3 dev-level one-command launcher.
//
// Orchestrates the local dev/operator path:
//   1. check the local API (/health); start it if not already up
//   2. wait for /health to become reachable
//   3. ensure the demo Project exists (seed only if absent)
//   4. check the web app; start the web dev server if not already up
//   5. wait until the web URL is reachable, then open it in the browser
//   6. friendly terminal output throughout
//
// Scope: dev/operator launcher only. No packaging/installer/signing/
// notarization, no AI canary, no ECC. All side-effecting steps (HTTP,
// process spawn, browser open, sleep) are injected so the orchestration is
// unit-testable without real processes or a browser.

import { type SpawnOptions, spawn } from 'node:child_process';
import { daemonBaseUrl } from './demo.js';

/** Mirrors apps/api/src/services/demo/manifest.ts DEMO_WORKSPACE_NAME. The
 *  CLI does not depend on @manthanos/api, so the name is duplicated here;
 *  keep the two in sync. */
const DEMO_WORKSPACE_NAME = 'Demo — Customer discovery';

/** Cross-platform browser-open command (pure — unit-tested per platform). */
export function browserOpenCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  return { cmd: 'xdg-open', args: [url] };
}

export interface StartDeps {
  /** GET /health → reachable? */
  readonly checkHealth: () => Promise<boolean>;
  /** GET /api/v1/workspaces → workspace display names. */
  readonly listWorkspaceNames: () => Promise<string[]>;
  /** POST /api/v1/demo/seed. */
  readonly seedDemo: () => Promise<void>;
  /** Start the local engine process (detached). */
  readonly spawnDaemon: () => void;
  /** GET the web URL → reachable? (web dev server already up) */
  readonly checkWebReachable: () => Promise<boolean>;
  /** Start the web dev server process (detached). */
  readonly spawnWeb: () => void;
  /** Open the web UI URL in the default browser. */
  readonly openUrl: (url: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (msg: string) => void;
  readonly logErr: (msg: string) => void;
  readonly webUrl: string;
  /** Health-poll budget. */
  readonly healthAttempts: number;
  readonly healthIntervalMs: number;
}

export async function waitForHealth(
  check: () => Promise<boolean>,
  opts: { attempts: number; intervalMs: number; sleep: (ms: number) => Promise<void> },
): Promise<boolean> {
  for (let i = 0; i < opts.attempts; i++) {
    if (await check()) return true;
    await opts.sleep(opts.intervalMs);
  }
  return false;
}

/** Orchestration. Returns a process exit code (0 ok, 1 failure). */
export async function runStart(deps: StartDeps): Promise<number> {
  deps.log('Starting ManthanOS…');

  const alreadyUp = await deps.checkHealth();
  if (alreadyUp) {
    deps.log('ManthanOS is already running.');
  } else {
    deps.log('Starting the local engine…');
    deps.spawnDaemon();
    const healthy = await waitForHealth(deps.checkHealth, {
      attempts: deps.healthAttempts,
      intervalMs: deps.healthIntervalMs,
      sleep: deps.sleep,
    });
    if (!healthy) {
      deps.logErr("ManthanOS didn't start in time. Try again in a moment.");
      return 1;
    }
  }

  // Ensure the demo Project exists — seed only if absent (seeding is not
  // idempotent, so a blind re-seed would pile up demo workspaces).
  try {
    const names = await deps.listWorkspaceNames();
    if (names.includes(DEMO_WORKSPACE_NAME)) {
      deps.log('Demo Project is ready.');
    } else {
      deps.log('Getting your demo Project ready…');
      await deps.seedDemo();
      deps.log('Demo Project ready.');
    }
  } catch {
    deps.logErr("ManthanOS started, but we couldn't set up the demo Project. Try again.");
    return 1;
  }

  // Ensure the web app is up. `start` is the one-command launcher, so it
  // also brings up the web dev server — the API alone is not browsable, and
  // the web URL must respond before we open a browser at it.
  const webUp = await deps.checkWebReachable();
  if (webUp) {
    deps.log('The web app is already running.');
  } else {
    deps.log('Starting the web app…');
    deps.spawnWeb();
    const webHealthy = await waitForHealth(deps.checkWebReachable, {
      attempts: deps.healthAttempts,
      intervalMs: deps.healthIntervalMs,
      sleep: deps.sleep,
    });
    if (!webHealthy) {
      deps.logErr("The web app didn't start in time. Try again in a moment.");
      return 1;
    }
  }

  deps.log(`Opening ManthanOS at ${deps.webUrl} …`);
  deps.openUrl(deps.webUrl);
  deps.log("You're all set.");
  return 0;
}

// ─────────────────────────────────────────────────────────────────
// Default wiring (real HTTP / spawn / browser)
// ─────────────────────────────────────────────────────────────────

/** Web UI URL. Default matches the Vite dev server (`vite.config.ts`
 *  port 7374, strictPort). Overridable via `MANTHANOS_WEB_URL`. */
export function resolveWebUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.MANTHANOS_WEB_URL?.trim() || 'http://127.0.0.1:7374';
}

/** Command that starts the web dev server. Default mirrors `spawnDaemon`'s
 *  pattern. Overridable via `MANTHANOS_WEB_CMD` (space-separated). */
export function resolveWebCommand(env: NodeJS.ProcessEnv = process.env): {
  cmd: string;
  args: string[];
} {
  const custom = env.MANTHANOS_WEB_CMD?.trim();
  if (custom) {
    const [cmd, ...args] = custom.split(/\s+/);
    return { cmd: cmd ?? 'pnpm', args };
  }
  return { cmd: 'pnpm', args: ['--filter', '@manthanos/web', 'dev'] };
}

function defaultStartDeps(env: NodeJS.ProcessEnv = process.env): StartDeps {
  const base = daemonBaseUrl(env);
  const webUrl = resolveWebUrl(env);

  const checkHealth = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/health`);
      return res.ok;
    } catch {
      return false;
    }
  };

  const listWorkspaceNames = async (): Promise<string[]> => {
    const res = await fetch(`${base}/api/v1/workspaces`);
    if (!res.ok) throw new Error(`workspaces request failed: HTTP ${res.status}`);
    const body = (await res.json()) as { workspaces?: Array<{ name?: unknown }> };
    return (body.workspaces ?? [])
      .map((w) => (typeof w.name === 'string' ? w.name : ''))
      .filter((n) => n.length > 0);
  };

  const seedDemo = async (): Promise<void> => {
    const res = await fetch(`${base}/api/v1/demo/seed`, { method: 'POST' });
    if (!res.ok) throw new Error(`demo seed failed: HTTP ${res.status}`);
  };

  const spawnDaemon = (): void => {
    // Dev default: `pnpm --filter @manthanos/api dev`, overridable via
    // MANTHANOS_API_CMD (space-separated). Detached so the engine outlives
    // this command; output is ignored (the operator watches the web app).
    const custom = env.MANTHANOS_API_CMD?.trim();
    const [cmd, ...args] = custom
      ? custom.split(/\s+/)
      : ['pnpm', '--filter', '@manthanos/api', 'dev'];
    const spawnOpts: SpawnOptions = { detached: true, stdio: 'ignore' };
    const child = spawn(cmd ?? 'pnpm', args, spawnOpts);
    child.unref();
  };

  const checkWebReachable = async (): Promise<boolean> => {
    try {
      const res = await fetch(webUrl);
      return res.ok;
    } catch {
      return false;
    }
  };

  const spawnWeb = (): void => {
    // Dev default: `pnpm --filter @manthanos/web dev` (Vite, port 7374),
    // overridable via MANTHANOS_WEB_CMD. Detached + output ignored, mirroring
    // the engine spawn so the web server outlives this command.
    const { cmd, args } = resolveWebCommand(env);
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  };

  const openUrl = (url: string): void => {
    const { cmd, args } = browserOpenCommand(process.platform, url);
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  };

  return {
    checkHealth,
    listWorkspaceNames,
    seedDemo,
    spawnDaemon,
    checkWebReachable,
    spawnWeb,
    openUrl,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (msg) => process.stdout.write(`${msg}\n`),
    logErr: (msg) => process.stderr.write(`${msg}\n`),
    webUrl,
    healthAttempts: 60,
    healthIntervalMs: 500,
  };
}

/** CLI entry: `manthan start`. */
export async function runStartCommand(): Promise<void> {
  const code = await runStart(defaultStartDeps());
  process.exitCode = code;
}
