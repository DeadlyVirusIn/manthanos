// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation CRUD foundation. Sprint 1 Task 6A.
//
// Every mutation flows through @manthanos/memory's auditedWrite. The
// single audit action emitted in this commit is `conversation.create`.
// Extraction, summarization, contestation, and tombstone are out of
// scope (Task 6B+).

import { randomUUID } from 'node:crypto';
import {
  type AuditedWriteContext,
  type AuditedWriteResult,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import { AUDIT_DECISION_HUMAN_APPROVED } from '@manthanos/safety';
import {
  type FactRow,
  type FactTier,
  FactValidationError,
  type FactView,
  TIER_CONFIDENCE,
  computeStatementHash,
  generateFactId,
  getFact,
  isFactTier,
  selectFactByHash,
} from './facts.js';
import {
  DEGRADATION_REASON_CONVERSATION_TOMBSTONED,
  markProvenanceDegradedByConversation,
  recordProvenanceSource,
} from './provenance.js';

// ─────────────────────────────────────────────────────────────────
// Enum vocabularies (mirrors migration 0007 documentation)
// ─────────────────────────────────────────────────────────────────

export type AudienceFit = 'target' | 'adjacent' | 'outside' | 'unknown';
export type ConversationType = 'discovery' | 'validation' | 'sales' | 'support' | 'other';
export type ConversationOutcome = 'validated' | 'invalidated' | 'inconclusive' | 'follow_up';
export type FactExtractionStatus = 'pending' | 'extracted' | 'skipped';

const ALLOWED_EXTRACTION_STATUSES: readonly FactExtractionStatus[] = [
  'pending',
  'extracted',
  'skipped',
];

export const TOMBSTONE_CONVERSATION_SENTINEL = '[tombstoned]';

const ALLOWED_AUDIENCE_FIT: readonly AudienceFit[] = ['target', 'adjacent', 'outside', 'unknown'];
const ALLOWED_CONVERSATION_TYPES: readonly ConversationType[] = [
  'discovery',
  'validation',
  'sales',
  'support',
  'other',
];
const ALLOWED_OUTCOMES: readonly ConversationOutcome[] = [
  'validated',
  'invalidated',
  'inconclusive',
  'follow_up',
];

export function isAudienceFit(v: unknown): v is AudienceFit {
  return typeof v === 'string' && (ALLOWED_AUDIENCE_FIT as readonly string[]).includes(v);
}
export function isConversationType(v: unknown): v is ConversationType {
  return typeof v === 'string' && (ALLOWED_CONVERSATION_TYPES as readonly string[]).includes(v);
}
export function isConversationOutcome(v: unknown): v is ConversationOutcome {
  return typeof v === 'string' && (ALLOWED_OUTCOMES as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────
// Views and errors
// ─────────────────────────────────────────────────────────────────

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
  // Task 6B columns (migration 0008). NULL when not set.
  readonly tombstoned_at: string | null;
  readonly tombstone_reason: string | null;
  readonly fact_extraction_status: FactExtractionStatus;
  readonly last_extracted_at: string | null;
  /** Derived: true when tombstoned_at is set. */
  readonly is_tombstoned: boolean;
  readonly verbatim_quotes: readonly ConversationQuoteView[];
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  person_name: string;
  occurred_at: string;
  audience_fit: AudienceFit;
  conversation_type: ConversationType;
  outcome: ConversationOutcome;
  summary: string | null;
  created_at: string;
  audit_seq: number;
  tombstoned_at: string | null;
  tombstone_reason: string | null;
  fact_extraction_status: FactExtractionStatus;
  last_extracted_at: string | null;
}

interface QuoteRow {
  id: string;
  conversation_id: string;
  position: number;
  text: string;
}

export class ConversationValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ConversationValidationError';
    this.field = field;
  }
}

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation ${id} not found`);
    this.name = 'ConversationNotFoundError';
  }
}

/** Raised when a caller tries to mutate a conversation whose lifecycle
 *  forbids it. States:
 *   - `tombstoned`: the conversation is terminal — no further mutations.
 *   - `already_skipped`: the conversation is already marked as not useful;
 *     a second skip is a no-op the caller probably didn't mean.
 *  Both surface as HTTP 409 with `error: 'invalid_lifecycle'` and the
 *  `state` field carrying the specific reason. */
export class ConversationLifecycleError extends Error {
  readonly state: 'tombstoned' | 'already_skipped';
  readonly conversationId: string;
  constructor(state: 'tombstoned' | 'already_skipped', conversationId: string, message: string) {
    super(message);
    this.name = 'ConversationLifecycleError';
    this.state = state;
    this.conversationId = conversationId;
  }
}

function assertConversationNotTombstoned(row: ConversationRow): void {
  if (row.tombstoned_at !== null) {
    throw new ConversationLifecycleError(
      'tombstoned',
      row.id,
      `conversation ${row.id} is tombstoned; no further mutations are allowed`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────

const MAX_PERSON_NAME_LEN = 200;
const MAX_SUMMARY_LEN = 8000;
const MAX_QUOTE_LEN = 4000;

function validateNonEmptyString(field: string, value: unknown, maxLen: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConversationValidationError(field, `${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new ConversationValidationError(field, `${field} must be ${maxLen} characters or fewer`);
  }
  return trimmed;
}

