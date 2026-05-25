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
import { workspaceExists } from '../services/audit.js';
import { type AiCapabilityFlags, computeAiCapabilities } from '../services/ai/capabilities.js';
import { getConversation } from '../services/conversations.js';
import { assembleSuggestedCandidates } from '../services/extraction/suggest.js';
import {
  noLiveValidatorClient,
  validateCandidates,
} from '../services/extraction/validatorRunner.js';
import { listFacts } from '../services/facts.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
  /** AI feature flags. The LLM validator is gated on these; in 3B the
   *  provider is never configured so the validator stays a no-op. */
  readonly flags?: AiCapabilityFlags;
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
      const caps = computeAiCapabilities(rc.flags ?? {});
      const candidates = await validateCandidates(
        result.candidates,
        {
          quotes: conversation.verbatim_quotes.map((q) => q.text),
          summary: conversation.summary,
        },
        { enabled: caps.llm_validator_enabled, client: noLiveValidatorClient },
      );

      await reply.send({ candidates, truncation: result.truncation });
    },
  );
}
