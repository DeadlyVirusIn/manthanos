// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// /health endpoint. Reports daemon liveness + identity.
//
// Verbs other than GET return 405 Method Not Allowed with an
// Allow header per RFC 7231.

import type { FastifyInstance } from 'fastify';

export interface HealthContext {
  readonly startedAt: number;
  readonly version: string;
  readonly boundHost: string;
  readonly port: number;
}

export interface HealthResponse {
  readonly ok: true;
  readonly version: string;
  readonly uptime_ms: number;
  readonly bound_host: string;
  readonly port: number;
}

const NON_GET_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

export function registerHealth(app: FastifyInstance, ctx: HealthContext): void {
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      ok: true,
      version: ctx.version,
      uptime_ms: Date.now() - ctx.startedAt,
      bound_host: ctx.boundHost,
      port: ctx.port,
    };
  });

  // Explicit 405 for the same path on non-GET verbs. Fastify's
  // default is 404 when method doesn't match, which is technically
  // incorrect: the path exists; only the verb is unsupported.
  for (const method of NON_GET_METHODS) {
    app.route({
      method,
      url: '/health',
      handler: async (_req, reply) => {
        await reply
          .code(405)
          .header('Allow', 'GET')
          .send({ error: 'method_not_allowed', allowed: 'GET' });
      },
    });
  }
}