/**
 * Accepts any string that `new Date(...)` parses without yielding NaN.
 * Stored canonical form is `toISOString()` so timezone-suffixed inputs
 * (e.g. '+04:00') normalize to UTC for consistent ordering / equality.
 */
function validateIsoTimestamp(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConversationValidationError(field, `${field} must be a non-empty ISO 8601 string`);
  }
  const trimmed = value.trim();
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new ConversationValidationError(field, `${field} is not a valid ISO 8601 timestamp`);
  }
  return d.toISOString();
}

function generateConversationId(): string {
  return `conv-${randomUUID().slice(0, 12)}`;
}

function generateQuoteId(): string {
  return `quote-${randomUUID().slice(0, 12)}`;
}

// ─────────────────────────────────────────────────────────────────
// Row → view mappers
// ─────────────────────────────────────────────────────────────────

const CONVERSATION_COLUMNS = `
  id, workspace_id, person_name, occurred_at, audience_fit,
  conversation_type, outcome, summary, created_at, audit_seq,
  tombstoned_at, tombstone_reason,
  fact_extraction_status, last_extracted_at
`;

function rowToView(
  row: ConversationRow,
  quotes: readonly ConversationQuoteView[],
): ConversationView {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    person_name: row.person_name,
    occurred_at: row.occurred_at,
    audience_fit: row.audience_fit,
    conversation_type: row.conversation_type,
    outcome: row.outcome,
    summary: row.summary,
    created_at: row.created_at,
    audit_seq: row.audit_seq,
    tombstoned_at: row.tombstoned_at,
    tombstone_reason: row.tombstone_reason,
    fact_extraction_status: row.fact_extraction_status,
    last_extracted_at: row.last_extracted_at,
    is_tombstoned: row.tombstoned_at !== null,
    verbatim_quotes: quotes,
  };
}

// Silence unused-warning until 6C consumes this list (extraction-status
// validation lives in extractFactFromConversation).
void ALLOWED_EXTRACTION_STATUSES;

function loadQuotesGrouped(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationIds: readonly string[],
): Map<string, ConversationQuoteView[]> {
  const out = new Map<string, ConversationQuoteView[]>();
  if (conversationIds.length === 0) return out;
  const placeholders = conversationIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT id, conversation_id, position, text
       FROM conversation_verbatim_quotes
       WHERE workspace_id = ? AND conversation_id IN (${placeholders})
       ORDER BY conversation_id ASC, position ASC`,
    )
    .all(workspaceId, ...conversationIds) as QuoteRow[];

  for (const r of rows) {
    let bucket = out.get(r.conversation_id);
    if (!bucket) {
      bucket = [];
      out.set(r.conversation_id, bucket);
    }
    bucket.push({ id: r.id, position: r.position, text: r.text });
  }
  return out;
}

function selectConversationById(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationId: string,
): ConversationRow | null {
  const row = db
    .prepare(
      `SELECT ${CONVERSATION_COLUMNS}
       FROM conversations
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, conversationId) as ConversationRow | undefined;
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Read paths
// ─────────────────────────────────────────────────────────────────

export interface ListConversationsOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly audienceFit?: AudienceFit;
  readonly conversationType?: ConversationType;
  readonly outcome?: ConversationOutcome;
  /** Default false. Tombstoned conversations are hidden from the
   *  default list (matches the facts pattern). Callers walking the
   *  audit trail or showing a "deleted" view pass true. */
  readonly includeTombstoned?: boolean;
}

export interface ListConversationsResult {
  readonly conversations: readonly ConversationView[];
  readonly total: number;
  readonly returned: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_more: boolean;
}

const DEFAULT_CONVERSATIONS_LIMIT = 50;
const MAX_CONVERSATIONS_LIMIT = 500;

