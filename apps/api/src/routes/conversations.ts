// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation API routes. Sprint 1 Task 6A.
//
//   POST /api/v1/workspaces/:id/conversations
//   GET  /api/v1/workspaces/:id/conversations
//   GET  /api/v1/workspaces/:id/conversations/:conversation_id

import type { FastifyInstance } from 'fastify';
import { workspaceExists } from '../services/audit.js';
import {
  type AudienceFit,
  type ConversationOutcome,
  type ConversationType,
  ConversationValidationError,
  createConversation,
  getConversation,
  isAudienceFit,
  isConversationOutcome,
  isConversationType,
  listConversations,
} from '../services/conversations.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
}

interface PostConversationBody {
  person_name?: unknown;
  occurred_at?: unknown;
  audience_fit?: unknown;
  conversation_type?: unknown;
  outcome?: unknown;
  summary?: unknown;
  verbatim_quotes?: unknown;
}

interface ListQuery {
  audience_fit?: string;
  conversation_type?: string;
  outcome?: string;
  limit?: string;
  offset?: string;
}

function parseIntOrUndefined(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || String(n) !== value.trim() || n < 0) {
    throw new ConversationValidationError(field, `${field} must be a non-negative integer`);
  }
  return n;
}

export function registerConversationRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.post<{ Params: { id: string }; Body: PostConversationBody }>(
    '/api/v1/workspaces/:id/conversations',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }

      const body = (req.body ?? {}) as PostConversationBody;

      // Surface-level type checks on optional fields so the service
      // layer can assume their narrowed shape.
      if (body.summary !== undefined && body.summary !== null && typeof body.summary !== 'string') {
        await reply.code(400).send({
          error: 'validation',
          field: 'summary',
          details: 'summary must be a string when provided',
        });
        return;
      }
      if (
        body.verbatim_quotes !== undefined &&
        body.verbatim_quotes !== null &&
        !Array.isArray(body.verbatim_quotes)
      ) {
        await reply.code(400).send({
          error: 'validation',
          field: 'verbatim_quotes',
          details: 'verbatim_quotes must be an array',
        });
        return;
      }

      try {
        const { conversation } = await createConversation(rc.substrate.ctx, req.params.id, {
          person_name: body.person_name as string,
          occurred_at: body.occurred_at as string,
          audience_fit: body.audience_fit as AudienceFit,
          conversation_type: body.conversation_type as ConversationType,
          outcome: body.outcome as ConversationOutcome,
          summary: (body.summary ?? undefined) as string | undefined,
          verbatim_quotes: (body.verbatim_quotes ?? undefined) as
            | ReadonlyArray<{ text: string }>
            | undefined,
        });
        await reply.code(201).send(conversation);
      } catch (err) {
        if (err instanceof ConversationValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: ListQuery }>(
    '/api/v1/workspaces/:id/conversations',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const q = req.query ?? {};
      try {
        const limit = parseIntOrUndefined(q.limit, 'limit');
        const offset = parseIntOrUndefined(q.offset, 'offset');

        if (q.audience_fit !== undefined && !isAudienceFit(q.audience_fit)) {
          await reply.code(400).send({
            error: 'validation',
            field: 'audience_fit',
            details: 'audience_fit must be one of target, adjacent, outside, unknown',
          });
          return;
        }
        if (q.conversation_type !== undefined && !isConversationType(q.conversation_type)) {
          await reply.code(400).send({
            error: 'validation',
            field: 'conversation_type',
            details:
              'conversation_type must be one of discovery, validation, sales, support, other',
          });
          return;
        }
        if (q.outcome !== undefined && !isConversationOutcome(q.outcome)) {
          await reply.code(400).send({
            error: 'validation',
            field: 'outcome',
            details: 'outcome must be one of validated, invalidated, inconclusive, follow_up',
          });
          return;
        }

        const result = listConversations(db, req.params.id, {
          audienceFit: q.audience_fit as AudienceFit | undefined,
          conversationType: q.conversation_type as ConversationType | undefined,
          outcome: q.outcome as ConversationOutcome | undefined,
          limit,
          offset,
        });
        await reply.send(result);
      } catch (err) {
        if (err instanceof ConversationValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string; conversation_id: string } }>(
    '/api/v1/workspaces/:id/conversations/:conversation_id',
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
      await reply.send(conversation);
    },
  );
}
