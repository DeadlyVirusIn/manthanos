// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Single source of truth for all UI labels. Sprint 2 M1 C1.8.
//
// Mission: NO RAW API VOCABULARY EVER APPEARS IN THE USER INTERFACE.
//
// This file maps every substrate enum value (and every audit action, and
// every form-field name renamed from a substrate column, and every
// fact-action verb) to a human-friendly label. The C1.9 lint scan is the
// second layer that catches anyone trying to render `{fact.tier}` or
// `'T+1'` directly in JSX.
//
// Exhaustiveness contract:
//   The per-enum label maps below use `Record<XValue, string>`. The
//   `XValue` types are derived in `api/types.ts` from the `ALLOWED_X`
//   tuples. Adding a value to ALLOWED_X without adding a label here
//   produces a TypeScript compile error of the form:
//     Type '{...}' does not satisfy the constraint 'Record<XValue, string>'.
//       Property '<new value>' is missing in type '{...}'.
//
// Vocabulary sources:
//   - Enum labels: MANTHANOS_PRODUCT_POSITIONING.md §15
//   - Field labels: SPRINT2_FIRST_TIME_USER_JOURNEY_REVIEW.md §3.5 + §9.4
//   - Fact actions (Mark for follow-up rename): journey review §5.7
//   - Audit actions: SPRINT2_IMPLEMENTATION_ROADMAP.md §2.4
//
// Forbidden substrate vocabulary (never appears in any label):
//   tombstoned, superseded, contested, uncontest, corroborate(d),
//   provenance, audit_seq, audit_chain, extractor, verbatim, workspace
//   (as user-facing), T+1, T0, T-1, T-2, killed, target (as bare),
//   adjacent (bare), outside (bare), follow_up.
// The labels test asserts this list against every label.

import type {
  AudienceFitValue,
  CandidateDuplicateKind,
  ConfidenceBucketValue,
  ConversationOutcomeValue,
  ConversationTypeValue,
  ExtractionReasonValue,
  ExtractionSourceValue,
  ExtractorValue,
  FactExtractionStatusValue,
  FactTierValue,
  LifecycleStateValue,
  ProvenanceKindValue,
  WorkspaceStatusValue,
} from '../api/types.js';

// ─────────────────────────────────────────────────────────────────
// Per-enum label maps (substrate value → user-facing label)
// ─────────────────────────────────────────────────────────────────

const AUDIENCE_FIT_LABELS: Record<AudienceFitValue, string> = {
  target: 'Exact match',
  adjacent: 'Adjacent',
  outside: 'Off-target',
  unknown: 'Not sure',
};

const CONVERSATION_TYPE_LABELS: Record<ConversationTypeValue, string> = {
  discovery: 'First conversation',
  validation: 'Testing an idea',
  sales: 'Selling / pricing',
  support: 'Help / support',
  other: 'Other',
};

const CONVERSATION_OUTCOME_LABELS: Record<ConversationOutcomeValue, string> = {
  validated: 'Confirmed what I expected',
  invalidated: 'Changed my mind',
  inconclusive: 'Mixed signal',
  follow_up: 'Need another talk',
};

const FACT_EXTRACTION_STATUS_LABELS: Record<FactExtractionStatusValue, string> = {
  pending: 'No findings yet',
  extracted: 'Findings added',
  skipped: 'Marked as not useful',
};

const FACT_TIER_LABELS: Record<FactTierValue, string> = {
  // C4.1.1 D4: "Well-evidenced" → the plainer "Well-supported".
  'T+1': 'Well-supported',
  T0: 'Noted',
  'T-1': 'Shaky',
  'T-2': 'Doubted',
};

const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatusValue, string> = {
  active: 'Active',
  paused: 'Paused',
  killed: 'Archived', // 'killed' is substrate-only; UI says "archived"
};

const LIFECYCLE_STATE_LABELS: Record<LifecycleStateValue, string> = {
  tombstoned: 'Erased',
  superseded: 'Older version',
  // C4.1.1 D9: follow-up reframed as "to double-check".
  contested: 'Flagged to double-check',
  not_contested: 'Not flagged',
  already_skipped: 'Already marked as not useful',
};

const PROVENANCE_KIND_LABELS: Record<ProvenanceKindValue, string> = {
  quote: 'from a quote',
  conversation: 'from this conversation',
};

/** `extractor` is hidden in the Sprint 2 UI (per journey review §1.4).
 *  The map entry exists for exhaustiveness; the empty string renders
 *  as nothing in JSX. Future AI extractors land in Sprint 3+. */
