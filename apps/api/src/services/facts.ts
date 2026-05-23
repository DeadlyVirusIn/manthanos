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
const TIER_CONFIDENCE: Record<FactTier, number> = {
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
}

interface FactRow extends FactView {}

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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function computeStatementHash(area: string, statement: string): string {
  // Same shape as brain-compound.ts (`${area}::${text}`). Audit BUG-4
  // flagged the `::` delimiter as theoretically collidable; the dedup
  // semantics here match the existing CLI's view of the brain. A future
  // hardening pass can swap the delimiter in lockstep with the CLI.
  const canonical = `${area}::${statement}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function generateFactId(): string {
  return `fact-${randomUUID().slice(0, 12)}`;
}

function rowToView(row: FactRow): FactView {
  return row;
}

function selectFactById(
  db: ManthanSqliteHandle,
  workspaceId: string,
  factId: string,
): FactRow | null {
  const row = db
    .prepare(
      `SELECT id, workspace_id, area, statement, statement_hash, tier,
              confidence, last_corroborated, last_administratively_touched, audit_seq
       FROM semantic_facts
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, factId) as FactRow | undefined;
  return row ?? null;
}

function selectFactByHash(
  db: ManthanSqliteHandle,
  workspaceId: string,
  statementHash: string,
): FactRow | null {
  const row = db
    .prepare(
      `SELECT id, workspace_id, area, statement, statement_hash, tier,
              confidence, last_corroborated, last_administratively_touched, audit_seq
       FROM semantic_facts
       WHERE workspace_id = ? AND statement_hash = ?`,
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
  // until Task 5B / V1 enables their lifecycle.
  clauses.push("tier IN ('T-2','T-1','T0','T+1')");

  const where = clauses.join(' AND ');
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM semantic_facts WHERE ${where}`)
    .get(...params) as { n: number };

  const rows = db
    .prepare(
      `SELECT id, workspace_id, area, statement, statement_hash, tier,
              confidence, last_corroborated, last_administratively_touched, audit_seq
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
