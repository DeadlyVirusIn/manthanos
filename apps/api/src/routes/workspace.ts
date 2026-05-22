// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace API routes.
//
//   POST   /api/v1/workspaces          create
//   GET    /api/v1/workspaces          list (optional ?status filter)
//   GET    /api/v1/workspaces/:id      fetch single
//   PATCH  /api/v1/workspaces/:id      rename / change status
//
// Every mutation flows through @manthanos/memory's auditedWrite via
// the workspace service. The daemon's workspace lock (acquired in
// createDaemon) ensures no other process can write to the substrate
// concurrently, so these routes are safe within the daemon's window.

import type { FastifyInstance } from 'fastify';
import type { SubstrateHandle } from '../services/substrate.js';
import {
  InvalidStatusTransitionError,
  WorkspaceNotFoundError,
  type WorkspaceStatus,
  WorkspaceValidationError,
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../services/workspace.js';

interface RouteContext {
  readonly substrate: SubstrateHandle;
  readonly daemonWorkspaceRoot: string;
}

interface PostBody {
  name?: unknown;
  idea_text?: unknown;
}

interface PatchBody {
  name?: unknown;
  status?: unknown;
  status_reason?: unknown;
}

const VALID_STATUSES: readonly WorkspaceStatus[] = ['active', 'paused', 'killed'];

function isWorkspaceStatus(v: unknown): v is WorkspaceStatus {
  return typeof v === 'string' && (VALID_STATUSES as readonly string[]).includes(v);
}

export function registerWorkspaceRoutes(app: FastifyInstance, rc: RouteContext): void {
  app.post<{ Body: PostBody }>('/api/v1/workspaces', async (req, reply) => {
    const body = (req.body ?? {}) as PostBody;
    if (typeof body.name !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'name',
        details: 'name must be a string',
      });
      return;
    }
    if (body.idea_text !== undefined && typeof body.idea_text !== 'string') {
      await reply.code(400).send({
        error: 'validation',
        field: 'idea_text',
        details: 'idea_text must be a string when provided',
      });
      return;
    }

    try {
      const { workspace } = await createWorkspace(rc.substrate.ctx, {
        name: body.name,
        daemonWorkspaceRoot: rc.daemonWorkspaceRoot,
        ideaText: body.idea_text,
      });
      await reply.code(201).send(workspace);
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        await reply.code(400).send({
          error: 'validation',
          field: err.field,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  app.get<{ Querystring: { status?: string } }>('/api/v1/workspaces', async (req, reply) => {
    const statusQuery = req.query?.status;
    if (statusQuery !== undefined && !isWorkspaceStatus(statusQuery)) {
      await reply.code(400).send({
        error: 'validation',
        field: 'status',
        details: `status must be one of ${VALID_STATUSES.join(', ')}`,
      });
      return;
    }
    const workspaces = listWorkspaces(rc.substrate.db.handle, {
      status: statusQuery as WorkspaceStatus | undefined,
    });
    await reply.send(workspaces);
  });

  app.get<{ Params: { id: string } }>('/api/v1/workspaces/:id', async (req, reply) => {
    const ws = getWorkspace(rc.substrate.db.handle, req.params.id);
    if (!ws) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    await reply.send(ws);
  });

  app.patch<{ Params: { id: string }; Body: PatchBody }>(
    '/api/v1/workspaces/:id',
    async (req, reply) => {
      const body = (req.body ?? {}) as PatchBody;
      if (body.name !== undefined && typeof body.name !== 'string') {
        await reply
          .code(400)
          .send({ error: 'validation', field: 'name', details: 'name must be a string' });
        return;
      }
      if (body.status !== undefined && !isWorkspaceStatus(body.status)) {
        await reply.code(400).send({
          error: 'validation',
          field: 'status',
          details: `status must be one of ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }
      if (body.status_reason !== undefined && typeof body.status_reason !== 'string') {
        await reply.code(400).send({
          error: 'validation',
          field: 'status_reason',
          details: 'status_reason must be a string',
        });
        return;
      }

      try {
        const { workspace } = await updateWorkspace(rc.substrate.ctx, req.params.id, {
          name: body.name as string | undefined,
          status: body.status as WorkspaceStatus | undefined,
          status_reason: body.status_reason as string | undefined,
        });
        await reply.send(workspace);
      } catch (err) {
        if (err instanceof WorkspaceNotFoundError) {
          await reply.code(404).send({ error: 'not_found' });
          return;
        }
        if (err instanceof WorkspaceValidationError) {
          await reply.code(400).send({
            error: 'validation',
            field: err.field,
            details: err.message,
          });
          return;
        }
        if (err instanceof InvalidStatusTransitionError) {
          await reply.code(409).send({
            error: 'invalid_status_transition',
            from: err.from,
            to: err.to,
            details: err.message,
          });
          return;
        }
        throw err;
      }
    },
  );
}
