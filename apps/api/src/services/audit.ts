// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Read-only audit chain queries + chain-integrity verification.
//
// All mutation paths must go through @manthanos/memory's auditedWrite();
// this module never writes. Verification uses the existing primitive
// verifyChain() from @manthanos/safety.

import { readFile } from 'node:fs/promises';
import type { BlobStore, ManthanSqliteHandle } from '@manthanos/memory';
import { type ChainedAuditEvent, verifyChain } from '@manthanos/safety';

export type EventTypeFilter = string;
export type ActorFilter = string;

export interface AuditEventSummary {
  readonly seq: number;
  readonly event_type: string;
  readonly actor: string;
  readonly timestamp: string;
  readonly kind: string;
  readonly decision: string;
  readonly prev_hash: string | null;
  readonly self_hash: string;
  readonly payload_hash: string | null;
}

export interface AuditEventDetail extends AuditEventSummary {
  readonly payload: unknown | null;
  readonly payload_resolved: 'present' | 'absent' | 'missing_blob';
}

export interface ListAuditOptions {
  /** Cursor: return events with seq strictly less than this. Default = head. */
  readonly beforeSeq?: number;
  /** Page size; default 50, max 500. */
  readonly limit?: number;
  /** Exact match on `action`. */
  readonly eventType?: EventTypeFilter;
  /** Exact match on `actor`. */
  readonly actor?: ActorFilter;
  /** ISO 8601 inclusive lower bound on ts. */
  readonly since?: string;
  /** ISO 8601 inclusive upper bound on ts. */
  readonly until?: string;
}

export interface ListAuditResult {
  readonly events: readonly AuditEventSummary[];
  readonly head_seq: number | null;
  readonly returned: number;
  readonly has_more: boolean;
  /** Pass this as the next request's `before_seq` to continue paging. */
  readonly next_before_seq: number | null;
}

export interface VerifyAuditResult {
  readonly valid: boolean;
  readonly head_seq: number | null;
  readonly total_events: number;
  readonly broken_at_seq: number | null;
  /** When invalid: what the chain expected vs. what it found at broken_at_seq. */
  readonly expected_prev_hash?: string | null;
  readonly actual_prev_hash?: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export class AuditQueryError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'AuditQueryError';
    this.field = field;
  }
}

interface AuditRow {
  seq: number;
  workspace_id: string;
  ts: string;
  actor: string;
  action: string;
  kind: string;
  payload_hash: string | null;
  decision: string;
  prev_hash: string | null;
  self_hash: string;
}

function rowToSummary(row: AuditRow): AuditEventSummary {
  return {
    seq: row.seq,
    event_type: row.action,
    actor: row.actor,
    timestamp: row.ts,
    kind: row.kind,
    decision: row.decision,
    prev_hash: row.prev_hash,
    self_hash: row.self_hash,
    payload_hash: row.payload_hash,
  };
}

export function workspaceExists(db: ManthanSqliteHandle, workspaceId: string): boolean {
  const row = db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId) as
    | { 1: number }
    | undefined;
  return row !== undefined;
}