export function listConversations(
  db: ManthanSqliteHandle,
  workspaceId: string,
  opts: ListConversationsOptions = {},
): ListConversationsResult {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? DEFAULT_CONVERSATIONS_LIMIT, MAX_CONVERSATIONS_LIMIT),
  );
  const offset = Math.max(0, opts.offset ?? 0);

  if (opts.audienceFit !== undefined && !isAudienceFit(opts.audienceFit)) {
    throw new ConversationValidationError(
      'audience_fit',
      `audience_fit must be one of ${ALLOWED_AUDIENCE_FIT.join(', ')}`,
    );
  }
  if (opts.conversationType !== undefined && !isConversationType(opts.conversationType)) {
    throw new ConversationValidationError(
      'conversation_type',
      `conversation_type must be one of ${ALLOWED_CONVERSATION_TYPES.join(', ')}`,
    );
  }
  if (opts.outcome !== undefined && !isConversationOutcome(opts.outcome)) {
    throw new ConversationValidationError(
      'outcome',
      `outcome must be one of ${ALLOWED_OUTCOMES.join(', ')}`,
    );
  }

  const clauses: string[] = ['workspace_id = ?'];
  const params: unknown[] = [workspaceId];
  if (opts.audienceFit !== undefined) {
    clauses.push('audience_fit = ?');
    params.push(opts.audienceFit);
  }
  if (opts.conversationType !== undefined) {
    clauses.push('conversation_type = ?');
    params.push(opts.conversationType);
  }
  if (opts.outcome !== undefined) {
    clauses.push('outcome = ?');
    params.push(opts.outcome);
  }
  if (!opts.includeTombstoned) {
    clauses.push('tombstoned_at IS NULL');
  }
  const where = clauses.join(' AND ');

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM conversations WHERE ${where}`)
    .get(...params) as { n: number };

  const rows = db
    .prepare(
      `SELECT ${CONVERSATION_COLUMNS}
       FROM conversations
       WHERE ${where}
       ORDER BY occurred_at DESC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ConversationRow[];

  const quoteMap = loadQuotesGrouped(
    db,
    workspaceId,
    rows.map((r) => r.id),
  );

  return {
    conversations: rows.map((r) => rowToView(r, quoteMap.get(r.id) ?? [])),
    total: totalRow.n,
    returned: rows.length,
    limit,
    offset,
    has_more: offset + rows.length < totalRow.n,
  };
}

export function getConversation(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationId: string,
): ConversationView | null {
  const row = selectConversationById(db, workspaceId, conversationId);
  if (!row) return null;
  const quoteMap = loadQuotesGrouped(db, workspaceId, [row.id]);
  return rowToView(row, quoteMap.get(row.id) ?? []);
}

// ─────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────

export interface CreateConversationQuoteInput {
  readonly text: string;
}

export interface CreateConversationInput {
  readonly person_name: string;
  readonly occurred_at: string;
  readonly audience_fit: AudienceFit;
  readonly conversation_type: ConversationType;
  readonly outcome: ConversationOutcome;
  readonly summary?: string | null;
  readonly verbatim_quotes?: ReadonlyArray<CreateConversationQuoteInput> | null;
}

export interface CreateConversationResult {
  readonly conversation: ConversationView;
  readonly audit: AuditedWriteResult;
}

