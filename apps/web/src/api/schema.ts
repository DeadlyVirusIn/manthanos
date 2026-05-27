// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Defensive response parsing for the workspaces-list and audit endpoints
// (C3.0 DEFECT-001/002/003 hardening). "Parse, don't cast": untyped JSON
// crossing the network is not `T`. Each parser validates structurally and
// returns an explicit fallback on malformed input — it logs a warning and
// never throws into the UI. Scoped intentionally to the three endpoints
// that drifted; not a general framework.

import type { ConversationFactsResponse } from './conversations.js';
import {
  ALLOWED_CANDIDATE_DUPLICATE_KIND,
  ALLOWED_EXTRACTION_REASON,
  ALLOWED_EXTRACTION_SOURCE,
  type AiCapabilities,
  type AudienceFit,
  type AuditChainVerifyResult,
  type AuditEventSummary,
  type CandidateDuplicate,
  type CandidateFact,
  type CandidateProvenancePreview,
  type ConversationOutcome,
  type ConversationQuoteView,
  type ConversationType,
  type ConversationView,
  type FactExtractionStatus,
  type FactTier,
  type FactView,
  type ListAuditEventsResult,
  type ListConversationsResult,
  type ListFactsResult,
  type SuggestExtractionsResult,
  type WorkspaceStatus,
  type WorkspaceView,
  isAudienceFit,
  isConversationOutcome,
  isConversationType,
  isFactExtractionStatus,
  isFactTier,
} from './types.js';

// ── primitive guards ──────────────────────────────────────────────
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const numberOrNull = (v: unknown): number | null => (isNumber(v) ? v : null);
const stringOrNull = (v: unknown): string | null => (isString(v) ? v : null);

/**
 * Run `parse`; on any throw, log a warning and return `fallback`.
 * The fallback path is the only way a malformed response reaches the UI,
 * so it must be a valid, renderable value of `T`.
 */
