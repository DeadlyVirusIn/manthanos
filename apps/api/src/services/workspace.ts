// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace service. Every mutation flows through @manthanos/memory's
// auditedWrite() so the audit chain captures it; the daemon's
// workspace lock ensures no other process writes to the same substrate
// concurrently.

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  type AuditedWriteContext,
  type AuditedWriteResult,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import { AUDIT_DECISION_HUMAN_APPROVED } from '@manthanos/safety';

export type WorkspaceStatus = 'active' | 'paused' | 'killed';

export interface WorkspaceRow {
  readonly id: string;
  readonly name: string | null;
  readonly root_path: string;
  readonly status: WorkspaceStatus;
  readonly status_changed_at: string | null;
  readonly status_reason: string | null;
  readonly stage_at_open: string | null;
  readonly portfolio_mode_enabled: number;
  readonly discovery_archive_ref: string | null;
  readonly schema_version: number;
  readonly audit_chain_seq_high: number;
  readonly created_at: string;
}

export interface WorkspaceView {
  readonly id: string;
  readonly name: string | null;
  readonly root_path: string;
  readonly status: WorkspaceStatus;
  readonly status_changed_at: string | null;
  readonly status_reason: string | null;
  readonly stage_at_open: string | null;
  readonly portfolio_mode_enabled: boolean;
  readonly discovery_archive_ref: string | null;
  readonly schema_version: number;
  readonly audit_chain_seq_high: number;
  readonly created_at: string;
}

export class WorkspaceValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
    this.field = field;
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(id: string) {
    super(`Workspace ${id} not found`);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class InvalidStatusTransitionError extends Error {
  readonly from: WorkspaceStatus;
  readonly to: WorkspaceStatus;
  constructor(from: WorkspaceStatus, to: WorkspaceStatus) {
    super(`Invalid workspace status transition: ${from} → ${to}`);
    this.name = 'InvalidStatusTransitionError';
    this.from = from;
    this.to = to;
  }
}

// Status transition matrix. Per Task 3 requirements:
//   active → paused, paused → active, active/paused → killed, killed → *
//   are the only allowed transitions. Re-asserting the same status is
//   treated as a no-op (handled by the route, not raised as an error).
const ALLOWED_TRANSITIONS: Record<WorkspaceStatus, ReadonlySet<WorkspaceStatus>> = {
  active: new Set(['paused', 'killed']),
  paused: new Set(['active', 'killed']),
  killed: new Set(),
};

export function isValidTransition(from: WorkspaceStatus, to: WorkspaceStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].has(to);
}

function rowToView(row: WorkspaceRow): WorkspaceView {
  return {
    id: row.id,
    name: row.name,
    root_path: row.root_path,
    status: row.status,
    status_changed_at: row.status_changed_at,
    status_reason: row.status_reason,
    stage_at_open: row.stage_at_open,
    portfolio_mode_enabled: row.portfolio_mode_enabled !== 0,
    discovery_archive_ref: row.discovery_archive_ref,
    schema_version: row.schema_version,
    audit_chain_seq_high: row.audit_chain_seq_high,
    created_at: row.created_at,
  };
}

function selectWorkspace(db: ManthanSqliteHandle, id: string): WorkspaceRow | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
    | WorkspaceRow
    | undefined;
  return row ?? null;
}

export interface ListWorkspacesOptions {
  readonly status?: WorkspaceStatus;
}

export function listWorkspaces(
  db: ManthanSqliteHandle,
  opts: ListWorkspacesOptions = {},
): WorkspaceView[] {
  const sql = opts.status
    ? 'SELECT * FROM workspaces WHERE status = ? ORDER BY created_at DESC, id ASC'
    : 'SELECT * FROM workspaces ORDER BY created_at DESC, id ASC';
  const rows = opts.status
    ? (db.prepare(sql).all(opts.status) as WorkspaceRow[])
    : (db.prepare(sql).all() as WorkspaceRow[]);
  return rows.map(rowToView);
}

export function getWorkspace(db: ManthanSqliteHandle, id: string): WorkspaceView | null {
  const row = selectWorkspace(db, id);
  return row ? rowToView(row) : null;
}

export interface CreateWorkspaceInput {
  readonly name: string;
  readonly daemonWorkspaceRoot: string;
  readonly ideaText?: string;
}

export interface CreateWorkspaceResult {
  readonly workspace: WorkspaceView;
  readonly audit: AuditedWriteResult;
}

function generateWorkspaceId(): string {
  // Short, human-readable. Distinguishable in logs; URL-safe.
  return `ws-${randomUUID().slice(0, 12)}`;
}

