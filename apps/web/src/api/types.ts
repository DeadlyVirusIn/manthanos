// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Branded enum types + response shapes for the ManthanOS web API client.
// Sprint 2 M1 C1.7.
//
// Branding strategy:
//   Each enum is a string-literal union intersected with a phantom symbol
//   property. The symbol cannot be constructed at runtime, so the only
//   ways to obtain a branded value are:
//     (a) accept one from a function whose return type already carries
//         the brand (e.g. asFactTier),
//     (b) explicit cast `as FactTier` (sanctioned only at parse-time).
//   This catches accidental string-typing slips at compile time —
//   `const t: FactTier = 'T+1'` fails because string literals don't
//   carry the brand symbol.
//
// JSX-rendering safety is enforced by the C1.9 lint scan, not by the
// type system. TypeScript's structural typing lets branded strings
// flow into `ReactNode` (= ... | string | ...) regardless of the
// phantom property. The brand is a guardrail, not an impenetrable
// wall.
//
// Mirror discipline:
//   The shapes in this file mirror the backend's service-layer types
//   (apps/api/src/services/*.ts). If the backend renames or reshapes a
//   response, update both. Future versions may use OpenAPI codegen to
//   eliminate the drift risk.

// ─────────────────────────────────────────────────────────────────
// Allowed-value tables + raw value unions
// ─────────────────────────────────────────────────────────────────
//
// The ALLOWED_X tuples below are the single source of truth for which
// values each enum permits. Both the branded types and the raw value
// unions derive from them. Adding a value here propagates to:
//   - the branded type (e.g. AudienceFit)
//   - the raw value union (e.g. AudienceFitValue)
//   - the runtime guard / brander (via makeGuard / makeBrander)
//   - the C1.8 translation map (via Record<XValue, string>)
// The C1.8 map relies on this derivation: adding an ALLOWED_X entry
// causes a TypeScript compile error in labels.ts until a label is added.

export const ALLOWED_AUDIENCE_FIT = ['target', 'adjacent', 'outside', 'unknown'] as const;
export const ALLOWED_CONVERSATION_TYPE = [
  'discovery',
  'validation',
  'sales',
  'support',
  'other',
] as const;
export const ALLOWED_CONVERSATION_OUTCOME = [
  'validated',
  'invalidated',
  'inconclusive',
  'follow_up',
] as const;
export const ALLOWED_FACT_EXTRACTION_STATUS = ['pending', 'extracted', 'skipped'] as const;
export const ALLOWED_FACT_TIER = ['T-2', 'T-1', 'T0', 'T+1'] as const;
export const ALLOWED_WORKSPACE_STATUS = ['active', 'paused', 'killed'] as const;
export const ALLOWED_LIFECYCLE_STATE = [
  'tombstoned',
  'superseded',
  'contested',
  'not_contested',
  'already_skipped',
] as const;
export const ALLOWED_PROVENANCE_KIND = ['quote', 'conversation'] as const;
export const ALLOWED_EXTRACTOR = ['manual'] as const;

// Raw value unions (unbranded). Used by the translation map for
// Record-based exhaustiveness checks where the brand symbol would
// otherwise reject string-literal keys.
export type AudienceFitValue = (typeof ALLOWED_AUDIENCE_FIT)[number];
export type ConversationTypeValue = (typeof ALLOWED_CONVERSATION_TYPE)[number];
export type ConversationOutcomeValue = (typeof ALLOWED_CONVERSATION_OUTCOME)[number];
export type FactExtractionStatusValue = (typeof ALLOWED_FACT_EXTRACTION_STATUS)[number];
export type FactTierValue = (typeof ALLOWED_FACT_TIER)[number];
export type WorkspaceStatusValue = (typeof ALLOWED_WORKSPACE_STATUS)[number];
export type LifecycleStateValue = (typeof ALLOWED_LIFECYCLE_STATE)[number];
export type ProvenanceKindValue = (typeof ALLOWED_PROVENANCE_KIND)[number];
export type ExtractorValue = (typeof ALLOWED_EXTRACTOR)[number];

// ─────────────────────────────────────────────────────────────────
// Branded enum types — derived from the raw value unions
// ─────────────────────────────────────────────────────────────────

declare const AudienceFitBrand: unique symbol;
export type AudienceFit = AudienceFitValue & { readonly [AudienceFitBrand]: 'AudienceFit' };

declare const ConversationTypeBrand: unique symbol;
export type ConversationType = ConversationTypeValue & {
  readonly [ConversationTypeBrand]: 'ConversationType';
};

declare const ConversationOutcomeBrand: unique symbol;
export type ConversationOutcome = ConversationOutcomeValue & {
  readonly [ConversationOutcomeBrand]: 'ConversationOutcome';
};

