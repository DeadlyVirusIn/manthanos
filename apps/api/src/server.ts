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
import {
  type WorkspaceLockHandle,
  WorkspaceLockedError,
  acquireWorkspaceLock,
} from '@manthanos/platform';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Config, loadConfig } from './config.js';
import { registerHealth } from './health.js';
import { registerLoopbackGuard } from './loopback-guard.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerExtractionRoutes } from './routes/extraction.js';
import { registerFactRoutes } from './routes/facts.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { type SubstrateHandle, openSubstrate } from './services/substrate.js';

export const VERSION = '0.0.0';

export interface DaemonHandle {
  readonly app: FastifyInstance;
  readonly port: number;
  readonly boundHost: string;
  readonly startedAt: number;
  readonly workspaceRoot: string;
  readonly lock: WorkspaceLockHandle;
  readonly substrate: SubstrateHandle | null;
  readonly shutdown: () => Promise<void>;
}

export interface CreateDaemonOptions {
  /** Override config (mainly for tests). Falls back to env. */
  readonly config?: Config;
  /** When true, do not call app.listen() — useful for inject-only tests. */
  readonly noListen?: boolean;
  /**
   * When true, skip workspace-lock acquisition. Tests that don't need lock
   * semantics use this to avoid colliding on shared workspace dirs.
   */
  readonly skipLock?: boolean;
  /**
   * When true, skip substrate (SQLite + blob store) initialization. Used
   * by inject-only tests that only need /health and the loopback guard.
   */
  readonly skipSubstrate?: boolean;
}

export async function createDaemon(opts: CreateDaemonOptions = {}): Promise<DaemonHandle> {
  const config = opts.config ?? loadConfig();
  const startedAt = Date.now();

  // Acquire the workspace lock BEFORE constructing the app. This is the
  // single-writer guarantee for the workspace. If another daemon or CLI
  // process already holds the lock, daemon startup fails fast with the
  // peer's identity in the error message.
  let lock: WorkspaceLockHandle | null = null;
  if (!opts.skipLock) {
    try {
      lock = await acquireWorkspaceLock(config.workspaceRoot, {
        actor: 'daemon',
        // 0 = single-attempt; the daemon doesn't queue.
        acquisitionTimeoutMs: 0,
      });
    } catch (err) {
      if (err instanceof WorkspaceLockedError) {
        throw err;
      }
      throw err;
    }
  } else {
    // Test affordance: a stub handle that does nothing.
    lock = {
      info: {
        actor: 'test',
        heartbeat_at: new Date(startedAt).toISOString(),
        hostname: 'test',
        lock_version: 1,
        owner_id: '00000000-0000-4000-8000-000000000000',
        pid: process.pid,
        started_at: new Date(startedAt).toISOString(),
      },
      lockPath: '',
      released: false,
      refresh: async () => undefined,
      release: async () => undefined,
    };
  }

  // Open the substrate (SQLite + blob store + audit chain mutex) once the
  // workspace lock is held. Done before route registration so workspace
  // mutations have a context to write through. If substrate open fails,
  // release the lock and propagate.
  let substrate: SubstrateHandle | null = null;
  if (!opts.skipSubstrate) {
    try {
      substrate = await openSubstrate(config.workspaceRoot);
    } catch (err) {
      await lock?.release().catch(() => undefined);
      throw err;
    }
  }

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
  // 3B.6.5: AI capability gate. No substrate needed — derived purely from
  // config flags (both default OFF). Always registered so the UI can
  // query it even before any AI affordance is enabled.
  registerAiRoutes(app, {
    flags: {
      extractionAssistEnabled: config.extractionAssistEnabled,
      llmValidatorEnabled: config.llmValidatorEnabled,
    },
  });
  if (substrate) {
    registerWorkspaceRoutes(app, {
      substrate,
      daemonWorkspaceRoot: config.workspaceRoot,
    });
    registerFactRoutes(app, { substrate });
    registerConversationRoutes(app, { substrate });
    registerExtractionRoutes(app, {
      substrate,
      flags: {
        extractionAssistEnabled: config.extractionAssistEnabled,
        llmValidatorEnabled: config.llmValidatorEnabled,
      },
    });
    registerAuditRoutes(app, { substrate });
  }

  let started = false;
  try {
    if (!opts.noListen) {
      await app.listen({ host: config.host, port: config.port });
    } else {
      await app.ready();
    }
    started = true;
  } finally {
    if (!started) {
      // Roll back substrate + lock if listen() / ready() failed.
      if (substrate) {
        try {
          substrate.close();
        } catch {
          /* swallow */
        }
      }
      if (lock) {
        await lock.release().catch(() => undefined);
      }
    }
  }

  return {
    app,
    port: config.port,
    boundHost: config.host,
    startedAt,
    workspaceRoot: config.workspaceRoot,
    lock,
    substrate,
    shutdown: async () => {
      // Close Fastify first (drains in-flight requests), then substrate,
      // then release the workspace lock so the next acquirer can proceed.
      await app.close();
      if (substrate) {
        try {
          substrate.close();
        } catch {
          /* swallow */
        }
      }
      await lock?.release();
    },
  };
}

async function main(): Promise<void> {
  const handle = await createDaemon();
  let shuttingDown = false;

  const shutdown = async (cause: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    handle.app.log.info({ cause }, 'shutting down');
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
  process.on('uncaughtException', (err) => {
    handle.app.log.error({ err }, 'uncaught exception — releasing lock');
    void shutdown('uncaughtException').finally(() => process.exit(1));
  });
  process.on('unhandledRejection', (reason) => {
    handle.app.log.error({ reason }, 'unhandled rejection — releasing lock');
    void shutdown('unhandledRejection').finally(() => process.exit(1));
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
