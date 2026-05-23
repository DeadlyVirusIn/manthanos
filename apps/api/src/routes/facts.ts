// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact API routes. Sprint 1 Task 5A.
//
//   POST   /api/v1/workspaces/:id/facts
//   GET    /api/v1/workspaces/:id/facts
//   GET    /api/v1/workspaces/:id/facts/:fact_id
//   PATCH  /api/v1/workspaces/:id/facts/:fact_id
//   POST   /api/v1/workspaces/:id/facts/:fact_id/promote
//   POST   /api/v1/workspaces/:id/facts/:fact_id/demote

import type { FastifyInstance } from 'fastify';
import { workspaceExists } from '../services/audit.js';
import {
  DuplicateFactError,
  FactNotFoundError,
  type FactTier,
  FactValidationError,
  InvalidFactLifecycleError,
  InvalidTierTransitionError,
  contestFact,
  createFact,
  demoteFact,
  getFact,
  getFactHistory,
  isFactTier,
  listFacts,
  promoteFact,
  reviseFact,
  tombstoneFact,
  uncontestFact,
  updateFact,
} from '../services/facts.js';
import { listProvenanceForFact } from '../services/provenance.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
}

interface PostFactBody {
  area?: unknown;
  statement?: unknown;
  tier?: unknown;
}

interface PatchFactBody {
  area?: unknown;
  statement?: unknown;
}

interface TransitionBody {
  target_tier?: unknown;
  note?: unknown;
  reason?: unknown;
}

interface ListQuery {
  tier?: string;
  area?: string;
  limit?: string;
  offset?: string;
  include_tombstoned?: string;
  include_superseded?: string;
  exclude_contested?: string;
}

function parseBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value === 'true' || value === '1';
}

function parseIntOrUndefined(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || String(n) !== value.trim() || n < 0) {
    throw new FactValidationError(field, `${field} must be a non-negative integer`);
  }
  return n;
}

