// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain queue-health` — Phase 2 operational diagnostic.
// Specifically measures queue backlog pressure: aging T0 facts, review
// burden estimate, and projected growth from recent activity.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { type ManthanSqliteHandle, openDb } from '@manthanos/memory';
import { findDuplicateClusters } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

const DAY_MS = 24 * 60 * 60 * 1000;

async function openWorkspace(cwd: string): Promise<
  | { workspaceId: string; m: Awaited<ReturnType<typeof openDb>> }
  | null
> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    process.stderr.write('manthan brain: workspace not initialized\n');
    return null;
  }
  const m = await openDb({ dbPath });
  const ws = m.handle
    .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
    .get(workspaceRoot) as { id: string } | undefined;
  if (!ws) {
    m.close();
    process.stderr.write('manthan brain: workspaces row missing\n');
    return null;
  }
  return { workspaceId: ws.id, m };
}

interface T0Row {
  id: string;
  area: string;
  statement: string;
  last_corroborated: string;
}

function loadT0(db: ManthanSqliteHandle, workspaceId: string): T0Row[] {
  return db
    .prepare(
      `SELECT id, area, statement, last_corroborated
       FROM semantic_facts
       WHERE workspace_id = ? AND tier = 'T0'
       ORDER BY last_corroborated ASC`,
    )
    .all(workspaceId) as T0Row[];
}