export async function createConversation(
  ctx: AuditedWriteContext,
  workspaceId: string,
  input: CreateConversationInput,
): Promise<CreateConversationResult> {
  const personName = validateNonEmptyString('person_name', input.person_name, MAX_PERSON_NAME_LEN);
  const occurredAt = validateIsoTimestamp('occurred_at', input.occurred_at);

  if (!isAudienceFit(input.audience_fit)) {
    throw new ConversationValidationError(
      'audience_fit',
      `audience_fit must be one of ${ALLOWED_AUDIENCE_FIT.join(', ')}`,
    );
  }
  if (!isConversationType(input.conversation_type)) {
    throw new ConversationValidationError(
      'conversation_type',
      `conversation_type must be one of ${ALLOWED_CONVERSATION_TYPES.join(', ')}`,
    );
  }
  if (!isConversationOutcome(input.outcome)) {
    throw new ConversationValidationError(
      'outcome',
      `outcome must be one of ${ALLOWED_OUTCOMES.join(', ')}`,
    );
  }

  let summary: string | null = null;
  if (input.summary !== undefined && input.summary !== null) {
    summary = validateNonEmptyString('summary', input.summary, MAX_SUMMARY_LEN);
  }

  const quotes: Array<{ id: string; position: number; text: string }> = [];
  if (input.verbatim_quotes !== undefined && input.verbatim_quotes !== null) {
    if (!Array.isArray(input.verbatim_quotes)) {
      throw new ConversationValidationError(
        'verbatim_quotes',
        'verbatim_quotes must be an array of { text } objects',
      );
    }
    for (let i = 0; i < input.verbatim_quotes.length; i++) {
      const raw = input.verbatim_quotes[i];
      if (!raw || typeof raw !== 'object') {
        throw new ConversationValidationError(
          `verbatim_quotes[${i}]`,
          `verbatim_quotes[${i}] must be an object`,
        );
      }
      const text = validateNonEmptyString(
        `verbatim_quotes[${i}].text`,
        (raw as { text?: unknown }).text,
        MAX_QUOTE_LEN,
      );
      quotes.push({ id: generateQuoteId(), position: i, text });
    }
  }

  const id = generateConversationId();
  const createdAt = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'conversation.create',
    kind: 'conversation',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      conversation_id: id,
      workspace_id: workspaceId,
      person_name: personName,
      occurred_at: occurredAt,
      audience_fit: input.audience_fit,
      conversation_type: input.conversation_type,
      outcome: input.outcome,
      summary,
      created_at: createdAt,
      verbatim_quotes: quotes,
      quote_count: quotes.length,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `INSERT INTO conversations (
             id, workspace_id, person_name, occurred_at, audience_fit,
             conversation_type, outcome, summary, created_at, audit_seq
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          personName,
          occurredAt,
          input.audience_fit,
          input.conversation_type,
          input.outcome,
          summary,
          createdAt,
          seq,
        );

      if (quotes.length > 0) {
        const insertQuote = ctx.db.prepare(
          `INSERT INTO conversation_verbatim_quotes (
             id, conversation_id, workspace_id, position, text
           ) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const q of quotes) {
          insertQuote.run(q.id, id, workspaceId, q.position, q.text);
        }
      }
    },
  });

  const view = getConversation(ctx.db, workspaceId, id);
  if (!view) {
    throw new Error(`conversation ${id} disappeared immediately after creation`);
  }
  return { conversation: view, audit };
}

// ─────────────────────────────────────────────────────────────────
// Task 6B commit 2 — tombstone
// ─────────────────────────────────────────────────────────────────

const AFFECTED_FACT_IDS_SAMPLE_CAP = 20;

export interface TombstoneConversationInput {
  readonly reason: string;
}

export interface TombstoneConversationResult {
  readonly conversation: ConversationView;
  readonly audit: AuditedWriteResult;
  readonly affected_quote_count: number;
  readonly affected_provenance_count: number;
  readonly affected_fact_ids_sample: readonly string[];
}

/**
 * Permanently retire a conversation. Terminal, irreversible.
 *
 * Sentinel-replaces `person_name`, `summary`, and every child quote's
 * `text` with `'[tombstoned]'`. Row identity (ids, positions,
 * occurred_at, audit_seq linkage) is preserved so audit-chain replay
 * still resolves the original payload from the `conversation.create`
 * event's blob.
 *
 * Cascades to provenance: every `fact_provenance_sources` row whose
 * conversation_id matches OR whose quote_id ∈ this conversation's
 * quotes is marked degraded with reason
 * `source_conversation_tombstoned`. Facts themselves are NOT
 * tombstoned — they survive with their tier and confidence intact,
 * but each affected fact's derived `provenance_degraded` flag flips
 * to true (and `degraded_source_count` increments accordingly).
 *
 * Forbidden against an already-tombstoned conversation
 * (ConversationLifecycleError 'tombstoned').
 */
