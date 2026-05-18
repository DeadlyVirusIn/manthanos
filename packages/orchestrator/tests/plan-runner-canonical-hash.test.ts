// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P0.1 regression test: `manthan plan` must commit the canonical-response
// hash into the `agent.invoke` audit payload so that `manthan replay` can
// recompute and compare without re-deriving the canonical projection.
//
// Before this test existed, plan-runner computed `responseHash` and then
// discarded it with `void responseHash`, leaving the hash-chain claim
// partially false: the chain committed to the canonical payload, but the
// recorded canonical hash was implicit and trust-impacted.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type AgentAdapter,
  type AgentRequest,
  type AgentResponse,
  type CanonicalAgentPayload,
  hashCanonicalPayload,
} from '@manthanos/adapters-sdk';
import { createBlobStore, openDb } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPlanWorkflow } from '../src/plan-runner.js';
import { PLAN_TOOL_NAME } from '../src/plan-tool.js';

function makeStubAdapter(): AgentAdapter {
  const args = {
    summary: 'Stub plan for canonical-hash regression.',
    steps: [
      {
        id: 'S1',
        description: 'No-op step.',
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
    model: 'stub-model',
    content: [{ type: 'tool_call', id: 'toolu_stub', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_stub', name: PLAN_TOOL_NAME, arguments: args }],
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
      model: 'stub-model',
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

describe('plan-runner persists canonical_hash in agent.invoke audit event', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-canonhash-'));
    // Canonicalize via the same PAL the orchestrator uses; this is how
    // plan-runner will look up the workspaces row.
    workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);

    // Bootstrap the workspaces row directly. We bypass the full `manthan
    // init` flow because charter-fact discovery is not under test here.
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    m.handle
      .prepare(
        'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
      )
      .run('ws_canonhash_test', workspaceRoot, new Date().toISOString());
    m.close();
  });

  afterEach(async () => {
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('writes canonical_hash that recomputes to the same value', async () => {
    const adapter = makeStubAdapter();

    const result = await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'verify canonical hash persistence',
      adapter,
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });

    expect(result.runId).toMatch(/^wf_/);

    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    try {
      const event = m.handle
        .prepare(
          `SELECT seq, payload_hash FROM audit_events
           WHERE workspace_id = ? AND action = 'agent.invoke'
           ORDER BY seq ASC LIMIT 1`,
        )
        .get('ws_canonhash_test') as { seq: number; payload_hash: string } | undefined;
      expect(event).toBeDefined();
      if (!event) return;
      expect(event.payload_hash).toMatch(/^[0-9a-f]{64}$/);

      // Load the audit payload from the content-addressed blob store.
      const blobs = createBlobStore(path.join(workspaceRoot, '.manthan', 'audit', 'blobs'));
      const blobPath = blobs.pathFor(event.payload_hash);
      const raw = await readFile(blobPath, 'utf8');
      const payload = JSON.parse(raw) as {
        canonical: CanonicalAgentPayload;
        canonical_hash: string;
      };

      // The hash must be present and well-formed.
      expect(payload.canonical_hash).toMatch(/^[0-9a-f]{64}$/);

      // The recorded hash must equal hashCanonicalPayload(payload.canonical).
      // This is the property `manthan replay` will rely on to verify a run.
      const recomputed = hashCanonicalPayload(payload.canonical).payloadHash;
      expect(recomputed).toBe(payload.canonical_hash);
    } finally {
      m.close();
    }
  });
});
