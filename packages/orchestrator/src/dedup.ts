// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Dedup — Phase 2 deliverable #3.
//
// Detects paraphrase clusters in the trusted brain (facts that share enough
// meaningful tokens within the same area) and provides a human-gated merge
// action. The merge writes ONE `brain.dedup_merge` audit event and demotes
// the superseded facts to T-2 atomically; the survivor's tier is unchanged.
//
// Discipline: detect-and-propose. Never auto-merge. Cross-area pairs are
// never clustered because the same vocabulary in different areas usually
// means different things.

import {
  type AuditedWriteContext,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import type { FactTier } from './brain-trust.js';

const DEFAULT_THRESHOLD = 0.25;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'be',
  'in',
  'of',
  'and',
  'to',
  'for',
  'with',
  'on',
  'as',
  'at',
  'by',
  'from',
  'or',
  'we',
  'our',
  'this',
  'that',
  'use',
  'used',
  'using',
  'will',
  'can',
  'no',
  'not',
  'all',
  'any',
]);

const TIER_RANK: Record<FactTier, number> = {
  'T+3': 3,
  'T+2': 2,
  'T+1': 1,
  T0: 0,
  'T-1': -1,
  'T-2': -2,
};

export interface ClusterFact {
  readonly id: string;
  readonly statement: string;
  readonly tier: FactTier;
  readonly confidence: number;
  readonly lastCorroborated: string;
}

export interface DuplicateCluster {
  readonly area: string;
  readonly facts: ReadonlyArray<ClusterFact>;
  /** The fact suggested as the survivor (highest tier, tie-broken by recency). */
  readonly suggestedSurvivorId: string;
  /** Minimum pairwise Jaccard across the cluster — useful for ranking. */
  readonly minPairwiseJaccard: number;
}

export interface FindDuplicatesOptions {
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  /** Jaccard threshold for single-link clustering. Default 0.25. */
  readonly threshold?: number;
  /** Optional area filter (e.g., "auth"). */
  readonly area?: string;
}

function tokensOf(text: string): Set<string> {
  const set = new Set<string>();
  for (const tok of text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))) {
    set.add(tok);
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface IndexedFact extends ClusterFact {
  readonly area: string;
  readonly tokens: Set<string>;
}

export function findDuplicateClusters(opts: FindDuplicatesOptions): DuplicateCluster[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  // Only trusted-tier facts are dedup candidates. Quarantined (T0) facts
  // haven't been promoted yet; demoted/contradicted facts already carry a
  // negative signal — re-clustering them just adds noise.
  const rows = opts.db
    .prepare(
      `SELECT id, area, statement, tier, confidence, last_corroborated
       FROM semantic_facts
       WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')
         ${opts.area ? 'AND area = ?' : ''}`,
    )
    .all(...(opts.area ? [opts.workspaceId, opts.area] : [opts.workspaceId])) as Array<{
    id: string;
    area: string;
    statement: string;
    tier: FactTier;
    confidence: number;
    last_corroborated: string;
  }>;

  const facts: IndexedFact[] = rows.map((r) => ({
    id: r.id,
    area: r.area,
    statement: r.statement,
    tier: r.tier,
    confidence: r.confidence,
    lastCorroborated: r.last_corroborated,
    tokens: tokensOf(r.statement),
  }));

  // Single-link clustering via union-find, restricted to same-area pairs.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur);
      if (!next) return cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = parent.get(cur) ?? cur;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const f of facts) parent.set(f.id, f.id);

  // Track the minimum Jaccard seen within each emergent cluster.
  const minJaccard = new Map<string, number>();

  for (let i = 0; i < facts.length; i++) {
    const a = facts[i];
    if (!a) continue;
    for (let j = i + 1; j < facts.length; j++) {
      const b = facts[j];
      if (!b) continue;
      if (a.area !== b.area) continue;
      const sim = jaccard(a.tokens, b.tokens);
      if (sim < threshold) continue;
      union(a.id, b.id);
      const rootAfter = find(a.id);
      const existing = minJaccard.get(rootAfter);
      const newMin = existing === undefined ? sim : Math.min(existing, sim);
      minJaccard.set(rootAfter, newMin);
    }
  }

  // Group facts by root, drop singletons.
  const groups = new Map<string, IndexedFact[]>();
  for (const f of facts) {
    const root = find(f.id);
    const arr = groups.get(root) ?? [];
    arr.push(f);
    groups.set(root, arr);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    // Survivor: highest tier rank, tie-broken by most recent corroboration.
    const survivor = members.reduce((best, m) => {
      const bestRank = TIER_RANK[best.tier];
      const mRank = TIER_RANK[m.tier];
      if (mRank > bestRank) return m;
      if (mRank < bestRank) return best;
      return m.lastCorroborated > best.lastCorroborated ? m : best;
    });
    // Sort cluster members deterministically: survivor first, then by id.
    const sorted = [...members].sort((a, b) => {
      if (a.id === survivor.id) return -1;
      if (b.id === survivor.id) return 1;
      return a.id < b.id ? -1 : 1;
    });
    clusters.push({
      area: members[0]?.area ?? '',
      facts: sorted.map((m) => ({
        id: m.id,
        statement: m.statement,
        tier: m.tier,
        confidence: m.confidence,
        lastCorroborated: m.lastCorroborated,
      })),
      suggestedSurvivorId: survivor.id,
      minPairwiseJaccard: minJaccard.get(root) ?? threshold,
    });
  }

  // Stable sort: highest-confidence cluster first (more facts × more overlap = more value to merge).
  clusters.sort((a, b) => {
    const sizeDiff = b.facts.length - a.facts.length;
    if (sizeDiff !== 0) return sizeDiff;
    return b.minPairwiseJaccard - a.minPairwiseJaccard;
  });
  return clusters;
}