declare const FactExtractionStatusBrand: unique symbol;
export type FactExtractionStatus = FactExtractionStatusValue & {
  readonly [FactExtractionStatusBrand]: 'FactExtractionStatus';
};

declare const FactTierBrand: unique symbol;
export type FactTier = FactTierValue & { readonly [FactTierBrand]: 'FactTier' };

declare const WorkspaceStatusBrand: unique symbol;
export type WorkspaceStatus = WorkspaceStatusValue & {
  readonly [WorkspaceStatusBrand]: 'WorkspaceStatus';
};

declare const LifecycleStateBrand: unique symbol;
/** Returned in the body of 409 invalid_lifecycle errors. The union spans
 *  fact lifecycle states + conversation lifecycle states + the
 *  skip-extraction state. */
export type LifecycleState = LifecycleStateValue & {
  readonly [LifecycleStateBrand]: 'LifecycleState';
};

declare const ProvenanceKindBrand: unique symbol;
export type ProvenanceKind = ProvenanceKindValue & {
  readonly [ProvenanceKindBrand]: 'ProvenanceKind';
};

declare const ExtractorBrand: unique symbol;
/** Currently always 'manual' in Sprint 2 (AI extractor lands in Sprint 3). */
export type Extractor = ExtractorValue & { readonly [ExtractorBrand]: 'Extractor' };

// ─────────────────────────────────────────────────────────────────
// Guards + branders
// ─────────────────────────────────────────────────────────────────

