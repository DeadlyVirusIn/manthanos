// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.5 — AI-assisted extraction suggestion route (read-only).
//
//   POST /api/v1/workspaces/:id/conversations/:conversation_id/suggest-extractions
//
// Returns deterministic candidate facts for human review, wrapped in the
// house-convention `{ candidates }` envelope (the DEFECT-001 lesson). This
// route is READ-ONLY: it reads the conversation and existing facts, runs
// the pure assembly pipeline, and returns suggestions. It performs NO
// persistence, NO writes, NO audit events, NO mutation, NO LLM, NO
// capability checks, and NO feature flags. Approval/creation stays on the
// existing extract mutation (wired in a later phase).

import type { FastifyInstance } from 'fastify';
import { type AiCapabilityFlags, computeAiCapabilities } from '../services/ai/capabilities.js';
import { PROVIDER_NOT_CONFIGURED, type ProviderDetection } from '../services/ai/provider.js';
import { workspaceExists } from '../services/audit.js';
import { getConversation } from '../services/conversations.js';
import { assembleSuggestedCandidates } from '../services/extraction/suggest.js';
import type { ValidatorClient } from '../services/extraction/validator.js';
import type { ValidatorCache } from '../services/extraction/validatorCache.js';
import { isWorkspaceAllowedForCanary } from '../services/extraction/validatorCanary.js';
import {
  noLiveValidatorClient,
  validateCandidates,
} from '../services/extraction/validatorRunner.js';
import { listFacts } from '../services/facts.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
  /** AI feature flags. The LLM validator is gated on these. */
  readonly flags?: AiCapabilityFlags;
  /** Detected single provider (3B.8A). Default not-configured ⇒ gate off. */
  readonly provider?: ProviderDetection;
  /** Live validator client (3B.8D), present only when a provider is
   *  configured. Falls back to the no-op client otherwise. */
  readonly validatorClient?: ValidatorClient;
  /** Verdict cache (3B.8C), present only in the canary path. */
  readonly cache?: ValidatorCache;
  /** Canary workspace allow-list (3B.8E). Empty ⇒ validator off for all. */
  readonly canaryWorkspaces?: readonly string[];
}

/** Cap on existing facts compared for duplicate detection (advisory). */
const DUPLICATE_SCAN_LIMIT = 500;

export function registerExtractionRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.post<{ Params: { id: string; conversation_id: string } }>(
    '/api/v1/workspaces/:id/conversations/:conversation_id/suggest-extractions',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const conversation = getConversation(db, req.params.id, req.params.conversation_id);
      if (!conversation) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }

      // Read-only: head, non-tombstoned facts for advisory duplicate checks.
      const factsPage = listFacts(db, req.params.id, { limit: DUPLICATE_SCAN_LIMIT });
      const existingFacts = factsPage.facts;
      // 3B.6.5: surface when the scan did not cover the whole fact base so
      // the advisory "duplicate" result is honestly qualified.
      const duplicateScanTruncated = factsPage.total > DUPLICATE_SCAN_LIMIT;

      const result = assembleSuggestedCandidates({
        conversation,
        conversationId: conversation.id,
        existingFacts,
        createdAt: new Date().toISOString(),
        duplicateScanTruncated,
      });

      // Capability-gated LLM validation (3B.7). In deterministic 3B the
      // gate is OFF (no provider configured) so this returns the candidates
      // UNCHANGED and never touches a client — a true no-op. The branch
      // exists so the validator is wired behind an already-proven gate.
      const caps = computeAiCapabilities(rc.flags ?? {}, rc.provider ?? PROVIDER_NOT_CONFIGURED);
      const candidates = await validateCandidates(
        result.candidates,
        {
          quotes: conversation.verbatim_quotes.map((q) => q.text),
          summary: conversation.summary,
        },
        {
          // Canary gate: live validation requires the capability gate AND
          // the workspace being explicitly allow-listed (empty ⇒ off).
          enabled:
            caps.llm_validator_enabled &&
            isWorkspaceAllowedForCanary(req.params.id, rc.canaryWorkspaces ?? []),
          client: rc.validatorClient ?? noLiveValidatorClient,
          cache: rc.cache,
          model: caps.model ?? undefined,
        },
      );

      await reply.send({ candidates, truncation: result.truncation });
    },
  );
}
