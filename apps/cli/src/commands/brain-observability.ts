// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain health` / `entropy` / `token-pressure` — Phase 2
// observability primitives. Intentionally crude: simple counts and
// deterministic projections from existing brain state. No dashboards,
// no semantic retrieval, no opaque scoring.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { estimateFactTokens, shapeTrustedFacts, type TrustedFact } from '@manthanos/context';
import { type ManthanSqliteHandle, openDb } from '@manthanos/memory';
import {
  computeBrainMetrics,
  DECAY_THRESHOLDS,
  type DecayProfile,
  findDuplicateClusters,
  planDecay,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

async function openWorkspace(cwd: string): Promise<
  | {
      workspaceId: string;
      m: Awaited<ReturnType<typeof openDb>>;
    }
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

interface TierCounts {
  'T+3': number;
  'T+2': number;
  'T+1': number;
  T0: number;
  'T-1': number;
  'T-2': number;
}

function tierCounts(db: ManthanSqliteHandle, workspaceId: string): TierCounts {
  const rows = db
    .prepare(
      `SELECT tier, COUNT(*) AS n FROM semantic_facts
       WHERE workspace_id = ? GROUP BY tier`,
    )
    .all(workspaceId) as Array<{ tier: keyof TierCounts; n: number }>;
  const out: TierCounts = { 'T+3': 0, 'T+2': 0, 'T+1': 0, T0: 0, 'T-1': 0, 'T-2': 0 };
  for (const r of rows) {
    if (r.tier in out) out[r.tier] = r.n;
  }
  return out;
}

function fetchTrustedFacts(db: ManthanSqliteHandle, workspaceId: string): TrustedFact[] {
  const rows = db
    .prepare(
      `SELECT id, area, statement, tier, confidence, provenance_workflow_id
       FROM semantic_facts
       WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')`,
    )
    .all(workspaceId) as Array<{
    id: string;
    area: string;
    statement: string;
    tier: 'T+1' | 'T+2' | 'T+3';
    confidence: number;
    provenance_workflow_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    area: r.area,
    statement: r.statement,
    tier: r.tier,
    confidence: r.confidence,
    provenanceWorkflowId: r.provenance_workflow_id,
  }));
}

function recentEvents(
  db: ManthanSqliteHandle,
  workspaceId: string,
  days: number,
): Map<string, number> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();
  const rows = db
    .prepare(
      `SELECT action, COUNT(*) AS n FROM audit_events
       WHERE workspace_id = ? AND ts >= ?
       GROUP BY action`,
    )
    .all(workspaceId, since) as Array<{ action: string; n: number }>;
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.action, r.n);
  return out;
}

// --------------------------------------------------------------------------
// `manthan brain health`
// --------------------------------------------------------------------------