const EXTRACTOR_LABELS: Record<ExtractorValue, string> = {
  manual: '',
};

// ─────────────────────────────────────────────────────────────────
// AI-assisted extraction display vocabulary — Sprint 3B.6
// ─────────────────────────────────────────────────────────────────
//
// The suggest-extractions endpoint returns substrate-flavoured signals
// (numeric confidence, reason-flag enum, duplicate kinds, source kind).
// None of those raw tokens may reach the DOM — the review UI renders
// only the friendly copy below.
//
// C4.1.1 D1/D2: the four engine buckets collapse to THREE user-facing
// review levels (the deterministic scorer rarely emits a true bottom
// band, so a 4th level only invites confusion with the 4-level trust
// ladder). These are "review prompt" words (clarity / should-I-look),
// deliberately DISTINCT from the evidence words on fact trust
// ("Well-supported"/"Shaky") so the two scales can never be conflated.
//   strong, solid  → "Strong signal"
//   tentative      → "Looks reasonable"
//   needs_review   → "Needs your eyes"

// First-encounter explainers (C4.1.1 §9). Short one-liners that tell a
// novice what each scale means and keep the two scales distinct. Rendered
// as lightweight tooltips on the trust meter and the review pill.
export const TRUST_LEVEL_EXPLAINER =
  "How well-backed this finding is. More dots = more evidence. 'Well-supported' has several sources; 'Doubted' is contradicted by what you heard.";
export const CONFIDENCE_REVIEW_EXPLAINER =
  "How clearly this reads as a finding — a nudge to review, not a verdict. 'Needs your eyes' means check it; 'Strong signal' means it looks solid.";

const CONFIDENCE_BUCKET_LABELS: Record<ConfidenceBucketValue, string> = {
  needs_review: 'Needs your eyes',
  tentative: 'Looks reasonable',
  solid: 'Strong signal',
  strong: 'Strong signal',
};

/** Why a candidate looks the way it does — shown as advisory chips. The
 *  raw reason-flag tokens are never rendered; only this copy is. */
const EXTRACTION_REASON_LABELS: Record<ExtractionReasonValue, string> = {
  has_clear_claim: 'Clear claim',
  has_subject: 'Names who or what',
  has_source_context: 'Backed by context',
  quote_backed: 'Tied to a quote',
  ambiguous: 'Ambiguous wording',
  short_statement: 'Very short',
  possible_duplicate: 'Possible duplicate',
  needs_human_review: 'Worth a closer look',
};

/** Where a suggested fact would be sourced from, for the preview line. */
const EXTRACTION_SOURCE_LABELS: Record<ExtractionSourceValue, string> = {
  conversation: 'From this conversation',
  manual: 'Added by hand',
  ai_assisted: 'AI-assisted',
};

/** Advisory duplicate-warning copy. Never blocking; approving still goes
 *  through the idempotent extract path (which links rather than dupes). */
const DUPLICATE_WARNING_LABELS: Record<CandidateDuplicateKind, string> = {
  exact: 'Already appears to exist',
  likely: 'Possible duplicate',
  corroborates: 'May support an existing finding',
};

// ─────────────────────────────────────────────────────────────────
// Form-field labels (substrate column → UI field label)
// ─────────────────────────────────────────────────────────────────
//
// These are NOT branded enum values — they're free-form keys naming the
// substrate field whose UI label we want. The set is hand-maintained;
// add a key when you need to render that field's label in a UI form.

const FIELD_LABEL_KEYS = [
  'area',
  'statement',
  'verbatim_quotes',
  'summary',
  'person_name',
  'occurred_at',
  'tombstone_reason',
  'contested_reason',
  // Added by Sprint 2 M2.5 C25.1 — enum-select field headings used by
  // CaptureConversationDialog and (later) other mutation forms.
  'audience_fit',
  'conversation_type',
  'outcome',
] as const;

export type FieldLabelKey = (typeof FIELD_LABEL_KEYS)[number];

const FIELD_LABELS: Record<FieldLabelKey, string> = {
  area: "What's this about?", // journey review §3.5 — highest-leverage rename
  statement: 'The finding', // C4.1.1 D7: fact → finding
  verbatim_quotes: 'Exact quotes',
  summary: 'Main takeaway',
  person_name: 'Who did you talk to?',
  occurred_at: 'When was it?',
  tombstone_reason: 'Why erased',
  contested_reason: 'Why flagged to double-check', // C4.1.1 D9
  audience_fit: 'How well do they match your target?',
  conversation_type: 'What kind of conversation was this?',
  outcome: 'How did it end?',
};

