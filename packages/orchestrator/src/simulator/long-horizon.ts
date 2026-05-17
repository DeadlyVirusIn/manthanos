// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Long-horizon experiment engine — Phase 2 deliverable #7.
//
// Drives the existing hygiene loop under simulated multi-month pressure
// to answer the operational questions:
//
//   - Does the T0 queue stabilize or grow forever?
//   - At what rate does review fatigue emerge?
//   - Does decay meaningfully counter accumulation?
//   - Does shaping keep trusted prompts bounded?
//   - Does the brain converge or run away?
//
// This is OBSERVATION INFRASTRUCTURE. It invents no new mechanisms.
// It loops through the existing audited paths (runAging.introduceOnly →
// promoteFact → runDecay → mergeDuplicates) on a seeded weekly schedule
// and records per-week metric snapshots to a JSONL file.

import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AuditedWriteContext, ManthanSqliteHandle } from '@manthanos/memory';
import { estimateFactTokens, shapeTrustedFacts, type TrustedFact } from '@manthanos/context';
import { promoteFact } from '../brain-trust.js';
import { runDecay } from '../decay.js';
import { findDuplicateClusters, mergeDuplicates } from '../dedup.js';
import { ALPHA_SERVICE_CORPUS, runAging, type CorpusFact } from './aging.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface LongHorizonOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  /** Total simulated span in weeks. Default 26 (≈ 6 months). */
  readonly weeks?: number;
  /** How many separate corpus injection cycles. Default 3. */
  readonly corpusCycles?: number;
  /** Human reviews the queue every K weeks. Default 2. */
  readonly reviewCadenceWeeks?: number;
  /** Mean fraction of T0 queue reviewed per session. Default 0.4. */
  readonly humanAttentionFactor?: number;
  /** Run decay every K weeks. Default 4. */
  readonly decayCadenceWeeks?: number;
  /** Run dedup every K weeks. Default 4. */
  readonly dedupCadenceWeeks?: number;
  /** Output JSONL path; one row per week. */
  readonly outPath: string;
  /** Seed for the PRNG that drives review variance + corpus jitter. */
  readonly seed?: number;
  /** Anchor end-of-experiment date. Default: now. */
  readonly endDate?: Date;
  /** Custom corpus; defaults to the canonical ALPHA_SERVICE_CORPUS. */
  readonly corpus?: ReadonlyArray<CorpusFact>;
}

export interface LongHorizonSnapshot {
  readonly week: number;
  readonly simulatedTs: string;
  // Trust ladder
  readonly t0Count: number;
  readonly trustedCount: number;
  readonly archivedCount: number;
  readonly contradictedCount: number;
  // Tokens
  readonly trustedTokens: number;
  // Activity in this snapshot's window (last 7 simulated days)
  readonly introductionsInWindow: number;
  readonly promotionsInWindow: number;
  readonly decayEventsInWindow: number;
  readonly dedupMergesInWindow: number;
  // Hygiene state
  readonly duplicateClusters: number;
  readonly highOverlapPairs: number;
  readonly staleRatio: number;
  // Queue dynamics
  readonly oldestT0AgeDays: number;
  readonly avgT0AgeDays: number;
  // Latency observed in this window (across promotions that fired)
  readonly avgPromotionLatencyDays: number | null;
  // Shaping projection
  readonly shapingOmissionRateAt1500t: number;
  // CpT proxy: trusted-tokens per archived fact (higher = less waste)
  readonly trustedTokensPerArchive: number | null;
  // Review burden indicator
  readonly t0AgingBuckets: { fresh: number; aging: number; stale: number };
}

export interface LongHorizonResult {
  readonly snapshots: ReadonlyArray<LongHorizonSnapshot>;
  readonly outPath: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly weeks: number;
  readonly corpusCycles: number;
  readonly finalT0: number;
  readonly finalTrustedTokens: number;
  readonly totalIntroductions: number;
  readonly totalPromotions: number;
  readonly totalDecayEvents: number;
  readonly totalDedupMerges: number;
}

