#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS local HTTP daemon — Task 2.
//
// Binds to 127.0.0.1 by default. Hosts /health and (in later
// tasks) the workspace / fact / conversation / decision /
// learning / audit / provider / context routes.

import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Config, loadConfig } from './config.js';
import { registerHealth } from './health.js';
import { registerLoopbackGuard } from './loopback-guard.js';

export const VERSION = '0.0.0';

export interface DaemonHandle {
  readonly app: FastifyInstance;
  readonly port: number;
  readonly boundHost: string;
  readonly startedAt: number;
  readonly shutdown: () => Promise<void>;
}

export interface CreateDaemonOptions {
  /** Override config (mainly for tests). Falls back to env. */
  readonly config?: Config;
  /** When true, do not call app.listen() — useful for inject-only tests. */
  readonly noListen?: boolean;
}

export async function createDaemon(opts: CreateDaemonOptions = {}): Promise<DaemonHandle> {
  const config = opts.config ?? loadConfig();
  const startedAt = Date.now();

  const app = Fastify({
    logger: { level: config.logLevel },
    disableRequestLogging: false,
  });

  registerLoopbackGuard(app);
  registerHealth(app, {
    startedAt,
    version: VERSION,
    boundHost: config.host,
    port: config.port,
  });

  if (!opts.noListen) {
    await app.listen({ host: config.host, port: config.port });
  } else {
    // For inject-only tests: ensure routes are registered before inject() is
    // called. ready() resolves after plugin/route registration is complete.
    await app.ready();
  }

  return {
    app,
    port: config.port,
    boundHost: config.host,
    startedAt,
    shutdown: async () => {
      await app.close();
    },
  };
}

async function main(): Promise<void> {
  const handle = await createDaemon();
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    handle.app.log.info({ signal }, 'shutting down');
    try {
      await handle.shutdown();
      process.exit(0);
    } catch (err) {
      handle.app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

// Only execute main() when invoked as a script (not when imported by tests).
// Compare the resolved filesystem path of the script (argv[1]) against the
// resolved path of this module. tsx-based loaders and `node --import tsx`
// both produce paths that compare correctly under fileURLToPath().
const isDirectInvocation = (() => {
  const argvPath = process.argv[1];
  if (!argvPath) {
    return false;
  }
  try {
    return resolvePath(argvPath) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch((err: unknown) => {
    process.stderr.write(`daemon failed to start: ${(err as Error)?.message ?? err}\n`);
    process.exit(1);
  });
}
