// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { RunPlanError, runPlanWorkflow } from './plan-runner.js';
export type { RunPlanOptions, RunPlanResult } from './plan-runner.js';

export { ReplayError, replayRun } from './replay.js';
export type {
  CheckOutcome,
  ReplayInput,
  ReplayResult,
  VerificationChecks,
  VerificationFailure,
  VerificationLegacyReason,
  VerificationReport,
  VerificationStatus,
  VerificationUnverifiableReason,
} from './replay.js';

export { PLAN_INSTRUCTIONS, parsePlan } from './plan-schema.js';
export type { ParseResult, PlanArtifact, PlanRisk, PlanStep } from './plan-schema.js';

export { extractPlan } from './plan-extract.js';
export type { ExtractMethod, PlanExtractResult } from './plan-extract.js';

export { PLAN_TOOL, PLAN_TOOL_NAME, PLAN_TOOL_SYSTEM_INSTRUCTIONS } from './plan-tool.js';

export { compoundFromPlan, inferArea } from './brain-compound.js';
export type { CompoundingInput, CompoundingResult } from './brain-compound.js';

export { BrainTrustError, demoteFact, promoteFact, undoCorrection } from './brain-trust.js';
export type {
  CorrectionReason,
  CorrectionResult,
  DemoteOptions,
  FactTier,
  PromoteOptions,
  UndoOptions,
} from './brain-trust.js';

export { ALPHA_SERVICE_CORPUS, runAging, summarizeCorpus } from './simulator/aging.js';
export type { AgingOptions, AgingResult, CorpusFact } from './simulator/aging.js';

export { computeBrainMetrics } from './metrics.js';
export type { BrainMetrics } from './metrics.js';

export { DedupError, findDuplicateClusters, mergeDuplicates } from './dedup.js';
export type {
  ClusterFact,
  DuplicateCluster,
  FindDuplicatesOptions,
  MergeDuplicatesOptions,
  MergeResult,
} from './dedup.js';

export { runLongHorizon } from './simulator/long-horizon.js';
export type {
  LongHorizonOptions,
  LongHorizonResult,
  LongHorizonSnapshot,
} from './simulator/long-horizon.js';

export { DECAY_THRESHOLDS, planDecay, runDecay } from './decay.js';
export type {
  DecayAction,
  DecayBand,
  DecayCandidate,
  DecayPlan,
  DecayProfile,
  PlanDecayOptions,
  RunDecayOptions,
  RunDecayResult,
} from './decay.js';
