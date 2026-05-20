// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Substrate access layer for the Phase 0 UI shell. Thin translation
// between substrate APIs and the React tree.
//
// Phase 0 discipline: this file imports only from @manthanos/* and
// runs the same SQL the CLI uses. No new substrate code. No state
// owned here — every value is read fresh from `.manthan/`.

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  type BlobStore,
  type ManthanSqliteHandle,
  createBlobStore,
  openDb,
  runRecovery,
} from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';

export interface WorkspaceHandle {
  readonly root: string;
  readonly manthanDir: string;
  readonly dbPath: string;
  readonly jsonlPath: string;
  readonly blobs: BlobStore;
}

export async function resolveWorkspace(cwd: string): Promise<WorkspaceHandle | null> {
  const platform = getPlatform();
  const root = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(root, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) return null;
  return {
    root,
    manthanDir,
    dbPath,
    jsonlPath: path.join(manthanDir, 'audit.log'),
    blobs: createBlobStore(path.join(manthanDir, 'audit', 'blobs')),
  };
}

export async function withDb<T>(
  ws: WorkspaceHandle,
  fn: (db: ManthanSqliteHandle, workspaceId: string) => Promise<T>,
): Promise<T> {
  const m = await openDb({ dbPath: ws.dbPath });
  try {
    const row = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(ws.root) as { id: string } | undefined;
    if (!row) throw new Error(`workspace row missing for ${ws.root}`);
    return await fn(m.handle, row.id);
  } finally {
    m.close();
  }
}

export type WorkflowState =
  | { readonly kind: 'no_workspace'; readonly cwd: string }
  | { readonly kind: 'workspace_row_missing'; readonly cwd: string }
  | {
      readonly kind: 'recovery_not_clean';
      readonly recoveryStatus: 'corrupted' | 'unrecoverable';
      readonly findingCount: number;
    }
  | {
      readonly kind: 'last_plan_failed';
      readonly runId: string;
      readonly status: string;
    }
  | { readonly kind: 'no_plans_yet' }
  | {
      readonly kind: 'has_quarantine';
      readonly quarantineCount: number;
      readonly latestRunId: string | null;
    }
  | {
      readonly kind: 'idle_with_trust';
      readonly trustedCount: number;
      readonly latestRunId: string | null;
    }
  | {
      readonly kind: 'idle_empty_trust';
      readonly latestRunId: string | null;
    };

/**
 * Aggregated workspace context for the persistent left pane and
 * status ribbon (UX prototype 9.1). Read fresh on every navigation
 * from the App; never cached across screens.
 *
 * The fields here duplicate substrate counts that some `WorkflowState`
 * variants already carry. They are exposed unconditionally so the
 * left pane can render consistently across all states without
 * branching on the discriminant.
 *
 * Substrate-boundary discipline: this function performs read-only
 * SELECTs against the existing tables. No new columns, no new
 * derived semantics. Equivalent to the operator running a sequence
 * of `manthan brain facts` / `manthan next` / `cat audit.log`
 * inspections — collapsed into one query batch.
 */
export interface WorkspaceContext {
  readonly workspaceName: string;
  readonly workflowState:
    | WorkflowState
    | { readonly kind: 'loading' }
    | { readonly kind: 'error'; readonly msg: string };
  readonly trustedCount: number;
  readonly quarantineCount: number;
  readonly runCount: number;
  readonly latestRunId: string | null;
}

