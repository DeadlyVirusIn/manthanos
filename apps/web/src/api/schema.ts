// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Defensive response parsing for the workspaces-list and audit endpoints
// (C3.0 DEFECT-001/002/003 hardening). "Parse, don't cast": untyped JSON
// crossing the network is not `T`. Each parser validates structurally and
// returns an explicit fallback on malformed input — it logs a warning and
// never throws into the UI. Scoped intentionally to the three endpoints
// that drifted; not a general framework.

import type {
  AuditChainVerifyResult,
  AuditEventSummary,
  ListAuditEventsResult,
  WorkspaceStatus,
  WorkspaceView,
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
