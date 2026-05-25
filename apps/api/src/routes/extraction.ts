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
import { getConversation } from '../services/conversations.js';
import { assembleSuggestedCandidates } from '../services/extraction/suggest.js';
import { listFacts } from '../services/facts.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
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
      const existingFacts = listFacts(db, req.params.id, { limit: DUPLICATE_SCAN_LIMIT }).facts;

      const result = assembleSuggestedCandidates({
        conversation,
        conversationId: conversation.id,
        existingFacts,
        createdAt: new Date().toISOString(),
      });
      await reply.send(result);
    },
  );
}
