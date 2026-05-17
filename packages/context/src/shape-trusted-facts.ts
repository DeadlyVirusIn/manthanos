// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Adaptive shaping for the trusted-facts layer — Phase 2 deliverable #5.
//
// Conservative and deterministic. No semantic retrieval, no embeddings,
// no AI-generated compression, no opaque scoring. Every omission has a
// concrete, human-explainable reason.
//
// Shaping does THREE things, in this strict order:
//
//   1. Sort: priorityAreas first; then (tier desc, confidence desc,
//      area asc, statement asc) — fully deterministic. This is the
//      default behavior even without any ShapingConfig.
//
//   2. Filter on minConfidence: drop facts below floor (reason:
//      below_min_confidence). Optional; default no floor.
//
//   3. Trim on trustedFactsTokenBudget: take from the head of the
//      sorted list while a running token total fits; drop the rest
//      (reason: budget_overflow). Optional; default unlimited.
//
// The token cost of each fact matches the rendering inside packer.ts:
// "- [<TIER> · <area> · conf=X.XX · src=<wf>] <statement>"

import type { OmittedFact, ShapingConfig, TrustedFact } from './types.js';

const CHARS_PER_TOKEN = 3.5;

const TIER_RANK: Record<'T+3' | 'T+2' | 'T+1', number> = {
  'T+3': 3,
  'T+2': 2,
  'T+1': 1,
};

export function estimateFactTokens(fact: TrustedFact): number {
  const src = fact.provenanceWorkflowId ? ` · src=${fact.provenanceWorkflowId}` : '';
  const line = `- [${fact.tier} · ${fact.area} · conf=${fact.confidence.toFixed(2)}${src}] ${fact.statement}`;
  return Math.ceil(line.length / CHARS_PER_TOKEN);
}

export interface ShapingResult {
  readonly kept: ReadonlyArray<TrustedFact>;
  readonly omitted: ReadonlyArray<OmittedFact>;
}

function shapingCompare(
  priorityMap: ReadonlyMap<string, number>,
): (a: TrustedFact, b: TrustedFact) => number {
  return (a, b) => {
    // 1. Priority area first (lower index = higher priority).
    const aPrio = priorityMap.get(a.area) ?? Number.MAX_SAFE_INTEGER;
    const bPrio = priorityMap.get(b.area) ?? Number.MAX_SAFE_INTEGER;
    if (aPrio !== bPrio) return aPrio - bPrio;

    // 2. Tier descending (T+3 → T+2 → T+1).
    const aTier = TIER_RANK[a.tier];
    const bTier = TIER_RANK[b.tier];
    if (aTier !== bTier) return bTier - aTier;

    // 3. Confidence descending.
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;

    // 4. Area ascending (stable, replay-safe).
    if (a.area !== b.area) return a.area < b.area ? -1 : 1;

    // 5. Statement ascending.
    if (a.statement !== b.statement) return a.statement < b.statement ? -1 : 1;

    // 6. Final tiebreaker: id ascending.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export function shapeTrustedFacts(
  facts: ReadonlyArray<TrustedFact>,
  config: ShapingConfig | undefined,
): ShapingResult {
  const priorityMap = new Map<string, number>();
  (config?.priorityAreas ?? []).forEach((area, i) => {
    if (!priorityMap.has(area)) priorityMap.set(area, i);
  });

  const sorted = [...facts].sort(shapingCompare(priorityMap));

  const omitted: OmittedFact[] = [];
  const minConf = config?.minConfidence;
  let postFloor: TrustedFact[];
  if (minConf !== undefined && minConf > 0) {
    postFloor = [];
    for (const f of sorted) {
      if (f.confidence < minConf) {
        omitted.push({
          id: f.id,
          area: f.area,
          tier: f.tier,
          confidence: f.confidence,
          estimatedTokens: estimateFactTokens(f),
          reason: 'below_min_confidence',
          detail: `conf=${f.confidence.toFixed(2)} < floor ${minConf.toFixed(2)}`,
        });
      } else {
        postFloor.push(f);
      }
    }
  } else {
    postFloor = sorted;
  }

  const budget = config?.trustedFactsTokenBudget;
  const kept: TrustedFact[] = [];
  if (budget === undefined || budget < 0) {
    kept.push(...postFloor);
  } else {
    // Reserve tokens for the layer's wrapping header (1 line). The packer
    // prepends "Trusted project facts (...):\n". Cost it once.
    const HEADER_TOKENS = Math.ceil(
      'Trusted project facts (promoted by the human; treat as high-signal priors):'.length /
        CHARS_PER_TOKEN,
    );
    let running = HEADER_TOKENS;
    for (const f of postFloor) {
      const cost = estimateFactTokens(f);
      if (running + cost > budget) {
        omitted.push({
          id: f.id,
          area: f.area,
          tier: f.tier,
          confidence: f.confidence,
          estimatedTokens: cost,
          reason: 'budget_overflow',
          detail: `running ${running}+${cost} would exceed budget ${budget}`,
        });
      } else {
        kept.push(f);
        running += cost;
      }
    }
  }

  return { kept, omitted };
}
