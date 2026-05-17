// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Brain-aging simulator — Phase 2 unblocking tool.
//
// Injects a curated fact corpus into a workspace with back-dated audit
// events that look like the brain accreted naturally over N weeks of
// real usage. The audit chain remains intact (verifyChain returns ok);
// only the `ts` fields move backwards in real-clock terms.
//
// What this provides operationally: a workspace whose brain state
// matches a realistic month-2-of-a-real-project so the hygiene
// deliverables (dedup, decay, adaptive shaping) can be tested before
// real usage data exists.

import { createHash, randomUUID } from 'node:crypto';
import {
  type AuditedWriteContext,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import { ALPHA_SERVICE_CORPUS, type CorpusFact, summarizeCorpus } from './corpus.js';

export interface AgingOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  /** Project span in weeks. Default 8. */
  readonly spanWeeks?: number;
  /** Anchor date for the END of the simulation (i.e., week N). Default: now. */
  readonly endDate?: Date;
  /** Optional seed for deterministic timing jitter. Default: 0xC0FFEE. */
  readonly seed?: number;
  /** Custom corpus; defaults to the canonical ALPHA_SERVICE_CORPUS. */
  readonly corpus?: ReadonlyArray<CorpusFact>;
  /** When true, write nothing — only return what would happen. */
  readonly dryRun?: boolean;
  /**
   * When true, every corpus fact is inserted as T0 only. No promotion or
   * corroboration events are produced. Used by the long-horizon engine
   * to drive review cadence independently of the corpus's targetTier.
   */
  readonly introduceOnly?: boolean;
}

export interface AgingResult {
  readonly factsInserted: number;
  readonly factsPromoted: number;
  readonly factsCorroborated: number;
  readonly auditEventsWritten: number;
  readonly spanDays: number;
  readonly firstEventTs: string;
  readonly lastEventTs: string;
}

/** Tiny xorshift32 PRNG so simulator output is reproducible without a dep. */
function makePrng(seed: number): () => number {
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

/** Quantize a Date to ISO with millisecond precision. */
function iso(d: Date): string {
  return d.toISOString();
}

/** Get a deterministic day-of-week offset within a given simulated week,
 *  spread across roughly business hours. */
function dayOffsetMs(prng: () => number): number {
  // Distribute 6 days per week (Mon-Sat), with some daily jitter.
  const day = Math.floor(prng() * 6); // 0..5
  const hour = 9 + Math.floor(prng() * 8); // 9..16
  const minute = Math.floor(prng() * 60);
  return ((day * 24 + hour) * 60 + minute) * 60 * 1000;
}

interface ScheduledFact {
  readonly factDef: CorpusFact;
  readonly factId: string;
  readonly area: string;
  readonly statement: string;
  readonly statementHash: string;
  readonly introducedAt: Date;
  /** Workflow id we fabricate as the originator. */
  readonly workflowId: string;
  /** Target tier at end of simulation. */
  readonly targetTier: 'T0' | 'T+1' | 'T+2';
  /** When this fact was promoted, if at all. */
  readonly promotedAt: Date | null;
  /** When this fact was corroborated (second promotion to T+2). */
  readonly corroboratedAt: Date | null;
}

function scheduleFact(
  def: CorpusFact,
  weekStart: Date,
  weekMs: number,
  prng: () => number,
  spanWeeks: number,
): ScheduledFact {
  const intro = new Date(weekStart.getTime() + dayOffsetMs(prng));
  let promotedAt: Date | null = null;
  let corroboratedAt: Date | null = null;

  if (def.targetTier === 'T+1' || def.targetTier === 'T+2') {
    // Promote anywhere from "same day" to "2 weeks later," but never past
    // the simulation end date.
    const delayDays = Math.min(0.3 + prng() * 14, (spanWeeks - def.weekIntroduced + 1) * 7 - 0.5);
    promotedAt = new Date(intro.getTime() + delayDays * 24 * 60 * 60 * 1000);
  }
  if (def.targetTier === 'T+2' && promotedAt) {
    // Corroboration follows promotion by 1-3 weeks.
    const corrDays = 7 + prng() * 14;
    const corrTime = promotedAt.getTime() + corrDays * 24 * 60 * 60 * 1000;
    const endMs = weekStart.getTime() + (spanWeeks - def.weekIntroduced + 1) * weekMs;
    corroboratedAt = new Date(Math.min(corrTime, endMs - 60_000));
  }

  return {
    factDef: def,
    factId: `fact_${randomUUID()}`,
    area: def.area,
    statement: def.statement,
    statementHash: createHash('sha256').update(`${def.area}::${def.statement}`).digest('hex'),
    introducedAt: intro,
    workflowId: `wf_${randomUUID()}`,
    targetTier: def.targetTier,
    promotedAt,
    corroboratedAt,
  };
}

interface TimelineEvent {
  readonly kind: 'introduce' | 'promote' | 'corroborate';
  readonly at: Date;
  readonly fact: ScheduledFact;
  /** For promote: target tier; for corroborate: 'T+2'. */
  readonly toTier?: 'T+1' | 'T+2';
}

function buildTimeline(scheduled: ReadonlyArray<ScheduledFact>): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const f of scheduled) {
    events.push({ kind: 'introduce', at: f.introducedAt, fact: f });
    if (f.promotedAt) {
      events.push({ kind: 'promote', at: f.promotedAt, fact: f, toTier: 'T+1' });
    }
    if (f.corroboratedAt) {
      events.push({ kind: 'corroborate', at: f.corroboratedAt, fact: f, toTier: 'T+2' });
    }
  }
  // Deterministic chronological order; tie-break by factId for stability.
  events.sort((a, b) => {
    const diff = a.at.getTime() - b.at.getTime();
    if (diff !== 0) return diff;
    return a.fact.factId < b.fact.factId ? -1 : 1;
  });
  return events;
}