export function listAuditEvents(
  db: ManthanSqliteHandle,
  workspaceId: string,
  opts: ListAuditOptions = {},
): ListAuditResult {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new AuditQueryError('limit', 'limit must be a positive integer');
  }
  if (opts.beforeSeq !== undefined && (!Number.isInteger(opts.beforeSeq) || opts.beforeSeq < 1)) {
    throw new AuditQueryError('before_seq', 'before_seq must be a positive integer');
  }
  if (opts.since !== undefined && Number.isNaN(Date.parse(opts.since))) {
    throw new AuditQueryError('since', 'since must be a parseable ISO 8601 timestamp');
  }
  if (opts.until !== undefined && Number.isNaN(Date.parse(opts.until))) {
    throw new AuditQueryError('until', 'until must be a parseable ISO 8601 timestamp');
  }

  const clauses: string[] = ['workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (opts.beforeSeq !== undefined) {
    clauses.push('seq < ?');
    params.push(opts.beforeSeq);
  }
  if (opts.eventType !== undefined) {
    clauses.push('action = ?');
    params.push(opts.eventType);
  }
  if (opts.actor !== undefined) {
    clauses.push('actor = ?');
    params.push(opts.actor);
  }
  if (opts.since !== undefined) {
    clauses.push('ts >= ?');
    params.push(opts.since);
  }
  if (opts.until !== undefined) {
    clauses.push('ts <= ?');
    params.push(opts.until);
  }

  // Fetch limit + 1 to detect whether there's another page.
  const sql = `
    SELECT seq, workspace_id, ts, actor, action, kind, payload_hash, decision, prev_hash, self_hash
    FROM audit_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY seq DESC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...params, limit + 1) as AuditRow[];

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const events = visible.map(rowToSummary);

  // head_seq is the workspace's current chain head, regardless of filters.
  const headRow = db
    .prepare('SELECT seq FROM audit_events WHERE workspace_id = ? ORDER BY seq DESC LIMIT 1')
    .get(workspaceId) as { seq: number } | undefined;
  const head = headRow?.seq ?? null;

  const nextBeforeSeq =
    hasMore && events.length > 0 ? (events[events.length - 1]?.seq ?? null) : null;

  return {
    events,
    head_seq: head,
    returned: events.length,
    has_more: hasMore,
    next_before_seq: nextBeforeSeq,
  };
}

export async function getAuditEvent(
  db: ManthanSqliteHandle,
  blobs: BlobStore,
  workspaceId: string,
  seq: number,
): Promise<AuditEventDetail | null> {
  if (!Number.isInteger(seq) || seq < 1) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT seq, workspace_id, ts, actor, action, kind, payload_hash,
              decision, prev_hash, self_hash
       FROM audit_events
       WHERE workspace_id = ? AND seq = ?`,
    )
    .get(workspaceId, seq) as AuditRow | undefined;
  if (!row) {
    return null;
  }

  const summary = rowToSummary(row);
  if (row.payload_hash === null) {
    return { ...summary, payload: null, payload_resolved: 'absent' };
  }

  // Resolve the blob from the content-addressable store. The blob is the
  // payload's canonical JSON. Missing blobs surface as missing_blob — the
  // event itself remains queryable.
  const blobPath = blobs.pathFor(row.payload_hash);
  try {
    const content = await readFile(blobPath, 'utf8');
    const payload = JSON.parse(content) as unknown;
    return { ...summary, payload, payload_resolved: 'present' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code === 'ENOENT') {
      return { ...summary, payload: null, payload_resolved: 'missing_blob' };
    }
    throw err;
  }
}

export function verifyAuditChain(db: ManthanSqliteHandle, workspaceId: string): VerifyAuditResult {
  // Stream the chain in ascending order. better-sqlite3 returns rows
  // synchronously; for large chains this is still linear. We pull all
  // rows so we can pass them to verifyChain() which expects an iterable.
  const rows = db
    .prepare(
      `SELECT seq, workspace_id, ts, actor, action, kind, payload_hash,
              decision, prev_hash, self_hash
       FROM audit_events
       WHERE workspace_id = ?
       ORDER BY seq ASC`,
    )
    .all(workspaceId) as AuditRow[];

  const total = rows.length;
  const headSeq = total > 0 ? (rows[total - 1]?.seq ?? null) : null;

  if (total === 0) {
    return {
      valid: true,
      head_seq: null,
      total_events: 0,
      broken_at_seq: null,
    };
  }

  const events: ChainedAuditEvent[] = rows.map((r) => ({
    workspace_id: r.workspace_id,
    seq: r.seq,
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    kind: r.kind,
    payload_hash: r.payload_hash,
    // verifyChain types decision as AuditDecision; the stored string
    // matches by construction (auditedWrite enforces the enum).
    decision: r.decision as ChainedAuditEvent['decision'],
    prev_hash: r.prev_hash,
    self_hash: r.self_hash,
  }));

  const check = verifyChain(events);
  if (check.ok) {
    return {
      valid: true,
      head_seq: headSeq,
      total_events: total,
      broken_at_seq: null,
    };
  }

  return {
    valid: false,
    head_seq: headSeq,
    total_events: total,
    broken_at_seq: check.failedAtSeq ?? null,
    expected_prev_hash: check.expected ?? null,
    actual_prev_hash: check.actual ?? null,
  };
}
