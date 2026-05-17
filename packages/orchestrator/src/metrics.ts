// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal observability primitives — Phase 2 deliverable #2.
//
// Just enough instrumentation to answer the questions PHASE2_THEORY.md
// frames as critical for Phase 2:
//
//   - trusted token count (estimated)
//   - stale-fact ratio
//   - contradiction count (rough — flag-style)
//   - fact reuse frequency
//   - average facts injected per bundle
//   - trusted-layer growth rate (week-over-week)
//
// CpT (continuity-per-token) requires output-side measurement against
// real plans and is therefore Phase 3, not Phase 2. We surface what
// can be computed from the brain alone.

import type { ManthanSqliteHandle } from '@manthanos/memory';

const CHARS_PER_TOKEN = 3.5;
const STALE_THRESHOLD_DAYS = 60;

export interface BrainMetrics {
  /** All facts at T+1/T+2/T+3 — the prompt-bound trusted set. */
  readonly trustedFacts: number;
  /** Estimated tokens those trusted facts cost when rendered into the bundle. */
  readonly trustedTokensEstimated: number;
  /** Per-area breakdown of trusted facts (high-bloat areas show up). */
  readonly trustedByArea: ReadonlyArray<{ area: string; count: number; estimatedTokens: number }>;
  /** Facts with last_corroborated older than 60 days. */
  readonly staleFacts: number;
  /** staleFacts / trustedFacts (or 0 if no trusted). */
  readonly staleRatio: number;
  /**
   * Pair count of trusted facts in the same area that share ≥3 meaningful
   * keywords — a coarse "possible duplicate or contradiction" signal.
   * Real contradiction surfacing is a separate Phase 3 deliverable; this is
   * just an early-warning ratio.
   */
  readonly highOverlapPairs: number;
  /** Number of plan-style workflows recorded. */
  readonly workflowsRecorded: number;
  /** Average trusted-facts count in plan workflows' bundles (when recorded). */
  readonly avgTrustedFactsPerBundle: number;
  /** Trusted facts added per week, week-over-week, over the audit's full span. */
  readonly trustedGrowthByWeek: ReadonlyArray<{ weekStart: string; added: number }>;
  /** Window covered by these metrics. */
  readonly windowStart: string;
  readonly windowEnd: string;
}

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

function meaningfulTokens(text: string): Set<string> {
  const set = new Set<string>();
  for (const tok of text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))) {
    set.add(tok);
  }
  return set;
}