// ─────────────────────────────────────────────────────────────────
// Fact-action labels (the "Mark for follow-up" rename from §5.7)
// ─────────────────────────────────────────────────────────────────

const FACT_ACTION_KEYS = [
  'promote',
  'demote',
  'revise',
  'contest',
  'uncontest',
  'tombstone',
] as const;

export type FactActionKey = (typeof FACT_ACTION_KEYS)[number];

const FACT_ACTION_LABELS: Record<FactActionKey, string> = {
  promote: 'Raise confidence',
  demote: 'Lower confidence',
  revise: 'Update wording',
  // C4.1.1 D9: follow-up → double-check.
  contest: 'Mark to double-check',
  uncontest: 'Mark as checked',
  tombstone: 'Erase forever',
};

// ─────────────────────────────────────────────────────────────────
// Audit-action labels (with payload parameterisation)
// ─────────────────────────────────────────────────────────────────

const AUDIT_ACTION_KEYS = [
  'workspace.create',
  'workspace.update',
  'conversation.create',
  'conversation.update',
  'conversation.tombstone',
  'conversation.skip_extraction',
  'fact.create',
  'fact.update',
  'fact.revise',
  'fact.promote',
  'fact.demote',
  'fact.contest',
  'fact.uncontest',
  'fact.corroborate',
  'fact.tombstone',
] as const;

export type AuditActionKey = (typeof AUDIT_ACTION_KEYS)[number];

type LabelFn = (payload: Record<string, unknown>) => string;
type AuditActionLabelEntry = string | LabelFn;

/** Coerce a payload value to a non-empty string with a graceful fallback.
 *  Used in audit-action label functions so a missing payload field shows
 *  a placeholder rather than `undefined` or crashing the render. */