export async function tombstoneConversation(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  input: TombstoneConversationInput,
): Promise<TombstoneConversationResult> {
  const existing = selectConversationById(ctx.db, workspaceId, conversationId);
  if (!existing) {
    throw new ConversationNotFoundError(conversationId);
  }
  assertConversationNotTombstoned(existing);

  const reason = validateNonEmptyString('reason', input.reason, 2000);
  const now = new Date().toISOString();

  // Pre-compute affected counts + sample BEFORE the auditedWrite so the
  // payload is fully populated when the audit blob is hashed. The same
  // WHERE clause is used by markProvenanceDegradedByConversation
  // (which also filters `degraded_at IS NULL`), so the counts match
  // the rows that the UPDATE will actually touch.
  const affectedQuoteCount = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM conversation_verbatim_quotes
          WHERE conversation_id = ?`,
      )
      .get(conversationId) as { n: number }
  ).n;

  const affectedProvenanceCount = (
    ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM fact_provenance_sources
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
      .get(workspaceId, conversationId, conversationId) as { n: number }
  ).n;

  const affectedFactIdsSample = (
    ctx.db
      .prepare(
        `SELECT DISTINCT fact_id FROM fact_provenance_sources
          WHERE workspace_id = ?
            AND degraded_at IS NULL
            AND (
              conversation_id = ?
              OR quote_id IN (
                SELECT id FROM conversation_verbatim_quotes
                 WHERE conversation_id = ?
              )
            )
          LIMIT ?`,
      )
      .all(workspaceId, conversationId, conversationId, AFFECTED_FACT_IDS_SAMPLE_CAP) as Array<{
      fact_id: string;
    }>
  ).map((r) => r.fact_id);

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'conversation.tombstone',
    kind: 'conversation',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      conversation_id: existing.id,
      reason,
      tombstoned_at: now,
      was_extracted: existing.fact_extraction_status === 'extracted',
      previous_person_name: existing.person_name,
      affected_quote_count: affectedQuoteCount,
      affected_provenance_count: affectedProvenanceCount,
      affected_fact_ids_sample: affectedFactIdsSample,
    },
    brainWrites: ({ seq }) => {
      // 1. Sentinel-replace the conversation's PII-bearing fields.
      ctx.db
        .prepare(
          `UPDATE conversations
              SET person_name = ?, summary = ?,
                  tombstoned_at = ?, tombstone_reason = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(
          TOMBSTONE_CONVERSATION_SENTINEL,
          TOMBSTONE_CONVERSATION_SENTINEL,
          now,
          reason,
          seq,
          workspaceId,
          existing.id,
        );

      // 2. Sentinel-replace every child quote's text. IDs and positions
      //    are preserved so any provenance row keyed on quote_id still
      //    resolves through audit-chain replay.
      ctx.db
        .prepare(
          `UPDATE conversation_verbatim_quotes
              SET text = ?
            WHERE conversation_id = ?`,
        )
        .run(TOMBSTONE_CONVERSATION_SENTINEL, existing.id);

      // 3. Degrade every linked provenance row in the same transaction.
      markProvenanceDegradedByConversation(
        ctx.db,
        workspaceId,
        existing.id,
        DEGRADATION_REASON_CONVERSATION_TOMBSTONED,
        now,
      );
    },
  });

  const view = getConversation(ctx.db, workspaceId, existing.id);
  if (!view) {
    throw new Error(`conversation ${existing.id} disappeared mid-tombstone`);
  }
  return {
    conversation: view,
    audit,
    affected_quote_count: affectedQuoteCount,
    affected_provenance_count: affectedProvenanceCount,
    affected_fact_ids_sample: affectedFactIdsSample,
  };
}

// ─────────────────────────────────────────────────────────────────
// Task 6B commit 3 — fact extraction
// ─────────────────────────────────────────────────────────────────

// Length cap reused for area / statement on the extraction path;
// matches services/facts.ts's validateNonEmpty cap.
const MAX_FACT_FIELD_LEN = 2000;

interface QuoteOwnershipRow {
  id: string;
  conversation_id: string;
}

