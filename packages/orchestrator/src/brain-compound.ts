// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Phase 1.5 brain compounding.
//
// When a `plan` workflow succeeds, write derivative brain rows so the
// project actually accumulates cognition. Rules per the user's directive:
//
//   risks (severity ≥ 3)  → open_issues
//   assumptions           → semantic_facts at T0 (quarantine)
//   workflow summary      → already in `workflows` (episodic)
//   approved decisions    → NOT yet (require `manthan decision sign`)
//   replay divergences    → NOT yet (contradiction detector is Phase 2)
//
// All inserts go through `auditedWrite` so every brain mutation has
// a chain entry. NO auto-promotion above T0.

import { createHash, randomUUID } from 'node:crypto';
import {
  type AuditedWriteContext,
  type ManthanSqliteHandle,
  auditedWrite,
} from '@manthanos/memory';
import type { PlanArtifact } from './plan-schema.js';

export interface CompoundingInput {
  readonly ctx: AuditedWriteContext;
  readonly db: ManthanSqliteHandle;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly area: string;
  readonly plan: PlanArtifact;
}

export interface CompoundingResult {
  readonly openIssuesCreated: number;
  readonly factsQuarantined: number;
  readonly auditEventsWritten: number;
}

const STATEMENT_HASH = (area: string, text: string): string =>
  createHash('sha256').update(`${area}::${text}`).digest('hex');

export async function compoundFromPlan(input: CompoundingInput): Promise<CompoundingResult> {
  let issues = 0;
  let facts = 0;
  let audits = 0;
  const now = new Date().toISOString();

  // -- Risks (severity ≥ 3) → open_issues --
  for (const risk of input.plan.risks) {
    if (risk.severity < 3) continue;
    // De-dup: if an open issue with the same summary already exists in
    // this area, skip (no double-counting on re-plan).
    const existing = input.db
      .prepare(
        `SELECT id FROM open_issues
         WHERE workspace_id = ? AND area = ? AND summary = ? AND closed_at IS NULL`,
      )
      .get(input.workspaceId, input.area, risk.description) as { id: string } | undefined;
    if (existing) continue;

    const issueId = `oi_${randomUUID()}`;
    await auditedWrite(input.ctx, {
      workspaceId: input.workspaceId,
      actor: `workflow:plan#${input.workflowId}`,
      action: 'brain.issue_opened',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        issue_id: issueId,
        area: input.area,
        summary: risk.description,
        severity: risk.severity,
        mitigation: risk.mitigation,
        source: 'plan_risk',
      },
      brainWrites: () => {
        input.db
          .prepare(
            `INSERT INTO open_issues
               (id, workspace_id, area, summary, severity, opened_at, contradiction_id)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          )
          .run(issueId, input.workspaceId, input.area, risk.description, risk.severity, now);
      },
    });
    issues += 1;
    audits += 1;
  }

  // -- Assumptions → semantic_facts at T0 (quarantine) --
  for (const assumption of input.plan.assumptions) {
    const sHash = STATEMENT_HASH(input.area, assumption);
    // De-dup: same statement_hash in this workspace is a no-op.
    const existing = input.db
      .prepare('SELECT id FROM semantic_facts WHERE workspace_id = ? AND statement_hash = ?')
      .get(input.workspaceId, sHash) as { id: string } | undefined;
    if (existing) continue;

    const factId = `fact_${randomUUID()}`;
    await auditedWrite(input.ctx, {
      workspaceId: input.workspaceId,
      actor: `workflow:plan#${input.workflowId}`,
      action: 'brain.fact_quarantined',
      kind: 'system',
      decision: 'auto-approve',
      payload: {
        fact_id: factId,
        area: input.area,
        statement: assumption,
        tier: 'T0',
        confidence: 0.3,
        source: 'plan_assumption',
      },
      brainWrites: ({ seq }) => {
        input.db
          .prepare(
            `INSERT INTO semantic_facts
               (id, workspace_id, area, statement, statement_hash,
                provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
                last_administratively_touched)
             VALUES (?, ?, ?, ?, ?, ?, 'T0', ?, 0.3, ?, ?)`,
          )
          .run(
            factId,
            input.workspaceId,
            input.area,
            assumption,
            sHash,
            input.workflowId,
            now,
            seq,
            now,
          );
      },
    });
    facts += 1;
    audits += 1;
  }

  return {
    openIssuesCreated: issues,
    factsQuarantined: facts,
    auditEventsWritten: audits,
  };
}

/**
 * Derive a brain area from a task brief. v0 keeps it simple: pick the
 * first salient keyword. This is intentionally crude — the eval harness
 * will tell us whether finer-grained areas are worth the complexity.
 */
export function inferArea(taskBrief: string): string {
  const tokens = taskBrief
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3);
  // Heuristic: prefer recognizable domain words.
  const DOMAIN_HINTS = new Set([
    'auth',
    'oauth',
    'login',
    'session',
    'billing',
    'payment',
    'subscription',
    'api',
    'rest',
    'graphql',
    'database',
    'migration',
    'schema',
    'cache',
    'queue',
    'worker',
    'job',
    'ui',
    'frontend',
    'backend',
    'docs',
    'test',
    'ci',
    'cd',
    'deploy',
    'security',
    'perf',
    'performance',
    'logging',
    'metrics',
    'tracing',
  ]);
  for (const t of tokens) {
    if (DOMAIN_HINTS.has(t)) return t;
  }
  return tokens[0] ?? 'general';
}