// --------------------------------------------------------------------------
// Merge action
// --------------------------------------------------------------------------

export interface MergeDuplicatesOptions {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly survivorId: string;
  readonly supersededIds: ReadonlyArray<string>;
  readonly approver: string;
  readonly note?: string;
  /** Simulator-only: back-date the audit ts + last_corroborated. */
  readonly tsOverride?: string;
}

export interface MergeResult {
  readonly survivorId: string;
  readonly supersededIds: ReadonlyArray<string>;
  readonly previousTiers: Readonly<Record<string, FactTier>>;
  readonly previousConfidences: Readonly<Record<string, number>>;
  readonly auditSeq: number;
}

export class DedupError extends Error {
  constructor(
    readonly code:
      | 'SURVIVOR_NOT_FOUND'
      | 'SUPERSEDED_NOT_FOUND'
      | 'CROSS_AREA_MERGE'
      | 'EMPTY_SUPERSEDED'
      | 'SIGNED_DEMOTION_BLOCKED'
      | 'SURVIVOR_IN_SUPERSEDED',
    message: string,
  ) {
    super(message);
    this.name = 'DedupError';
  }
}

interface FactRow {
  id: string;
  area: string;
  statement: string;
  tier: FactTier;
  confidence: number;
}

function fetchFact(db: ManthanSqliteHandle, workspaceId: string, factId: string): FactRow | null {
  return (
    (db
      .prepare(
        `SELECT id, area, statement, tier, confidence
         FROM semantic_facts WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, factId) as FactRow | undefined) ?? null
  );
}

function mergeId(): string {
  return `dedup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function mergeDuplicates(opts: MergeDuplicatesOptions): Promise<MergeResult> {
  if (opts.supersededIds.length === 0) {
    throw new DedupError('EMPTY_SUPERSEDED', 'must supersede at least one fact');
  }
  if (opts.supersededIds.includes(opts.survivorId)) {
    throw new DedupError('SURVIVOR_IN_SUPERSEDED', 'survivor id appears in the superseded list');
  }

  const survivor = fetchFact(opts.db, opts.workspaceId, opts.survivorId);
  if (!survivor) {
    throw new DedupError('SURVIVOR_NOT_FOUND', `survivor fact not found: ${opts.survivorId}`);
  }

  const superseded: FactRow[] = [];
  for (const id of opts.supersededIds) {
    const f = fetchFact(opts.db, opts.workspaceId, id);
    if (!f) {
      throw new DedupError('SUPERSEDED_NOT_FOUND', `superseded fact not found: ${id}`);
    }
    if (f.area !== survivor.area) {
      throw new DedupError(
        'CROSS_AREA_MERGE',
        `cross-area merge refused: survivor area=${survivor.area} but ${id} area=${f.area}`,
      );
    }
    if (f.tier === 'T+3') {
      throw new DedupError(
        'SIGNED_DEMOTION_BLOCKED',
        `T+3 (signed) facts cannot be superseded by dedup: ${id}`,
      );
    }
    superseded.push(f);
  }

  const previousTiers: Record<string, FactTier> = {};
  const previousConfidences: Record<string, number> = {};
  for (const f of superseded) {
    previousTiers[f.id] = f.tier;
    previousConfidences[f.id] = f.confidence;
  }

  const correctionId = mergeId();
  const effectiveTs = opts.tsOverride ?? new Date().toISOString();
  const result = await auditedWrite(opts.ctx, {
    workspaceId: opts.workspaceId,
    actor: `user:${opts.approver}`,
    action: 'brain.dedup_merge',
    kind: 'system',
    decision: 'human-approved',
    tsOverride: opts.tsOverride,
    payload: {
      merge_id: correctionId,
      area: survivor.area,
      survivor_id: survivor.id,
      survivor_tier: survivor.tier,
      superseded_ids: [...opts.supersededIds],
      previous_tiers: previousTiers,
      previous_confidences: previousConfidences,
      reason: 'superseded_by_dedup',
      note: opts.note ?? null,
    },
    brainWrites: () => {
      // Stabilization §3.1: dedup-supersede administratively touches the
      // row but is not a corroboration of the superseded statement.
      // Leave last_corroborated alone; update only the administrative ts.
      const stmt = opts.db.prepare(
        `UPDATE semantic_facts
         SET tier = 'T-2', confidence = 0.0, last_administratively_touched = ?
         WHERE workspace_id = ? AND id = ?`,
      );
      for (const f of superseded) {
        stmt.run(effectiveTs, opts.workspaceId, f.id);
      }
    },
  });

  return {
    survivorId: survivor.id,
    supersededIds: [...opts.supersededIds],
    previousTiers,
    previousConfidences,
    auditSeq: result.seq,
  };
}
