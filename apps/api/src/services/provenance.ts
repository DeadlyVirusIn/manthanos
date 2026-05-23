// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Content-provenance helpers. Sprint 1 Task 6B commit 2.
//
// Provenance rows link a fact to the *content* it came from (a quote, or
// a conversation when no specific quote is cited). The schema is in
// migration 0008 (`fact_provenance_sources`). Re-extraction policy:
// duplicate content does NOT reject — it adds a new provenance row to
// the existing fact (corroboration).
//
// These helpers are intentionally NOT a top-level audited-write surface.
// Provenance writes happen inside another service's audited transaction
// (e.g. tombstoneConversation in services/conversations.ts, or
// extractFactFromConversation in commit 3), so the parent action's
// audit event captures provenance changes atomically. No new audit
// action is emitted from this file — by design.

import { randomUUID } from 'node:crypto';
import type { ManthanSqliteHandle } from '@manthanos/memory';

// ─────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────

export type ProvenanceExtractor = 'manual'; // 'ai-v1' lands in Task 6C
export type ProvenanceSourceKind = 'quote' | 'conversation';

/** Reason string written into degraded_reason. Free-form, but the
 *  conversation tombstone path uses this canonical token so downstream
 *  audit replay can disambiguate. */
export const DEGRADATION_REASON_CONVERSATION_TOMBSTONED = 'source_conversation_tombstoned';

// ─────────────────────────────────────────────────────────────────
// Views and errors
// ─────────────────────────────────────────────────────────────────

export interface ProvenanceSourceView {
  readonly id: string;
  readonly fact_id: string;
  readonly kind: ProvenanceSourceKind;
  /** quote_id when kind = 'quote'; conversation_id when kind = 'conversation'. */
  readonly source_id: string;
  readonly extracted_at: string;
  readonly extractor: ProvenanceExtractor;
  readonly degraded_at: string | null;
  readonly degraded_reason: string | null;
}

interface ProvenanceRow {
  id: string;
  workspace_id: string;
  fact_id: string;
  quote_id: string | null;
  conversation_id: string | null;
  extracted_at: string;
  extractor: ProvenanceExtractor;
  degraded_at: string | null;
  degraded_reason: string | null;
}

export class ProvenanceValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ProvenanceValidationError';
    this.field = field;
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function generateProvenanceId(): string {
  return `prov-${randomUUID().slice(0, 12)}`;
}

function rowToView(row: ProvenanceRow): ProvenanceSourceView {
  // Exactly one of {quote_id, conversation_id} is non-NULL per row;
  // enforced at the insert path by recordProvenanceSource.
  if (row.quote_id !== null) {
    return {
      id: row.id,
      fact_id: row.fact_id,
      kind: 'quote',
      source_id: row.quote_id,
      extracted_at: row.extracted_at,
      extractor: row.extractor,
      degraded_at: row.degraded_at,
      degraded_reason: row.degraded_reason,
    };
  }
  if (row.conversation_id !== null) {
    return {
      id: row.id,
      fact_id: row.fact_id,
      kind: 'conversation',
      source_id: row.conversation_id,
      extracted_at: row.extracted_at,
      extractor: row.extractor,
      degraded_at: row.degraded_at,
      degraded_reason: row.degraded_reason,
    };
  }
  // Defensive: schema permits NULL for both but the service layer
  // forbids it. If we ever observe this, the row was inserted by a
  // bypass path (raw SQL).
  throw new Error(`provenance ${row.id} has neither quote_id nor conversation_id (data integrity)`);
}

// ─────────────────────────────────────────────────────────────────
// Write paths
// ─────────────────────────────────────────────────────────────────

export interface RecordProvenanceSourceInput {
  readonly factId: string;
  /** Exactly one of {quoteId, conversationId} must be provided. */
  readonly quoteId?: string;
  readonly conversationId?: string;
  readonly extractor: ProvenanceExtractor;
  /** Optional override for the timestamp (used by the extraction path
   *  to keep the provenance row's timestamp aligned with the audit
   *  event's `extracted_at`). Defaults to now if omitted. */
  readonly extractedAt?: string;
}

/**
 * Insert one provenance row. Intended to be called inside another
 * service's audited write (e.g. extractFactFromConversation). Does
 * NOT itself call auditedWrite — the parent transaction's audit event
 * captures the new linkage.
 *
 * Returns the new provenance source's id.
 */