function selectQuoteById(
  db: ManthanSqliteHandle,
  workspaceId: string,
  quoteId: string,
): QuoteOwnershipRow | null {
  const row = db
    .prepare(
      `SELECT id, conversation_id
         FROM conversation_verbatim_quotes
        WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, quoteId) as QuoteOwnershipRow | undefined;
  return row ?? null;
}

export interface ExtractFactInput {
  readonly area: string;
  readonly statement: string;
  readonly tier?: FactTier;
  /** Optional. If absent, provenance is recorded at conversation level. */
  readonly quote_id?: string;
}

export interface ExtractFactResult {
  readonly fact: FactView;
  /** true when a new fact row was created; false when an existing fact
   *  was corroborated (a new provenance row was added but the fact
   *  itself already existed). */
  readonly was_created: boolean;
  readonly audit: AuditedWriteResult;
}

/**
 * Extract a fact from a conversation. Two paths:
 *
 *   - Create: no existing fact matches the (area, statement) hash. A
 *     new fact is inserted, a provenance row is created, and the
 *     conversation's extraction status is bumped to 'extracted'. The
 *     audit event is `fact.create` with an `extraction_source` field.
 *
 *   - Corroborate: a non-tombstoned fact with the same hash exists.
 *     A new provenance row is added pointing at the existing fact;
 *     the fact's `last_corroborated` and `audit_seq` advance; tier
 *     and confidence are preserved. The audit event is
 *     `fact.corroborate`. Truth accumulates evidence; duplicate
 *     content corroborates rather than rejects.
 *
 * Forbidden against a tombstoned conversation (409 'tombstoned').
 * `quote_id`, if provided, must belong to the target conversation
 * (400 otherwise).
 */
export async function extractFactFromConversation(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  input: ExtractFactInput,
): Promise<ExtractFactResult> {
  // 1. Conversation existence + lifecycle.
  const conv = selectConversationById(ctx.db, workspaceId, conversationId);
  if (!conv) {
    throw new ConversationNotFoundError(conversationId);
  }
  assertConversationNotTombstoned(conv);

  // 2. Quote ownership (if provided).
  let quoteId: string | undefined;
  if (input.quote_id !== undefined && input.quote_id !== null) {
    const quote = selectQuoteById(ctx.db, workspaceId, input.quote_id);
    if (!quote || quote.conversation_id !== conversationId) {
      throw new ConversationValidationError(
        'quote_id',
        `quote_id ${input.quote_id} does not belong to conversation ${conversationId}`,
      );
    }
    quoteId = input.quote_id;
  }

  // 3. Content validation. Routed through conversations' validator so
  //    the field labels stay 'area' / 'statement' (matching the public
  //    API surface). Cap matches services/facts.ts.
  const area = validateNonEmptyString('area', input.area, MAX_FACT_FIELD_LEN);
  const statement = validateNonEmptyString('statement', input.statement, MAX_FACT_FIELD_LEN);

  // 4. Tier validation. Default T0 mirrors createFact.
  if (input.tier !== undefined && !isFactTier(input.tier)) {
    throw new FactValidationError('tier', 'tier must be one of T-2, T-1, T0, T+1');
  }
  const requestedTier: FactTier = input.tier ?? 'T0';

  // 5. Hash + lookup.
  const statementHash = computeStatementHash(area, statement);
  const existingFact = selectFactByHash(ctx.db, workspaceId, statementHash);

  if (existingFact) {
    return corroborateExistingFact(ctx, workspaceId, conversationId, existingFact, {
      area,
      statement,
      statementHash,
      quoteId,
    });
  }
  return createFactFromExtraction(ctx, workspaceId, conversationId, {
    area,
    statement,
    statementHash,
    tier: requestedTier,
    quoteId,
  });
}

interface ExtractionProps {
  readonly area: string;
  readonly statement: string;
  readonly statementHash: string;
  readonly quoteId: string | undefined;
}

interface CreationProps extends ExtractionProps {
  readonly tier: FactTier;
}

async function corroborateExistingFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  existing: FactRow,
  props: ExtractionProps,
): Promise<ExtractFactResult> {
  const now = new Date().toISOString();
  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.corroborate',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      area: props.area,
      statement: props.statement,
      statement_hash: props.statementHash,
      conversation_id: conversationId,
      quote_id: props.quoteId ?? null,
      extractor: 'manual',
      corroborated_at: now,
    },
    brainWrites: ({ seq }) => {
      // 1. New provenance row pointing at the existing fact.
      recordProvenanceSource(ctx.db, workspaceId, {
        factId: existing.id,
        quoteId: props.quoteId,
        conversationId: props.quoteId === undefined ? conversationId : undefined,
        extractor: 'manual',
        extractedAt: now,
      });
      // 2. Bump the fact's last_corroborated (Stabilization §3.1: this
      //    IS a genuine corroboration, not an administrative touch).
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET last_corroborated = ?,
                  last_administratively_touched = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(now, now, seq, workspaceId, existing.id);
      // 3. Bump the conversation's extraction status. Idempotent for
      //    repeated extractions on the same conversation.
      ctx.db
        .prepare(
          `UPDATE conversations
              SET fact_extraction_status = 'extracted',
                  last_extracted_at = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(now, seq, workspaceId, conversationId);
    },
  });

  const fact = getFact(ctx.db, workspaceId, existing.id);
  if (!fact) {
    throw new Error(`fact ${existing.id} disappeared mid-corroborate`);
  }
  return { fact, was_created: false, audit };
}

