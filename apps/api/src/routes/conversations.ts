// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation API routes. Sprint 1 Task 6A + Sprint 2 M1.
//
//   POST   /api/v1/workspaces/:id/conversations
//   GET    /api/v1/workspaces/:id/conversations
//   GET    /api/v1/workspaces/:id/conversations/:conversation_id
//   PATCH  /api/v1/workspaces/:id/conversations/:conversation_id            (M1 C1.1)
//   POST   /api/v1/workspaces/:id/conversations/:conversation_id/tombstone
//   POST   /api/v1/workspaces/:id/conversations/:conversation_id/skip-extraction (M1 C1.2)
//   POST   /api/v1/workspaces/:id/conversations/:conversation_id/extract
//   GET    /api/v1/workspaces/:id/conversations/:conversation_id/facts
//   GET    /api/v1/workspaces/:id/conversations/:conversation_id/export     (M1 C1.5)

import type { FastifyInstance } from 'fastify';
import type { ProviderDetection } from '../services/ai/provider.js';
import { workspaceExists } from '../services/audit.js';
import {
  type AudienceFit,
  ConversationLifecycleError,
  ConversationNotFoundError,
  type ConversationOutcome,
  type ConversationType,
  ConversationValidationError,
  type FactExtractionStatus,
  createConversation,
  extractFactFromConversation,
  getConversation,
  isAudienceFit,
  isConversationOutcome,
  isConversationType,
  isFactExtractionStatus,
  listConversations,
  skipConversationExtraction,
  tombstoneConversation,
  updateConversation,
} from '../services/conversations.js';
import { exportConversationMarkdown } from '../services/export.js';
import {
  type FactTier,
  FactValidationError,
  isFactTier,
  listFactsByConversation,
} from '../services/facts.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
  /** Detected single provider (3B.8). Supplies the model id stamped onto an
   *  approved LLM-validated candidate's provenance. Never the API key. */
  readonly provider?: ProviderDetection;
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

/** Fields that PATCH /api/v1/workspaces/:id/conversations/:cid accepts.
 *  Any other key in the body returns 400 — substrate-managed fields
 *  (tombstoned_at, fact_extraction_status, last_extracted_at, audit_seq,
 *  id, workspace_id, created_at) and child-table fields (verbatim_quotes)
 *  are deliberately rejected rather than silently ignored. */
const PATCH_CONVERSATION_ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  'person_name',
  'occurred_at',
  'audience_fit',
  'conversation_type',
  'outcome',
  'summary',
]);

interface ListQuery {
  audience_fit?: string;
  conversation_type?: string;
  outcome?: string;
  limit?: string;
  offset?: string;
  include_tombstoned?: string;
  fact_extraction_status?: string;
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
        if (
          q.fact_extraction_status !== undefined &&
          !isFactExtractionStatus(q.fact_extraction_status)
        ) {
          await reply.code(400).send({
            error: 'validation',
            field: 'fact_extraction_status',
            details: 'fact_extraction_status must be one of pending, extracted, skipped',
          });
          return;
        }

