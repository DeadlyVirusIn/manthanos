// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Demo reset — C4.4-E1. Purges ONLY the demo workspace, then re-seeds to a
// logically identical state. Isolation is the whole point: this code must
// NEVER be able to delete a real workspace's data.
//
// Two-layer isolation guard:
//   1. The target id comes solely from the durable demo marker written by
//      seedDemo (never from a request body).
//   2. Before purging, we re-confirm the live workspace's NAME equals the
//      reserved demo name. A mismatch (or a marker pointing at a missing
//      workspace) aborts the purge.
//
// The purge is a scoped, FK-safe hard delete (the only raw-SQL write in the
// demo subsystem; all CONTENT is still created exclusively via audited
// writes during the re-seed). audit_events.seq is keyed (workspace_id, seq),
// so deleting the demo workspace's rows cannot affect any other workspace's
// audit chain. Orphaned content-addressed blobs are harmless (GC'd).

import type { SubstrateHandle } from '../substrate.js';
import { DEMO_WORKSPACE_NAME } from './manifest.js';
import { type SeedDemoOptions, type SeedDemoResult, readDemoMarker, seedDemo } from './seedDemo.js';

/** Raised when the reset target fails the isolation guard. Reset refuses
 *  rather than risk deleting non-demo data. */
export class DemoIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoIsolationError';
  }
}

interface SqliteLike {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  pragma(source: string): unknown;
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
}

/** Tables (other than `workspaces`) that carry a `workspace_id` column —
 *  discovered at runtime so the purge tolerates schema drift. */
function tablesWithWorkspaceId(db: SqliteLike): string[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  const out: string[] = [];
  for (const { name } of tables) {
    if (name === 'workspaces') continue;
    const cols = db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'workspace_id')) out.push(name);
  }
  return out;
}

/**
 * Confirm `workspaceId` names a workspace whose display name is the reserved
 * demo name. Returns:
 *   - 'purge'   → exists and IS the demo workspace; safe to purge.
 *   - 'absent'  → marker points at a missing workspace; nothing to purge.
 * Throws DemoIsolationError if the workspace exists but is NOT the demo.
 */
function classifyResetTarget(db: SqliteLike, workspaceId: string): 'purge' | 'absent' {
  const row = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId) as
    | { name: string }
    | undefined;
  if (row === undefined) return 'absent';
  if (row.name !== DEMO_WORKSPACE_NAME) {
    throw new DemoIsolationError(
      `refusing to reset: workspace ${workspaceId} is not the demo workspace`,
    );
  }
  return 'purge';
}

/** FK-safe scoped purge of one workspace's data. Runs with foreign_keys
 *  temporarily disabled under the audited-write mutex, so delete order is
 *  irrelevant and no concurrent write can interleave. */
function purgeWorkspace(db: SqliteLike, workspaceId: string): void {
  const wsTables = tablesWithWorkspaceId(db);
  db.pragma('foreign_keys = OFF');
  try {
    const purge = db.transaction((wsId: string) => {
      // Child rows keyed off conversation/fact rather than workspace_id.
      db.prepare(
        `DELETE FROM conversation_verbatim_quotes
          WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ?)`,
      ).run(wsId);
      db.prepare(
        `DELETE FROM fact_provenance_sources
          WHERE fact_id IN (SELECT id FROM semantic_facts WHERE workspace_id = ?)
             OR conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ?)`,
      ).run(wsId, wsId);
      // Everything with a workspace_id column (facts, conversations,
      // audit_events, and any other workspace-scoped table).
      for (const table of wsTables) {
        db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(wsId);
      }
      // The workspace row last.
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(wsId);
    });
    purge(workspaceId);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Reset the demo workspace to a logically identical state: purge the demo
 * workspace (guarded), then re-seed. If no demo exists yet, this is just a
 * seed. Never touches non-demo workspaces or tester feedback notes (which
 * live outside the substrate).
 */
export async function resetDemo(
  substrate: SubstrateHandle,
  daemonWorkspaceRoot: string,
  opts: SeedDemoOptions = {},
): Promise<SeedDemoResult> {
  const marker = readDemoMarker(daemonWorkspaceRoot);
  const db = substrate.ctx.db as unknown as SqliteLike;

  if (marker !== null) {
    const verdict = classifyResetTarget(db, marker.demoWorkspaceId);
    if (verdict === 'purge') {
      const release = await substrate.ctx.mutex.acquire();
      try {
        purgeWorkspace(db, marker.demoWorkspaceId);
      } finally {
        release();
      }
    }
  }

  // Re-seed creates a fresh demo workspace and rewrites the marker.
  return seedDemo(substrate, daemonWorkspaceRoot, opts);
}
