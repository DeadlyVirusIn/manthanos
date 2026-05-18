// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P1.6: prove `runPlanWorkflow` populates the new bundleMetrics
// fields end-to-end so the post-plan summary line has accurate
// counts.

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  CanonicalAgentPayload,
} from '@manthanos/adapters-sdk';
import { openDb } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPlanWorkflow } from '../src/plan-runner.js';
import { PLAN_TOOL_NAME } from '../src/plan-tool.js';

function makeStubAdapter(): AgentAdapter {
  const args = {
    summary: 'P1.6 stub plan',
    steps: [
      {
        id: 'S1',
        description: 'noop',
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
    model: 'stub',
    content: [{ type: 'tool_call', id: 'toolu_x', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_x', name: PLAN_TOOL_NAME, arguments: args }],
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
    raw: { stub: true },
    canonical,
    latencyMs: 1,
  };
  return {
    metadata: {
      id: 'stub:test',
      displayName: 'Stub',
      provider: 'stub',
      model: 'stub',
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

const WS = 'ws_p16_bundle_metrics';

async function setup(): Promise<{ workspaceRoot: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-p16-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, workspaceRoot, new Date().toISOString());

  // Seed 3 T0 (non-charter) facts so quarantineFactsExcluded is non-zero.
  for (let i = 0; i < 3; i += 1) {
    m.handle
      .prepare(
        `INSERT INTO semantic_facts
           (id, workspace_id, area, statement, statement_hash,
            provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
            last_administratively_touched)
         VALUES (?, ?, 'auth', ?, ?, NULL, 'T0', ?, 0.3, 0, ?)`,
      )
      .run(
        `t0_fact_${i}`,
        WS,
        `quarantine fact ${i}`,
        `h_${i}`,
        new Date().toISOString(),
        new Date().toISOString(),
      );
  }
  m.close();
  return { workspaceRoot };
}

describe('runPlanWorkflow bundleMetrics for post-plan summary', () => {
  let workspaceRoot: string;
  beforeEach(async () => {
    const env = await setup();
    workspaceRoot = env.workspaceRoot;
  });
  afterEach(async () => {
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('quarantineFactsExcluded equals total T0 non-charter facts when --include-quarantine is off', async () => {
    const result = await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'test',
      adapter: makeStubAdapter(),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
      // includeQuarantine omitted → defaults to false
    });

    expect(result.bundleMetrics.quarantineFactsInBundle).toBe(0);
    expect(result.bundleMetrics.quarantineFactsExcluded).toBe(3);
    expect(result.bundleMetrics.trustedFactsInBundle).toBe(0);
    expect(result.bundleMetrics.omittedFactsCount).toBeGreaterThanOrEqual(0);
  });

  it('quarantineFactsExcluded drops to 0 when --include-quarantine is on', async () => {
    const result = await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'test',
      adapter: makeStubAdapter(),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
      includeQuarantine: true,
    });

    expect(result.bundleMetrics.quarantineFactsInBundle).toBe(3);
    expect(result.bundleMetrics.quarantineFactsExcluded).toBe(0);
  });
});