export async function runAging(opts: AgingOptions): Promise<AgingResult> {
  const spanWeeks = opts.spanWeeks ?? 8;
  const endDate = opts.endDate ?? new Date();
  const corpus = opts.corpus ?? ALPHA_SERVICE_CORPUS;
  const prng = makePrng(opts.seed ?? 0xc0ffee);

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const startDate = new Date(endDate.getTime() - spanWeeks * weekMs);

  // Schedule every fact's introduce / promote / corroborate events.
  const scheduled: ScheduledFact[] = [];
  for (const def of corpus) {
    const weekStart = new Date(startDate.getTime() + (def.weekIntroduced - 1) * weekMs);
    const sf = scheduleFact(def, weekStart, weekMs, prng, spanWeeks);
    if (opts.introduceOnly) {
      // Strip promote/corroborate; the long-horizon driver runs reviews
      // separately and decides which T0 facts get promoted when.
      scheduled.push({ ...sf, promotedAt: null, corroboratedAt: null, targetTier: 'T0' });
    } else {
      scheduled.push(sf);
    }
  }
  const timeline = buildTimeline(scheduled);

  if (opts.dryRun) {
    return {
      factsInserted: scheduled.length,
      factsPromoted: scheduled.filter((s) => s.promotedAt).length,
      factsCorroborated: scheduled.filter((s) => s.corroboratedAt).length,
      auditEventsWritten: 0,
      spanDays: spanWeeks * 7,
      firstEventTs: iso(timeline[0]?.at ?? startDate),
      lastEventTs: iso(timeline[timeline.length - 1]?.at ?? endDate),
    };
  }

  let factsInserted = 0;
  let factsPromoted = 0;
  let factsCorroborated = 0;
  let auditEventsWritten = 0;

  // Pre-stage a synthetic workflows row for each unique workflowId so
  // semantic_facts can FK-link to it.
  const seenWorkflows = new Set<string>();
  for (const f of scheduled) seenWorkflows.add(f.workflowId);
  const insertWorkflow = opts.db.prepare(
    `INSERT OR IGNORE INTO workflows
       (id, workspace_id, type, version, started_at, finished_at, status,
        total_input_tokens, total_output_tokens, total_usd_micro)
     VALUES (?, ?, 'plan', '1.0.0', ?, ?, 'completed_simulated', 0, 0, 0)`,
  );
  for (const wf of seenWorkflows) {
    // Use the introduction time of the fact owned by this workflow.
    const owner = scheduled.find((s) => s.workflowId === wf);
    if (!owner) continue;
    const ts = iso(owner.introducedAt);
    insertWorkflow.run(wf, opts.workspaceId, ts, ts);
  }

  for (const ev of timeline) {
    if (ev.kind === 'introduce') {
      await auditedWrite(opts.ctx, {
        workspaceId: opts.workspaceId,
        actor: `simulator:workflow:plan#${ev.fact.workflowId}`,
        action: 'brain.fact_quarantined',
        kind: 'system',
        decision: 'auto-approve',
        tsOverride: iso(ev.at),
        payload: {
          fact_id: ev.fact.factId,
          area: ev.fact.area,
          statement: ev.fact.statement,
          tier: 'T0',
          confidence: 0.3,
          source: 'simulator',
        },
        brainWrites: ({ seq }) => {
          opts.db
            .prepare(
              `INSERT INTO semantic_facts
                 (id, workspace_id, area, statement, statement_hash,
                  provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
                  last_administratively_touched)
               VALUES (?, ?, ?, ?, ?, ?, 'T0', ?, 0.3, ?, ?)`,
            )
            .run(
              ev.fact.factId,
              opts.workspaceId,
              ev.fact.area,
              ev.fact.statement,
              ev.fact.statementHash,
              ev.fact.workflowId,
              iso(ev.at),
              seq,
              iso(ev.at),
            );
        },
      });
      factsInserted += 1;
      auditEventsWritten += 1;
    } else if (ev.kind === 'promote') {
      // T0 → T+1 transition recorded as a brain.correction event.
      await auditedWrite(opts.ctx, {
        workspaceId: opts.workspaceId,
        actor: 'simulator:user:engineer',
        action: 'brain.correction',
        kind: 'system',
        decision: 'auto-approve',
        tsOverride: iso(ev.at),
        payload: {
          correction_id: `corr_sim_${ev.fact.factId.slice(0, 8)}`,
          fact_id: ev.fact.factId,
          area: ev.fact.area,
          from_tier: 'T0',
          to_tier: 'T+1',
          from_confidence: 0.3,
          to_confidence: 0.7,
          reason: 'simulator:human_promotion',
          note: null,
          is_undo_of_seq: null,
        },
        brainWrites: () => {
          opts.db
            .prepare(
              `UPDATE semantic_facts
               SET tier = 'T+1', confidence = 0.7,
                   last_corroborated = ?, last_administratively_touched = ?
               WHERE workspace_id = ? AND id = ?`,
            )
            .run(iso(ev.at), iso(ev.at), opts.workspaceId, ev.fact.factId);
        },
      });
      factsPromoted += 1;
      auditEventsWritten += 1;
    } else if (ev.kind === 'corroborate') {
      // T+1 → T+2 transition (would normally happen via dedup-corroboration
      // signal; we model it as a direct correction event for now).
      await auditedWrite(opts.ctx, {
        workspaceId: opts.workspaceId,
        actor: 'simulator:user:engineer',
        action: 'brain.correction',
        kind: 'system',
        decision: 'auto-approve',
        tsOverride: iso(ev.at),
        payload: {
          correction_id: `corr_sim_corro_${ev.fact.factId.slice(0, 8)}`,
          fact_id: ev.fact.factId,
          area: ev.fact.area,
          from_tier: 'T+1',
          to_tier: 'T+2',
          from_confidence: 0.7,
          to_confidence: 0.9,
          reason: 'simulator:corroborated_via_followup_plan',
          note: null,
          is_undo_of_seq: null,
        },
        brainWrites: () => {
          opts.db
            .prepare(
              `UPDATE semantic_facts
               SET tier = 'T+2', confidence = 0.9,
                   last_corroborated = ?, last_administratively_touched = ?
               WHERE workspace_id = ? AND id = ?`,
            )
            .run(iso(ev.at), iso(ev.at), opts.workspaceId, ev.fact.factId);
        },
      });
      factsCorroborated += 1;
      auditEventsWritten += 1;
    }
  }

  return {
    factsInserted,
    factsPromoted,
    factsCorroborated,
    auditEventsWritten,
    spanDays: spanWeeks * 7,
    firstEventTs: iso(timeline[0]?.at ?? startDate),
    lastEventTs: iso(timeline[timeline.length - 1]?.at ?? endDate),
  };
}

export { summarizeCorpus, ALPHA_SERVICE_CORPUS };
export type { CorpusFact };