async function createFactFromExtraction(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  props: CreationProps,
): Promise<ExtractFactResult> {
  const id = generateFactId();
  const confidence = TIER_CONFIDENCE[props.tier];
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.create',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: id,
      workspace_id: workspaceId,
      area: props.area,
      statement: props.statement,
      statement_hash: props.statementHash,
      tier: props.tier,
      confidence,
      created_at: now,
      // Extension over the standard fact.create payload: the source of
      // this creation, present iff the fact came from an extraction.
      extraction_source: {
        conversation_id: conversationId,
        quote_id: props.quoteId ?? null,
      },
    },
    brainWrites: ({ seq }) => {
      // 1. Insert the new fact.
      ctx.db
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          props.area,
          props.statement,
          props.statementHash,
          props.tier,
          now,
          confidence,
          seq,
          now,
        );
      // 2. Provenance row.
      recordProvenanceSource(ctx.db, workspaceId, {
        factId: id,
        quoteId: props.quoteId,
        conversationId: props.quoteId === undefined ? conversationId : undefined,
        extractor: 'manual',
        extractedAt: now,
      });
      // 3. Conversation status.
      ctx.db
        .prepare(
          `UPDATE conversations
              SET fact_extraction_status = 'extracted',
                  last_extracted_at = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(now, seq, workspaceId, conversationId);
    },
  });

  const fact = getFact(ctx.db, workspaceId, id);
  if (!fact) {
    throw new Error(`fact ${id} disappeared mid-extract`);
  }
  return { fact, was_created: true, audit };
}

// ─────────────────────────────────────────────────────────────────
// Sprint 2 M1 — Conversation PATCH (update editable metadata)
// ─────────────────────────────────────────────────────────────────

export interface UpdateConversationInput {
  readonly person_name?: string;
  readonly occurred_at?: string;
  readonly audience_fit?: AudienceFit;
  readonly conversation_type?: ConversationType;
  readonly outcome?: ConversationOutcome;
  /** A non-empty string sets the summary; `null` explicitly clears it;
   *  `undefined` (omitted) leaves it unchanged. */
  readonly summary?: string | null;
}

export interface UpdateConversationResult {
  readonly conversation: ConversationView;
  /** `null` when the PATCH was a no-op (no values actually changed). */
  readonly audit: AuditedWriteResult | null;
}

/**
 * Update a conversation's editable metadata.
 *
 * Editable: person_name, occurred_at, audience_fit, conversation_type,
 *           outcome, summary.
 * Not editable here (intentional): id, workspace_id, created_at,
 *           audit_seq, tombstoned_at, tombstone_reason,
 *           fact_extraction_status, last_extracted_at, verbatim_quotes.
 *           These are managed by their own dedicated routes / services
 *           or are immutable substrate fields.
 *
 * Lifecycle guard: PATCH on a tombstoned conversation raises
 * ConversationLifecycleError('tombstoned').
 *
 * No-op behavior: if the PATCH supplies values that all match the
 * existing state, no audit event is emitted and the response carries
 * `audit: null`. The conversation view is returned regardless.
 *
 * Audit event: `conversation.update` with payload
 * `{ conversation_id, changes: [{field, from, to}], updated_at }`.
 */
export async function updateConversation(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  input: UpdateConversationInput,
): Promise<UpdateConversationResult> {
  const existing = selectConversationById(ctx.db, workspaceId, conversationId);
  if (!existing) {
    throw new ConversationNotFoundError(conversationId);
  }
  assertConversationNotTombstoned(existing);

  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

  let newPersonName = existing.person_name;
  if (input.person_name !== undefined) {
    const trimmed = validateNonEmptyString('person_name', input.person_name, MAX_PERSON_NAME_LEN);
    if (trimmed !== existing.person_name) {
      changes.push({ field: 'person_name', from: existing.person_name, to: trimmed });
      newPersonName = trimmed;
    }
  }

  let newOccurredAt = existing.occurred_at;
  if (input.occurred_at !== undefined) {
    const normalized = validateIsoTimestamp('occurred_at', input.occurred_at);
    if (normalized !== existing.occurred_at) {
      changes.push({ field: 'occurred_at', from: existing.occurred_at, to: normalized });
      newOccurredAt = normalized;
    }
  }

  let newAudienceFit = existing.audience_fit;
  if (input.audience_fit !== undefined) {
    if (!isAudienceFit(input.audience_fit)) {
      throw new ConversationValidationError(
        'audience_fit',
        `audience_fit must be one of ${ALLOWED_AUDIENCE_FIT.join(', ')}`,
      );
    }
    if (input.audience_fit !== existing.audience_fit) {
      changes.push({
        field: 'audience_fit',
        from: existing.audience_fit,
        to: input.audience_fit,
      });
      newAudienceFit = input.audience_fit;
    }
  }

  let newConversationType = existing.conversation_type;
  if (input.conversation_type !== undefined) {
    if (!isConversationType(input.conversation_type)) {
      throw new ConversationValidationError(
        'conversation_type',
        `conversation_type must be one of ${ALLOWED_CONVERSATION_TYPES.join(', ')}`,
      );
    }
    if (input.conversation_type !== existing.conversation_type) {
      changes.push({
        field: 'conversation_type',
        from: existing.conversation_type,
        to: input.conversation_type,
      });
      newConversationType = input.conversation_type;
    }
  }

  let newOutcome = existing.outcome;
  if (input.outcome !== undefined) {
    if (!isConversationOutcome(input.outcome)) {
      throw new ConversationValidationError(
        'outcome',
        `outcome must be one of ${ALLOWED_OUTCOMES.join(', ')}`,
      );
    }
    if (input.outcome !== existing.outcome) {
      changes.push({ field: 'outcome', from: existing.outcome, to: input.outcome });
      newOutcome = input.outcome;
    }
  }

  let newSummary: string | null = existing.summary;
  if (input.summary !== undefined) {
    if (input.summary === null) {
      if (existing.summary !== null) {
        changes.push({ field: 'summary', from: existing.summary, to: null });
        newSummary = null;
      }
    } else {
      const trimmed = validateNonEmptyString('summary', input.summary, MAX_SUMMARY_LEN);
      if (trimmed !== existing.summary) {
        changes.push({ field: 'summary', from: existing.summary, to: trimmed });
        newSummary = trimmed;
      }
    }
  }

  // No-op: nothing actually changed. Return current view, no audit.
  if (changes.length === 0) {
    const view = getConversation(ctx.db, workspaceId, conversationId);
    if (!view) {
      throw new Error(`conversation ${conversationId} disappeared mid-update`);
    }
    return { conversation: view, audit: null };
  }

  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'conversation.update',
    kind: 'conversation',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      conversation_id: existing.id,
      changes,
      updated_at: now,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `UPDATE conversations
              SET person_name = ?, occurred_at = ?, audience_fit = ?,
                  conversation_type = ?, outcome = ?, summary = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(
          newPersonName,
          newOccurredAt,
          newAudienceFit,
          newConversationType,
          newOutcome,
          newSummary,
          seq,
          workspaceId,
          existing.id,
        );
    },
  });

  const view = getConversation(ctx.db, workspaceId, existing.id);
  if (!view) {
    throw new Error(`conversation ${existing.id} disappeared mid-update`);
  }
  return { conversation: view, audit };
}

