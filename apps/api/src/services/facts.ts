// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact CRUD + tier transitions. Sprint 1 Task 5A.
//
// Allowed tiers in Task 5A: T-2, T-1, T0, T+1 only. T+2/T+3 are disabled
// at this layer (they require V1's signed-decision flow).
//
// Every mutation flows through @manthanos/memory's auditedWrite, emitting
// one of the four required audit actions:
//   fact.create, fact.update, fact.promote, fact.demote.
//
// Out of scope (Task 5B): versioning, contestation, tombstones,
// extraction pipeline.

import { createHash, randomUUID } from 'node:crypto';
import {
  type AuditedWriteContext,
  type AuditedWriteResult,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import { AUDIT_DECISION_HUMAN_APPROVED } from '@manthanos/safety';

// ─────────────────────────────────────────────────────────────────
// Tier vocabulary
// ─────────────────────────────────────────────────────────────────

export type FactTier = 'T-2' | 'T-1' | 'T0' | 'T+1';

const ALLOWED_TIERS: readonly FactTier[] = ['T-2', 'T-1', 'T0', 'T+1'];

const TIER_RANK: Record<FactTier, number> = {
  'T+1': 1,
  T0: 0,
  'T-1': -1,
  'T-2': -2,
};

// Confidence values mirror the existing brain-trust.ts convention but
// trimmed to the Task 5A range. The CLI promote path still uses its own
// table; values here apply only to the HTTP-routed lifecycle.
// Exported so the conversation-extraction path (Task 6B commit 3) can
// pick the right confidence for a freshly extracted fact.
export const TIER_CONFIDENCE: Record<FactTier, number> = {
  'T+1': 0.7,
  T0: 0.3,
  'T-1': 0.1,
  'T-2': 0.0,
};

export function isFactTier(v: unknown): v is FactTier {
  return typeof v === 'string' && (ALLOWED_TIERS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────
// Views and errors
// ─────────────────────────────────────────────────────────────────

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
  // Task 5B lifecycle fields. NULL when not set.
  readonly version_chain_root_id: string | null;
  readonly superseded_by_fact_id: string | null;
  readonly contested_at: string | null;
  readonly contested_reason: string | null;
  readonly tombstoned_at: string | null;
  readonly tombstone_reason: string | null;
  /** Derived: true when this fact is the live head of its chain. */
  readonly is_head: boolean;
  /** Derived: true when contested_at is set. */
  readonly is_contested: boolean;
  /** Derived: true when tombstoned_at is set. */
  readonly is_tombstoned: boolean;
  // Task 6B commit 2 — content-provenance counters (derived from
  // fact_provenance_sources via correlated subqueries; not stored).
  readonly active_source_count: number;
  readonly degraded_source_count: number;
  /** Derived: true when at least one provenance row is degraded
   *  (i.e. its source conversation has been tombstoned). */
  readonly provenance_degraded: boolean;
}

export interface FactRow {
  id: string;
  workspace_id: string;
  area: string;
  statement: string;
  statement_hash: string;
  tier: FactTier;
  confidence: number;
  last_corroborated: string;
  last_administratively_touched: string;
  audit_seq: number;
  version_chain_root_id: string | null;
  superseded_by_fact_id: string | null;
  contested_at: string | null;
  contested_reason: string | null;
  tombstoned_at: string | null;
  tombstone_reason: string | null;
  active_source_count: number;
  degraded_source_count: number;
}

export interface CreateFactInput {
  readonly area: string;
  readonly statement: string;
  readonly tier?: FactTier;
}

export interface UpdateFactInput {
  readonly area?: string;
  readonly statement?: string;
}

export interface TransitionInput {
  readonly targetTier?: FactTier;
  readonly note?: string;
  readonly reason?: string;
}

export interface TransitionResult {
  readonly fact: FactView;
  readonly fromTier: FactTier;
  readonly toTier: FactTier;
  readonly audit: AuditedWriteResult;
}

export class FactValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'FactValidationError';
    this.field = field;
  }
}

export class FactNotFoundError extends Error {
  constructor(id: string) {
    super(`Fact ${id} not found`);
    this.name = 'FactNotFoundError';
  }
}

export class DuplicateFactError extends Error {
  readonly existingFactId: string;
  constructor(existingFactId: string, hash: string) {
    super(`A fact with statement_hash ${hash} already exists (id ${existingFactId})`);
    this.name = 'DuplicateFactError';
    this.existingFactId = existingFactId;
  }
}

export class InvalidTierTransitionError extends Error {
  readonly from: FactTier;
  readonly to: FactTier;
  readonly direction: 'promote' | 'demote';
  constructor(from: FactTier, to: FactTier, direction: 'promote' | 'demote') {
    super(`Invalid ${direction} transition: ${from} → ${to}`);
    this.name = 'InvalidTierTransitionError';
    this.from = from;
    this.to = to;
    this.direction = direction;
  }
}