function countEventsInWindow(
  db: ManthanSqliteHandle,
  workspaceId: string,
  action: string,
  days: number,
): number {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_events
       WHERE workspace_id = ? AND action = ? AND ts >= ?`,
    )
    .get(workspaceId, action, since) as { n: number };
  return row.n;
}

export async function runQueueHealth(opts: { cwd: string }): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const t0 = loadT0(ws.m.handle, ws.workspaceId);
    const now = Date.now();

    // Aging buckets.
    const buckets = { fresh: 0, week1: 0, month1: 0, stale: 0 };
    const byArea = new Map<string, { n: number; oldestDays: number }>();
    let oldestDays = 0;
    let sumDays = 0;
    for (const f of t0) {
      const ts = Date.parse(f.last_corroborated);
      const ageDays = Number.isFinite(ts) ? Math.max(0, (now - ts) / DAY_MS) : 0;
      if (ageDays < 7) buckets.fresh += 1;
      else if (ageDays < 30) buckets.week1 += 1;
      else if (ageDays < 60) buckets.month1 += 1;
      else buckets.stale += 1;
      oldestDays = Math.max(oldestDays, ageDays);
      sumDays += ageDays;
      const e = byArea.get(f.area) ?? { n: 0, oldestDays: 0 };
      e.n += 1;
      e.oldestDays = Math.max(e.oldestDays, ageDays);
      byArea.set(f.area, e);
    }
    const avgDays = t0.length === 0 ? 0 : sumDays / t0.length;

    // Activity in last 7d (real wall-clock; for synthetic brains this
    // shows only events written today as a "session burst" — that's
    // a known property of back-dated simulations and not a bug).
    const intros7 = countEventsInWindow(ws.m.handle, ws.workspaceId, 'brain.fact_quarantined', 7);
    const corrections7 = countEventsInWindow(
      ws.m.handle,
      ws.workspaceId,
      'brain.correction',
      7,
    );
    const intros30 = countEventsInWindow(
      ws.m.handle,
      ws.workspaceId,
      'brain.fact_quarantined',
      30,
    );
    const corrections30 = countEventsInWindow(
      ws.m.handle,
      ws.workspaceId,
      'brain.correction',
      30,
    );

    // Unresolved contradiction-shaped clusters across ALL trusted facts.
    const clusters = findDuplicateClusters({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
    });

    process.stdout.write('manthan brain queue-health\n\n');
    process.stdout.write(`T0 queue: ${t0.length} fact${t0.length === 1 ? '' : 's'}\n`);
    process.stdout.write(`  oldest:   ${Math.round(oldestDays * 10) / 10}d\n`);
    process.stdout.write(`  average:  ${Math.round(avgDays * 10) / 10}d\n`);
    process.stdout.write('\nAging buckets\n');
    process.stdout.write(`  <7d (fresh):       ${buckets.fresh}\n`);
    process.stdout.write(`  7-30d:             ${buckets.week1}\n`);
    process.stdout.write(`  30-60d:            ${buckets.month1}\n`);
    process.stdout.write(`  60d+ (stale T0):   ${buckets.stale}\n`);

    if (byArea.size > 0) {
      process.stdout.write('\nBy area\n');
      const sorted = [...byArea.entries()].sort((a, b) => b[1].n - a[1].n);
      for (const [area, v] of sorted) {
        process.stdout.write(
          `  ${area.padEnd(10)} ${String(v.n).padStart(3)}  oldest=${Math.round(v.oldestDays * 10) / 10}d\n`,
        );
      }
    }

    process.stdout.write('\nRecent activity\n');
    process.stdout.write(`  last 7d  — introductions: ${intros7}  corrections: ${corrections7}\n`);
    process.stdout.write(`  last 30d — introductions: ${intros30}  corrections: ${corrections30}\n`);

    process.stdout.write('\nUnresolved contradiction-shaped clusters\n');
    if (clusters.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const c of clusters.slice(0, 5)) {
        process.stdout.write(
          `  [${c.area}] ${c.facts.length} facts  min-jaccard=${c.minPairwiseJaccard.toFixed(2)}\n`,
        );
      }
      if (clusters.length > 5) {
        process.stdout.write(`  … and ${clusters.length - 5} more.\n`);
      }
    }

    // Projection: linear extrapolation from recent activity.
    // Net30 = intros - corrections over 30d. If positive, queue grows.
    const net30 = intros30 - corrections30;
    process.stdout.write('\nProjection (linear, 30d window)\n');
    process.stdout.write(
      `  net flow:           ${net30 >= 0 ? '+' : ''}${net30} (intros − corrections)\n`,
    );
    if (corrections30 > 0) {
      const drainDays = t0.length === 0 ? 0 : (t0.length * 30) / corrections30;
      process.stdout.write(
        `  drain rate:         ${(corrections30 / 30).toFixed(2)} corrections/day\n`,
      );
      process.stdout.write(
        `  est. drain time:    ${drainDays === 0 ? '0' : `${Math.round(drainDays)}d`}  (if intros stopped now)\n`,
      );
    } else {
      process.stdout.write('  drain rate:         (no corrections in last 30d)\n');
    }

    // Verdict.
    const warnings: string[] = [];
    if (buckets.stale >= 3) warnings.push(`${buckets.stale} T0 facts older than 60 days`);
    if (oldestDays >= 90) warnings.push(`oldest T0 fact is ${Math.round(oldestDays)}d`);
    if (net30 > 0 && corrections30 > 0)
      warnings.push(`queue growing: net +${net30} over last 30d`);
    if (clusters.length >= 5) warnings.push(`${clusters.length} duplicate clusters unresolved`);

    let status: 'HEALTHY' | 'STRESSED' | 'DEGRADED';
    if (warnings.length === 0) status = 'HEALTHY';
    else if (warnings.length >= 2) status = 'DEGRADED';
    else status = 'STRESSED';

    process.stdout.write(`\nStatus: ${status}\n`);
    for (const w of warnings) process.stdout.write(`  ⚠ ${w}\n`);
    if (warnings.length > 0) {
      process.stdout.write('\nRecommended:\n');
      if (t0.length > 0) process.stdout.write('  manthan brain review\n');
      if (clusters.length > 0) process.stdout.write('  manthan brain duplicates\n');
      if (buckets.stale > 0) process.stdout.write('  manthan brain age-facts --dry-run\n');
    }

    return 0;
  } finally {
    ws.m.close();
  }
}
