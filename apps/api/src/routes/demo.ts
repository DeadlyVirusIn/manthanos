// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Demo workspace routes — C4.4-E1.
//
//   POST /api/v1/demo/seed    seed the demo workspace (fresh)
//   POST /api/v1/demo/reset   purge the demo workspace (guarded) + re-seed
//
// Loopback-only: the global loopback guard (registerLoopbackGuard) already
// rejects any non-loopback Host, and the daemon binds 127.0.0.1, so these
// mutating routes are reachable only from the local machine. All content is
// created through audited writes in the seed engine; the only raw SQL is the
// guarded, demo-scoped purge in resetDemo.

import type { FastifyInstance } from 'fastify';
import { DemoIsolationError, resetDemo } from '../services/demo/resetDemo.js';
import { type SeedDemoResult, seedDemo } from '../services/demo/seedDemo.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
  readonly daemonWorkspaceRoot: string;
}

function toEnvelope(result: SeedDemoResult): {
  demo: { workspace_id: string; conversation_count: number; fact_count: number };
} {
  return {
    demo: {
      workspace_id: result.demoWorkspaceId,
      conversation_count: result.conversationCount,
      fact_count: result.factCount,
    },
  };
}

export function registerDemoRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.post('/api/v1/demo/seed', async (_req, reply) => {
    const result = await seedDemo(rc.substrate, rc.daemonWorkspaceRoot);
    await reply.code(201).send(toEnvelope(result));
  });

  app.post('/api/v1/demo/reset', async (_req, reply) => {
    try {
      const result = await resetDemo(rc.substrate, rc.daemonWorkspaceRoot);
      await reply.code(200).send(toEnvelope(result));
    } catch (err) {
      if (err instanceof DemoIsolationError) {
        // The reset target failed the isolation guard — refuse rather than
        // risk deleting non-demo data.
        await reply.code(409).send({ error: 'demo_isolation', details: err.message });
        return;
      }
      throw err;
    }
  });
}