export async function loadWorkspaceContext(ws: WorkspaceHandle): Promise<WorkspaceContext> {
  const workspaceName = path.basename(ws.root);
  const workflowState = await inspectWorkflowState(ws.root);
  return withDb(ws, async (db, workspaceId) => {
    const trusted = db
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')`,
      )
      .get(workspaceId) as { n: number };
    const quarantine = db
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
               AND area NOT IN ('language','project','package_manager','testing')`,
      )
      .get(workspaceId) as { n: number };
    const runs = db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(started_at) AS last_ts FROM workflows
         WHERE workspace_id = ?`,
      )
      .get(workspaceId) as { n: number; last_ts: string | null };
    const latest = db
      .prepare(
        `SELECT id FROM workflows WHERE workspace_id = ?
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(workspaceId) as { id: string } | undefined;
    return {
      workspaceName,
      workflowState,
      trustedCount: trusted.n,
      quarantineCount: quarantine.n,
      runCount: runs.n,
      latestRunId: latest?.id ?? null,
    };
  });
}

export interface ReviewCandidate {
  readonly factId: string;
  readonly area: string;
  readonly statement: string;
  readonly confidence: number;
  readonly ageDays: number;
  readonly provenanceWorkflowId: string | null;
}

export async function loadReviewQueue(
  ws: WorkspaceHandle,
  limit: number,
): Promise<readonly ReviewCandidate[]> {
  return withDb(ws, async (db, workspaceId) => {
    const rows = db
      .prepare(
        `SELECT id, area, statement, confidence, last_corroborated, provenance_workflow_id
         FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
               AND area NOT IN ('language','project','package_manager','testing')
         ORDER BY last_corroborated ASC
         LIMIT ?`,
      )
      .all(workspaceId, limit) as Array<{
      id: string;
      area: string;
      statement: string;
      confidence: number;
      last_corroborated: string;
      provenance_workflow_id: string | null;
    }>;
    const now = Date.now();
    return rows.map((r) => ({
      factId: r.id,
      area: r.area,
      statement: r.statement,
      confidence: r.confidence,
      ageDays: Math.max(
        0,
        Math.round((now - Date.parse(r.last_corroborated)) / (24 * 60 * 60 * 1000)),
      ),
      provenanceWorkflowId: r.provenance_workflow_id,
    }));
  });
}

export async function listRecentRunIds(
  ws: WorkspaceHandle,
  limit: number,
): Promise<readonly string[]> {
  return withDb(ws, async (db, workspaceId) => {
    const rows = db
      .prepare(
        `SELECT id FROM workflows
         WHERE workspace_id = ?
         ORDER BY started_at DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  });
}

export async function inspectWorkflowState(cwd: string): Promise<WorkflowState> {
  const platform = getPlatform();
  const root = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const ws = await resolveWorkspace(root);
  if (!ws) return { kind: 'no_workspace', cwd: root };
  const m = await openDb({ dbPath: ws.dbPath });
  try {
    const wsRow = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(ws.root) as { id: string } | undefined;
    if (!wsRow) return { kind: 'workspace_row_missing', cwd: ws.root };
    const workspaceId = wsRow.id;
    const recovery = await runRecovery({
      db: m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      workspaceId,
    });
    if (recovery.status === 'corrupted' || recovery.status === 'unrecoverable') {
      return {
        kind: 'recovery_not_clean',
        recoveryStatus: recovery.status,
        findingCount: recovery.findings.length,
      };
    }
    const latestWorkflow = m.handle
      .prepare(
        `SELECT id, status FROM workflows
         WHERE workspace_id = ?
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(workspaceId) as { id: string; status: string } | undefined;
    if (!latestWorkflow) return { kind: 'no_plans_yet' };
    if (
      latestWorkflow.status === 'failed' ||
      latestWorkflow.status === 'crashed_recoverable' ||
      latestWorkflow.status === 'running'
    ) {
      return {
        kind: 'last_plan_failed',
        runId: latestWorkflow.id,
        status: latestWorkflow.status,
      };
    }
    const quarantineRow = m.handle
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
               AND area NOT IN ('language','project','package_manager','testing')`,
      )
      .get(workspaceId) as { n: number };
    if (quarantineRow.n > 0) {
      return {
        kind: 'has_quarantine',
        quarantineCount: quarantineRow.n,
        latestRunId: latestWorkflow.id,
      };
    }
    const trustedRow = m.handle
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')`,
      )
      .get(workspaceId) as { n: number };
    if (trustedRow.n > 0) {
      return {
        kind: 'idle_with_trust',
        trustedCount: trustedRow.n,
        latestRunId: latestWorkflow.id,
      };
    }
    return { kind: 'idle_empty_trust', latestRunId: latestWorkflow.id };
  } finally {
    m.close();
  }
}