function coerce(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

const AUDIT_ACTION_LABELS: Record<AuditActionKey, AuditActionLabelEntry> = {
  'workspace.create': 'Started this project.',
  'workspace.update': 'Updated project settings.',
  'conversation.create': (p) =>
    `Captured a conversation with ${coerce(p.person_name, 'that person')}.`,
  'conversation.update': (p) =>
    `Edited the conversation with ${coerce(p.previous_person_name ?? p.person_name, 'that person')}.`,
  'conversation.tombstone': (p) =>
    `Erased the conversation with ${coerce(p.previous_person_name, 'that person')}.`,
  'conversation.skip_extraction': (p) =>
    `Marked the conversation with ${coerce(p.previous_person_name ?? p.person_name, 'that person')} as not useful.`,
  // C4.1.1 D7/D9: user-facing noun is "finding"; follow-up → double-check.
  'fact.create': (p) => {
    const stmt = coerce(p.statement, 'a claim');
    const fromExtraction = p.extraction_source !== undefined && p.extraction_source !== null;
    return fromExtraction
      ? `Added a finding from a conversation: "${stmt}".`
      : `Added a finding: "${stmt}".`;
  },
  'fact.update': (p) => `Edited a finding: "${coerce(p.statement, 'a claim')}".`,
  'fact.revise': (p) =>
    `Made a new version of "${coerce(p.previous_statement ?? p.statement, 'a claim')}".`,
  'fact.promote': (p) => `Raised confidence on "${coerce(p.statement, 'a claim')}".`,
  'fact.demote': (p) => `Lowered confidence on "${coerce(p.statement, 'a claim')}".`,
  'fact.contest': (p) => `Marked "${coerce(p.statement, 'a claim')}" to double-check.`,
  'fact.uncontest': (p) => `Checked "${coerce(p.statement, 'a claim')}".`,
  'fact.corroborate': (p) =>
    `Found new evidence for "${coerce(p.statement, 'a claim')}" in a conversation.`,
  'fact.tombstone': (p) => `Erased the finding "${coerce(p.statement, 'a claim')}".`,
};

// ─────────────────────────────────────────────────────────────────
// Mutation-error labels — Sprint 2 M2.5 C25.1
// ─────────────────────────────────────────────────────────────────
//
// MutationErrorBanner discriminates an ApiError envelope to a category
// and routes the visible copy through this table. Categories cover the
// five typed envelopes from api/types.ts plus a network catch-all and
// an unknown fallback. Function-valued entries receive the envelope's
// payload and produce the visible string — keeping all user-facing
// error text inside this file.

export const MUTATION_ERROR_CATEGORIES = [
  'validation',
  'not_found',
  'invalid_lifecycle',
  'duplicate_fact',
  'invalid_tier_transition',
  'network',
  'unknown',
] as const;
export type MutationErrorCategory = (typeof MUTATION_ERROR_CATEGORIES)[number];

const MUTATION_ERROR_LABELS: Record<MutationErrorCategory, AuditActionLabelEntry> = {
  validation: (p) =>
    coerce(p.details, "Something about that didn't work. Please check the fields above."),
  not_found: 'This is no longer here. It may have been erased or moved.',
  invalid_lifecycle: (p) => {
    const state = typeof p.state === 'string' ? p.state : '';
    if (state === '') return "Can't do that right now.";
    const label = (LIFECYCLE_STATE_LABELS as Record<string, string>)[state] ?? state;
    return `Can't do that — this is ${label.toLowerCase()}.`;
  },
  duplicate_fact: 'We already have this.',
  invalid_tier_transition: (p) => {
    const from = typeof p.from === 'string' ? p.from : '';
    const to = typeof p.to === 'string' ? p.to : '';
    const fromLabel = (FACT_TIER_LABELS as Record<string, string>)[from] ?? from;
    const toLabel = (FACT_TIER_LABELS as Record<string, string>)[to] ?? to;
    if (fromLabel === '' || toLabel === '') return "Can't change the trust level that way.";
    return `Can't move from "${fromLabel}" to "${toLabel}".`;
  },
  network: "Couldn't reach ManthanOS. Make sure it's running, then try again.",
  unknown: 'Something unexpected happened. Try again, or report this if it keeps happening.',
};

// ─────────────────────────────────────────────────────────────────
// Master kind → map registry
// ─────────────────────────────────────────────────────────────────

const LABEL_MAPS = {
  audience_fit: AUDIENCE_FIT_LABELS,
  conversation_type: CONVERSATION_TYPE_LABELS,
  outcome: CONVERSATION_OUTCOME_LABELS,
  fact_extraction_status: FACT_EXTRACTION_STATUS_LABELS,
  tier: FACT_TIER_LABELS,
  workspace_status: WORKSPACE_STATUS_LABELS,
  lifecycle_state: LIFECYCLE_STATE_LABELS,
  provenance_kind: PROVENANCE_KIND_LABELS,
  extractor: EXTRACTOR_LABELS,
  confidence_bucket: CONFIDENCE_BUCKET_LABELS,
  extraction_reason: EXTRACTION_REASON_LABELS,
  extraction_source: EXTRACTION_SOURCE_LABELS,
  duplicate_warning: DUPLICATE_WARNING_LABELS,
  field_label: FIELD_LABELS,
  fact_action: FACT_ACTION_LABELS,
  audit_action: AUDIT_ACTION_LABELS,
  mutation_error: MUTATION_ERROR_LABELS,
} as const;

export type LabelKind = keyof typeof LABEL_MAPS;

/** All registered kinds, exported for iteration in tests and for any
 *  caller that needs a runtime enumeration of the supported kinds. */
export const LABEL_KINDS = [
  'audience_fit',
  'conversation_type',
  'outcome',
  'fact_extraction_status',
  'tier',
  'workspace_status',
  'lifecycle_state',
  'provenance_kind',
  'extractor',
  'confidence_bucket',
  'extraction_reason',
  'extraction_source',
  'duplicate_warning',
  'field_label',
  'fact_action',
  'audit_action',
  'mutation_error',
] as const satisfies readonly LabelKind[];

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/** Translate an enum value or action key into its user-facing label.
 *
 *  Behavior on unknown input:
 *    - Unknown kind → returns the raw value with a dev-mode console warning.
 *    - Known kind, unknown value → returns the raw value with a dev-mode
 *      console warning. The fallback prevents crashes when the backend
 *      adds a new enum value before the frontend's labels.ts catches up.
 *
 *  Payload parameter: only used by the `audit_action` kind. Other kinds
 *  ignore it. The payload is the audit event's `payload` field. */
export function getEnumLabel(
  kind: LabelKind,
  value: string,
  payload?: Record<string, unknown>,
): string {
  const table = LABEL_MAPS[kind];
  if (table === undefined) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[i18n] Unknown label kind: ${kind}`);
    }
    return value;
  }
  const entry = (table as Record<string, string | LabelFn>)[value];
  if (entry === undefined) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[i18n] Unknown ${kind} value: ${value}`);
    }
    return value;
  }
  if (typeof entry === 'function') {
    return entry(payload ?? {});
  }
  return entry;
}