/**
 * Raised when a caller tries to mutate a fact whose lifecycle forbids it:
 * tombstoned (irreversible), superseded (write to the head instead), or
 * mismatched contestation state (contest an already-contested fact, etc.)
 */
export class InvalidFactLifecycleError extends Error {
  readonly state: 'tombstoned' | 'superseded' | 'contested' | 'not_contested';
  readonly factId: string;
  constructor(
    state: 'tombstoned' | 'superseded' | 'contested' | 'not_contested',
    factId: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidFactLifecycleError';
    this.state = state;
    this.factId = factId;
  }
}

/** Guard: mutation must not target a tombstoned fact. */
function assertNotTombstoned(row: FactRow): void {
  if (row.tombstoned_at !== null) {
    throw new InvalidFactLifecycleError(
      'tombstoned',
      row.id,
      `fact ${row.id} is tombstoned; no further mutations are allowed`,
    );
  }
}

/** Guard: mutation must not target a superseded (non-head) fact. */
function assertNotSuperseded(row: FactRow): void {
  if (row.superseded_by_fact_id !== null) {
    throw new InvalidFactLifecycleError(
      'superseded',
      row.id,
      `fact ${row.id} has been superseded by ${row.superseded_by_fact_id}; mutate the head instead`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

export function computeStatementHash(area: string, statement: string): string {
  // Same shape as brain-compound.ts (`${area}::${text}`). Audit BUG-4
  // flagged the `::` delimiter as theoretically collidable; the dedup
  // semantics here match the existing CLI's view of the brain. A future
  // hardening pass can swap the delimiter in lockstep with the CLI.
  // Exported for the conversation-extraction path (Task 6B commit 3),
  // which needs to compute the same hash to look up existing facts.
  const canonical = `${area}::${statement}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function generateFactId(): string {
  return `fact-${randomUUID().slice(0, 12)}`;
}

function rowToView(row: FactRow): FactView {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    area: row.area,
    statement: row.statement,
    statement_hash: row.statement_hash,
    tier: row.tier,
    confidence: row.confidence,
    last_corroborated: row.last_corroborated,
    last_administratively_touched: row.last_administratively_touched,
    audit_seq: row.audit_seq,
    version_chain_root_id: row.version_chain_root_id,
    superseded_by_fact_id: row.superseded_by_fact_id,
    contested_at: row.contested_at,
    contested_reason: row.contested_reason,
    tombstoned_at: row.tombstoned_at,
    tombstone_reason: row.tombstone_reason,
    is_head: row.superseded_by_fact_id === null,
    is_contested: row.contested_at !== null,
    is_tombstoned: row.tombstoned_at !== null,
    active_source_count: row.active_source_count,
    degraded_source_count: row.degraded_source_count,
    provenance_degraded: row.degraded_source_count > 0,
  };
}

// `active_source_count` / `degraded_source_count` are computed via
// correlated subqueries against `fact_provenance_sources`. The partial
// index `ix_fact_provenance_degraded` and the full
// `ix_fact_provenance_fact` index keep both subqueries O(log n).
const FACT_SELECT_COLUMNS = `
  id, workspace_id, area, statement, statement_hash, tier,
  confidence, last_corroborated, last_administratively_touched, audit_seq,
  version_chain_root_id, superseded_by_fact_id,
  contested_at, contested_reason,
  tombstoned_at, tombstone_reason,
  (SELECT COUNT(*) FROM fact_provenance_sources p
     WHERE p.workspace_id = semantic_facts.workspace_id
       AND p.fact_id = semantic_facts.id
       AND p.degraded_at IS NULL) AS active_source_count,
  (SELECT COUNT(*) FROM fact_provenance_sources p
     WHERE p.workspace_id = semantic_facts.workspace_id
       AND p.fact_id = semantic_facts.id
       AND p.degraded_at IS NOT NULL) AS degraded_source_count
`;

function selectFactById(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): FactRow | null {
  const row = db
    .prepare(
      `SELECT ${FACT_SELECT_COLUMNS}
       FROM semantic_facts
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, factId) as FactRow | undefined;
  return row ?? null;
}

export function selectFactByHash(
  db: ManthanSqliteHandle,
  workspaceId: string,
  statementHash: string,
): FactRow | null {
  // Dedup must NOT match a tombstoned predecessor (its statement field is
  // already a sentinel; a fresh fact with the same content should be a
  // new, untombstoned record). Tombstoned rows keep their original
  // statement_hash for audit linkage, but dedup excludes them.
  const row = db
    .prepare(
      `SELECT ${FACT_SELECT_COLUMNS}
       FROM semantic_facts
       WHERE workspace_id = ? AND statement_hash = ?
         AND tombstoned_at IS NULL
       LIMIT 1`,
    )
    .get(workspaceId, statementHash) as FactRow | undefined;
  return row ?? null;
}

function validateNonEmpty(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FactValidationError(field, `${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 2000) {
    throw new FactValidationError(field, `${field} must be 2000 characters or fewer`);
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────

export interface ListFactsOptions {
  readonly tier?: FactTier;
  readonly area?: string;
  readonly limit?: number;
  readonly offset?: number;
  /** Default false. Includes tombstoned rows (content is the sentinel). */
  readonly includeTombstoned?: boolean;
  /** Default false. Includes superseded (non-head) versions in chains. */
  readonly includeSuperseded?: boolean;
  /** Default false. Includes contested facts. (Contested rows are still
   *  live by default — this flag exists only as a future affordance for
   *  callers that want to exclude them.) */
  readonly excludeContested?: boolean;
}

export interface ListFactsResult {
  readonly facts: readonly FactView[];
  readonly total: number;
  readonly returned: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_more: boolean;
}

const DEFAULT_FACTS_LIMIT = 50;
const MAX_FACTS_LIMIT = 500;

export function listFacts(
  db: ManthanSqliteHandle,
  workspaceId: string,
  opts: ListFactsOptions = {},
): ListFactsResult {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_FACTS_LIMIT, MAX_FACTS_LIMIT));
  const offset = Math.max(0, opts.offset ?? 0);

  if (opts.tier !== undefined && !isFactTier(opts.tier)) {
    throw new FactValidationError('tier', `tier must be one of ${ALLOWED_TIERS.join(', ')}`);
  }

  const clauses: string[] = ['workspace_id = ?'];
  const params: unknown[] = [workspaceId];
  if (opts.tier !== undefined) {
    clauses.push('tier = ?');
    params.push(opts.tier);
  }
  if (opts.area !== undefined) {
    clauses.push('area = ?');
    params.push(opts.area);
  }
  // Also exclude tiers above T+1 from listing — Task 5A's scope. Any
  // pre-existing T+2/T+3 facts in the DB remain invisible to this API
  // until V1 enables their lifecycle.
  clauses.push("tier IN ('T-2','T-1','T0','T+1')");

  // Task 5B defaults: hide superseded (non-head) and tombstoned facts.
  // Callers that want to walk lineage use the history endpoint instead.
  if (!opts.includeSuperseded) {
    clauses.push('superseded_by_fact_id IS NULL');
  }
  if (!opts.includeTombstoned) {
    clauses.push('tombstoned_at IS NULL');
  }
  if (opts.excludeContested) {
    clauses.push('contested_at IS NULL');
  }

  const where = clauses.join(' AND ');
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM semantic_facts WHERE ${where}`)
    .get(...params) as { n: number };

  const rows = db
    .prepare(
      `SELECT ${FACT_SELECT_COLUMNS}
       FROM semantic_facts
       WHERE ${where}
       ORDER BY audit_seq DESC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as FactRow[];

  return {
    facts: rows.map(rowToView),
    total: totalRow.n,
    returned: rows.length,
    limit,
    offset,
    has_more: offset + rows.length < totalRow.n,
  };
}

export function getFact(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): FactView | null {
  const row = selectFactById(db, workspaceId, factId);
  return row ? rowToView(row) : null;
}

export interface ListFactsByConversationResult {
  readonly facts: readonly FactView[];
  readonly total: number;
}

/**
 * Return every fact in the workspace that has at least one provenance
 * row pointing at the given conversation — either directly (the row's
 * conversation_id matches) or transitively (its quote_id belongs to a
 * quote of that conversation).
 *
 * Implementation note: we use an `IN (SELECT DISTINCT fact_id ...)`
 * subquery rather than a JOIN to avoid an alias collision with the
 * `p` aliases inside FACT_SELECT_COLUMNS's correlated COUNT subqueries.
 * The subquery approach also gives one row per fact naturally (no
 * outer DISTINCT needed) and lets the partial indexes do the work.
 *
 * No pagination: a single conversation realistically yields tens of
 * facts at most, not enough to warrant limit/offset plumbing.
 */
export function listFactsByConversation(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationId: string,
): ListFactsByConversationResult {
  const rows = db
    .prepare(
      `SELECT ${FACT_SELECT_COLUMNS}
         FROM semantic_facts
        WHERE workspace_id = ?
          AND id IN (
            SELECT DISTINCT fact_id
              FROM fact_provenance_sources
             WHERE workspace_id = ?
               AND (
                 conversation_id = ?
                 OR quote_id IN (
                   SELECT id FROM conversation_verbatim_quotes
                    WHERE conversation_id = ?
                 )
               )
          )
        ORDER BY audit_seq DESC, id ASC`,
    )
    .all(workspaceId, workspaceId, conversationId, conversationId) as FactRow[];

  return {
    facts: rows.map(rowToView),
    total: rows.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Sprint 2 M1 — Topic suggestions (GET .../facts/areas)
// ─────────────────────────────────────────────────────────────────

export interface AreaCount {
  /** Display form: the most-frequent case variant of this area, trimmed. */
  readonly area: string;
  /** Aggregated count across all case variants of this area. */
  readonly count: number;
}

export interface ListFactAreasOptions {
  /** Max entries returned. Clamped to [1, MAX_FACT_AREAS_LIMIT]. Default
   *  is DEFAULT_FACT_AREAS_LIMIT (20), tuned for the topic-suggestion
   *  chips on the extract-fact modal which renders top 6. */
  readonly limit?: number;
}

const DEFAULT_FACT_AREAS_LIMIT = 20;
const MAX_FACT_AREAS_LIMIT = 500;

/**
 * Return normalized topic suggestions for the conversation-capture and
 * fact-extraction surfaces (per Sprint 2 roadmap §4A + journey review §3.5).
 *
 * Normalization rules:
 *   - Skip tombstoned facts (their area is preserved in the row but the
 *     fact itself has been retired from active suggestions).
 *   - Trim leading/trailing whitespace from each area value.
 *   - Skip rows whose trimmed area is the empty string.
 *   - Merge case variants of the same trimmed area (e.g. "Audience",
 *     "audience", "AUDIENCE" all collapse to one bucket).
 *   - For each bucket, pick the most-frequent case variant as the
 *     display form. Ties broken alphabetically.
 *
 * Ordering: by aggregated count DESC, then display form ASC. Output is
 * deterministic — two calls against the same workspace state return
 * byte-identical lists.
 *
 * Performance: the SQL pre-aggregates by `TRIM(area)`, so the JS-side
 * case-folding map sees at most one row per (case-sensitive, trimmed)
 * area value — small bounded work.
 */
export function listFactAreas(
  db: ManthanSqliteHandle,
  workspaceId: string,
  opts: ListFactAreasOptions = {},
): readonly AreaCount[] {
  const requestedLimit = opts.limit ?? DEFAULT_FACT_AREAS_LIMIT;
  const limit = Math.max(1, Math.min(requestedLimit, MAX_FACT_AREAS_LIMIT));

  // SQL pre-aggregates by exact area text. Whitespace + empty-string
  // normalization runs in JS because SQLite's TRIM() defaults to spaces
  // only and would not strip tabs / newlines / CR. JavaScript's
  // String#trim is Unicode-whitespace-aware, which is what we want.
  const rows = db
    .prepare(
      `SELECT area, COUNT(*) AS cnt
         FROM semantic_facts
        WHERE workspace_id = ?
          AND tombstoned_at IS NULL
        GROUP BY area`,
    )
    .all(workspaceId) as Array<{ area: string; cnt: number }>;

  // Bucket by lowercase trimmed key. Each bucket tracks per-variant
  // counts so we can pick the most-frequent case variant (using the
  // trimmed form as the variant) as the display form.
  const buckets = new Map<string, { variants: Map<string, number>; total: number }>();
  for (const row of rows) {
    const trimmed = row.area.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { variants: new Map(), total: 0 };
      buckets.set(key, bucket);
    }
    bucket.variants.set(trimmed, (bucket.variants.get(trimmed) ?? 0) + row.cnt);
    bucket.total += row.cnt;
  }

  // For each bucket, pick the most-frequent variant as display form.
  // Ties broken alphabetically (lexicographic ASC).
  const merged: AreaCount[] = [];
  for (const bucket of buckets.values()) {
    let displayForm: string | null = null;
    let displayCount = -1;
    for (const [variant, count] of bucket.variants) {
      if (
        count > displayCount ||
        (count === displayCount && (displayForm === null || variant < displayForm))
      ) {
        displayForm = variant;
        displayCount = count;
      }
    }
    if (displayForm !== null) {
      merged.push({ area: displayForm, count: bucket.total });
    }
  }

  // Sort by aggregated count DESC, then display form ASC.
  merged.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.area < b.area) return -1;
    if (a.area > b.area) return 1;
    return 0;
  });

  return merged.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────

export interface CreateFactResult {
  readonly fact: FactView;
  readonly audit: AuditedWriteResult;
}

export async function createFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  input: CreateFactInput,
): Promise<CreateFactResult> {
  const area = validateNonEmpty('area', input.area);
  const statement = validateNonEmpty('statement', input.statement);
  const tier: FactTier = input.tier ?? 'T0';
  if (!isFactTier(tier)) {
    throw new FactValidationError('tier', `tier must be one of ${ALLOWED_TIERS.join(', ')}`);
  }

  const statementHash = computeStatementHash(area, statement);
  const existing = selectFactByHash(ctx.db, workspaceId, statementHash);
  if (existing) {
    throw new DuplicateFactError(existing.id, statementHash);
  }

  const id = generateFactId();
  const confidence = TIER_CONFIDENCE[tier];
  const createdAt = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.create',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: id,
      workspace_id: workspaceId,
      area,
      statement,
      statement_hash: statementHash,
      tier,
      confidence,
      created_at: createdAt,
    },
    brainWrites: ({ seq }) => {
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
          area,
          statement,
          statementHash,
          tier,
          createdAt,
          confidence,
          seq,
          createdAt,
        );
    },
  });

  const view = getFact(ctx.db, workspaceId, id);
  if (!view) {
    throw new Error(`fact ${id} disappeared immediately after creation`);
  }
  return { fact: view, audit };
}

// ─────────────────────────────────────────────────────────────────
// Update (in-place)
// ─────────────────────────────────────────────────────────────────

export interface UpdateFactResult {
  readonly fact: FactView;
  readonly audit: AuditedWriteResult | null;
}

export async function updateFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: UpdateFactInput,
): Promise<UpdateFactResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  assertNotSuperseded(existing);

  let newArea = existing.area;
  let newStatement = existing.statement;
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

  if (input.area !== undefined) {
    const trimmed = validateNonEmpty('area', input.area);
    if (trimmed !== existing.area) {
      changes.push({ field: 'area', from: existing.area, to: trimmed });
      newArea = trimmed;
    }
  }
  if (input.statement !== undefined) {
    const trimmed = validateNonEmpty('statement', input.statement);
    if (trimmed !== existing.statement) {
      changes.push({ field: 'statement', from: existing.statement, to: trimmed });
      newStatement = trimmed;
    }
  }

  if (changes.length === 0) {
    return { fact: rowToView(existing), audit: null };
  }

  const newHash = computeStatementHash(newArea, newStatement);
  if (newHash !== existing.statement_hash) {
    // Hash changed — guard against collisions with OTHER facts in the
    // same workspace.
    const collision = selectFactByHash(ctx.db, workspaceId, newHash);
    if (collision && collision.id !== existing.id) {
      throw new DuplicateFactError(collision.id, newHash);
    }
  }

  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.update',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      changes,
      old_statement_hash: existing.statement_hash,
      new_statement_hash: newHash,
      changed_at: now,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET area = ?, statement = ?, statement_hash = ?,
                  last_administratively_touched = ?, audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(newArea, newStatement, newHash, now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) {
    throw new Error(`fact ${existing.id} disappeared mid-update`);
  }
  return { fact: view, audit };
}

// ─────────────────────────────────────────────────────────────────
// Promote / Demote
// ─────────────────────────────────────────────────────────────────

function defaultUpTier(current: FactTier): FactTier {
  switch (current) {
    case 'T-2':
      return 'T-1';
    case 'T-1':
      return 'T0';
    case 'T0':
      return 'T+1';
    case 'T+1':
      return 'T+1'; // no-op; already at ceiling
  }
}

function defaultDownTier(current: FactTier): FactTier {
  switch (current) {
    case 'T+1':
      return 'T0';
    case 'T0':
      return 'T-1';
    case 'T-1':
      return 'T-2';
    case 'T-2':
      return 'T-2'; // no-op; already at floor
  }
}

export async function promoteFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: TransitionInput,
): Promise<TransitionResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  assertNotSuperseded(existing);
  const fromTier = existing.tier;

  if (input.targetTier !== undefined && !isFactTier(input.targetTier)) {
    throw new FactValidationError(
      'target_tier',
      `target_tier must be one of ${ALLOWED_TIERS.join(', ')}`,
    );
  }
  const toTier: FactTier = input.targetTier ?? defaultUpTier(fromTier);

  // Same-tier requests are idempotent no-ops (no audit event).
  if (toTier === fromTier) {
    return { fact: rowToView(existing), fromTier, toTier, audit: noopAudit() };
  }

  // Must strictly move UP within the allowed range.
  if (TIER_RANK[toTier] <= TIER_RANK[fromTier]) {
    throw new InvalidTierTransitionError(fromTier, toTier, 'promote');
  }

  // T+1 is the ceiling per Task 5A scope.
  if (TIER_RANK[toTier] > TIER_RANK['T+1']) {
    throw new InvalidTierTransitionError(fromTier, toTier, 'promote');
  }

  const now = new Date().toISOString();
  const toConfidence = TIER_CONFIDENCE[toTier];

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.promote',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      from_tier: fromTier,
      to_tier: toTier,
      from_confidence: existing.confidence,
      to_confidence: toConfidence,
      note: input.note ?? null,
      changed_at: now,
    },
    brainWrites: ({ seq }) => {
      // Promotion is corroboration: both last_corroborated and
      // last_administratively_touched advance.
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET tier = ?, confidence = ?,
                  last_corroborated = ?, last_administratively_touched = ?,
                  audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(toTier, toConfidence, now, now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) throw new Error(`fact ${existing.id} disappeared mid-promote`);
  return { fact: view, fromTier, toTier, audit };
}

export async function demoteFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: TransitionInput,
): Promise<TransitionResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  assertNotSuperseded(existing);
  const fromTier = existing.tier;

  if (input.targetTier !== undefined && !isFactTier(input.targetTier)) {
    throw new FactValidationError(
      'target_tier',
      `target_tier must be one of ${ALLOWED_TIERS.join(', ')}`,
    );
  }
  const toTier: FactTier = input.targetTier ?? defaultDownTier(fromTier);

  if (toTier === fromTier) {
    return { fact: rowToView(existing), fromTier, toTier, audit: noopAudit() };
  }

  if (TIER_RANK[toTier] >= TIER_RANK[fromTier]) {
    throw new InvalidTierTransitionError(fromTier, toTier, 'demote');
  }
  if (TIER_RANK[toTier] < TIER_RANK['T-2']) {
    throw new InvalidTierTransitionError(fromTier, toTier, 'demote');
  }

  const now = new Date().toISOString();
  const toConfidence = TIER_CONFIDENCE[toTier];

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.demote',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      from_tier: fromTier,
      to_tier: toTier,
      from_confidence: existing.confidence,
      to_confidence: toConfidence,
      reason: input.reason ?? null,
      changed_at: now,
    },
    brainWrites: ({ seq }) => {
      // Demotion is an administrative touch; last_corroborated is NOT
      // advanced (decay's staleness signal must continue to read the
      // last genuine corroboration moment per Stabilization §3.1).
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET tier = ?, confidence = ?,
                  last_administratively_touched = ?, audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(toTier, toConfidence, now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) throw new Error(`fact ${existing.id} disappeared mid-demote`);
  return { fact: view, fromTier, toTier, audit };
}

function noopAudit(): AuditedWriteResult {
  return { seq: -1, selfHash: '', payloadHash: null, blobReused: false };
}

// ─────────────────────────────────────────────────────────────────
// Task 5B — revise (versioning) + history
// ─────────────────────────────────────────────────────────────────

export interface ReviseFactInput {
  /** New area for the successor. If absent, inherits from predecessor. */
  readonly area?: string;
  /** New statement for the successor. If absent, inherits from predecessor. */
  readonly statement?: string;
  /** Optional explanation for the revision. */
  readonly note?: string;
}

export interface ReviseFactResult {
  readonly fact: FactView;
  readonly previousFactId: string;
  readonly versionChainRootId: string;
  readonly audit: AuditedWriteResult;
}

export async function reviseFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: ReviseFactInput,
): Promise<ReviseFactResult> {
  const previous = selectFactById(ctx.db, workspaceId, factId);
  if (!previous) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(previous);
  assertNotSuperseded(previous);

  const newArea = input.area === undefined ? previous.area : validateNonEmpty('area', input.area);
  const newStatement =
    input.statement === undefined
      ? previous.statement
      : validateNonEmpty('statement', input.statement);

  // A revise that changes nothing is rejected — the user should either
  // patch (in-place no-op returns 200) or omit the call.
  if (newArea === previous.area && newStatement === previous.statement) {
    throw new FactValidationError(
      'body',
      'revise must change at least one of area or statement; for in-place updates use PATCH',
    );
  }

  const newHash = computeStatementHash(newArea, newStatement);
  if (newHash !== previous.statement_hash) {
    const collision = selectFactByHash(ctx.db, workspaceId, newHash);
    if (collision && collision.id !== previous.id) {
      throw new DuplicateFactError(collision.id, newHash);
    }
  }

  const newId = generateFactId();
  // Root identity: if the predecessor was already part of a chain, the
  // root is whatever it pointed at. Otherwise, the predecessor itself
  // becomes the root (and gets its version_chain_root_id stamped with
  // its own id so future revisions inherit the same root).
  const rootId = previous.version_chain_root_id ?? previous.id;
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.revise',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      previous_fact_id: previous.id,
      new_fact_id: newId,
      version_chain_root_id: rootId,
      changes: collectChanges(previous, { area: newArea, statement: newStatement }),
      previous_statement_hash: previous.statement_hash,
      new_statement_hash: newHash,
      note: input.note ?? null,
      revised_at: now,
    },
    brainWrites: ({ seq }) => {
      // Insert the successor with the predecessor's current tier and
      // confidence (revise is structural; it doesn't move the trust
      // ladder). The successor inherits provenance_workflow_id = NULL;
      // version_chain_root_id points at the chain's root.
      ctx.db
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched, version_chain_root_id
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId,
          workspaceId,
          newArea,
          newStatement,
          newHash,
          previous.tier,
          now,
          previous.confidence,
          seq,
          now,
          rootId,
        );

      // Mark the predecessor as superseded by the new fact. Also stamp
      // its version_chain_root_id (with its own id) if this is the first
      // revision in the chain — keeps subsequent lookups uniform.
      const predecessorRoot = previous.version_chain_root_id ?? previous.id;
      ctx.db
        .prepare(
          `UPDATE semantic_facts
             SET superseded_by_fact_id = ?, version_chain_root_id = ?,
                 last_administratively_touched = ?, audit_seq = ?
           WHERE workspace_id = ? AND id = ?`,
        )
        .run(newId, predecessorRoot, now, seq, workspaceId, previous.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, newId);
  if (!view) {
    throw new Error(`fact ${newId} disappeared immediately after revise`);
  }
  return {
    fact: view,
    previousFactId: previous.id,
    versionChainRootId: rootId,
    audit,
  };
}

function collectChanges(
  previous: FactRow,
  next: { area: string; statement: string },
): Array<{ field: string; from: string; to: string }> {
  const out: Array<{ field: string; from: string; to: string }> = [];
  if (previous.area !== next.area) {
    out.push({ field: 'area', from: previous.area, to: next.area });
  }
  if (previous.statement !== next.statement) {
    out.push({ field: 'statement', from: previous.statement, to: next.statement });
  }
  return out;
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

/**
 * Walk a fact's version chain in chronological order, root first.
 * The input fact id can be any version in the chain (root, head, or
 * intermediate); the result always starts at the root.
 */
export function getFactHistory(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): FactHistoryResult | null {
  const anchor = selectFactById(db, workspaceId, factId);
  if (!anchor) {
    return null;
  }

  // Identify the root id. For a never-revised fact the chain is trivial
  // (just this fact); the root id is the fact's own id.
  const rootId = anchor.version_chain_root_id ?? anchor.id;

  // Pull every member of the chain. The chain is identified by either
  // having version_chain_root_id = rootId OR by being the root itself.
  const rows = db
    .prepare(
      `SELECT ${FACT_SELECT_COLUMNS}
       FROM semantic_facts
       WHERE workspace_id = ?
         AND (id = ? OR version_chain_root_id = ?)`,
    )
    .all(workspaceId, rootId, rootId) as FactRow[];

  if (rows.length === 0) {
    return null;
  }

  // Order: walk forward via superseded_by_fact_id. The root has either
  // version_chain_root_id = NULL (never revised — singleton chain) or
  // version_chain_root_id = self.id (first revision marker).
  const byId = new Map<string, FactRow>(rows.map((r) => [r.id, r]));
  const ordered: FactRow[] = [];

  // The root is the row with id = rootId.
  let cur: FactRow | undefined = byId.get(rootId);
  if (!cur) {
    // Defensive: anchor's chain pointer is invalid — fall back to anchor.
    cur = anchor;
  }

  // Walk forward bounded by chain size to defend against accidental
  // cycles (would indicate a substrate corruption; an interruption
  // test in Task 5B verifies this can't happen via the API).
  const guard = rows.length + 1;
  for (let i = 0; i < guard && cur; i++) {
    ordered.push(cur);
    const nextId = cur.superseded_by_fact_id;
    if (nextId === null) break;
    const nextRow = byId.get(nextId);
    if (!nextRow) break;
    cur = nextRow;
  }

  const head = ordered[ordered.length - 1];
  if (!head) {
    return null;
  }

  return {
    root_id: rootId,
    head_id: head.id,
    total_versions: ordered.length,
    versions: ordered.map((row, idx) => ({
      fact: rowToView(row),
      position: idx,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// Task 5B — contest / uncontest
// ─────────────────────────────────────────────────────────────────

export interface ContestFactInput {
  /** User-provided explanation for why the fact is being contested. */
  readonly reason: string;
}

export interface ContestFactResult {
  readonly fact: FactView;
  readonly audit: AuditedWriteResult;
}

/**
 * Mark a fact as contested. Contestation is a soft flag — the fact
 * remains live and listable by default. Callers can hide contested
 * rows from listings with `excludeContested = true`.
 *
 * Forbidden against tombstoned facts (terminal state) and superseded
 * facts (mutate the head instead). Double-contesting raises
 * InvalidFactLifecycleError('contested').
 */
export async function contestFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: ContestFactInput,
): Promise<ContestFactResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  assertNotSuperseded(existing);

  if (existing.contested_at !== null) {
    throw new InvalidFactLifecycleError(
      'contested',
      existing.id,
      `fact ${existing.id} is already contested (since ${existing.contested_at})`,
    );
  }

  const reason = validateNonEmpty('reason', input.reason);
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.contest',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      reason,
      contested_at: now,
    },
    brainWrites: ({ seq }) => {
      // Contestation is administrative; last_corroborated is NOT advanced
      // (the underlying claim has not been re-affirmed — its trustworthiness
      // is in fact being questioned).
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET contested_at = ?, contested_reason = ?,
                  last_administratively_touched = ?, audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(now, reason, now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) throw new Error(`fact ${existing.id} disappeared mid-contest`);
  return { fact: view, audit };
}

export interface UncontestFactInput {
  /** User-provided note explaining how the contestation was resolved. */
  readonly resolution: string;
}

export interface UncontestFactResult {
  readonly fact: FactView;
  readonly audit: AuditedWriteResult;
}

/**
 * Clear the contested flag on a fact. The fact must currently be
 * contested; clearing a clean fact raises
 * InvalidFactLifecycleError('not_contested'). The previous
 * contested_at / contested_reason are preserved in the audit payload
 * so the contestation episode remains reconstructible.
 */
export async function uncontestFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: UncontestFactInput,
): Promise<UncontestFactResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  assertNotSuperseded(existing);

  if (existing.contested_at === null) {
    throw new InvalidFactLifecycleError(
      'not_contested',
      existing.id,
      `fact ${existing.id} is not contested; nothing to clear`,
    );
  }

  const resolution = validateNonEmpty('resolution', input.resolution);
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.uncontest',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      resolution,
      previous_contested_at: existing.contested_at,
      previous_contested_reason: existing.contested_reason,
      uncontested_at: now,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET contested_at = NULL, contested_reason = NULL,
                  last_administratively_touched = ?, audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) throw new Error(`fact ${existing.id} disappeared mid-uncontest`);
  return { fact: view, audit };
}

// ─────────────────────────────────────────────────────────────────
// Task 5B — tombstone (terminal state)
// ─────────────────────────────────────────────────────────────────

/**
 * Sentinel that replaces the original `statement` text on a tombstoned
 * row. The `statement_hash` is preserved (so audit-chain replay still
 * resolves the original payload via the audit event), and the dedup
 * query (`selectFactByHash`) excludes tombstoned rows, so a fresh fact
 * with the same content can be created post-erasure.
 */
export const TOMBSTONE_STATEMENT_SENTINEL = '[tombstoned]';

export interface TombstoneFactInput {
  /** User-provided reason for tombstoning. Required, non-empty. */
  readonly reason: string;
  /**
   * Default false. Tombstoning a superseded (non-head) fact requires
   * an explicit opt-in because superseded rows are otherwise read-only.
   * The override exists for forensic / compliance-driven content
   * suppression of historical versions (e.g. GDPR erasure).
   */
  readonly allowSuperseded?: boolean;
}

export interface TombstoneFactResult {
  readonly fact: FactView;
  readonly audit: AuditedWriteResult;
}

/**
 * Tombstone a fact. Terminal, irreversible state. The original
 * `statement` is overwritten with `TOMBSTONE_STATEMENT_SENTINEL`; the
 * `statement_hash` is preserved for audit linkage. All other mutations
 * (revise, promote, demote, update, contest, uncontest, tombstone
 * itself) are forbidden against a tombstoned fact.
 *
 * Rules:
 *  - Double-tombstone → InvalidFactLifecycleError('tombstoned').
 *  - Tombstoning a superseded fact without `allowSuperseded = true` →
 *    InvalidFactLifecycleError('superseded').
 *  - A tombstoned fact's contested flag (if any) is preserved so the
 *    contest→tombstone forensic sequence remains reconstructible.
 */
export async function tombstoneFact(
  ctx: AuditedWriteContext,
  workspaceId: string,
  factId: string,
  input: TombstoneFactInput,
): Promise<TombstoneFactResult> {
  const existing = selectFactById(ctx.db, workspaceId, factId);
  if (!existing) {
    throw new FactNotFoundError(factId);
  }
  assertNotTombstoned(existing);
  if (existing.superseded_by_fact_id !== null && !input.allowSuperseded) {
    throw new InvalidFactLifecycleError(
      'superseded',
      existing.id,
      `fact ${existing.id} is superseded by ${existing.superseded_by_fact_id}; pass allow_superseded=true to tombstone a historical version`,
    );
  }

  const reason = validateNonEmpty('reason', input.reason);
  const now = new Date().toISOString();

  const audit = await auditedWrite(ctx, {
    workspaceId,
    actor: 'user',
    action: 'fact.tombstone',
    kind: 'fact',
    decision: AUDIT_DECISION_HUMAN_APPROVED,
    payload: {
      fact_id: existing.id,
      reason,
      tombstoned_at: now,
      previous_tier: existing.tier,
      previous_statement_hash: existing.statement_hash,
      was_superseded: existing.superseded_by_fact_id !== null,
      was_contested: existing.contested_at !== null,
    },
    brainWrites: ({ seq }) => {
      ctx.db
        .prepare(
          `UPDATE semantic_facts
              SET statement = ?,
                  tombstoned_at = ?, tombstone_reason = ?,
                  last_administratively_touched = ?, audit_seq = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .run(TOMBSTONE_STATEMENT_SENTINEL, now, reason, now, seq, workspaceId, existing.id);
    },
  });

  const view = getFact(ctx.db, workspaceId, existing.id);
  if (!view) throw new Error(`fact ${existing.id} disappeared mid-tombstone`);
  return { fact: view, audit };
}