export function computeBrainMetrics(
  db: ManthanSqliteHandle,
  workspaceId: string,
): BrainMetrics {
  // Trusted facts (T+1 and above).
  const trustedRows = db
    .prepare(
      `SELECT id, area, statement, tier, last_corroborated
       FROM semantic_facts
       WHERE workspace_id = ? AND tier IN ('T+1', 'T+2', 'T+3')`,
    )
    .all(workspaceId) as Array<{
    id: string;
    area: string;
    statement: string;
    tier: string;
    last_corroborated: string;
  }>;

  const trustedFacts = trustedRows.length;
  // Estimated rendered tokens: the bundle renders each fact roughly as
  //   "- [TIER · area · conf=0.70 · src=wf_XXXXXXXX] <statement>\n"
  // We approximate the wrapper at ~50 chars per fact + the statement.
  const trustedTokensEstimated = trustedRows.reduce((acc, f) => {
    const wrapperChars = 50;
    const totalChars = wrapperChars + f.statement.length;
    return acc + Math.ceil(totalChars / CHARS_PER_TOKEN);
  }, 0);

  // Per-area breakdown.
  const areaMap = new Map<string, { count: number; estimatedTokens: number }>();
  for (const f of trustedRows) {
    const wrapperChars = 50;
    const tokens = Math.ceil((wrapperChars + f.statement.length) / CHARS_PER_TOKEN);
    const entry = areaMap.get(f.area) ?? { count: 0, estimatedTokens: 0 };
    entry.count += 1;
    entry.estimatedTokens += tokens;
    areaMap.set(f.area, entry);
  }
  const trustedByArea = Array.from(areaMap.entries())
    .map(([area, v]) => ({ area, count: v.count, estimatedTokens: v.estimatedTokens }))
    .sort((a, b) => b.count - a.count);

  // Stale facts.
  const staleCutoffMs = Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const staleFacts = trustedRows.filter((f) => {
    const t = Date.parse(f.last_corroborated);
    return Number.isFinite(t) && t < staleCutoffMs;
  }).length;
  const staleRatio = trustedFacts === 0 ? 0 : staleFacts / trustedFacts;

  // High-overlap pairs (coarse contradiction / duplicate signal).
  let highOverlapPairs = 0;
  const tokenized = trustedRows.map((f) => ({
    id: f.id,
    area: f.area,
    tokens: meaningfulTokens(f.statement),
  }));
  for (let i = 0; i < tokenized.length; i++) {
    const a = tokenized[i];
    if (!a) continue;
    for (let j = i + 1; j < tokenized.length; j++) {
      const b = tokenized[j];
      if (!b) continue;
      if (a.area !== b.area) continue;
      // Count shared meaningful tokens.
      let shared = 0;
      for (const tok of a.tokens) {
        if (b.tokens.has(tok)) shared += 1;
        if (shared >= 3) break;
      }
      if (shared >= 3) highOverlapPairs += 1;
    }
  }

  // Workflow & bundle metrics.
  const workflowsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM workflows WHERE workspace_id = ? AND type = 'plan'`,
    )
    .get(workspaceId) as { n: number };
  const workflowsRecorded = workflowsRow.n;

  // Try to compute avg trusted_facts_in_bundle from recorded context.pack events
  // whose payload blob includes trusted_facts_in_bundle.
  // For simplicity in this minimal pass, we approximate by scanning the
  // workflows.audit_seq range and reading context_snapshots layers_json.
  const snapshots = db
    .prepare(
      `SELECT layers_json FROM context_snapshots WHERE workspace_id = ?`,
    )
    .all(workspaceId) as Array<{ layers_json: string }>;
  let bundleSamples = 0;
  let bundleTrustedFactsSum = 0;
  for (const s of snapshots) {
    try {
      const layers = JSON.parse(s.layers_json) as Array<{ kind: string; estimated_tokens: number }>;
      const trustedLayer = layers.find((l) => l.kind === 'trusted_facts');
      // We approximate trusted-facts count via tokens / per-fact-cost.
      // Since per-fact token cost varies, we use a coarse 30-tokens-per-fact estimate.
      const trustedCount = trustedLayer ? Math.round(trustedLayer.estimated_tokens / 30) : 0;
      bundleTrustedFactsSum += trustedCount;
      bundleSamples += 1;
    } catch {
      // skip malformed snapshot
    }
  }
  const avgTrustedFactsPerBundle =
    bundleSamples === 0 ? 0 : bundleTrustedFactsSum / bundleSamples;

  // Growth-by-week: count brain.correction events that landed a fact at
  // T+1 (or directly at T+2 via corroboration), bucketed by week.
  const correctionEvents = db
    .prepare(
      `SELECT ts, payload_hash FROM audit_events
       WHERE workspace_id = ? AND action = 'brain.correction'
       ORDER BY ts ASC`,
    )
    .all(workspaceId) as Array<{ ts: string; payload_hash: string | null }>;
  // For metric simplicity we count every correction that promotes a fact
  // (we don't read payload blobs to filter on to_tier). This over-counts
  // demotions but those are rare in the simulator output. Phase 3 refines.
  const weekBuckets = new Map<string, number>();
  for (const e of correctionEvents) {
    const t = new Date(e.ts);
    if (!Number.isFinite(t.getTime())) continue;
    // Bucket by Monday of that week.
    const day = t.getUTCDay(); // 0..6, 0=Sunday
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + mondayOffset),
    );
    const key = monday.toISOString().slice(0, 10);
    weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
  }
  const trustedGrowthByWeek = Array.from(weekBuckets.entries())
    .map(([weekStart, added]) => ({ weekStart, added }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

  // Window.
  const firstRow = db
    .prepare(
      `SELECT ts FROM audit_events WHERE workspace_id = ? ORDER BY seq ASC LIMIT 1`,
    )
    .get(workspaceId) as { ts: string } | undefined;
  const lastRow = db
    .prepare(
      `SELECT ts FROM audit_events WHERE workspace_id = ? ORDER BY seq DESC LIMIT 1`,
    )
    .get(workspaceId) as { ts: string } | undefined;

  return {
    trustedFacts,
    trustedTokensEstimated,
    trustedByArea,
    staleFacts,
    staleRatio,
    highOverlapPairs,
    workflowsRecorded,
    avgTrustedFactsPerBundle,
    trustedGrowthByWeek,
    windowStart: firstRow?.ts ?? '',
    windowEnd: lastRow?.ts ?? '',
  };
}
