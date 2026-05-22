// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Audit chain HTTP read endpoints.
//
//   GET /api/v1/workspaces/:id/audit         — paginated list with filters
//   GET /api/v1/workspaces/:id/audit/verify  — chain integrity check
//   GET /api/v1/workspaces/:id/audit/:seq    — single event with payload
//
// All read-only. No mutation. Fastify routes static segments
// (/audit/verify) ahead of parametric ones (/audit/:seq), so the verify
// endpoint is unambiguous regardless of registration order.

import type { FastifyInstance } from 'fastify';
import {
  AuditQueryError,
  getAuditEvent,
  listAuditEvents,
  verifyAuditChain,
  workspaceExists,
} from '../services/audit.js';
import type { SubstrateHandle } from '../services/substrate.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
}

interface ListQuery {
  before_seq?: string;
  limit?: string;
  event_type?: string;
  actor?: string;
  since?: string;
  until?: string;
}

function parseIntegerParam(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || String(n) !== value.trim()) {
    throw new AuditQueryError(field, `${field} must be an integer`);
  }
  return n;
}

export function registerAuditRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.get<{ Params: { id: string }; Querystring: ListQuery }>(
    '/api/v1/workspaces/:id/audit',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }

      const q = req.query ?? {};
      try {
        const beforeSeq = parseIntegerParam(q.before_seq, 'before_seq');
        const limit = parseIntegerParam(q.limit, 'limit');

        const result = listAuditEvents(db, req.params.id, {
          beforeSeq,
          limit,
          eventType: q.event_type,
          actor: q.actor,
          since: q.since,
          until: q.until,
        });
        await reply.send(result);
      } catch (err) {
        if (err instanceof AuditQueryError) {
          await reply
            .code(400)
            .send({ error: 'validation', field: err.field, details: err.message });
          return;
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/workspaces/:id/audit/verify', async (req, reply) => {
    const db = rc.substrate.db.handle;
    if (!workspaceExists(db, req.params.id)) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const result = verifyAuditChain(db, req.params.id);
    await reply.send(result);
  });

  app.get<{ Params: { id: string; seq: string } }>(
    '/api/v1/workspaces/:id/audit/:seq',
    async (req, reply) => {
      const db = rc.substrate.db.handle;
      if (!workspaceExists(db, req.params.id)) {
        await reply.code(404).send({ error: 'not_found' });
        return;
      }

      // Validate seq parameter.
      const seqRaw = req.params.seq;
      const seq = Number.parseInt(seqRaw, 10);
      if (!Number.isInteger(seq) || String(seq) !== seqRaw.trim() || seq < 1) {
        await reply.code(400).send({
          error: 'validation',
          field: 'seq',
          details: 'seq must be a positive integer',
        });
        return;
      }

      const event = await getAuditEvent(db, rc.substrate.blobs, req.params.id, seq);
      if (!event) {
        await reply.code(404).send({ error: 'not_found', details: `audit seq ${seq} not found` });
        return;
      }
      await reply.send(event);
    },
  );
}