// ─────────────────────────────────────────────────────────────────
// Sprint 2 M1 — Skip-extraction ("mark as not useful")
// ─────────────────────────────────────────────────────────────────

export interface SkipExtractionInput {
  /** Optional explanation. Trimmed; max 2000 characters. */
  readonly reason?: string;
}

export interface SkipExtractionResult {
  readonly conversation: ConversationView;
  /** The status the conversation had before this call. Captured so the
   *  audit payload distinguishes "never extracted" (`pending`) from
   *  "had been extracted, changed mind" (`extracted`). */
  readonly previous_status: FactExtractionStatus;
  readonly audit: AuditedWriteResult;
}

/**
 * Mark a conversation as not useful for fact extraction.
 *
 * Status transitions:
 *   pending   → skipped       (never extracted)
 *   extracted → skipped       (had been extracted, changed mind)
 *   skipped   → 409 already_skipped
 *   tombstoned → 409 tombstoned
 *
 * Reverse path: a subsequent `extractFactFromConversation` call on a
 * skipped conversation flips status back to `extracted` via the
 * existing extract path's unconditional UPDATE — no special case
 * needed here.
 *
 * Side effects:
 *   - sets `fact_extraction_status = 'skipped'`
 *   - bumps `audit_seq` to the new event's seq
 *   - leaves `last_extracted_at` unchanged (so the "I extracted then
 *     changed my mind" history is preserved)
 *   - emits `conversation.skip_extraction` audit event
 */
export async function skipConversationExtraction(
  ctx: AuditedWriteContext,
  workspaceId: string,
  conversationId: string,
  input: SkipExtractionInput,
): Promise<SkipExtractionResult> {
  const existing = selectConversationById(ctx.db, workspaceId, conversationId);
  if (!existing) {
    throw new ConversationNotFoundError(conversationId);
  }
  assertConversationNotTombstoned(existing);

  if (existing.fact_extraction_status === 'skipped') {
    throw new ConversationLifecycleError(
      'already_skipped',
      existing.id,
      `conversation ${existing.id} is already marked as not useful`,
    );
  }

  // Reason is optional. If provided, it must be a non-empty trimmed
  // string ≤ 2000 chars. Null is accepted and treated as omitted.
  let reason: string | null = null;
  if (input.reason !== undefined && input.reason !== null) {
    reason = validateNonEmptyString('reason', input.reason, 2000);
  }

  const previousStatus = existing.fact_extraction_status;
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'conversation.skip_extraction',
    kind: 'conversation',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      conversation_id: existing.id,
      previous_status: previousStatus,
      reason,
      skipped_at: now,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `UPDATE conversations
              SET fact_extraction_status = 'skipped',
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(seq, workspaceId, existing.id);
    },
  });

  const view = getConversation(ctx.db, workspaceId, existing.id);
  if (!view) {
    throw new Error(`conversation ${existing.id} disappeared mid-skip`);
  }
  return { conversation: view, previous_status: previousStatus, audit };
}