export async function runHealth(opts: { cwd: string }): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const metrics = computeBrainMetrics(ws.m.handle, ws.workspaceId);
    const tiers = tierCounts(ws.m.handle, ws.workspaceId);
    const recent14 = recentEvents(ws.m.handle, ws.workspaceId, 14);
    const dupClusters = findDuplicateClusters({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
    });

    process.stdout.write('manthan brain health\n\n');

    process.stdout.write('Trust ladder\n');
    process.stdout.write(`  T+3 signed:              ${tiers['T+3']}\n`);
    process.stdout.write(`  T+2 corroborated:        ${tiers['T+2']}\n`);
    process.stdout.write(`  T+1 active:              ${tiers['T+1']}\n`);
    process.stdout.write(`  T0  quarantine:          ${tiers.T0}\n`);
    process.stdout.write(`  T-1 contradicted:        ${tiers['T-1']}\n`);
    process.stdout.write(`  T-2 archived/superseded: ${tiers['T-2']}\n`);

    process.stdout.write('\nTrusted layer\n');
    process.stdout.write(`  facts (T+1/T+2/T+3):     ${metrics.trustedFacts}\n`);
    process.stdout.write(`  estimated tokens:        ${metrics.trustedTokensEstimated}\n`);
    process.stdout.write(`  window:                  ${metrics.windowStart || '(none)'} → ${metrics.windowEnd || '(none)'}\n`);

    process.stdout.write('\nRecent activity (last 14d)\n');
    if (recent14.size === 0) {
      process.stdout.write('  (none)\n');
    } else {
      const sorted = [...recent14.entries()].sort((a, b) => b[1] - a[1]);
      for (const [action, n] of sorted) {
        process.stdout.write(`  ${action.padEnd(28)} ${n}\n`);
      }
    }

    process.stdout.write('\nHygiene pressure\n');
    process.stdout.write(`  stale facts (>60d):      ${metrics.staleFacts}  (ratio ${(metrics.staleRatio * 100).toFixed(1)}%)\n`);
    process.stdout.write(`  duplicate clusters:      ${dupClusters.length}\n`);
    if (dupClusters.length > 0) {
      const byArea = new Map<string, number>();
      for (const c of dupClusters) byArea.set(c.area, (byArea.get(c.area) ?? 0) + 1);
      for (const [area, n] of byArea) {
        process.stdout.write(`    ${area}: ${n}\n`);
      }
    }

    // Verdict: combine signals.
    const warnings: string[] = [];
    if (metrics.trustedFacts >= 30) {
      warnings.push(`trusted set is ${metrics.trustedFacts} facts (bundle bloat risk)`);
    }
    if (metrics.staleRatio >= 0.3) {
      warnings.push(`${(metrics.staleRatio * 100).toFixed(0)}% of trusted facts are stale`);
    }
    if (dupClusters.length >= 3) {
      warnings.push(`${dupClusters.length} duplicate clusters need review`);
    }

    let status: 'HEALTHY' | 'STRESSED' | 'DEGRADED';
    if (warnings.length === 0) status = 'HEALTHY';
    else if (warnings.length >= 2) status = 'DEGRADED';
    else status = 'STRESSED';

    process.stdout.write(`\nStatus: ${status}\n`);
    if (warnings.length > 0) {
      for (const w of warnings) process.stdout.write(`  ⚠ ${w}\n`);
      process.stdout.write('\nRecommended commands:\n');
      if (metrics.staleFacts > 0 || metrics.staleRatio >= 0.3) {
        process.stdout.write('  manthan brain age-facts --dry-run\n');
      }
      if (dupClusters.length > 0) {
        process.stdout.write('  manthan brain duplicates\n');
      }
      process.stdout.write('  manthan brain token-pressure\n');
    }

    return 0;
  } finally {
    ws.m.close();
  }
}

// --------------------------------------------------------------------------
// `manthan brain entropy`
// --------------------------------------------------------------------------

export interface EntropyOpts {
  readonly cwd: string;
  readonly profile: DecayProfile;
}

export async function runEntropy(opts: EntropyOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const plan = planDecay({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      profile: opts.profile,
    });
    const dupClusters = findDuplicateClusters({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
    });
    const recent30 = recentEvents(ws.m.handle, ws.workspaceId, 30);

    process.stdout.write(`manthan brain entropy  (profile=${opts.profile})\n\n`);
    const w = DECAY_THRESHOLDS[opts.profile];
    process.stdout.write(`Decay thresholds: warn=${w.warn}d, demote=${w.demote}d, archive=${w.archive}d\n`);

    process.stdout.write('\nAging breakdown (trusted + T0 facts)\n');
    process.stdout.write(`  fresh:               ${plan.summary.noChange}\n`);
    process.stdout.write(`  warn (no-op):        ${plan.summary.warned}\n`);
    process.stdout.write(`  confidence-reduce:   ${plan.summary.confidenceReduced}\n`);
    process.stdout.write(`  tier-demote:         ${plan.summary.demoted}\n`);
    process.stdout.write(`  archive candidate:   ${plan.summary.archived}\n`);

    process.stdout.write('\nDuplicate pressure (Jaccard ≥ 0.25, same area)\n');
    if (dupClusters.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const c of dupClusters) {
        process.stdout.write(
          `  [${c.area}] ${c.facts.length} facts  min-jaccard=${c.minPairwiseJaccard.toFixed(2)}\n`,
        );
      }
      process.stdout.write('\n  → manthan brain duplicates  (for full details + suggested survivor)\n');
    }

    process.stdout.write('\nRecent decay/correction activity (last 30d)\n');
    const corrections = recent30.get('brain.correction') ?? 0;
    const merges = recent30.get('brain.dedup_merge') ?? 0;
    process.stdout.write(`  brain.correction:        ${corrections}\n`);
    process.stdout.write(`  brain.dedup_merge:       ${merges}\n`);

    return 0;
  } finally {
    ws.m.close();
  }
}

