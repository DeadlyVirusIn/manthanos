// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Context packer v0 types per ARCHITECTURE §5 + §7.5 + BOOTSTRAP §8.
// Phase 1.6: facts are split by trust tier. Trusted facts enter the
// default bundle; T0 (quarantine) only enters when explicitly opted in.

export type LayerKind =
  | 'charter'
  | 'trusted_facts'
  | 'quarantine_facts'
  | 'task_brief'
  | 'git_diff'
  | 'decisions'
  | 'source';

export interface ContextLayer {
  readonly kind: LayerKind;
  /** XML-tagged wrapper applied at render time (SAFETY §11b.1). */
  readonly wrapAs: 'system' | 'task_brief' | 'repository_text';
  /** Optional path/identifier carried into the wrapper as an attribute. */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Untrusted/structurally-suspect content gets a trust tag. */
  readonly trust: 'system' | 'user_input' | 'untrusted';
  readonly content: string;
  /** Rough token estimate; chars/4 unless overridden. */
  readonly estimatedTokens: number;
  /** Stable provenance for the audit blob. */
  readonly provenance: string;
}

export type OmissionReason = 'below_min_confidence' | 'budget_overflow' | 'tier_below_floor';

export interface OmittedFact {
  readonly id: string;
  readonly area: string;
  readonly tier: 'T+1' | 'T+2' | 'T+3' | 'T0';
  readonly confidence: number;
  readonly estimatedTokens: number;
  readonly reason: OmissionReason;
  /** Short human-readable explanation, e.g., "conf=0.40 < floor 0.50". */
  readonly detail: string;
}

export interface BundleMetrics {
  /** Tier-tagged counts of facts that entered the bundle. */
  readonly trustedFactsInBundle: number;
  readonly quarantineFactsInBundle: number;
  /** Number of `repository_text` layers (untrusted). */
  readonly untrustedLayerCount: number;
  /** Number of `system` layers (trusted). */
  readonly systemLayerCount: number;
  /** Token estimates split by trust class. */
  readonly trustedTokens: number;
  readonly untrustedTokens: number;
  /**
   * Every trusted fact that was omitted from the bundle, with reason.
   * Replay-safe: this is metrics-only and not part of the bundle hash.
   * The list is empty unless shaping rules trimmed something.
   */
  readonly omittedFacts: ReadonlyArray<OmittedFact>;
}

/**
 * Adaptive shaping for the trusted-facts layer. Conservative and
 * deterministic; every omission is explainable. Absent => no trimming.
 */
export interface ShapingConfig {
  /** Cap trusted-facts layer at N estimated tokens; trim weakest-first. */
  readonly trustedFactsTokenBudget?: number;
  /** Omit trusted facts whose confidence < this. */
  readonly minConfidence?: number;
  /** Ordered list of areas to pack first (before non-priority areas). */
  readonly priorityAreas?: readonly string[];
}

export interface ContextBundle {
  readonly bundleHash: string;
  readonly layers: readonly ContextLayer[];
  readonly totalEstimatedTokens: number;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly metrics: BundleMetrics;
}

export interface TrustedFact {
  readonly id: string;
  readonly area: string;
  readonly statement: string;
  readonly tier: 'T+1' | 'T+2' | 'T+3';
  readonly confidence: number;
  /** Workflow id that originally derived the fact, if any. */
  readonly provenanceWorkflowId: string | null;
}

export interface QuarantineFact {
  readonly id: string;
  readonly area: string;
  readonly statement: string;
  readonly tier: 'T0';
  readonly confidence: number;
  readonly provenanceWorkflowId: string | null;
}

export interface PackerInput {
  readonly workspaceRoot: string;
  readonly taskBrief: string;
  /**
   * Bootstrap charter facts — extracted from manifest/git on init.
   * Always entered into the system prompt as "low-confidence priors"
   * regardless of trust tier, because they're operationally reliable
   * (`language=typescript` is hard to be wrong about). See BOOTSTRAP §6.
   */
  readonly charterFacts: ReadonlyArray<{ area: string; statement: string; tier: string }>;
  /**
   * Facts at tier T+1 / T+2 / T+3. These enter the system prompt with
   * provenance and tier annotations. Always sorted deterministically.
   */
  readonly trustedFacts: ReadonlyArray<TrustedFact>;
  /**
   * Facts at tier T0 (quarantine). Excluded by default; included only
   * when `includeQuarantine = true`.
   */
  readonly quarantineFacts: ReadonlyArray<QuarantineFact>;
  /** Default false. Include T0 facts in the bundle. */
  readonly includeQuarantine?: boolean;
  /** Recent decisions in scope. */
  readonly decisions: ReadonlyArray<{
    area: string;
    summary: string;
    rationale: string;
    signed_at: string | null;
  }>;
  /**
   * Optional explicit file set — paths relative to workspaceRoot.
   * When omitted, the packer uses git diff + keyword ranking.
   */
  readonly includeFiles?: readonly string[];
  /** Hard ceiling on estimated tokens; layers truncate or drop in order. */
  readonly tokenBudget: number;
  /** Per-layer max bytes — defensive against pathologically large files. */
  readonly maxBytesPerFile?: number;
  /** Top-K files when keyword-ranking; default 8. */
  readonly topK?: number;
  /**
   * Adaptive shaping for the trusted-facts layer. Default: refined sort
   * only (no trimming). Set fields here to enable budget/floor/priority.
   */
  readonly shaping?: ShapingConfig;
}
