// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P1.7 — end-to-end happy path: init → review → promote → plan → replay.
//
// This is the mechanically defensible golden path. It exercises real
// production code at every step. The only injected boundary is the
// AgentAdapter, which returns a fixed canonical response so the test
// is deterministic and runs without network access. Every other
// substrate (PAL, audited write, brain promote, context packer, plan
// runner, replay verifier, recovery) is the same code that ships.
//
// The intent is forensic clarity, not coverage breadth: one test that
// fails loudly if any link in the chain breaks. Coverage-quantity
// tests live in their per-module test files.

import { execSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  CanonicalAgentPayload,
} from '@manthanos/adapters-sdk';
import { createBlobStore, openDb, runRecovery } from '@manthanos/memory';
import { PLAN_TOOL_NAME, promoteFact, replayRun, runPlanWorkflow } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { formatPlanSummary } from '../src/commands/plan.js';

function makeStubAdapter(): AgentAdapter {
  const args = {
    summary: 'Golden-path plan.',
    steps: [
      {
        id: 'S1',
        description: 'Stub step (no real work).',
        files_affected: [],
        depends_on: [],
        estimated_difficulty: 1,
      },
    ],
    assumptions: [],
    risks: [],
    open_questions: [],
  };
  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: 'stub-golden',
    content: [{ type: 'tool_call', id: 'toolu_g', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_g', name: PLAN_TOOL_NAME, arguments: args }],
    usage: { input_tokens: 10, output_tokens: 10, usd_micro: 100 },
    finish_reason: 'tool_use',
    identifiers: {},
  };
  const response: AgentResponse = {
    text: '',
    content: canonical.content,
    toolCalls: canonical.tool_calls,
    usage: { inputTokens: 10, outputTokens: 10, usdMicro: 100 },
    finishReason: 'tool_use',
    raw: { stub: 'golden' },
    canonical,
    latencyMs: 1,
  };
  return {
    metadata: {
      id: 'stub:golden',
      displayName: 'Stub (golden path)',
      provider: 'stub',
      model: 'stub-golden',
      capabilities: {
        contextTokens: 100_000,
        maxOutputTokens: 4096,
        toolUse: true,
        vision: false,
        streaming: false,
        fileAccess: 'none',
        reasoningStrength: 3,
        implementationStrength: 3,
        webBrowsing: false,
        structuredOutput: true,
      },
      cost: { inputUsdMicroPer1k: 100, outputUsdMicroPer1k: 100 },
      latencyClass: 'fast',
      recommendedFor: ['architecture'],
      adapterVersion: '0.0.0',
    },
    invoke: async (_req: AgentRequest): Promise<AgentResponse> => response,
  };
}

describe('e2e golden path: init → review → promote → plan → replay', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    // Temp git repo. `manthan init` refuses to run outside a git repo,
    // so this is the minimum fixture for a real init.
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-e2e-'));
    workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
    execSync('git init', { cwd: workspaceRoot, stdio: 'ignore' });
    // Minimal package.json so init derives a charter fact about the
    // workspace and the test exercises charter-fact discovery.
    await writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 'e2e-fixture', type: 'module' }),
    );
  });

  afterEach(async () => {
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('mechanically defensible from init to verified replay', async () => {
    // ---- 1. init -------------------------------------------------------
    const initResult = await runInit({ cwd: workspaceRoot });
    expect(initResult.charterFacts).toBeGreaterThan(0);
    expect(initResult.genesisSeq).toBe(1);

    // Re-open the DB for the rest of the test. Same path init wrote to.
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const jsonlPath = path.join(workspaceRoot, '.manthan', 'audit.log');
    const blobs = createBlobStore(path.join(workspaceRoot, '.manthan', 'audit', 'blobs'));
    const m = await openDb({ dbPath });

    try {
      // Seed a non-charter T0 fact to represent prior-plan-run output
      // awaiting review. The substrate normally produces these via
      // `compoundFromPlan` extracting assumptions; here we insert one
      // directly so the test stays linear and deterministic without a
      // second plan run.
      m.handle
        .prepare(
          `INSERT INTO semantic_facts
             (id, workspace_id, area, statement, statement_hash,
              provenance_workflow_id, tier, last_corroborated, confidence,
              audit_seq, last_administratively_touched)
           VALUES (?, ?, 'auth', 'Sessions use httpOnly cookies', 'h_e2e',
                   NULL, 'T0', ?, 0.3, ?, ?)`,
        )
        .run(
          'fact_e2e_review',
          initResult.workspaceId,
          new Date().toISOString(),
          initResult.genesisSeq,
          new Date().toISOString(),
        );

      // ---- 2. review (queue inspection) ------------------------------
      // `manthan brain review` is interactive; programmatically the
      // queue is the set of T0 non-charter facts. The seeded fact
      // must be in it.
      const reviewQueue = m.handle
        .prepare(
          `SELECT id, area, statement FROM semantic_facts
           WHERE workspace_id = ? AND tier = 'T0'
                 AND area NOT IN ('language','project','package_manager','testing')`,
        )
        .all(initResult.workspaceId) as Array<{ id: string; area: string; statement: string }>;
      expect(reviewQueue.length).toBeGreaterThanOrEqual(1);
      expect(reviewQueue.some((r) => r.id === 'fact_e2e_review')).toBe(true);

      // ---- 3. promote ------------------------------------------------
      const promotion = await promoteFact({
        ctx: {
          db: m.handle,
          blobs,
          jsonlPath,
          mutex: new (await import('@manthanos/memory')).AsyncMutex(),
        },
        db: m.handle,
        workspaceId: initResult.workspaceId,
        factId: 'fact_e2e_review',
        approver: 'e2e-tester',
      });
      expect(promotion.fromTier).toBe('T0');
      expect(promotion.toTier).toBe('T+1');

      // Promoted fact is now at T+1 in storage.
      const promotedRow = m.handle
        .prepare('SELECT tier FROM semantic_facts WHERE id = ?')
        .get('fact_e2e_review') as { tier: string };
      expect(promotedRow.tier).toBe('T+1');
    } finally {
      m.close();
    }

    // ---- 4. plan -------------------------------------------------------
    const planResult = await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'golden-path plan',
      adapter: makeStubAdapter(),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });

    // The promoted fact entered the bundle as trusted continuity.
    expect(planResult.bundleMetrics.trustedFactsInBundle).toBe(1);
    expect(planResult.bundleMetrics.quarantineFactsInBundle).toBe(0);
    // No quarantine facts were excluded (the only T0 non-charter fact
    // got promoted away in step 3).
    expect(planResult.bundleMetrics.quarantineFactsExcluded).toBe(0);
    expect(planResult.bundleMetrics.omittedFactsCount).toBe(0);

    // The continuity summary renders correctly. Forensic clarity: this
    // is the exact wording an operator will see.
    const summary = formatPlanSummary(planResult);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toBe(
      '[manthan] context: 1 trusted facts injected | 0 quarantine facts excluded | 0 omitted',
    );
    expect(summary[1]).toContain(`manthan replay ${planResult.runId}`);

    // Wording discipline. No anthropomorphic language anywhere in the
    // golden path output. (`exit` and `stop` come from non-banned
    // language; `learn` and `remember` are the load-bearing watch-list.)
    const joined = summary.join('\n').toLowerCase();
    for (const banned of [
      'ai remembered',
      'successfully understood',
      'guaranteed',
      'remembered',
      'understood',
      'thinks',
      'learned',
      'trusted ai',
    ]) {
      expect(joined).not.toContain(banned);
    }

    // ---- 5. replay (using the runId we just extracted) ----------------
    // The summary's second line is the literal command an operator
    // would type. Parse the runId out and feed it to the verifier —
    // this proves the printed hint actually works.
    const replayMatch = summary[1]?.match(/manthan replay (\S+)/);
    expect(replayMatch).not.toBeNull();
    const runId = replayMatch?.[1] as string;
    expect(runId).toBe(planResult.runId);

    const replayResult = await replayRun({ workspaceRoot, runId });
    const v = replayResult.verification;
    expect(v.status).toBe('verified');
    expect(v.checks.chain).toBe('ok');
    expect(v.checks.canonicalHash).toBe('ok');
    expect(v.checks.bundleHash).toBe('ok');
    expect(v.checks.blobs.failed).toBe(0);
    expect(v.checks.blobs.missing).toBe(0);
    expect(v.failures).toHaveLength(0);
    expect(v.legacy).toHaveLength(0);
    expect(v.unverifiable).toHaveLength(0);

    // ---- 6. End-state checks ------------------------------------------
    // Recovery is still clean (no findings, chain unbroken end-to-end).
    const m2 = await openDb({ dbPath });
    try {
      const recovery = await runRecovery({
        db: m2.handle,
        blobs,
        jsonlPath,
        workspaceId: initResult.workspaceId,
      });
      expect(recovery.status === 'clean' || recovery.status === 'partial').toBe(true);
      expect(recovery.findings).toHaveLength(0);
      expect(recovery.chainOk).toBe(true);
      expect(recovery.workflowsMarkSkipped).toBe(false);
    } finally {
      m2.close();
    }
  });
});