export async function createWorkspace(
  ctx: AuditedWriteContext,
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const name = input.name.trim();
  if (!name) {
    throw new WorkspaceValidationError('name', 'name must be a non-empty string');
  }
  if (name.length > 200) {
    throw new WorkspaceValidationError('name', 'name must be 200 characters or fewer');
  }

  const id = generateWorkspaceId();
  const rootPath = path.join(input.daemonWorkspaceRoot, 'workspaces', id);
  const createdAt = new Date().toISOString();

  // The audit_events.workspace_id FK requires the workspace row to exist
  // before the first audit event referencing it is written. The existing
  // CLI init follows the same pattern (INSERT INTO workspaces first, then
  // audited operations against the workspace). The audit chain still
  // records workspace.create as the first event referencing this id, so
  // forensic queries see the creation moment.
  ctx.db
    .prepare(
      `INSERT INTO workspaces (
        id, root_path, created_at, name, status, schema_version, audit_chain_seq_high
      ) VALUES (?, ?, ?, ?, 'active', 3, 0)`,
    )
    .run(id, rootPath, createdAt, name);

  let audit: AuditedWriteResult;
  try {
    audit = await auditedWrite(ctx, {
      workspaceId: id,
      actor: 'user',
      action: 'workspace.create',
      kind: 'workspace',
      decision: AUDIT_DECISION_HUMAN_APPROVED,
      payload: {
        workspace_id: id,
        name,
        root_path: rootPath,
        idea_text: input.ideaText ?? null,
        created_at: createdAt,
      },
    });
  } catch (err) {
    // Audit write failed — roll back the orphan workspace row so future
    // creates with the same id (vanishingly unlikely given UUIDs) and
    // recovery diagnostics aren't confused.
    try {
      ctx.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    } catch {
      /* swallow — operator can diagnose via doctor */
    }
    throw err;
  }

  // Cache the high-water seq for fast tail diagnostics.
  ctx.db.prepare('UPDATE workspaces SET audit_chain_seq_high = ? WHERE id = ?').run(audit.seq, id);

  const view = getWorkspace(ctx.db, id);
  if (!view) {
    throw new Error(`workspace ${id} disappeared immediately after creation`);
  }
  return { workspace: view, audit };
}

export interface UpdateWorkspaceInput {
  readonly name?: string;
  readonly status?: WorkspaceStatus;
  readonly status_reason?: string;
}

export interface UpdateWorkspaceResult {
  readonly workspace: WorkspaceView;
  readonly audit: AuditedWriteResult | null;
}

export async function updateWorkspace(
  ctx: AuditedWriteContext,
  id: string,
  input: UpdateWorkspaceInput,
): Promise<UpdateWorkspaceResult> {
  const existing = selectWorkspace(ctx.db, id);
  if (!existing) {
    throw new WorkspaceNotFoundError(id);
  }

  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  let newName = existing.name;
  let newStatus: WorkspaceStatus = existing.status;
  let newStatusReason = existing.status_reason;

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new WorkspaceValidationError('name', 'name must be a non-empty string');
    }
    if (trimmed.length > 200) {
      throw new WorkspaceValidationError('name', 'name must be 200 characters or fewer');
    }
    if (trimmed !== existing.name) {
      changes.push({ field: 'name', from: existing.name, to: trimmed });
      newName = trimmed;
    }
  }

  if (input.status !== undefined) {
    if (!isValidTransition(existing.status, input.status)) {
      throw new InvalidStatusTransitionError(existing.status, input.status);
    }
    if (input.status !== existing.status) {
      changes.push({ field: 'status', from: existing.status, to: input.status });
      newStatus = input.status;
      newStatusReason = input.status_reason ?? null;
    }
  } else if (input.status_reason !== undefined && input.status_reason !== existing.status_reason) {
    // status_reason update without status change — uncommon but allowed.
    changes.push({
      field: 'status_reason',
      from: existing.status_reason,
      to: input.status_reason,
    });
    newStatusReason = input.status_reason;
  }

  if (changes.length === 0) {
    // No-op update — return current state without writing an audit event.
    return { workspace: rowToView(existing), audit: null };
  }

  const now = new Date().toISOString();
  const statusChanged = changes.some((c) => c.field === 'status');
  const newStatusChangedAt = statusChanged ? now : existing.status_changed_at;

  const audit = await auditedWrite(ctx, {
    workspaceId: id,
    actor: 'user',
    action: 'workspace.update',
    kind: 'workspace',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      workspace_id: id,
      changes,
      changed_at: now,
    },
    brainWrites: () => {
      ctx.db
        .prepare(
          `UPDATE workspaces
             SET name = ?, status = ?, status_reason = ?, status_changed_at = ?
           WHERE id = ?`,
        )
        .run(newName, newStatus, newStatusReason, newStatusChangedAt, id);
    },
  });

  ctx.db.prepare('UPDATE workspaces SET audit_chain_seq_high = ? WHERE id = ?').run(audit.seq, id);

  const view = getWorkspace(ctx.db, id);
  if (!view) {
    throw new Error(`workspace ${id} disappeared mid-update`);
  }
  return { workspace: view, audit };
}
