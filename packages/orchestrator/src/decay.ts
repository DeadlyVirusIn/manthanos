// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Decay — Phase 2 deliverable #4.
//
// Conservative hygiene mechanism that lowers confidence and eventually
// demotes facts whose `last_corroborated` has crossed staleness thresholds.
// Discipline: detect-and-propose, dry-run-first, audited transitions,
// no deletion, no automatic promotion. The audit action stays
// `brain.correction` (with reason='decay:*') so the existing 7-day undo
// path applies uniformly.
//
// Decay does ONE thing per band, per fact, per pass:
//   - fresh   (age < warn):     no action
//   - warn    (warn ≤ age < demote):   reduce confidence by one step
//   - demote  (demote ≤ age < archive): demote one tier (T+2→T+1, T+1→T0)
//   - archive (age ≥ archive):  send to T-2 ("excluded from default bundle")
//
// Out of scope (Phase 2 narrow-and-empirical):
//   - contradiction detection
//   - supersede/replace
//   - embeddings
//   - autonomous cleanup

import {
  type AuditedWriteContext,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import type { FactTier } from './brain-trust.js';

const CONFIDENCE_FLOOR = 0.5;
const CONFIDENCE_STEP = 0.1;
const CHARS_PER_TOKEN = 3.5;
const WRAPPER_CHARS = 50;

export type DecayProfile = 'conservative' | 'normal' | 'aggressive';
export type DecayBand = 'fresh' | 'warn' | 'demote' | 'archive';
export type DecayAction = 'none' | 'confidence_reduce' | 'tier_demote' | 'archive';

export const DECAY_THRESHOLDS: Record<
  DecayProfile,
  { readonly warn: number; readonly demote: number; readonly archive: number }
> = {
  conservative: { warn: 90, demote: 180, archive: 270 },
  normal: { warn: 60, demote: 120, archive: 180 },
  aggressive: { warn: 30, demote: 60, archive: 90 },
};

const TIER_CONFIDENCE: Record<FactTier, number> = {
  'T+3': 1.0,
  'T+2': 0.9,
  'T+1': 0.7,
  T0: 0.3,
  'T-1': 0.1,
  'T-2': 0.0,
};

export interface DecayCandidate {
  readonly factId: string;
  readonly area: string;
  readonly statement: string;
  readonly fromTier: FactTier;
  readonly toTier: FactTier;
  readonly fromConfidence: number;
  readonly toConfidence: number;
  readonly band: DecayBand;
  readonly action: DecayAction;
  readonly ageDays: number;
  readonly estimatedTokens: number;
  readonly lastCorroborated: string;
}

export interface DecayPlan {
  readonly asOf: string;
  readonly profile: DecayProfile;
  readonly windows: { readonly warn: number; readonly demote: number; readonly archive: number };
  readonly area: string | null;
  readonly scanned: number;
  readonly candidates: ReadonlyArray<DecayCandidate>;
  readonly summary: {
    readonly noChange: number;
    readonly warned: number;
    readonly confidenceReduced: number;
    readonly demoted: number;
    readonly archived: number;
  };
  readonly trustedTokensBefore: number;
  readonly trustedTokensAfter: number;
  readonly byArea: ReadonlyArray<{
    readonly area: string;
    readonly touched: number;
    readonly ofTotal: number;
  }>;
}

export interface PlanDecayOptions {
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly asOf?: Date;
  readonly profile?: DecayProfile;
  readonly area?: string;
}

function tokensFor(statement: string): number {
  return Math.ceil((WRAPPER_CHARS + statement.length) / CHARS_PER_TOKEN);
}

function tierStepDown(t: FactTier): FactTier | null {
  if (t === 'T+2') return 'T+1';
  if (t === 'T+1') return 'T0';
  return null;
}

function isTrustedTier(t: FactTier): boolean {
  return t === 'T+1' || t === 'T+2' || t === 'T+3';
}

export function planDecay(opts: PlanDecayOptions): DecayPlan {
  const profile = opts.profile ?? 'normal';
  const windows = DECAY_THRESHOLDS[profile];
  const asOf = opts.asOf ?? new Date();

  const rows = opts.db
    .prepare(
      `SELECT id, area, statement, tier, confidence, last_corroborated
       FROM semantic_facts
       WHERE workspace_id = ? AND tier IN ('T+3','T+2','T+1','T0')
         ${opts.area ? 'AND area = ?' : ''}
       ORDER BY last_corroborated ASC`,
    )
    .all(...(opts.area ? [opts.workspaceId, opts.area] : [opts.workspaceId])) as Array<{
    id: string;
    area: string;
    statement: string;
    tier: FactTier;
    confidence: number;
    last_corroborated: string;
  }>;

  const candidates: DecayCandidate[] = [];
  const summary = { noChange: 0, warned: 0, confidenceReduced: 0, demoted: 0, archived: 0 };
  const areaTotals = new Map<string, { touched: number; total: number }>();
  let trustedTokensBefore = 0;
  let trustedTokensAfter = 0;

  for (const r of rows) {
    const ts = Date.parse(r.last_corroborated);
    const ageDays = Number.isFinite(ts)
      ? Math.max(0, (asOf.getTime() - ts) / (24 * 60 * 60 * 1000))
      : 0;
    const tokens = tokensFor(r.statement);
    if (isTrustedTier(r.tier)) trustedTokensBefore += tokens;

    const tally = areaTotals.get(r.area) ?? { touched: 0, total: 0 };
    tally.total += 1;

    let band: DecayBand;
    if (ageDays < windows.warn) band = 'fresh';
    else if (ageDays < windows.demote) band = 'warn';
    else if (ageDays < windows.archive) band = 'demote';
    else band = 'archive';

    let action: DecayAction = 'none';
    let toTier: FactTier = r.tier;
    let toConfidence = r.confidence;

    if (band === 'fresh') {
      summary.noChange += 1;
    } else if (r.tier === 'T+3') {
      // Signed facts cannot be auto-demoted; surface as a visible warning only.
      summary.warned += 1;
    } else if (band === 'warn') {
      if ((r.tier === 'T+1' || r.tier === 'T+2') && r.confidence > CONFIDENCE_FLOOR + 1e-9) {
        toConfidence = Math.max(CONFIDENCE_FLOOR, r.confidence - CONFIDENCE_STEP);
        action = 'confidence_reduce';
        summary.confidenceReduced += 1;
      } else {
        // Already at floor, or tier is T0 (no useful reduction below 0.3 without a tier change).
        summary.warned += 1;
      }
    } else if (band === 'demote') {
      const next = tierStepDown(r.tier);
      if (next) {
        toTier = next;
        toConfidence = TIER_CONFIDENCE[next];
        action = 'tier_demote';
        summary.demoted += 1;
      } else {
        // T0 in the demote band: nowhere to go without archiving. Wait.
        summary.warned += 1;
      }
    } else {
      toTier = 'T-2';
      toConfidence = 0.0;
      action = 'archive';
      summary.archived += 1;
    }

    if (action !== 'none') tally.touched += 1;
    areaTotals.set(r.area, tally);

    if (isTrustedTier(toTier)) trustedTokensAfter += tokens;

    candidates.push({
      factId: r.id,
      area: r.area,
      statement: r.statement,
      fromTier: r.tier,
      toTier,
      fromConfidence: r.confidence,
      toConfidence,
      band,
      action,
      ageDays: Math.round(ageDays * 10) / 10,
      estimatedTokens: tokens,
      lastCorroborated: r.last_corroborated,
    });
  }

  // Sort: most-stale first, then by area for stable display.
  const sorted = [...candidates].sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
    return a.area < b.area ? -1 : 1;
  });

  const byArea = Array.from(areaTotals.entries())
    .map(([area, v]) => ({ area, touched: v.touched, ofTotal: v.total }))
    .sort((a, b) => b.touched - a.touched);

  return {
    asOf: asOf.toISOString(),
    profile,
    windows,
    area: opts.area ?? null,
    scanned: rows.length,
    candidates: sorted,
    summary,
    trustedTokensBefore,
    trustedTokensAfter,
    byArea,
  };
}

