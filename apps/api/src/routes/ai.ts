// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — AI capability route (read-only, no LLM).
//
//   GET /api/v1/ai/capabilities
//
// Returns the daemon's current AI affordances derived purely from config
// feature flags (see services/ai/capabilities.ts). No substrate, no DB,
// no provider, no LLM call. The UI uses this to gate the "Suggest facts"
// affordance and degrades safely (hides it) when the call fails.

import type { FastifyInstance } from 'fastify';
import { type AiCapabilityFlags, computeAiCapabilities } from '../services/ai/capabilities.js';

interface RouteContext {
  readonly flags: AiCapabilityFlags;
}

export function registerAiRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.get('/api/v1/ai/capabilities', async (_req, reply) => {
    await reply.send(computeAiCapabilities(rc.flags));
  });
}