export function parseWithFallback<T>(label: string, parse: () => T, fallback: T): T {
  try {
    return parse();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[api:schema] ${label} failed validation; using fallback`, err);
    return fallback;
  }
}

// ── workspaces list (DEFECT-001) ──────────────────────────────────
// API contract: { workspaces: WorkspaceView[] }. We tolerate per-row
// drift: a row missing its `id` is dropped (not fatal); an unknown
// `status` enum value is passed through (downgrade, not crash) so the
// workspace still appears in the list.
function toWorkspaceView(row: Record<string, unknown>): WorkspaceView | null {
  if (!isString(row.id)) return null;
  return {
    id: row.id,
    name: stringOrNull(row.name),
    root_path: isString(row.root_path) ? row.root_path : '',
    // Enum-drift protection: keep whatever the server sent; the UI must
    // default on unknown status rather than this layer dropping the row.
    status: (isString(row.status) ? row.status : 'active') as WorkspaceStatus,
    status_changed_at: stringOrNull(row.status_changed_at),
    status_reason: stringOrNull(row.status_reason),
    stage_at_open: stringOrNull(row.stage_at_open),
    // API sends a boolean; the legacy type annotates number. Coerce to a
    // number so the declared type holds without touching unrelated code.
    portfolio_mode_enabled: row.portfolio_mode_enabled ? 1 : 0,
    discovery_archive_ref: stringOrNull(row.discovery_archive_ref),
    schema_version: isNumber(row.schema_version) ? row.schema_version : 0,
    audit_chain_seq_high: isNumber(row.audit_chain_seq_high) ? row.audit_chain_seq_high : 0,
    created_at: isString(row.created_at) ? row.created_at : '',
  };
}

export function parseWorkspaceList(raw: unknown): readonly WorkspaceView[] {
  return parseWithFallback(
    'GET /api/v1/workspaces',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      const list = raw.workspaces;
      if (!Array.isArray(list)) throw new Error('`workspaces` is not an array');
      const out: WorkspaceView[] = [];
      for (const item of list) {
        if (!isObject(item)) continue;
        const view = toWorkspaceView(item);
        if (view !== null) out.push(view);
      }
      return out;
    },
    [],
  );
}

// ── audit list (DEFECT-002) ───────────────────────────────────────
const EMPTY_AUDIT_LIST: ListAuditEventsResult = {
  events: [],
  head_seq: null,
  returned: 0,
  has_more: false,
  next_before_seq: null,
};

function toAuditEvent(row: Record<string, unknown>): AuditEventSummary | null {
  if (!isNumber(row.seq) || !isString(row.action)) return null;
  return {
    seq: row.seq,
    workspace_id: isString(row.workspace_id) ? row.workspace_id : '',
    ts: isString(row.ts) ? row.ts : '',
    actor: isString(row.actor) ? row.actor : '',
    action: row.action,
    kind: isString(row.kind) ? row.kind : '',
    decision: isString(row.decision) ? row.decision : '',
    payload_hash: stringOrNull(row.payload_hash),
    self_hash: isString(row.self_hash) ? row.self_hash : '',
  };
}

export function parseAuditEventsResult(raw: unknown): ListAuditEventsResult {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/audit',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      if (!Array.isArray(raw.events)) throw new Error('`events` is not an array');
      const events: AuditEventSummary[] = [];
      for (const item of raw.events) {
        if (!isObject(item)) continue;
        const ev = toAuditEvent(item);
        if (ev !== null) events.push(ev);
      }
      return {
        events,
        head_seq: numberOrNull(raw.head_seq),
        returned: isNumber(raw.returned) ? raw.returned : events.length,
        has_more: isBool(raw.has_more) ? raw.has_more : false,
        next_before_seq: numberOrNull(raw.next_before_seq),
      };
    },
    EMPTY_AUDIT_LIST,
  );
}

// ── audit verify (DEFECT-003) ─────────────────────────────────────
const VERIFY_FALLBACK: AuditChainVerifyResult = {
  valid: false,
  head_seq: null,
  total_events: 0,
  broken_at_seq: null,
};

export function parseAuditVerifyResult(raw: unknown): AuditChainVerifyResult {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/audit/verify',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      // `valid` is the load-bearing field — a malformed verify result must
      // never read as "valid: true". Default-false on any non-boolean.
      return {
        valid: isBool(raw.valid) ? raw.valid : false,
        head_seq: numberOrNull(raw.head_seq),
        total_events: isNumber(raw.total_events) ? raw.total_events : 0,
        broken_at_seq: numberOrNull(raw.broken_at_seq),
        expected_prev_hash: stringOrNull(raw.expected_prev_hash) ?? undefined,
        actual_prev_hash: stringOrNull(raw.actual_prev_hash) ?? undefined,
      };
    },
    VERIFY_FALLBACK,
  );
}

// ── suggest-extractions (3B.5) ────────────────────────────────────
// Web-local allow-lists. NOTE: these mirror the API's enums; a shared
// constants package is a documented future (single-source-of-truth)
// improvement — for now they are validated defensively here.
const ALLOWED_REASON_FLAGS: ReadonlySet<string> = new Set(ALLOWED_EXTRACTION_REASON);
const ALLOWED_DUPLICATE_KINDS: ReadonlySet<string> = new Set(ALLOWED_CANDIDATE_DUPLICATE_KIND);
const ALLOWED_SOURCES: ReadonlySet<string> = new Set(ALLOWED_EXTRACTION_SOURCE);

const clamp01 = (v: unknown): number => (isNumber(v) ? Math.min(1, Math.max(0, v)) : 0);

function parseReasonFlagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is string => isString(f) && ALLOWED_REASON_FLAGS.has(f));
}

function parseDuplicate(value: unknown): CandidateDuplicate | undefined {
  if (!isObject(value)) return undefined;
  if (!isString(value.kind) || !ALLOWED_DUPLICATE_KINDS.has(value.kind)) return undefined; // enum-drift: drop
  const dup: CandidateDuplicate = { kind: value.kind as CandidateDuplicate['kind'] };
  const fact_id = stringOrNull(value.fact_id);
  const similarity = isNumber(value.similarity) ? clamp01(value.similarity) : undefined;
  return {
    ...dup,
    ...(fact_id !== null ? { fact_id } : {}),
    ...(similarity !== undefined ? { similarity } : {}),
  };
}

function parseProvenancePreview(value: unknown): CandidateProvenancePreview {
  const v = isObject(value) ? value : {};
  return {
    // Allow-list the source: an unknown/drifted value must never reach the
    // DOM as raw vocabulary (3B.6.5). Default to 'conversation' — the only
    // source a deterministic 3B candidate can legitimately have.
    source: isString(v.source) && ALLOWED_SOURCES.has(v.source) ? v.source : 'conversation',
    conversation_id: isString(v.conversation_id) ? v.conversation_id : '',
    source_quote_id: stringOrNull(v.source_quote_id),
    created_at: isString(v.created_at) ? v.created_at : '',
    extraction_confidence: clamp01(v.extraction_confidence),
    reason_flags: parseReasonFlagList(v.reason_flags),
    extractor_version: isString(v.extractor_version) ? v.extractor_version : '',
    model_used: stringOrNull(v.model_used),
  };
}

function toCandidateFact(row: Record<string, unknown>): CandidateFact | null {
  if (!isString(row.area) || !isString(row.statement)) return null;
  const base: CandidateFact = {
    area: row.area,
    statement: row.statement,
    confidence_score: clamp01(row.confidence_score),
    confidence_reasons: parseReasonFlagList(row.confidence_reasons),
    provenance_preview: parseProvenancePreview(row.provenance_preview),
    // 3B.8 follow-up 2: boolean-only; anything else is treated as absent.
    ...(row.validated_by_llm === true ? { validated_by_llm: true } : {}),
  };
  const withQuote = isString(row.source_quote_id)
    ? { ...base, source_quote_id: row.source_quote_id }
    : base;
  const duplicate = parseDuplicate(row.duplicate);
  return duplicate !== undefined ? { ...withQuote, duplicate } : withQuote;
}

// AI capability gate (3B.6.5). Degrade-to-safe: any malformed/unreachable
// response yields all-false capabilities so the UI hides AI affordances
// rather than crashing or over-promising.
const SAFE_AI_CAPABILITIES: AiCapabilities = {
  ai_extraction_available: false,
  provider_configured: false,
  llm_validator_enabled: false,
  model: null,
};

export function parseAiCapabilities(raw: unknown): AiCapabilities {
  return parseWithFallback(
    'GET /api/v1/ai/capabilities',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      return {
        ai_extraction_available: raw.ai_extraction_available === true,
        provider_configured: raw.provider_configured === true,
        llm_validator_enabled: raw.llm_validator_enabled === true,
        model: isString(raw.model) ? raw.model : null,
      };
    },
    SAFE_AI_CAPABILITIES,
  );
}

const EMPTY_SUGGEST: SuggestExtractionsResult = { candidates: [] };

export function parseSuggestExtractionsResponse(raw: unknown): SuggestExtractionsResult {
  return parseWithFallback(
    'POST /api/v1/workspaces/:id/conversations/:cid/suggest-extractions',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      if (!Array.isArray(raw.candidates)) throw new Error('`candidates` is not an array');
      const candidates: CandidateFact[] = [];
      for (const item of raw.candidates) {
        if (!isObject(item)) continue;
        const c = toCandidateFact(item);
        if (c !== null) candidates.push(c);
      }
      return { candidates };
    },
    EMPTY_SUGGEST,
  );
}

// ── findings read-path (R1) ───────────────────────────────────────
// The fact & conversation read endpoints were previously cast, not
// parsed. These mirror the parsers above: validate structurally, never
// throw into the UI, and NORMALIZE unknown enum values to a safe known
// default at the boundary (not just at render) so downstream code only
// ever sees a valid enum. lifecycle_state is NOT a wire field on these
// endpoints — it is derived in the UI from is_tombstoned / superseded /
// is_contested — so there is nothing to downgrade for it here.

// Trust-tier normalization defaults to the LOWEST tier on unknown/missing
// input: a malformed fact must never *overstate* how well-backed it is.
function normTier(v: unknown): FactTier {
  return isFactTier(v) ? v : ('T-2' as FactTier);
}

function toFactView(row: Record<string, unknown>): FactView | null {
  // id/area/statement are load-bearing; a row missing any is dropped from
  // a list (or triggers the detail fallback).
  if (!isString(row.id) || !isString(row.area) || !isString(row.statement)) return null;
  return {
    id: row.id,
    workspace_id: isString(row.workspace_id) ? row.workspace_id : '',
    area: row.area,
    statement: row.statement,
    statement_hash: isString(row.statement_hash) ? row.statement_hash : '',
    tier: normTier(row.tier),
    confidence: isNumber(row.confidence) ? row.confidence : 0,
    last_corroborated: isString(row.last_corroborated) ? row.last_corroborated : '',
    last_administratively_touched: isString(row.last_administratively_touched)
      ? row.last_administratively_touched
      : '',
    audit_seq: isNumber(row.audit_seq) ? row.audit_seq : 0,
    version_chain_root_id: stringOrNull(row.version_chain_root_id),
    superseded_by_fact_id: stringOrNull(row.superseded_by_fact_id),
    contested_at: stringOrNull(row.contested_at),
    contested_reason: stringOrNull(row.contested_reason),
    tombstoned_at: stringOrNull(row.tombstoned_at),
    tombstone_reason: stringOrNull(row.tombstone_reason),
    is_head: isBool(row.is_head) ? row.is_head : false,
    is_contested: isBool(row.is_contested) ? row.is_contested : false,
    is_tombstoned: isBool(row.is_tombstoned) ? row.is_tombstoned : false,
    active_source_count: isNumber(row.active_source_count) ? row.active_source_count : 0,
    degraded_source_count: isNumber(row.degraded_source_count) ? row.degraded_source_count : 0,
    provenance_degraded: isBool(row.provenance_degraded) ? row.provenance_degraded : false,
  };
}

// A renderable placeholder for a malformed single-fact response. All flags
// false, lowest trust — safe to show without crashing or overstating trust.
const FALLBACK_FACT: FactView = {
  id: '',
  workspace_id: '',
  area: '',
  statement: '',
  statement_hash: '',
  tier: 'T-2' as FactTier,
  confidence: 0,
  last_corroborated: '',
  last_administratively_touched: '',
  audit_seq: 0,
  version_chain_root_id: null,
  superseded_by_fact_id: null,
  contested_at: null,
  contested_reason: null,
  tombstoned_at: null,
  tombstone_reason: null,
  is_head: false,
  is_contested: false,
  is_tombstoned: false,
  active_source_count: 0,
  degraded_source_count: 0,
  provenance_degraded: false,
};

export function parseFactView(raw: unknown): FactView {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/facts/:fact_id',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      const view = toFactView(raw);
      if (view === null) throw new Error('fact missing id/area/statement');
      return view;
    },
    FALLBACK_FACT,
  );
}

const EMPTY_FACTS_LIST: ListFactsResult = {
  facts: [],
  total: 0,
  returned: 0,
  limit: 0,
  offset: 0,
  has_more: false,
};

export function parseListFactsResult(raw: unknown): ListFactsResult {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/facts',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      if (!Array.isArray(raw.facts)) throw new Error('`facts` is not an array');
      const facts: FactView[] = [];
      for (const item of raw.facts) {
        if (!isObject(item)) continue;
        const view = toFactView(item);
        if (view !== null) facts.push(view);
      }
      return {
        facts,
        total: isNumber(raw.total) ? raw.total : facts.length,
        returned: isNumber(raw.returned) ? raw.returned : facts.length,
        limit: isNumber(raw.limit) ? raw.limit : 0,
        offset: isNumber(raw.offset) ? raw.offset : 0,
        has_more: isBool(raw.has_more) ? raw.has_more : false,
      };
    },
    EMPTY_FACTS_LIST,
  );
}

function toQuote(value: unknown): ConversationQuoteView | null {
  if (!isObject(value) || !isString(value.id)) return null;
  return {
    id: value.id,
    position: isNumber(value.position) ? value.position : 0,
    text: isString(value.text) ? value.text : '',
  };
}

function toConversationView(row: Record<string, unknown>): ConversationView | null {
  if (!isString(row.id)) return null;
  const quotes: ConversationQuoteView[] = [];
  if (Array.isArray(row.verbatim_quotes)) {
    for (const q of row.verbatim_quotes) {
      const quote = toQuote(q);
      if (quote !== null) quotes.push(quote);
    }
  }
  return {
    id: row.id,
    workspace_id: isString(row.workspace_id) ? row.workspace_id : '',
    person_name: isString(row.person_name) ? row.person_name : '',
    occurred_at: isString(row.occurred_at) ? row.occurred_at : '',
    // Enum normalization: unknown/missing → a safe known default.
    audience_fit: isAudienceFit(row.audience_fit) ? row.audience_fit : ('unknown' as AudienceFit),
    conversation_type: isConversationType(row.conversation_type)
      ? row.conversation_type
      : ('other' as ConversationType),
    outcome: isConversationOutcome(row.outcome)
      ? row.outcome
      : ('inconclusive' as ConversationOutcome),
    summary: stringOrNull(row.summary),
    created_at: isString(row.created_at) ? row.created_at : '',
    audit_seq: isNumber(row.audit_seq) ? row.audit_seq : 0,
    tombstoned_at: stringOrNull(row.tombstoned_at),
    tombstone_reason: stringOrNull(row.tombstone_reason),
    fact_extraction_status: isFactExtractionStatus(row.fact_extraction_status)
      ? row.fact_extraction_status
      : ('pending' as FactExtractionStatus),
    last_extracted_at: stringOrNull(row.last_extracted_at),
    is_tombstoned: isBool(row.is_tombstoned) ? row.is_tombstoned : false,
    verbatim_quotes: quotes,
  };
}

const FALLBACK_CONVERSATION: ConversationView = {
  id: '',
  workspace_id: '',
  person_name: '',
  occurred_at: '',
  audience_fit: 'unknown' as AudienceFit,
  conversation_type: 'other' as ConversationType,
  outcome: 'inconclusive' as ConversationOutcome,
  summary: null,
  created_at: '',
  audit_seq: 0,
  tombstoned_at: null,
  tombstone_reason: null,
  fact_extraction_status: 'pending' as FactExtractionStatus,
  last_extracted_at: null,
  is_tombstoned: false,
  verbatim_quotes: [],
};

export function parseConversationView(raw: unknown): ConversationView {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/conversations/:cid',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      const view = toConversationView(raw);
      if (view === null) throw new Error('conversation missing id');
      return view;
    },
    FALLBACK_CONVERSATION,
  );
}

const EMPTY_CONVERSATIONS_LIST: ListConversationsResult = {
  conversations: [],
  total: 0,
  returned: 0,
  limit: 0,
  offset: 0,
  has_more: false,
};

export function parseListConversations(raw: unknown): ListConversationsResult {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/conversations',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      if (!Array.isArray(raw.conversations)) throw new Error('`conversations` is not an array');
      const conversations: ConversationView[] = [];
      for (const item of raw.conversations) {
        if (!isObject(item)) continue;
        const view = toConversationView(item);
        if (view !== null) conversations.push(view);
      }
      return {
        conversations,
        total: isNumber(raw.total) ? raw.total : conversations.length,
        returned: isNumber(raw.returned) ? raw.returned : conversations.length,
        limit: isNumber(raw.limit) ? raw.limit : 0,
        offset: isNumber(raw.offset) ? raw.offset : 0,
        has_more: isBool(raw.has_more) ? raw.has_more : false,
      };
    },
    EMPTY_CONVERSATIONS_LIST,
  );
}

const EMPTY_CONVERSATION_FACTS: ConversationFactsResponse = {
  conversation_id: '',
  facts: [],
  total: 0,
};

export function parseConversationFacts(raw: unknown): ConversationFactsResponse {
  return parseWithFallback(
    'GET /api/v1/workspaces/:id/conversations/:cid/facts',
    () => {
      if (!isObject(raw)) throw new Error('response is not an object');
      if (!Array.isArray(raw.facts)) throw new Error('`facts` is not an array');
      const facts: FactView[] = [];
      for (const item of raw.facts) {
        if (!isObject(item)) continue;
        const view = toFactView(item);
        if (view !== null) facts.push(view);
      }
      return {
        conversation_id: isString(raw.conversation_id) ? raw.conversation_id : '',
        facts,
        total: isNumber(raw.total) ? raw.total : facts.length,
      };
    },
    EMPTY_CONVERSATION_FACTS,
  );
}