function makeGuard<T extends string>(values: readonly T[]): (v: unknown) => v is T {
  return (v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
}

export const isAudienceFit = makeGuard(ALLOWED_AUDIENCE_FIT) as (v: unknown) => v is AudienceFit;
export const isConversationType = makeGuard(ALLOWED_CONVERSATION_TYPE) as (
  v: unknown,
) => v is ConversationType;
export const isConversationOutcome = makeGuard(ALLOWED_CONVERSATION_OUTCOME) as (
  v: unknown,
) => v is ConversationOutcome;
export const isFactExtractionStatus = makeGuard(ALLOWED_FACT_EXTRACTION_STATUS) as (
  v: unknown,
) => v is FactExtractionStatus;
export const isFactTier = makeGuard(ALLOWED_FACT_TIER) as (v: unknown) => v is FactTier;
export const isWorkspaceStatus = makeGuard(ALLOWED_WORKSPACE_STATUS) as (
  v: unknown,
) => v is WorkspaceStatus;
export const isLifecycleState = makeGuard(ALLOWED_LIFECYCLE_STATE) as (
  v: unknown,
) => v is LifecycleState;
export const isProvenanceKind = makeGuard(ALLOWED_PROVENANCE_KIND) as (
  v: unknown,
) => v is ProvenanceKind;
export const isExtractor = makeGuard(ALLOWED_EXTRACTOR) as (v: unknown) => v is Extractor;

/** Brand a raw value as the named enum. Throws if invalid. The cast is
 *  the only sanctioned bypass of the brand wall — call sites that
 *  receive `unknown` from JSON.parse use this to enter the typed world. */
export class EnumBrandError extends Error {
  readonly field: string;
  readonly value: unknown;
  constructor(field: string, value: unknown) {
    super(`expected ${field}, got ${JSON.stringify(value)}`);
    this.name = 'EnumBrandError';
    this.field = field;
    this.value = value;
  }
}

function makeBrander<T extends string>(
  field: string,
  values: readonly string[],
): (v: unknown) => T {
  return (v: unknown): T => {
    if (typeof v !== 'string' || !values.includes(v)) {
      throw new EnumBrandError(field, v);
    }
    // The only sanctioned cast: an unbranded validated string crosses
    // the brand boundary here, scoped to this one line.
    return v as T;
  };
}

export const asAudienceFit = makeBrander<AudienceFit>('AudienceFit', ALLOWED_AUDIENCE_FIT);
export const asConversationType = makeBrander<ConversationType>(
  'ConversationType',
  ALLOWED_CONVERSATION_TYPE,
);
export const asConversationOutcome = makeBrander<ConversationOutcome>(
  'ConversationOutcome',
  ALLOWED_CONVERSATION_OUTCOME,
);
export const asFactExtractionStatus = makeBrander<FactExtractionStatus>(
  'FactExtractionStatus',
  ALLOWED_FACT_EXTRACTION_STATUS,
);
export const asFactTier = makeBrander<FactTier>('FactTier', ALLOWED_FACT_TIER);
export const asWorkspaceStatus = makeBrander<WorkspaceStatus>(
  'WorkspaceStatus',
  ALLOWED_WORKSPACE_STATUS,
);
export const asLifecycleState = makeBrander<LifecycleState>(
  'LifecycleState',
  ALLOWED_LIFECYCLE_STATE,
);
export const asProvenanceKind = makeBrander<ProvenanceKind>(
  'ProvenanceKind',
  ALLOWED_PROVENANCE_KIND,
);
export const asExtractor = makeBrander<Extractor>('Extractor', ALLOWED_EXTRACTOR);

// ─────────────────────────────────────────────────────────────────
// Response shapes — mirrored from the backend service layer
// ─────────────────────────────────────────────────────────────────

export interface WorkspaceView {
  readonly id: string;
  readonly name: string | null;
  readonly root_path: string;
  readonly status: WorkspaceStatus;
  readonly status_changed_at: string | null;
  readonly status_reason: string | null;
  readonly stage_at_open: string | null;
  readonly portfolio_mode_enabled: number; // SQLite stores boolean as INTEGER
  readonly discovery_archive_ref: string | null;
  readonly schema_version: number;
  readonly audit_chain_seq_high: number;
  readonly created_at: string;
}

export interface ConversationQuoteView {
  readonly id: string;
  readonly position: number;
  readonly text: string;
}

export interface ConversationView {
  readonly id: string;
  readonly workspace_id: string;
  readonly person_name: string;
  readonly occurred_at: string;
  readonly audience_fit: AudienceFit;
  readonly conversation_type: ConversationType;
  readonly outcome: ConversationOutcome;
  readonly summary: string | null;
  readonly created_at: string;
  readonly audit_seq: number;
  readonly tombstoned_at: string | null;
  readonly tombstone_reason: string | null;
  readonly fact_extraction_status: FactExtractionStatus;
  readonly last_extracted_at: string | null;
  readonly is_tombstoned: boolean;
  readonly verbatim_quotes: readonly ConversationQuoteView[];
}

export interface ListConversationsResult {
  readonly conversations: readonly ConversationView[];
  readonly total: number;
  readonly returned: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_more: boolean;
}

export interface FactView {
  readonly id: string;
  readonly workspace_id: string;
  readonly area: string;
  readonly statement: string;
  readonly statement_hash: string;
  readonly tier: FactTier;
  readonly confidence: number;
  readonly last_corroborated: string;
  readonly last_administratively_touched: string;
  readonly audit_seq: number;
  readonly version_chain_root_id: string | null;
  readonly superseded_by_fact_id: string | null;
  readonly contested_at: string | null;
  readonly contested_reason: string | null;
  readonly tombstoned_at: string | null;
  readonly tombstone_reason: string | null;
  readonly is_head: boolean;
  readonly is_contested: boolean;
  readonly is_tombstoned: boolean;
  readonly active_source_count: number;
  readonly degraded_source_count: number;
  readonly provenance_degraded: boolean;
}

export interface ListFactsResult {
  readonly facts: readonly FactView[];
  readonly total: number;
  readonly returned: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_more: boolean;
}

export interface FactHistoryEntry {
  readonly fact: FactView;
  readonly position: number;
}

export interface FactHistoryResult {
  readonly root_id: string;
  readonly head_id: string;
  readonly total_versions: number;
  readonly versions: readonly FactHistoryEntry[];
}

export interface ProvenanceSourceView {
  readonly id: string;
  readonly fact_id: string;
  readonly kind: ProvenanceKind;
  readonly source_id: string;
  readonly extracted_at: string;
  readonly extractor: Extractor;
  readonly degraded_at: string | null;
  readonly degraded_reason: string | null;
}

export interface ListProvenanceResult {
  readonly fact_id: string;
  readonly provenance: readonly ProvenanceSourceView[];
  readonly total: number;
}

export interface AreaCount {
  readonly area: string;
  readonly count: number;
}

export interface ListAreasResult {
  readonly areas: readonly AreaCount[];
}

export interface AuditEventSummary {
  readonly seq: number;
  readonly workspace_id: string;
  readonly ts: string;
  readonly actor: string;
  readonly action: string;
  readonly kind: string;
  readonly decision: string;
  readonly payload_hash: string | null;
  readonly self_hash: string;
}

export interface AuditEventDetail extends AuditEventSummary {
  readonly payload: Record<string, unknown> | null;
}

// DEFECT-002: aligned to the daemon's actual `GET .../audit` response
// (services/audit.ts ListAuditResult). The previous shape declared a
// `total` field the API never sends; the API paginates by seq cursor.
export interface ListAuditEventsResult {
  readonly events: readonly AuditEventSummary[];
  readonly head_seq: number | null;
  readonly returned: number;
  readonly has_more: boolean;
  /** Pass as the next request's `before_seq` to continue paging. */
  readonly next_before_seq: number | null;
}

// DEFECT-003: aligned to the daemon's actual `GET .../audit/verify`
// response (services/audit.ts VerifyAuditResult). Every field of the
// previous shape was misnamed (verified/checked_events/latest_seq/issues).
export interface AuditChainVerifyResult {
  readonly valid: boolean;
  readonly head_seq: number | null;
  readonly total_events: number;
  readonly broken_at_seq: number | null;
  readonly expected_prev_hash?: string | null;
  readonly actual_prev_hash?: string | null;
}

// ─────────────────────────────────────────────────────────────────
// API error envelopes
// ─────────────────────────────────────────────────────────────────

/** Backend error response shapes. The web client wraps these in
 *  ApiError (see client.ts) with the parsed body attached. */
// ─────────────────────────────────────────────────────────────────
// AI-assisted extraction suggestions (Sprint 3B.5) — read-only.
// ─────────────────────────────────────────────────────────────────

// Allowed-value tuples for the extraction display layer. These are the
// single source of truth consumed by the schema parser (drop-unknown
// guards), the i18n label maps (Record-exhaustiveness), and the web
// confidence bucketing helper. Mirror discipline: they track the
// backend's extraction constants (apps/api/.../extraction/confidence.ts).
export const ALLOWED_CANDIDATE_DUPLICATE_KIND = ['exact', 'likely', 'corroborates'] as const;
export const ALLOWED_EXTRACTION_REASON = [
  'has_clear_claim',
  'has_subject',
  'has_source_context',
  'quote_backed',
  'ambiguous',
  'short_statement',
  'possible_duplicate',
  'needs_human_review',
] as const;
export const ALLOWED_EXTRACTION_SOURCE = ['conversation', 'manual', 'ai_assisted'] as const;
// Display buckets are a *view* over the numeric extraction-confidence
// score — never persisted, never sent by the API. Distinct copy from the
// fact-tier labels (resolved in Sprint 3B.6) so the two axes don't blur.
export const ALLOWED_CONFIDENCE_BUCKET = ['needs_review', 'tentative', 'solid', 'strong'] as const;

export type CandidateDuplicateKind = (typeof ALLOWED_CANDIDATE_DUPLICATE_KIND)[number];
export type ExtractionReasonValue = (typeof ALLOWED_EXTRACTION_REASON)[number];
export type ExtractionSourceValue = (typeof ALLOWED_EXTRACTION_SOURCE)[number];
export type ConfidenceBucketValue = (typeof ALLOWED_CONFIDENCE_BUCKET)[number];

export interface CandidateDuplicate {
  readonly kind: CandidateDuplicateKind;
  readonly fact_id?: string;
  readonly similarity?: number;
}

export interface CandidateProvenancePreview {
  readonly source: string;
  readonly conversation_id: string;
  readonly source_quote_id: string | null;
  readonly created_at: string;
  readonly extraction_confidence: number;
  readonly reason_flags: readonly string[];
  readonly extractor_version: string;
  readonly model_used: string | null;
}

export interface CandidateFact {
  readonly area: string;
  readonly statement: string;
  readonly source_quote_id?: string;
  readonly confidence_score: number;
  readonly confidence_reasons: readonly string[];
  /** Present only when a duplicate relationship exists (advisory). */
  readonly duplicate?: CandidateDuplicate;
  readonly provenance_preview: CandidateProvenancePreview;
}

export interface SuggestExtractionsResult {
  readonly candidates: readonly CandidateFact[];
}

// ─────────────────────────────────────────────────────────────────
// AI capability gate (Sprint 3B.6.5) — GET /api/v1/ai/capabilities.
// ─────────────────────────────────────────────────────────────────
//
// The UI gates the "Suggest facts" affordance on `ai_extraction_available`
// and degrades safely (treats everything as false) when the call fails.
export interface AiCapabilities {
  readonly ai_extraction_available: boolean;
  readonly provider_configured: boolean;
  readonly llm_validator_enabled: boolean;
  readonly model: string | null;
}

export interface ValidationErrorBody {
  readonly error: 'validation';
  readonly field: string;
  readonly details: string;
}

export interface NotFoundErrorBody {
  readonly error: 'not_found';
}

export interface InvalidLifecycleErrorBody {
  readonly error: 'invalid_lifecycle';
  readonly state: LifecycleState;
  /** Backend includes one of these depending on entity. */
  readonly fact_id?: string;
  readonly conversation_id?: string;
  readonly details: string;
}

export interface DuplicateFactErrorBody {
  readonly error: 'duplicate_fact';
  readonly existing_fact_id: string;
  readonly details: string;
}

export interface InvalidTierTransitionErrorBody {
  readonly error: 'invalid_tier_transition';
  readonly from: FactTier;
  readonly to: FactTier;
  readonly direction: 'promote' | 'demote';
  readonly details: string;
}

export type ApiErrorBody =
  | ValidationErrorBody
  | NotFoundErrorBody
  | InvalidLifecycleErrorBody
  | DuplicateFactErrorBody
  | InvalidTierTransitionErrorBody
  | { readonly error: string; readonly [k: string]: unknown };
