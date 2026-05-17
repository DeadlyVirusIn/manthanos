// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Brain trust mutations — Phase 1.6.
//
// Implements ARCH §7.5 promotion / demotion / undo with the strict
// human-approval rule. No automatic promotion. No model self-promotion.
// Every mutation writes a brain.correction audit event.

import { readFile } from 'node:fs/promises';
import {
  type AuditedWriteContext,
  type BlobStore,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';

export type FactTier = 'T+3' | 'T+2' | 'T+1' | 'T0' | 'T-1' | 'T-2';

const TIER_RANK: Record<FactTier, number> = {
  'T+3': 3,
  'T+2': 2,
  'T+1': 1,
  T0: 0,
  'T-1': -1,
  'T-2': -2,
};

const TIER_CONFIDENCE: Record<FactTier, number> = {
  'T+3': 1.0,
  'T+2': 0.9,
  'T+1': 0.7,
  T0: 0.3,
  'T-1': 0.1,
  'T-2': 0.0,
};

export type CorrectionReason = 'human_promotion' | 'human_demotion' | 'human_undo';

export interface PromoteOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly factId: string;
  readonly targetTier?: 'T+1' | 'T+2';
  readonly approver: string;
  readonly note?: string;
  /** Simulator-only: back-date the audit ts + last_corroborated. */
  readonly tsOverride?: string;
}

export interface DemoteOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly factId: string;
  readonly targetTier?: 'T0' | 'T-1' | 'T-2';
  readonly approver: string;
  readonly reason: string;
  /** Simulator-only: back-date the audit ts + last_corroborated. */
  readonly tsOverride?: string;
}

export interface UndoOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly blobs: BlobStore;
  readonly workspaceId: string;
  /** Audit seq of the original brain.correction event to undo. */
  readonly auditSeq: number;
  readonly approver: string;
  /** Max age in days for an undo to be allowed. Per ARCH §7.9. */
  readonly maxAgeDays?: number;
}

export interface CorrectionResult {
  readonly factId: string;
  readonly fromTier: FactTier;
  readonly toTier: FactTier;
  readonly fromConfidence: number;
  readonly toConfidence: number;
  readonly auditSeq: number;
  readonly correctionId: string;
}

export class BrainTrustError extends Error {
  constructor(
    readonly code:
      | 'FACT_NOT_FOUND'
      | 'INVALID_TRANSITION'
      | 'SIGNED_DEMOTION_BLOCKED'
      | 'CONTRADICTED_PROMOTION_BLOCKED'
      | 'NO_PRIOR_CORRECTION'
      | 'OUTSIDE_UNDO_WINDOW'
      | 'INTERVENING_CORRECTION',
    message: string,
  ) {
    super(message);
    this.name = 'BrainTrustError';
  }
}

interface FactRow {
  id: string;
  workspace_id: string;
  area: string;
  statement: string;
  tier: FactTier;
  confidence: number;
}

