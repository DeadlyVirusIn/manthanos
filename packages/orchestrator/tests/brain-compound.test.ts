// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compoundFromPlan, inferArea } from '../src/brain-compound.js';
import type { PlanArtifact } from '../src/plan-schema.js';

const WORKSPACE_ID = 'ws-test-compound';

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-compound-'));
  const dbPath = path.join(dir, '.manthan/memory/manthan.db');
  const jsonlPath = path.join(dir, '.manthan/audit.log');
  const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      `INSERT INTO workspaces (id, root_path, git_remote_hash, created_at)
       VALUES (?, ?, NULL, ?)`,
    )
    .run(WORKSPACE_ID, dir, new Date().toISOString());
  // Seed a workflow row so brain inserts reference a valid foreign key.
  m.handle
    .prepare(
      `INSERT INTO workflows
         (id, workspace_id, type, version, started_at, finished_at, status,
          total_input_tokens, total_output_tokens, total_usd_micro)
       VALUES ('wf_test', ?, 'plan', '1.0.0', ?, NULL, 'running', 0, 0, 0)`,
    )
    .run(WORKSPACE_ID, new Date().toISOString());
  const ctx = { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() };
  return { dir, m, ctx };
}

const PLAN_SAMPLE: PlanArtifact = {
  summary: 'Add OAuth login',
  steps: [
    {
      id: 'S1',
      description: 'Install passport',
      files_affected: ['package.json'],
      depends_on: [],
      estimated_difficulty: 2,
    },
  ],
  assumptions: ['Node.js >= 20', 'Database supports sessions'],
  risks: [
    { description: 'Token leak', severity: 4, mitigation: 'Use httpOnly' },
    { description: 'Tiny cosmetic risk', severity: 1, mitigation: 'n/a' },
    { description: 'Session replay', severity: 3, mitigation: 'Rotate' },
  ],
  open_questions: ['Which provider first?'],
};

describe('compoundFromPlan', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('opens issues for risks with severity >= 3 only', async () => {
    const r = await compoundFromPlan({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WORKSPACE_ID,
      workflowId: 'wf_test',
      area: 'auth',
      plan: PLAN_SAMPLE,
    });
    expect(r.openIssuesCreated).toBe(2); // severities 4 and 3
    expect(r.factsQuarantined).toBe(2);

    const issues = env.m.handle
      .prepare(
        'SELECT severity, summary FROM open_issues WHERE workspace_id = ? ORDER BY severity DESC',
      )
      .all(WORKSPACE_ID) as Array<{ severity: number; summary: string }>;
    expect(issues.length).toBe(2);
    expect(issues[0]?.severity).toBe(4);
    expect(issues[1]?.severity).toBe(3);

    const facts = env.m.handle
      .prepare('SELECT statement, tier, confidence FROM semantic_facts WHERE workspace_id = ?')
      .all(WORKSPACE_ID) as Array<{ statement: string; tier: string; confidence: number }>;
    expect(facts.length).toBe(2);
    expect(facts.every((f) => f.tier === 'T0')).toBe(true);
    expect(facts.every((f) => f.confidence === 0.3)).toBe(true);
  });

  it('does not promote facts to higher tiers on repeat calls (no self-confirmation)', async () => {
    await compoundFromPlan({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WORKSPACE_ID,
      workflowId: 'wf_test',
      area: 'auth',
      plan: PLAN_SAMPLE,
    });
    // Second invocation with the same plan must NOT add duplicate rows
    // and must NOT bump tiers.
    const r2 = await compoundFromPlan({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WORKSPACE_ID,
      workflowId: 'wf_test',
      area: 'auth',
      plan: PLAN_SAMPLE,
    });
    expect(r2.openIssuesCreated).toBe(0);
    expect(r2.factsQuarantined).toBe(0);
    const tiers = env.m.handle
      .prepare('SELECT DISTINCT tier FROM semantic_facts WHERE workspace_id = ?')
      .all(WORKSPACE_ID) as Array<{ tier: string }>;
    expect(tiers.map((t) => t.tier)).toEqual(['T0']);
  });

  it('writes audit events for every compounding insert (chain stays intact)', async () => {
    const before = env.m.handle
      .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ?')
      .get(WORKSPACE_ID) as { n: number };
    await compoundFromPlan({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WORKSPACE_ID,
      workflowId: 'wf_test',
      area: 'auth',
      plan: PLAN_SAMPLE,
    });
    const after = env.m.handle
      .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ?')
      .get(WORKSPACE_ID) as { n: number };
    // 2 open_issues + 2 semantic_facts = 4 new audit events.
    expect(after.n - before.n).toBe(4);
  });
});

describe('inferArea', () => {
  it('picks domain hints when present', () => {
    expect(inferArea('add OAuth login flow')).toBe('oauth');
    expect(inferArea('write integration tests for billing')).toBe('billing');
    expect(inferArea('improve cache hit ratio')).toBe('cache');
  });
  it('falls back to the first salient token', () => {
    expect(inferArea('rename the widget renderer')).toBe('rename');
  });
  it('handles empty/whitespace input', () => {
    expect(inferArea('')).toBe('general');
  });
});
