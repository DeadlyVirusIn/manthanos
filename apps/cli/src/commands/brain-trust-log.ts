// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain trust-log` — Phase 2 promotion-UX surface. Lists recent
// trust mutations (promote / demote / dedup_merge / decay) so the human
// can see what changed without combing the full audit log. Each row
// includes the undo seq for fast rollback.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type BlobStore, createBlobStore, openDb } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';

async function openWorkspace(cwd: string): Promise<{
  workspaceId: string;
  m: Awaited<ReturnType<typeof openDb>>;
  blobs: BlobStore;
} | null> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    process.stderr.write('manthan brain: workspace not initialized\n');
    return null;
  }
  const m = await openDb({ dbPath });
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const ws = m.handle
    .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
    .get(workspaceRoot) as { id: string } | undefined;
  if (!ws) {
    m.close();
    process.stderr.write('manthan brain: workspaces row missing\n');
    return null;
  }
  return { workspaceId: ws.id, m, blobs };
}

interface TrustEventRow {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  payload_hash: string | null;
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

async function readPayload(
  blobs: BlobStore,
  hash: string,
): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(blobs.pathFor(hash), 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarizeCorrection(p: Record<string, unknown> | null): string {
  if (!p) return '(payload unreadable)';
  const fromTier = String(p.from_tier ?? '?');
  const toTier = String(p.to_tier ?? '?');
  const reason = String(p.reason ?? '');
  const factId = typeof p.fact_id === 'string' ? p.fact_id : null;
  const note = typeof p.note === 'string' ? p.note : null;
  const factStr = factId ? `  fact=${shortId(factId)}` : '';
  const noteStr =
    note && note.length > 0 ? `  note=${note.length > 50 ? `${note.slice(0, 47)}...` : note}` : '';
  return `${fromTier} → ${toTier}  reason=${reason}${factStr}${noteStr}`;
}

function summarizeDedupMerge(p: Record<string, unknown> | null): string {
  if (!p) return '(payload unreadable)';
  const survivor = typeof p.survivor_id === 'string' ? p.survivor_id : '?';
  const superseded = Array.isArray(p.superseded_ids) ? p.superseded_ids.length : 0;
  const area = String(p.area ?? '?');
  return `area=${area}  survivor=${shortId(survivor)}  superseded=${superseded}`;
}

export interface TrustLogOpts {
  readonly cwd: string;
  readonly limit: number;
  readonly includeDecay: boolean;
}

export async function runTrustLog(opts: TrustLogOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const rows = ws.m.handle
      .prepare(
        `SELECT seq, ts, actor, action, payload_hash
         FROM audit_events
         WHERE workspace_id = ?
           AND action IN ('brain.correction', 'brain.dedup_merge')
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .all(ws.workspaceId, opts.limit) as TrustEventRow[];

    if (rows.length === 0) {
      process.stdout.write('manthan brain trust-log: no trust mutations recorded yet.\n');
      return 0;
    }

    process.stdout.write(`manthan brain trust-log  (last ${rows.length})\n\n`);

    const undoWindowMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const r of rows) {
      const payload = r.payload_hash ? await readPayload(ws.blobs, r.payload_hash) : null;
      const reason = payload && typeof payload.reason === 'string' ? payload.reason : '';

      // Optionally hide automatic decay activity for a cleaner human-action view.
      if (!opts.includeDecay && reason.startsWith('decay:')) continue;

      const tsShort = r.ts.replace('T', ' ').replace(/\..+Z$/, 'Z');
      const ageMs = now - Date.parse(r.ts);
      const within7d = ageMs < undoWindowMs && ageMs >= 0;
      const undoHint = within7d && r.action === 'brain.correction' ? `  [undo: ${r.seq}]` : '';

      process.stdout.write(
        `  seq=${String(r.seq).padStart(4)}  ${tsShort}  ${r.action}${undoHint}\n`,
      );
      process.stdout.write(`           actor=${r.actor}\n`);
      const summary =
        r.action === 'brain.correction'
          ? summarizeCorrection(payload)
          : summarizeDedupMerge(payload);
      process.stdout.write(`           ${summary}\n\n`);
    }

    process.stdout.write('Filters:\n');
    process.stdout.write(
      `  --include-decay   show automatic decay events (currently ${opts.includeDecay ? 'shown' : 'hidden'})\n`,
    );
    process.stdout.write('  --limit N         number of recent events to show\n');
    process.stdout.write('\nUndo within 7 days: manthan brain undo-correction <seq>\n');
    return 0;
  } finally {
    ws.m.close();
  }
}
