// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { pack } from './packer.js';
export { gitDiff, gitLog } from './git-diff.js';
export { rankByKeyword } from './keyword-rank.js';
export { estimateFactTokens, shapeTrustedFacts } from './shape-trusted-facts.js';
export { recomputeBundleHash } from './recompute.js';
export type { GitDiffOptions, GitDiffResult } from './git-diff.js';
export type { KeywordRankOptions, RankedFile } from './keyword-rank.js';
export type { RecomputeBundleHashResult, StoredLayer } from './recompute.js';
export type { ShapingResult } from './shape-trusted-facts.js';
export type {
  BundleMetrics,
  ContextBundle,
  ContextLayer,
  LayerKind,
  OmissionReason,
  OmittedFact,
  PackerInput,
  QuarantineFact,
  ShapingConfig,
  TrustedFact,
} from './types.js';