        const result = listConversations(db, req.params.id, {
          audienceFit: q.audience_fit as AudienceFit | undefined,
          conversationType: q.conversation_type as ConversationType | undefined,
          outcome: q.outcome as ConversationOutcome | undefined,
          factExtractionStatus: q.fact_extraction_status as FactExtractionStatus | undefined,
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

  // PATCH .../conversations/:cid — edit conversation metadata (M1 C1.1).
  // Editable fields are restricted to the PATCH_CONVERSATION_ALLOWED_FIELDS
  // set; any other key in the body returns 400 with field='body'.
  app.patch<{
    Params: { id: string; conversation_id: string };
    Body: Record<string, unknown>;
  }>('/api/v1/workspaces/:id/conversations/:conversation_id', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Reject unknown fields up-front (per Sprint 2 M1 decision: do not
    // silently ignore — surface the typo so the caller can fix it).
    for (const key of Object.keys(body)) {
      if (!PATCH_CONVERSATION_ALLOWED_FIELDS.has(key)) {
        await reply.code(400).send({
          error: 'validation',
          field: 'body',
          details: `unknown field: ${key}`,
        });
        return;
      }
    }

    // Surface-level type checks so the service layer can assume narrowed
    // shapes. Deeper validation (non-empty, enum values, ISO parseability)
    // lives in updateConversation itself.
    if (body.person_name !== undefined && typeof body.person_name !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'person_name',
        details: 'person_name must be a string',
      });
      return;
    }
    if (body.occurred_at !== undefined && typeof body.occurred_at !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'occurred_at',
        details: 'occurred_at must be a string',
      });
      return;
    }
    if (body.audience_fit !== undefined && typeof body.audience_fit !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'audience_fit',
        details: 'audience_fit must be a string',
      });
      return;
    }
    if (body.conversation_type !== undefined && typeof body.conversation_type !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'conversation_type',
        details: 'conversation_type must be a string',
      });
      return;
    }
    if (body.outcome !== undefined && typeof body.outcome !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'outcome',
        details: 'outcome must be a string',
      });
      return;
    }
    if (body.summary !== undefined && body.summary !== null && typeof body.summary !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'summary',
        details: 'summary must be a string or null',
      });
      return;
    }

    try {
      const result = await updateConversation(
        rc.substrate.ctx,
        req.params.id,
        req.params.conversation_id,
        {
          person_name: body.person_name as string | undefined,
          occurred_at: body.occurred_at as string | undefined,
          audience_fit: body.audience_fit as AudienceFit | undefined,
          conversation_type: body.conversation_type as ConversationType | undefined,
          outcome: body.outcome as ConversationOutcome | undefined,
          summary: body.summary as string | null | undefined,
        },
      );
      await reply.send(result.conversation);
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

  // POST .../skip-extraction — mark this conversation as not useful for
  // fact extraction (M1 C1.2). Status transitions pending → skipped or
  // extracted → skipped; a subsequent extract call restores it to
  // extracted via the existing extract path. See
  // services/conversations.ts:skipConversationExtraction.
  app.post<{
    Params: { id: string; conversation_id: string };
    Body: { reason?: unknown };
  }>(
    '/api/v1/workspaces/:id/conversations/:conversation_id/skip-extraction',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const body = (req.body ?? {}) as { reason?: unknown };
      if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
        await reply.code(400).send({
          error: 'validation',
          field: 'reason',
          details: 'reason must be a string when provided',
        });
        return;
      }
      try {
        const result = await skipConversationExtraction(
          rc.substrate.ctx,
          req.params.id,
          req.params.conversation_id,
          { reason: (body.reason ?? undefined) as string | undefined },
        );
        await reply.send({
          conversation: result.conversation,
          previous_status: result.previous_status,
        });
      } catch (err) {
        if (err instanceof ConversationNotFoundError) {
          await reply.code(404).send({ error: 'not_found' });
          return;
        }
        if (err instanceof ConversationValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
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
    },
  );

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
      // 3B.6.5: optional extraction metadata from an approved suggestion.
      extraction_confidence?: unknown;
      extractor_version?: unknown;
      reason_flags?: unknown;
      // 3B.8 follow-up 2: signals the candidate was LLM-validated. model_used
      // is NEVER read from the body — it is stamped from server config below.
      validated_by_llm?: unknown;
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
    // 3B.6.5 metadata validation (all optional). The service clamps the
    // score, drops unknown reason flags, and caps the version string;
    // here we only reject wrong-typed fields. `model_used` is NOT read
    // from the request — it stays NULL in deterministic 3B.
    if (
      body.extraction_confidence !== undefined &&
      typeof body.extraction_confidence !== 'number'
    ) {
      await reply.code(400).send({
        error: 'validation',
        field: 'extraction_confidence',
        details: 'extraction_confidence must be a number when provided',
      });
      return;
    }
    if (body.extractor_version !== undefined && typeof body.extractor_version !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'extractor_version',
        details: 'extractor_version must be a string when provided',
      });
      return;
    }
    if (body.reason_flags !== undefined && !Array.isArray(body.reason_flags)) {
      await reply.code(400).send({
        error: 'validation',
        field: 'reason_flags',
        details: 'reason_flags must be an array when provided',
      });
      return;
    }
    // 3B.8 follow-up 2: stamp model_used from OUR server-configured provider
    // when the approval indicates an LLM-validated candidate. model_used is
    // never taken from the request body or from model output; if no provider
    // is configured (or the candidate wasn't validated) it stays NULL.
    const modelUsed =
      body.validated_by_llm === true && rc.provider?.configured === true
        ? rc.provider.model
        : undefined;
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
          extraction_confidence: body.extraction_confidence as number | undefined,
          extractor_version: body.extractor_version as string | undefined,
          reason_flags: body.reason_flags as readonly string[] | undefined,
          model_used: modelUsed,
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

  // GET .../export — Markdown export of a single conversation (M1 C1.5).
  // Renders person, timestamps, tags, summary, quotes (in position
  // order), and facts pulled from this conversation. Tombstoned
  // conversations export with sentinel content (`[tombstoned]`) for
  // all PII fields. Deterministic output: same workspace state →
  // byte-identical Markdown.
  app.get<{
    Params: { id: string; conversation_id: string };
    Querystring: { format?: string };
  }>('/api/v1/workspaces/:id/conversations/:conversation_id/export', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const format = req.query?.format ?? 'markdown';
    if (format !== 'markdown') {
      await reply.code(400).send({
        error: 'validation',
        field: 'format',
        details: 'format must be "markdown"',
      });
      return;
    }
    const markdown = exportConversationMarkdown(db, req.params.id, req.params.conversation_id);
    if (markdown === null) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    await reply.header('Content-Type', 'text/markdown; charset=utf-8').send(markdown);
  });
}
