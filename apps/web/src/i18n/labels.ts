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
  ConversationOutcomeValue,
  ConversationTypeValue,
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
  support: 'Help / follow-up',
  other: 'Other',
};

const CONVERSATION_OUTCOME_LABELS: Record<ConversationOutcomeValue, string> = {
  validated: 'Confirmed what I expected',
  invalidated: 'Changed my mind',
  inconclusive: 'Mixed signal',
  follow_up: 'Need another talk',
};

const FACT_EXTRACTION_STATUS_LABELS: Record<FactExtractionStatusValue, string> = {
  pending: 'No facts pulled yet',
  extracted: 'Facts pulled',
  skipped: 'Marked as not useful',
};

const FACT_TIER_LABELS: Record<FactTierValue, string> = {
  'T+1': 'Well-evidenced',
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
  contested: 'Flagged for follow-up',
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
] as const;

export type FieldLabelKey = (typeof FIELD_LABEL_KEYS)[number];

const FIELD_LABELS: Record<FieldLabelKey, string> = {
  area: "What's this about?", // journey review §3.5 — highest-leverage rename
  statement: 'The fact',
  verbatim_quotes: 'Exact quotes',
  summary: 'Main takeaway',
  person_name: 'Who did you talk to?',
  occurred_at: 'When was it?',
  tombstone_reason: 'Why erased',
  contested_reason: 'Why flagged for follow-up',
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
  contest: 'Mark for follow-up',
  uncontest: 'Done following up',
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
  'fact.create': (p) => {
    const stmt = coerce(p.statement, 'a claim');
    const fromExtraction = p.extraction_source !== undefined && p.extraction_source !== null;
    return fromExtraction
      ? `Pulled a fact from a conversation: "${stmt}".`
      : `Added a fact: "${stmt}".`;
  },
  'fact.update': (p) => `Edited a fact: "${coerce(p.statement, 'a claim')}".`,
  'fact.revise': (p) =>
    `Made a new version of "${coerce(p.previous_statement ?? p.statement, 'a claim')}".`,
  'fact.promote': (p) => `Raised confidence on "${coerce(p.statement, 'a claim')}".`,
  'fact.demote': (p) => `Lowered confidence on "${coerce(p.statement, 'a claim')}".`,
  // The contest / uncontest rename (journey review §5.7): user-facing
  // vocabulary is "follow-up", not "flag" or "contest".
  'fact.contest': (p) => `Marked "${coerce(p.statement, 'a claim')}" for follow-up.`,
  'fact.uncontest': (p) => `Followed up on "${coerce(p.statement, 'a claim')}".`,
  'fact.corroborate': (p) =>
    `Found new evidence for "${coerce(p.statement, 'a claim')}" in a conversation.`,
  'fact.tombstone': (p) => `Erased the fact "${coerce(p.statement, 'a claim')}".`,
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
  field_label: FIELD_LABELS,
  fact_action: FACT_ACTION_LABELS,
  audit_action: AUDIT_ACTION_LABELS,
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
  'field_label',
  'fact_action',
  'audit_action',
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