export function registerFactRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.post<{ Params: { id: string }; Body: PostFactBody }>(
    '/api/v1/workspaces/:id/facts',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }

      const body = (req.body ?? {}) as PostFactBody;
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

      try {
        const { fact } = await createFact(rc.substrate.ctx, req.params.id, {
          area: body.area,
          statement: body.statement,
          tier: body.tier as FactTier | undefined,
        });
        await reply.code(201).send(fact);
      } catch (err) {
        if (err instanceof FactValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        if (err instanceof DuplicateFactError) {
          await reply.code(409).send({
            error: 'duplicate_fact',
            existing_fact_id: err.existingFactId,
            details: err.message,
          });
          return;
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: ListQuery }>(
    '/api/v1/workspaces/:id/facts',
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
        if (q.tier !== undefined && !isFactTier(q.tier)) {
          await reply.code(400).send({
            error: 'validation',
            field: 'tier',
            details: 'tier must be one of T-2, T-1, T0, T+1',
          });
          return;
        }
        const result = listFacts(db, req.params.id, {
          tier: q.tier as FactTier | undefined,
          area: q.area,
          limit,
          offset,
          includeTombstoned: parseBool(q.include_tombstoned),
          includeSuperseded: parseBool(q.include_superseded),
          excludeContested: parseBool(q.exclude_contested),
        });
        await reply.send(result);
      } catch (err) {
        if (err instanceof FactValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string; fact_id: string } }>(
    '/api/v1/workspaces/:id/facts/:fact_id',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const fact = getFact(db, req.params.id, req.params.fact_id);
      if (!fact) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      await reply.send(fact);
    },
  );

  app.patch<{ Params: { id: string; fact_id: string }; Body: PatchFactBody }>(
    '/api/v1/workspaces/:id/facts/:fact_id',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const body = (req.body ?? {}) as PatchFactBody;
      if (body.area !== undefined && typeof body.area !== 'string') {
        await reply
          .code(400)
          .send({ error: 'validation', field: 'area', details: 'area must be a string' });
        return;
      }
      if (body.statement !== undefined && typeof body.statement !== 'string') {
        await reply
          .code(400)
          .send({ error: 'validation', field: 'statement', details: 'statement must be a string' });
        return;
      }
      try {
        const { fact } = await updateFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
          area: body.area,
          statement: body.statement,
        });
        await reply.send(fact);
      } catch (err) {
        if (err instanceof FactNotFoundError) {
          await reply.code(404).send({ error: 'not_found' });
          return;
        }
        if (err instanceof FactValidationError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        if (err instanceof DuplicateFactError) {
          await reply.code(409).send({
            error: 'duplicate_fact',
            existing_fact_id: err.existingFactId,
            details: err.message,
          });
          return;
        }
        if (err instanceof InvalidFactLifecycleError) {
          await reply.code(409).send({
            error: 'invalid_lifecycle',
            state: err.state,
            fact_id: err.factId,
            details: err.message,
          });
          return;
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { id: string; fact_id: string };
    Body: TransitionBody;
  }>('/api/v1/workspaces/:id/facts/:fact_id/promote', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as TransitionBody;
    if (body.target_tier !== undefined && !isFactTier(body.target_tier)) {
      await reply.code(400).send({
        error: 'validation',
        field: 'target_tier',
        details: 'target_tier must be one of T-2, T-1, T0, T+1',
      });
      return;
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'note', details: 'note must be a string' });
      return;
    }
    try {
      const result = await promoteFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        targetTier: body.target_tier as FactTier | undefined,
        note: body.note as string | undefined,
      });
      await reply.send({
        fact: result.fact,
        from_tier: result.fromTier,
        to_tier: result.toTier,
      });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof InvalidTierTransitionError) {
        await reply.code(409).send({
          error: 'invalid_tier_transition',
          from: err.from,
          to: err.to,
          direction: err.direction,
          details: err.message,
        });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  app.post<{
    Params: { id: string; fact_id: string };
    Body: TransitionBody;
  }>('/api/v1/workspaces/:id/facts/:fact_id/demote', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as TransitionBody;
    if (body.target_tier !== undefined && !isFactTier(body.target_tier)) {
      await reply.code(400).send({
        error: 'validation',
        field: 'target_tier',
        details: 'target_tier must be one of T-2, T-1, T0, T+1',
      });
      return;
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'reason', details: 'reason must be a string' });
      return;
    }
    try {
      const result = await demoteFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        targetTier: body.target_tier as FactTier | undefined,
        reason: body.reason as string | undefined,
      });
      await reply.send({
        fact: result.fact,
        from_tier: result.fromTier,
        to_tier: result.toTier,
      });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof InvalidTierTransitionError) {
        await reply.code(409).send({
          error: 'invalid_tier_transition',
          from: err.from,
          to: err.to,
          direction: err.direction,
          details: err.message,
        });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // ────────── Task 5B ──────────
  // POST .../revise — create a successor fact version
  app.post<{
    Params: { id: string; fact_id: string };
    Body: { area?: unknown; statement?: unknown; note?: unknown };
  }>('/api/v1/workspaces/:id/facts/:fact_id/revise', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as { area?: unknown; statement?: unknown; note?: unknown };
    if (body.area !== undefined && typeof body.area !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'area', details: 'area must be a string' });
      return;
    }
    if (body.statement !== undefined && typeof body.statement !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'statement', details: 'statement must be a string' });
      return;
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'note', details: 'note must be a string' });
      return;
    }
    if (body.area === undefined && body.statement === undefined) {
      await reply.code(400).send({
        error: 'validation',
        field: 'body',
        details: 'revise requires at least area or statement',
      });
      return;
    }

    try {
      const result = await reviseFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        area: body.area as string | undefined,
        statement: body.statement as string | undefined,
        note: body.note as string | undefined,
      });
      await reply.code(201).send({
        fact: result.fact,
        previous_fact_id: result.previousFactId,
        version_chain_root_id: result.versionChainRootId,
      });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof DuplicateFactError) {
        await reply.code(409).send({
          error: 'duplicate_fact',
          existing_fact_id: err.existingFactId,
          details: err.message,
        });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // GET .../history — walk the version chain root → head
  app.get<{ Params: { id: string; fact_id: string } }>(
    '/api/v1/workspaces/:id/facts/:fact_id/history',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const history = getFactHistory(db, req.params.id, req.params.fact_id);
      if (!history) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      await reply.send(history);
    },
  );

  // POST .../contest — flag a fact as disputed
  app.post<{
    Params: { id: string; fact_id: string };
    Body: { reason?: unknown };
  }>('/api/v1/workspaces/:id/facts/:fact_id/contest', async (req, reply) => {
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
      const result = await contestFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        reason: body.reason,
      });
      await reply.send({ fact: result.fact });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // POST .../tombstone — permanently retire a fact (terminal state)
  app.post<{
    Params: { id: string; fact_id: string };
    Body: { reason?: unknown; allow_superseded?: unknown };
  }>('/api/v1/workspaces/:id/facts/:fact_id/tombstone', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as { reason?: unknown; allow_superseded?: unknown };
    if (typeof body.reason !== 'string') {
      await reply
        .code(400)
        .send({ error: 'validation', field: 'reason', details: 'reason must be a string' });
      return;
    }
    if (body.allow_superseded !== undefined && typeof body.allow_superseded !== 'boolean') {
      await reply.code(400).send({
        error: 'validation',
        field: 'allow_superseded',
        details: 'allow_superseded must be a boolean',
      });
      return;
    }
    try {
      const result = await tombstoneFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        reason: body.reason,
        allowSuperseded: body.allow_superseded === true,
      });
      await reply.send({ fact: result.fact });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // POST .../uncontest — clear the contested flag
  app.post<{
    Params: { id: string; fact_id: string };
    Body: { resolution?: unknown };
  }>('/api/v1/workspaces/:id/facts/:fact_id/uncontest', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const body = (req.body ?? {}) as { resolution?: unknown };
    if (typeof body.resolution !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'resolution',
        details: 'resolution must be a string',
      });
      return;
    }
    try {
      const result = await uncontestFact(rc.substrate.ctx, req.params.id, req.params.fact_id, {
        resolution: body.resolution,
      });
      await reply.send({ fact: result.fact });
    } catch (err) {
      if (err instanceof FactNotFoundError) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      if (err instanceof FactValidationError) {
        await reply.code(400).send({ error: 'validation', field: err.field, details: err.message });
        return;
      }
      if (err instanceof InvalidFactLifecycleError) {
        await reply.code(409).send({
          error: 'invalid_lifecycle',
          state: err.state,
          fact_id: err.factId,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // GET .../facts/:fact_id/provenance — list every provenance source
  // attached to this fact (quote- or conversation-level), including
  // degraded ones (degraded_at + degraded_reason populated).
  app.get<{ Params: { id: string; fact_id: string } }>(
    '/api/v1/workspaces/:id/facts/:fact_id/provenance',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const fact = getFact(db, req.params.id, req.params.fact_id);
      if (!fact) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }
      const provenance = listProvenanceForFact(db, req.params.id, req.params.fact_id);
      await reply.send({
        fact_id: req.params.fact_id,
        provenance,
        total: provenance.length,
      });
    },
  );
}