function fetchFact(db: ManthanSqliteHandle, workspaceId: string, factId: string): FactRow | null {
  return (
    (db
      .prepare(
        `SELECT id, workspace_id, area, statement, tier, confidence
         FROM semantic_facts WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, factId) as FactRow | undefined) ?? null
  );
}

function nextCorrectionId(): string {
  // Stable enough; the audit_seq is the durable identifier. This id is
  // only for the brain_correction payload field.
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Promote a fact upward in trust. Permitted transitions per ARCH §7.5:
 *   T0 → T+1  (with corroboration OR explicit human promotion)
 *   T+1 → T+2 (with corroboration OR explicit human promotion)
 *   T+2 → T+3 (only via signed decision; ARCH §7.5)  — not via this fn.
 *
 * The targetTier defaults to one tier above current.
 */
export async function promoteFact(opts: PromoteOptions): Promise<CorrectionResult> {
  const fact = fetchFact(opts.db, opts.workspaceId, opts.factId);
  if (!fact) throw new BrainTrustError('FACT_NOT_FOUND', `no fact: ${opts.factId}`);

  // Forbid promoting contradicted facts (ARCH §7.5).
  if (fact.tier === 'T-1') {
    throw new BrainTrustError(
      'CONTRADICTED_PROMOTION_BLOCKED',
      'fact is contradicted (T-1); resolve the contradiction before promoting',
    );
  }
  if (fact.tier === 'T-2') {
    throw new BrainTrustError(
      'CONTRADICTED_PROMOTION_BLOCKED',
      'fact was rejected (T-2); demoting via this path is forbidden',
    );
  }

  const target: FactTier = opts.targetTier ?? defaultUpTier(fact.tier);
  if (target === fact.tier) {
    // Idempotent — return a no-op result.
    return {
      factId: fact.id,
      fromTier: fact.tier,
      toTier: target,
      fromConfidence: fact.confidence,
      toConfidence: fact.confidence,
      auditSeq: -1,
      correctionId: 'noop',
    };
  }
  if (TIER_RANK[target] <= TIER_RANK[fact.tier]) {
    throw new BrainTrustError(
      'INVALID_TRANSITION',
      `cannot promote ${fact.tier} → ${target} (use demote instead)`,
    );
  }
  if (target === 'T+3') {
    throw new BrainTrustError(
      'INVALID_TRANSITION',
      'T+3 promotion requires a signed decision (manthan decision sign), not promote',
    );
  }

  return applyTransition({
    ctx: opts.ctx,
    db: opts.db,
    workspaceId: opts.workspaceId,
    fact,
    toTier: target,
    actor: `user:${opts.approver}`,
    reason: 'human_promotion',
    note: opts.note,
    tsOverride: opts.tsOverride,
    decision: 'human-approved',
  });
}

/** Demote a fact downward in trust. Used to override a stale promotion or
 *  to reject a fact's continued use. */
export async function demoteFact(opts: DemoteOptions): Promise<CorrectionResult> {
  const fact = fetchFact(opts.db, opts.workspaceId, opts.factId);
  if (!fact) throw new BrainTrustError('FACT_NOT_FOUND', `no fact: ${opts.factId}`);

  if (fact.tier === 'T+3') {
    throw new BrainTrustError(
      'SIGNED_DEMOTION_BLOCKED',
      'T+3 (signed) facts cannot be demoted via the simple demote command; supersede via signed decision',
    );
  }

  const target: FactTier = opts.targetTier ?? defaultDownTier(fact.tier);
  if (target === fact.tier) {
    return {
      factId: fact.id,
      fromTier: fact.tier,
      toTier: target,
      fromConfidence: fact.confidence,
      toConfidence: fact.confidence,
      auditSeq: -1,
      correctionId: 'noop',
    };
  }
  if (TIER_RANK[target] >= TIER_RANK[fact.tier]) {
    throw new BrainTrustError(
      'INVALID_TRANSITION',
      `cannot demote ${fact.tier} → ${target} (use promote instead)`,
    );
  }

  return applyTransition({
    ctx: opts.ctx,
    db: opts.db,
    workspaceId: opts.workspaceId,
    fact,
    toTier: target,
    actor: `user:${opts.approver}`,
    reason: 'human_demotion',
    note: opts.reason,
    tsOverride: opts.tsOverride,
    decision: 'human-approved',
  });
}

/** Undo a previous brain.correction within the 7-day window (ARCH §7.9). */
export async function undoCorrection(opts: UndoOptions): Promise<CorrectionResult> {
  const maxDays = opts.maxAgeDays ?? 7;
  const evt = opts.db
    .prepare(
      `SELECT seq, ts, payload_hash, action
       FROM audit_events
       WHERE workspace_id = ? AND seq = ?`,
    )
    .get(opts.workspaceId, opts.auditSeq) as
    | { seq: number; ts: string; payload_hash: string | null; action: string }
    | undefined;

  if (!evt || evt.action !== 'brain.correction') {
    throw new BrainTrustError(
      'NO_PRIOR_CORRECTION',
      `no brain.correction event at seq=${opts.auditSeq}`,
    );
  }

  const ageMs = Date.now() - new Date(evt.ts).getTime();
  if (ageMs > maxDays * 24 * 60 * 60 * 1000) {
    throw new BrainTrustError(
      'OUTSIDE_UNDO_WINDOW',
      `correction at seq=${opts.auditSeq} is older than ${maxDays} days; undo refused`,
    );
  }

  // Read the original correction's payload blob to recover fact_id + transition.
  if (!evt.payload_hash) {
    throw new BrainTrustError(
      'NO_PRIOR_CORRECTION',
      `correction at seq=${opts.auditSeq} has no payload blob`,
    );
  }
  const blobContent = await readFile(opts.blobs.pathFor(evt.payload_hash), 'utf8');
  const original = JSON.parse(blobContent) as {
    fact_id?: string;
    from_tier?: FactTier;
    to_tier?: FactTier;
  };
  if (!original.fact_id || !original.from_tier || !original.to_tier) {
    throw new BrainTrustError('NO_PRIOR_CORRECTION', 'correction payload malformed');
  }

  const fact = fetchFact(opts.db, opts.workspaceId, original.fact_id);
  if (!fact) {
    throw new BrainTrustError(
      'FACT_NOT_FOUND',
      `fact ${original.fact_id} referenced by correction no longer exists`,
    );
  }

  // Stabilization §3.2: refuse the undo if a newer correction has moved
  // the fact's tier off `original.to_tier`. Blindly resetting to
  // `original.from_tier` would clobber the intervening state.
  if (fact.tier !== original.to_tier) {
    throw new BrainTrustError(
      'INTERVENING_CORRECTION',
      `cannot undo seq=${opts.auditSeq}: fact is now at ${fact.tier}, but the correction left it at ${original.to_tier}. Resolve newer corrections first.`,
    );
  }

  // Reverse: move from current tier back to original.from_tier.
  return applyTransition({
    ctx: opts.ctx,
    db: opts.db,
    workspaceId: opts.workspaceId,
    fact,
    toTier: original.from_tier,
    actor: `user:${opts.approver}`,
    reason: 'human_undo',
    note: `undo of seq=${opts.auditSeq} (${original.from_tier} → ${original.to_tier})`,
    isUndoOf: opts.auditSeq,
    decision: 'human-approved',
  });
}

function defaultUpTier(current: FactTier): FactTier {
  switch (current) {
    case 'T0':
      return 'T+1';
    case 'T+1':
      return 'T+2';
    default:
      return current;
  }
}
function defaultDownTier(current: FactTier): FactTier {
  switch (current) {
    case 'T+2':
      return 'T+1';
    case 'T+1':
      return 'T0';
    case 'T0':
      return 'T-2';
    case 'T-1':
      return 'T-2';
    default:
      return current;
  }
}

interface ApplyTransitionInput {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly fact: FactRow;
  readonly toTier: FactTier;
  readonly actor: string;
  readonly reason: CorrectionReason;
  readonly note?: string;
  readonly isUndoOf?: number;
  /**
   * Audit metadata: 'human-approved' for human-initiated transitions
   * (promote, demote, undo); 'auto-approve' reserved for genuinely
   * machine-decided transitions. Default 'auto-approve'.
   * Stabilization §3.3.
   */
  readonly decision?: 'auto-approve' | 'human-approved';
  /**
   * Simulator-only: back-date the audit event ts and the fact's
   * timestamp columns to a specific moment. Production calls leave
   * this unset and the wall-clock is used.
   */
  readonly tsOverride?: string;
}

async function applyTransition(args: ApplyTransitionInput): Promise<CorrectionResult> {
  const correctionId = nextCorrectionId();
  const toConfidence = TIER_CONFIDENCE[args.toTier];
  const effectiveTs = args.tsOverride ?? new Date().toISOString();
  // Stabilization §3.1: only a human_promotion is a corroboration event.
  // Demotions and undos administratively touch the row but do NOT
  // re-corroborate the fact's content. Decay reads last_corroborated
  // as the semantic anchor; do not move it on non-corroboration.
  const isCorroboration = args.reason === 'human_promotion';
  const result = await auditedWrite(args.ctx, {
    workspaceId: args.workspaceId,
    actor: args.actor,
    action: 'brain.correction',
    kind: 'system',
    decision: args.decision ?? 'auto-approve',
    tsOverride: args.tsOverride,
    payload: {
      correction_id: correctionId,
      fact_id: args.fact.id,
      area: args.fact.area,
      from_tier: args.fact.tier,
      to_tier: args.toTier,
      from_confidence: args.fact.confidence,
      to_confidence: toConfidence,
      reason: args.reason,
      note: args.note ?? null,
      is_undo_of_seq: args.isUndoOf ?? null,
    },
    brainWrites: () => {
      if (isCorroboration) {
        args.db
          .prepare(
            `UPDATE semantic_facts
             SET tier = ?, confidence = ?,
                 last_corroborated = ?, last_administratively_touched = ?
             WHERE workspace_id = ? AND id = ?`,
          )
          .run(args.toTier, toConfidence, effectiveTs, effectiveTs, args.workspaceId, args.fact.id);
      } else {
        args.db
          .prepare(
            `UPDATE semantic_facts
             SET tier = ?, confidence = ?, last_administratively_touched = ?
             WHERE workspace_id = ? AND id = ?`,
          )
          .run(args.toTier, toConfidence, effectiveTs, args.workspaceId, args.fact.id);
      }
    },
  });

  return {
    factId: args.fact.id,
    fromTier: args.fact.tier,
    toTier: args.toTier,
    fromConfidence: args.fact.confidence,
    toConfidence,
    auditSeq: result.seq,
    correctionId,
  };
}