// --------------------------------------------------------------------------
// Execute
// --------------------------------------------------------------------------

export interface RunDecayOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly asOf?: Date;
  readonly profile?: DecayProfile;
  readonly area?: string;
  readonly approver?: string;
  /**
   * Simulator-only: back-date both the audit ts and the fact's
   * last_corroborated for every event written by this pass. Useful for
   * long-horizon simulation where decay must appear to happen in
   * simulated time. Defaults to wall-clock.
   */
  readonly tsOverride?: string;
}

export interface RunDecayResult {
  readonly plan: DecayPlan;
  readonly auditEventsWritten: number;
}

function decayCorrectionId(): string {
  return `decay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function runDecay(opts: RunDecayOptions): Promise<RunDecayResult> {
  const plan = planDecay({
    db: opts.db,
    workspaceId: opts.workspaceId,
    asOf: opts.asOf,
    profile: opts.profile,
    area: opts.area,
  });

  const actor = `user:${opts.approver ?? 'cli'}`;
  let written = 0;

  for (const c of plan.candidates) {
    if (c.action === 'none') continue;

    const reason =
      c.action === 'confidence_reduce'
        ? 'decay:confidence_reduce'
        : c.action === 'tier_demote'
          ? 'decay:tier_demote'
          : 'decay:archive';

    const effectiveTs = opts.tsOverride ?? new Date().toISOString();
    await auditedWrite(opts.ctx, {
      workspaceId: opts.workspaceId,
      actor,
      action: 'brain.correction',
      kind: 'system',
      decision: 'human-approved',
      tsOverride: opts.tsOverride,
      payload: {
        correction_id: decayCorrectionId(),
        fact_id: c.factId,
        area: c.area,
        from_tier: c.fromTier,
        to_tier: c.toTier,
        from_confidence: c.fromConfidence,
        to_confidence: c.toConfidence,
        reason,
        note: JSON.stringify({
          age_days: c.ageDays,
          band: c.band,
          profile: plan.profile,
          as_of: plan.asOf,
        }),
        is_undo_of_seq: null,
      },
      brainWrites: () => {
        // Stabilization §3.1: decay administratively touches the row
        // but is not corroboration. Leave last_corroborated alone so
        // the next decay pass continues to see the same age.
        opts.db
          .prepare(
            `UPDATE semantic_facts
             SET tier = ?, confidence = ?, last_administratively_touched = ?
             WHERE workspace_id = ? AND id = ?`,
          )
          .run(c.toTier, c.toConfidence, effectiveTs, opts.workspaceId, c.factId);
      },
    });
    written += 1;
  }

  return { plan, auditEventsWritten: written };
}