// --------------------------------------------------------------------------
// `manthan brain token-pressure`
// --------------------------------------------------------------------------

const BUDGET_PROJECTIONS = [300, 500, 800, 1500, 3000];

export interface TokenPressureOpts {
  readonly cwd: string;
  readonly minConfidence?: number;
  readonly priorityAreas?: ReadonlyArray<string>;
}

export async function runTokenPressure(opts: TokenPressureOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const facts = fetchTrustedFacts(ws.m.handle, ws.workspaceId);

    process.stdout.write('manthan brain token-pressure\n\n');
    if (facts.length === 0) {
      process.stdout.write('No trusted facts in this workspace.\n');
      return 0;
    }

    // Per-fact tokens with shaping (sort only, no trim).
    const noTrim = shapeTrustedFacts(facts, {
      minConfidence: opts.minConfidence,
      priorityAreas: opts.priorityAreas,
    });
    const perFactTokens = noTrim.kept.map((f) => ({ f, t: estimateFactTokens(f) }));
    const totalTokens = perFactTokens.reduce((s, x) => s + x.t, 0);

    process.stdout.write('Trusted layer (no budget)\n');
    process.stdout.write(`  facts kept:      ${noTrim.kept.length} / ${facts.length}\n`);
    process.stdout.write(`  estimated tokens: ${totalTokens}\n`);
    if (noTrim.omitted.length > 0) {
      process.stdout.write(`  omitted (floor): ${noTrim.omitted.length}\n`);
    }

    // Projections.
    process.stdout.write('\nProjections at various budgets\n');
    for (const budget of BUDGET_PROJECTIONS) {
      const shaped = shapeTrustedFacts(facts, {
        trustedFactsTokenBudget: budget,
        minConfidence: opts.minConfidence,
        priorityAreas: opts.priorityAreas,
      });
      const keptTokens = shaped.kept.reduce((s, f) => s + estimateFactTokens(f), 0);
      const droppedByBudget = shaped.omitted.filter((o) => o.reason === 'budget_overflow').length;
      const droppedByFloor = shaped.omitted.filter((o) => o.reason === 'below_min_confidence').length;
      const droppedSummary =
        droppedByFloor > 0
          ? `${droppedByBudget} budget + ${droppedByFloor} floor`
          : `${droppedByBudget} budget`;
      process.stdout.write(
        `  budget ${String(budget).padStart(5)}t  →  ${String(shaped.kept.length).padStart(3)} facts, ${String(keptTokens).padStart(5)}t kept, ${droppedSummary} dropped\n`,
      );
    }

    // By area.
    const byArea = new Map<string, { count: number; tokens: number }>();
    for (const { f, t } of perFactTokens) {
      const e = byArea.get(f.area) ?? { count: 0, tokens: 0 };
      e.count += 1;
      e.tokens += t;
      byArea.set(f.area, e);
    }
    process.stdout.write('\nBy area (descending token spend)\n');
    const areaSorted = [...byArea.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
    for (const [area, v] of areaSorted) {
      process.stdout.write(`  ${area.padEnd(10)} ${String(v.tokens).padStart(5)}t  (${v.count} facts)\n`);
    }

    // Top-5 individual facts.
    process.stdout.write('\nTop facts by token cost\n');
    const top = [...perFactTokens].sort((a, b) => b.t - a.t).slice(0, 5);
    for (const { f, t } of top) {
      const stmt = f.statement.length > 60 ? `${f.statement.slice(0, 57)}...` : f.statement;
      process.stdout.write(`  ${String(t).padStart(4)}t  [${f.tier} · ${f.area}]  ${stmt}\n`);
    }

    if (opts.minConfidence !== undefined) {
      process.stdout.write(`\nFilter applied: minConfidence=${opts.minConfidence}\n`);
    }
    if (opts.priorityAreas && opts.priorityAreas.length > 0) {
      process.stdout.write(`Priority areas (packed first): ${opts.priorityAreas.join(', ')}\n`);
    }

    return 0;
  } finally {
    ws.m.close();
  }
}