function xorshift32(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

interface FactRow {
  id: string;
  area: string;
  statement: string;
  tier: 'T+3' | 'T+2' | 'T+1' | 'T0' | 'T-1' | 'T-2';
  confidence: number;
  last_corroborated: string;
  provenance_workflow_id: string | null;
}

function fetchAllFacts(db: ManthanSqliteHandle, workspaceId: string): FactRow[] {
  return db
    .prepare(
      `SELECT id, area, statement, tier, confidence, last_corroborated, provenance_workflow_id
       FROM semantic_facts WHERE workspace_id = ?`,
    )
    .all(workspaceId) as FactRow[];
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

function countEventsBetween(
  db: ManthanSqliteHandle,
  workspaceId: string,
  action: string,
  startTs: string,
  endTs: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_events
       WHERE workspace_id = ? AND action = ? AND ts > ? AND ts <= ?`,
    )
    .get(workspaceId, action, startTs, endTs) as { n: number };
  return row.n;
}

async function snapshot(
  db: ManthanSqliteHandle,
  workspaceId: string,
  week: number,
  simulatedTs: string,
  windowStartTs: string,
  // Counters from the schedule (exact, not blob-read approximations):
  windowPromotions: number,
  windowDecayEvents: number,
  windowDedupMerges: number,
  windowIntroductions: number,
  windowPromotionLatenciesDays: number[],
): Promise<LongHorizonSnapshot> {
  const facts = fetchAllFacts(db, workspaceId);
  const simNowMs = Date.parse(simulatedTs);

  const tierCounts = { 'T+3': 0, 'T+2': 0, 'T+1': 0, T0: 0, 'T-1': 0, 'T-2': 0 } as const;
  const tc: Record<keyof typeof tierCounts, number> = { ...tierCounts };
  for (const f of facts) tc[f.tier] += 1;

  const trustedCount = tc['T+1'] + tc['T+2'] + tc['T+3'];
  const trusted = fetchTrustedFacts(db, workspaceId);
  const trustedTokens = trusted.reduce((s, t) => s + estimateFactTokens(t), 0);

  const t0Facts = facts.filter((f) => f.tier === 'T0');
  const t0Ages = t0Facts.map((f) => {
    const ts = Date.parse(f.last_corroborated);
    return Number.isFinite(ts) ? Math.max(0, (simNowMs - ts) / DAY_MS) : 0;
  });
  const oldestT0AgeDays = t0Ages.length === 0 ? 0 : Math.max(...t0Ages);
  const avgT0AgeDays = t0Ages.length === 0 ? 0 : t0Ages.reduce((a, b) => a + b, 0) / t0Ages.length;

  const t0AgingBuckets = { fresh: 0, aging: 0, stale: 0 };
  for (const age of t0Ages) {
    if (age < 14) t0AgingBuckets.fresh += 1;
    else if (age < 60) t0AgingBuckets.aging += 1;
    else t0AgingBuckets.stale += 1;
  }

  // Hygiene state
  const clusters = findDuplicateClusters({ db, workspaceId });
  const duplicateClusters = clusters.length;
  // High-overlap pair count is the sum of C(n,2) across clusters.
  let highOverlapPairs = 0;
  for (const c of clusters) {
    const n = c.facts.length;
    highOverlapPairs += (n * (n - 1)) / 2;
  }

  const staleCutoffMs = simNowMs - 60 * DAY_MS;
  let stale = 0;
  for (const f of trusted) {
    const row = facts.find((x) => x.id === f.id);
    const ts = row ? Date.parse(row.last_corroborated) : NaN;
    if (Number.isFinite(ts) && ts < staleCutoffMs) stale += 1;
  }
  const staleRatio = trusted.length === 0 ? 0 : stale / trusted.length;

  // Shaping projection at 1500 token budget.
  const shaped = shapeTrustedFacts(trusted, { trustedFactsTokenBudget: 1500 });
  const shapingOmissionRateAt1500t = trusted.length === 0 ? 0 : shaped.omitted.length / trusted.length;

  const trustedTokensPerArchive = tc['T-2'] === 0 ? null : trustedTokens / tc['T-2'];

  // Introductions in the window — count fact_quarantined events.
  // (Falls back to provided counter if SQL count differs.)
  const introductionsObserved = countEventsBetween(
    db,
    workspaceId,
    'brain.fact_quarantined',
    windowStartTs,
    simulatedTs,
  );

  const avgPromotionLatencyDays =
    windowPromotionLatenciesDays.length === 0
      ? null
      : windowPromotionLatenciesDays.reduce((a, b) => a + b, 0) / windowPromotionLatenciesDays.length;

  return {
    week,
    simulatedTs,
    t0Count: tc.T0,
    trustedCount,
    archivedCount: tc['T-2'],
    contradictedCount: tc['T-1'],
    trustedTokens,
    introductionsInWindow: Math.max(introductionsObserved, windowIntroductions),
    promotionsInWindow: windowPromotions,
    decayEventsInWindow: windowDecayEvents,
    dedupMergesInWindow: windowDedupMerges,
    duplicateClusters,
    highOverlapPairs,
    staleRatio,
    oldestT0AgeDays: Math.round(oldestT0AgeDays * 10) / 10,
    avgT0AgeDays: Math.round(avgT0AgeDays * 10) / 10,
    avgPromotionLatencyDays:
      avgPromotionLatencyDays === null ? null : Math.round(avgPromotionLatencyDays * 10) / 10,
    shapingOmissionRateAt1500t: Math.round(shapingOmissionRateAt1500t * 1000) / 1000,
    trustedTokensPerArchive:
      trustedTokensPerArchive === null ? null : Math.round(trustedTokensPerArchive * 10) / 10,
    t0AgingBuckets,
  };
}

export async function runLongHorizon(opts: LongHorizonOptions): Promise<LongHorizonResult> {
  const weeks = opts.weeks ?? 26;
  const corpusCycles = opts.corpusCycles ?? 3;
  const reviewCadence = opts.reviewCadenceWeeks ?? 2;
  const humanAttention = Math.max(0, Math.min(1, opts.humanAttentionFactor ?? 0.4));
  const decayCadence = opts.decayCadenceWeeks ?? 4;
  const dedupCadence = opts.dedupCadenceWeeks ?? 4;
  const endDate = opts.endDate ?? new Date();
  const startDate = new Date(endDate.getTime() - weeks * WEEK_MS);
  const corpus = opts.corpus ?? ALPHA_SERVICE_CORPUS;
  const prng = xorshift32(opts.seed ?? 0xdecade);

  await mkdir(path.dirname(opts.outPath), { recursive: true });

  // Plan corpus injection points: evenly spaced through the run.
  const cycleStarts: number[] = [];
  for (let i = 0; i < corpusCycles; i++) {
    const week = Math.floor((i * weeks) / corpusCycles) + 1;
    cycleStarts.push(week);
  }
  let nextCycleIdx = 0;

  const snapshots: LongHorizonSnapshot[] = [];
  let totalIntros = 0;
  let totalPromotions = 0;
  let totalDecay = 0;
  let totalDedup = 0;
  let prevSnapshotTs = startDate.toISOString();

  // Track per-fact introduction time so we can compute promotion latency.
  const introductionTs = new Map<string, string>();

  // Append a metric row to the JSONL file as each snapshot lands.
  const appendSnapshot = (s: LongHorizonSnapshot) => {
    writeFileSync(opts.outPath, `${JSON.stringify(s)}\n`, { flag: 'a' });
  };

  // Truncate the output file once at the start.
  writeFileSync(opts.outPath, '');

  for (let week = 1; week <= weeks; week++) {
    const simulatedNow = new Date(startDate.getTime() + week * WEEK_MS);
    const simulatedNowIso = simulatedNow.toISOString();

    let weekIntros = 0;
    let weekPromotions = 0;
    let weekDecay = 0;
    let weekDedup = 0;
    const weekPromotionLatencies: number[] = [];

    // 1) Corpus injection (compressed: each cycle is introduced over the
    //    span between this week and the next cycle's week).
    if (nextCycleIdx < cycleStarts.length && week === cycleStarts[nextCycleIdx]) {
      const nextStart = cycleStarts[nextCycleIdx + 1] ?? weeks + 1;
      const cycleSpan = Math.max(1, nextStart - (cycleStarts[nextCycleIdx] ?? week));
      const cycleEnd = new Date(startDate.getTime() + (week - 1 + cycleSpan) * WEEK_MS);
      const before = fetchAllFacts(opts.db, opts.workspaceId).length;
      await runAging({
        ctx: opts.ctx,
        db: opts.db,
        workspaceId: opts.workspaceId,
        endDate: cycleEnd,
        spanWeeks: cycleSpan,
        introduceOnly: true,
        seed: ((opts.seed ?? 0xdecade) + nextCycleIdx * 31) >>> 0,
        corpus,
      });
      const after = fetchAllFacts(opts.db, opts.workspaceId);
      weekIntros = after.length - before;
      // Record introduction times for the new facts (this week's batch
      // is a slice of the cycle; we use last_corroborated as the introduction ts).
      for (const f of after) {
        if (!introductionTs.has(f.id)) introductionTs.set(f.id, f.last_corroborated);
      }
      nextCycleIdx += 1;
    }

    // 2) Human review (stochastic attention).
    if (week % reviewCadence === 0) {
      const t0 = fetchAllFacts(opts.db, opts.workspaceId).filter((f) => f.tier === 'T0');
      // Attention jitter: actual fraction this session = mean ± up to ±0.3, clamped.
      const jitter = (prng() - 0.5) * 0.6;
      const sessionFraction = Math.max(0, Math.min(1, humanAttention + jitter));
      const toReview = Math.floor(t0.length * sessionFraction);
      // Oldest first (the human's natural priority).
      t0.sort((a, b) => (a.last_corroborated < b.last_corroborated ? -1 : 1));
      for (let i = 0; i < toReview; i++) {
        const f = t0[i];
        if (!f) break;
        try {
          await promoteFact({
            ctx: opts.ctx,
            db: opts.db,
            workspaceId: opts.workspaceId,
            factId: f.id,
            targetTier: 'T+1',
            approver: 'long-horizon-simulator',
            tsOverride: simulatedNowIso,
          });
          weekPromotions += 1;
          const intro = introductionTs.get(f.id);
          if (intro) {
            const lat =
              (simulatedNow.getTime() - Date.parse(intro)) / DAY_MS;
            if (Number.isFinite(lat) && lat >= 0) weekPromotionLatencies.push(lat);
          }
        } catch {
          // Skip facts that fail (already promoted, contradicted, etc.).
        }
      }
    }

    // 3) Decay pass.
    if (week % decayCadence === 0) {
      const result = await runDecay({
        ctx: opts.ctx,
        db: opts.db,
        workspaceId: opts.workspaceId,
        asOf: simulatedNow,
        approver: 'long-horizon-simulator',
        tsOverride: simulatedNowIso,
      });
      weekDecay = result.auditEventsWritten;
    }

    // 4) Dedup pass — auto-pick survivor (simulates "human runs merge
    //    on the suggested survivor without overriding").
    if (week % dedupCadence === 0) {
      const clusters = findDuplicateClusters({
        db: opts.db,
        workspaceId: opts.workspaceId,
      });
      for (const c of clusters) {
        const supersededIds = c.facts
          .filter((f) => f.id !== c.suggestedSurvivorId)
          .map((f) => f.id);
        if (supersededIds.length === 0) continue;
        try {
          await mergeDuplicates({
            ctx: opts.ctx,
            db: opts.db,
            workspaceId: opts.workspaceId,
            survivorId: c.suggestedSurvivorId,
            supersededIds,
            approver: 'long-horizon-simulator',
            note: 'auto-merged in long-horizon experiment',
            tsOverride: simulatedNowIso,
          });
          weekDedup += 1;
        } catch {
          // Skip clusters whose survivor is no longer eligible.
        }
      }
    }

    totalIntros += weekIntros;
    totalPromotions += weekPromotions;
    totalDecay += weekDecay;
    totalDedup += weekDedup;

    const snap = await snapshot(
      opts.db,
      opts.workspaceId,
      week,
      simulatedNowIso,
      prevSnapshotTs,
      weekPromotions,
      weekDecay,
      weekDedup,
      weekIntros,
      weekPromotionLatencies,
    );
    snapshots.push(snap);
    appendSnapshot(snap);
    prevSnapshotTs = simulatedNowIso;
  }

  const final = snapshots[snapshots.length - 1];
  return {
    snapshots,
    outPath: opts.outPath,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    weeks,
    corpusCycles,
    finalT0: final?.t0Count ?? 0,
    finalTrustedTokens: final?.trustedTokens ?? 0,
    totalIntroductions: totalIntros,
    totalPromotions,
    totalDecayEvents: totalDecay,
    totalDedupMerges: totalDedup,
  };
}
