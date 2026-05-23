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
  ConversationLifecycleError,
  ConversationNotFoundError,
  type ConversationOutcome,
  type ConversationType,
  ConversationValidationError,
  createConversation,
  extractFactFromConversation,
  getConversation,
  isAudienceFit,
  isConversationOutcome,
  isConversationType,
  listConversations,
  tombstoneConversation,
} from '../services/conversations.js';
import {
  type FactTier,
  FactValidationError,
  isFactTier,
  listFactsByConversation,
} from '../services/facts.js';
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
  include_tombstoned?: string;
}

function parseIntOrUndefined(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || String(n) !== value.trim() || n < 0) {
    throw new ConversationValidationError(field, `${field} must be a non-negative integer`);
  }
  return n;
}

function parseBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value === 'true' || value === '1';
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
          includeTombstoned: parseBool(q.include_tombstoned),
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

  // POST .../tombstone — permanently retire a conversation (Task 6B).
  app.post<{
    Params: { id: string; conversation_id: string };
    Body: { reason?: unknown };
  }>('/api/v1/workspaces/:id/conversations/:conversation_id/tombstone', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as { reason?: unknown };
    if (typeof body.reason !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'reason', details: 'reason must be a string' });
      return;
    }
    try {
      const result = await tombstoneConversation(
        rc.substrate.ctx,
        req.params.id,
        req.params.conversation_id,
        { reason: body.reason },
      );
      await reply.send({
        conversation: result.conversation,
        affected_quote_count: result.affected_quote_count,
        affected_provenance_count: result.affected_provenance_count,
        affected_fact_ids_sample: result.affected_fact_ids_sample,
      });
    } catch (err) {
      if (err instanceof ConversationNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof ConversationValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof ConversationLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          conversation_id: err.conversationId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // POST .../extract — extract a fact from this conversation. Creates a
  // new fact when the content is novel; corroborates an existing one
  // when the (area, statement) hash already lives in the workspace.
  app.post<{
    Params: { id: string; conversation_id: string };
    Body: { area?: unknown; statement?: unknown; tier?: unknown; quote_id?: unknown };
  }>('/api/v1/workspaces/:id/conversations/:conversation_id/extract', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as {
      area?: unknown;
      statement?: unknown;
      tier?: unknown;
      quote_id?: unknown;
    };
    if (typeof body.area !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'area', details: 'area must be a string' });
      return;
    }
    if (typeof body.statement !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'statement', details: 'statement must be a string' });
      return;
    }
    if (body.tier !== undefined && !isFactTier(body.tier)) {
      await reply.code(400).send({
        error: 'validation',
        field: 'tier',
        details: 'tier must be one of T-2, T-1, T0, T+1',
      });
      return;
    }
    if (
      body.quote_id !== undefined &&
      body.quote_id !== null &&
      typeof body.quote_id !== 'string'
    ) {
      await reply.code(400).send({
        error: 'validation',
        field: 'quote_id',
        details: 'quote_id must be a string when provided',
      });
      return;
    }
    try {
      const result = await extractFactFromConversation(
        rc.substrate.ctx,
        req.params.id,
        req.params.conversation_id,
        {
          area: body.area,
          statement: body.statement,
          tier: body.tier as FactTier | undefined,
          quote_id: (body.quote_id ?? undefined) as string | undefined,
        },
      );
      // 201 when a new fact was minted; 200 when an existing fact was
      // corroborated (only a provenance row was created).
      await reply.code(result.was_created ? 201 : 200).send({
        fact: result.fact,
        was_created: result.was_created,
      });
    } catch (err) {
      if (err instanceof ConversationNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof ConversationValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof ConversationLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          conversation_id: err.conversationId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // GET .../facts — list facts that have at least one provenance row
  // pointing at this conversation (quote-level or conversation-level).
  app.get<{ Params: { id: string; conversation_id: string } }>(
    '/api/v1/workspaces/:id/conversations/:conversation_id/facts',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      // Confirm the conversation itself exists; otherwise 404 even
      // though listFactsByConversation would return an empty list.
      const conversation = getConversation(db, req.params.id, req.params.conversation_id);
      if (!conversation) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const result = listFactsByConversation(db, req.params.id, req.params.conversation_id);
      await reply.send({
        conversation_id: req.params.conversation_id,
        facts: result.facts,
        total: result.total,
      });
    },
  );
}
