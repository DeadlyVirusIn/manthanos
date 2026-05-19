// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX-2A regression test: `runPlanWorkflow` emits real phase events
// in a deterministic order, including a heartbeat under a slow
// adapter. No fabricated progress: every event corresponds to a
// real substrate state transition.

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
import { type PhaseEvent, runPlanWorkflow } from '../src/plan-runner.js';
import { PLAN_TOOL_NAME } from '../src/plan-tool.js';

const WS = 'ws_phase_events';

function makeAdapter(invokeDelayMs = 0): AgentAdapter {
  const args = {
    summary: 'phase test',
    steps: [
      {
        id: 'S1',
        description: 'noop',
        files_affected: [],
        depends_on: [],
        estimated_difficulty: 1,
      },
    ],
    assumptions: ['assumption 1'],
    risks: [],
    open_questions: [],
  };
  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: 'stub',
    content: [{ type: 'tool_call', id: 'toolu_p', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_p', name: PLAN_TOOL_NAME, arguments: args }],
    usage: { input_tokens: 10, output_tokens: 42, usd_micro: 100 },
    finish_reason: 'tool_use',
    identifiers: {},
  };
  const response: AgentResponse = {
    text: '',
    content: canonical.content,
    toolCalls: canonical.tool_calls,
    usage: { inputTokens: 10, outputTokens: 42, usdMicro: 100 },
    finishReason: 'tool_use',
    raw: { stub: true },
    canonical,
    latencyMs: invokeDelayMs,
  };
  return {
    metadata: {
      id: 'stub:phase',
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
    invoke: async (_req: AgentRequest): Promise<AgentResponse> => {
      if (invokeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, invokeDelayMs));
      }
      return response;
    },
  };
}

async function setup(): Promise<{ workspaceRoot: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-phase-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, workspaceRoot, new Date().toISOString());
  m.close();
  return { workspaceRoot };
}

describe('runPlanWorkflow phase events', () => {
  let workspaceRoot: string;
  beforeEach(async () => {
    const env = await setup();
    workspaceRoot = env.workspaceRoot;
  });
  afterEach(async () => {
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('emits the canonical phase sequence on a fast adapter (no heartbeat)', async () => {
    const events: PhaseEvent[] = [];
    await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'fast',
      adapter: makeAdapter(0),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
      onPhase: (e) => events.push(e),
      heartbeatIntervalMs: 60_000,
    });

    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual([
      'bundle_ready',
      'adapter_invoke_start',
      'adapter_invoke_done',
      'extracted',
    ]);

    // bundle_ready carries real numbers from the packer.
    const ready = events[0];
    expect(ready?.kind).toBe('bundle_ready');
    if (ready?.kind === 'bundle_ready') {
      expect(ready.trustedFactsInBundle).toBe(0);
      expect(ready.quarantineFactsExcluded).toBe(0);
      expect(ready.estimatedTokens).toBeGreaterThan(0);
      expect(ready.estCostUsdMicro).toBeGreaterThanOrEqual(0);
    }

    // adapter_invoke_start carries the adapter id.
    const start = events[1];
    expect(start?.kind).toBe('adapter_invoke_start');
    if (start?.kind === 'adapter_invoke_start') {
      expect(start.adapterId).toBe('stub:phase');
    }

    // adapter_invoke_done carries the real output-token count.
    const done = events[2];
    expect(done?.kind).toBe('adapter_invoke_done');
    if (done?.kind === 'adapter_invoke_done') {
      expect(done.outputTokens).toBe(42);
      expect(done.elapsedMs).toBeGreaterThanOrEqual(0);
    }

    // extracted carries the real fact-recorded count (1 assumption).
    const extracted = events[3];
    expect(extracted?.kind).toBe('extracted');
    if (extracted?.kind === 'extracted') {
      expect(extracted.factsRecorded).toBe(1);
    }
  });

  it('emits heartbeat events under a slow adapter', async () => {
    const events: PhaseEvent[] = [];
    await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'slow',
      adapter: makeAdapter(250), // 250ms delay
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
      onPhase: (e) => events.push(e),
      heartbeatIntervalMs: 100, // 100ms heartbeat — should fire ~2 times during the 250ms call
    });

    const heartbeats = events.filter((e) => e.kind === 'adapter_invoke_heartbeat');
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    // Heartbeats appear strictly between start and done.
    const startIdx = events.findIndex((e) => e.kind === 'adapter_invoke_start');
    const doneIdx = events.findIndex((e) => e.kind === 'adapter_invoke_done');
    expect(startIdx).toBeGreaterThan(-1);
    expect(doneIdx).toBeGreaterThan(startIdx);
    for (const hb of heartbeats) {
      const idx = events.indexOf(hb);
      expect(idx).toBeGreaterThan(startIdx);
      expect(idx).toBeLessThan(doneIdx);
      if (hb.kind === 'adapter_invoke_heartbeat') {
        expect(hb.elapsedMs).toBeGreaterThan(0);
      }
    }
  });

  it('emits no phase events when no callback is provided', async () => {
    // Smoke: passing `onPhase` undefined must not throw or alter behavior.
    // The result is verified through the normal RunPlanResult shape.
    const result = await runPlanWorkflow({
      workspaceRoot,
      taskBrief: 'no callback',
      adapter: makeAdapter(0),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });
    expect(result.runId).toMatch(/^wf_/);
    expect(result.bundleMetrics.trustedFactsInBundle).toBe(0);
  });
});