export function recordProvenanceSource(
  db: ManthanSqliteHandle,
  workspaceId: string,
  input: RecordProvenanceSourceInput,
): string {
  // Exactly-one invariant. Schema permits NULLs; service enforces.
  const hasQuote = input.quoteId !== undefined && input.quoteId !== null;
  const hasConversation = input.conversationId !== undefined && input.conversationId !== null;
  if (hasQuote === hasConversation) {
    throw new ProvenanceValidationError(
      'source',
      'recordProvenanceSource requires exactly one of quoteId or conversationId',
    );
  }

  const id = generateProvenanceId();
  const extractedAt = input.extractedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO fact_provenance_sources (
       id, workspace_id, fact_id, quote_id, conversation_id,
       extracted_at, extractor
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspaceId,
    input.factId,
    hasQuote ? (input.quoteId as string) : null,
    hasConversation ? (input.conversationId as string) : null,
    extractedAt,
    input.extractor,
  );
  return id;
}

export interface DegradationOutcome {
  readonly affectedRows: number;
  readonly affectedFactIds: readonly string[];
}

/**
 * Mark every provenance row linked to the given conversation as degraded.
 * Linkage = row.conversation_id matches OR row.quote_id ∈ that
 * conversation's quotes.
 *
 * Idempotent: only updates rows whose degraded_at is currently NULL, so
 * a future re-tombstone (currently blocked by the service entry guard)
 * would not overwrite an existing degradation reason.
 *
 * Returns counts + the distinct fact_ids touched, for the caller's
 * audit payload.
 */
export function markProvenanceDegradedByConversation(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationId: string,
  reason: string,
  degradedAt: string,
): DegradationOutcome {
  // Collect distinct fact_ids that are about to be degraded. Bound to
  // the same WHERE clause as the UPDATE so the audit-payload sample
  // matches what actually changed.
  const affectedFactIds = (
    db
      .prepare(
        `SELECT DISTINCT fact_id
           FROM fact_provenance_sources
          WHERE workspace_id = ?
            AND degraded_at IS NULL
            AND (
              conversation_id = ?
              OR quote_id IN (
                SELECT id FROM conversation_verbatim_quotes
                 WHERE conversation_id = ?
              )
            )`,
      )
      .all(workspaceId, conversationId, conversationId) as Array<{ fact_id: string }>
  ).map((r) => r.fact_id);

  const result = db
    .prepare(
      `UPDATE fact_provenance_sources
          SET degraded_at = ?, degraded_reason = ?
        WHERE workspace_id = ?
          AND degraded_at IS NULL
          AND (
            conversation_id = ?
            OR quote_id IN (
              SELECT id FROM conversation_verbatim_quotes
               WHERE conversation_id = ?
            )
          )`,
    )
    .run(degradedAt, reason, workspaceId, conversationId, conversationId);

  return { affectedRows: result.changes, affectedFactIds };
}

// ─────────────────────────────────────────────────────────────────
// Read paths
// ─────────────────────────────────────────────────────────────────

const PROVENANCE_SELECT_COLUMNS = `
  id, workspace_id, fact_id, quote_id, conversation_id,
  extracted_at, extractor, degraded_at, degraded_reason
`;

/**
 * Return every provenance row pointing at the given fact, in extraction
 * order. Empty array when the fact has no provenance sources (e.g. it
 * was created directly via POST /facts rather than extracted).
 */
export function listProvenanceForFact(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): readonly ProvenanceSourceView[] {
  const rows = db
    .prepare(
      `SELECT ${PROVENANCE_SELECT_COLUMNS}
         FROM fact_provenance_sources
        WHERE workspace_id = ? AND fact_id = ?
        ORDER BY extracted_at ASC, id ASC`,
    )
    .all(workspaceId, factId) as ProvenanceRow[];
  return rows.map(rowToView);
}

/**
 * Cheap EXISTS-style check: does this fact have at least one degraded
 * provenance row? Backs the FactView's derived `provenance_degraded`
 * flag for callers that only need the boolean. The partial index
 * `ix_fact_provenance_degraded` makes this O(log n).
 */
export function factHasDegradedProvenance(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1
         FROM fact_provenance_sources
        WHERE workspace_id = ? AND fact_id = ? AND degraded_at IS NOT NULL
        LIMIT 1`,
    )
    .get(workspaceId, factId);
  return row !== undefined;
}
