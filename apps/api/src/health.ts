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

// Canonical health path + the /api-prefixed alias. The web app's readiness
// probe runs in the browser, where the Vite dev proxy forwards ONLY /api/*
// to the daemon; a bare /health request hits the Vite server (SPA fallback)
// and gives a false-positive. Serving the same liveness at /api/v1/health
// lets the browser probe actually reach the daemon (C1 fix).
const HEALTH_PATHS = ['/health', '/api/v1/health'] as const;

export function registerHealth(app: FastifyInstance, ctx: HealthContext): void {
  const buildResponse = (): HealthResponse => ({
    ok: true,
    version: ctx.version,
    uptime_ms: Date.now() - ctx.startedAt,
    bound_host: ctx.boundHost,
    port: ctx.port,
  });

  for (const url of HEALTH_PATHS) {
    app.get(url, async (): Promise<HealthResponse> => buildResponse());
  }

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
