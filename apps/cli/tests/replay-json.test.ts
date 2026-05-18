// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Stabilization batch 1 — `manthan replay <runId> --json`.
//
// The flag emits the full `ReplayResult` struct as pretty-printed
// JSON on stdout, byte-identical to `JSON.stringify(result, null, 2)`.
// No rendering transforms, no ANSI, no extra fields. Exit codes
// are unchanged.
//
// One test per verification status so each branch is pinned.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  CanonicalAgentPayload,
} from '@manthanos/adapters-sdk';
import { openDb } from '@manthanos/memory';
import { PLAN_TOOL_NAME, runPlanWorkflow } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runReplay } from '../src/commands/replay.js';

function makeStubAdapter(): AgentAdapter {
  const args = {
    summary: 'replay-json test plan',
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
    content: [{ type: 'tool_call', id: 'toolu_j', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_j', name: PLAN_TOOL_NAME, arguments: args }],
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
    raw: { stub: 'json' },
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

const WS = 'ws_replay_json';

async function setupRun(): Promise<{ workspaceRoot: string; runId: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-replay-json-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, workspaceRoot, new Date().toISOString());
  m.close();

  const result = await runPlanWorkflow({
    workspaceRoot,
    taskBrief: 'test',
    adapter: makeStubAdapter(),
    maxUsdMicro: 10_000_000,
    contextTokenBudget: 60_000,
  });
  return { workspaceRoot, runId: result.runId };
}

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    calls.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { calls, restore: () => spy.mockRestore() };
}

describe('manthan replay --json', () => {
  let workspaceRoot: string;
  let runId: string;

  beforeEach(async () => {
    const env = await setupRun();
    workspaceRoot = env.workspaceRoot;
    runId = env.runId;
  });
  afterEach(async () => {
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('verified: emits parseable JSON with status=verified and exit code 0', async () => {
    const { calls, restore } = captureStdout();
    const code = await runReplay({ cwd: workspaceRoot, runId, json: true });
    restore();
    expect(code).toBe(0);

    const out = calls.join('');
    const obj = JSON.parse(out);
    expect(obj.runId).toBe(runId);
    expect(obj.verification.status).toBe('verified');
    expect(obj.verification.checks.chain).toBe('ok');
    expect(obj.verification.checks.canonicalHash).toBe('ok');
    expect(obj.verification.checks.bundleHash).toBe('ok');
    expect(obj.verification.failures).toEqual([]);
    expect(obj.verification.legacy).toEqual([]);
    expect(obj.verification.unverifiable).toEqual([]);

    // Byte-identical to JSON.stringify(_, null, 2) with a single
    // trailing newline. No ANSI escape sequences anywhere.
    expect(out.endsWith('\n')).toBe(true);
    const ESC = String.fromCharCode(0x1b);
    expect(out.includes(`${ESC}[`)).toBe(false);
  });

  it('corrupted: emits status=corrupted with a populated failures array, exit code 3', async () => {
    // Mutate the agent.invoke blob to invalidate its payload_hash.
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    const row = m.handle
      .prepare(
        `SELECT payload_hash FROM audit_events
         WHERE workspace_id = ? AND action = 'agent.invoke'
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(WS) as { payload_hash: string };
    m.close();
    const blobPath = path.join(
      workspaceRoot,
      '.manthan',
      'audit',
      'blobs',
      row.payload_hash.slice(0, 2),
      `${row.payload_hash.slice(2)}.json`,
    );
    const raw = await readFile(blobPath, 'utf8');
    await writeFile(blobPath, raw.replace(/^\{/, '{"injected":"x",'), 'utf8');

    const { calls, restore } = captureStdout();
    const code = await runReplay({ cwd: workspaceRoot, runId, json: true });
    restore();
    expect(code).toBe(3);

    const obj = JSON.parse(calls.join(''));
    expect(obj.verification.status).toBe('corrupted');
    expect(Array.isArray(obj.verification.failures)).toBe(true);
    expect(obj.verification.failures.length).toBeGreaterThan(0);
    expect(obj.verification.failures.some((f: { check: string }) => f.check === 'blob')).toBe(true);
  });

  it('unverifiable: missing context_snapshots row → status=unverifiable, exit code 2', async () => {
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    m.handle.prepare('DELETE FROM context_snapshots WHERE workflow_id = ?').run(runId);
    m.close();

    const { calls, restore } = captureStdout();
    const code = await runReplay({ cwd: workspaceRoot, runId, json: true });
    restore();
    expect(code).toBe(2);

    const obj = JSON.parse(calls.join(''));
    expect(obj.verification.status).toBe('unverifiable');
    expect(obj.verification.checks.bundleHash).toBe('unverifiable');
    expect(
      obj.verification.unverifiable.some((u: { check: string }) => u.check === 'bundle_hash'),
    ).toBe(true);
  });

  it('legacy: layers_json without content_sha256 → status=legacy, exit code 1', async () => {
    // Strip content_sha256 from every layer in layers_json — simulates
    // a pre-P0.3 snapshot.
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    const row = m.handle
      .prepare('SELECT layers_json FROM context_snapshots WHERE workflow_id = ?')
      .get(runId) as { layers_json: string };
    const parsed = JSON.parse(row.layers_json) as Array<Record<string, unknown>>;
    // Rebuild each layer without content_sha256 — simulates pre-P0.3
    // shape. Destructuring + spread is the lint-clean way to drop a
    // field without using `delete`.
    const stripped = parsed.map((l) => {
      const { content_sha256: _drop, ...rest } = l;
      void _drop;
      return rest;
    });
    m.handle
      .prepare('UPDATE context_snapshots SET layers_json = ? WHERE workflow_id = ?')
      .run(JSON.stringify(stripped), runId);
    m.close();

    const { calls, restore } = captureStdout();
    const code = await runReplay({ cwd: workspaceRoot, runId, json: true });
    restore();
    expect(code).toBe(1);

    const obj = JSON.parse(calls.join(''));
    expect(obj.verification.status).toBe('legacy');
    expect(obj.verification.checks.bundleHash).toBe('legacy');
    expect(obj.verification.legacy.some((l: { check: string }) => l.check === 'bundle_hash')).toBe(
      true,
    );
  });

  it('JSON output is byte-identical to JSON.stringify(result, null, 2) + newline', async () => {
    // Re-run the verifier directly to obtain the canonical struct and
    // compare against what the CLI emits. This is the contract:
    // --json round-trips the underlying object verbatim.
    const { replayRun } = await import('@manthanos/orchestrator');
    const direct = await replayRun({ workspaceRoot, runId });
    const expected = `${JSON.stringify(direct, null, 2)}\n`;

    const { calls, restore } = captureStdout();
    await runReplay({ cwd: workspaceRoot, runId, json: true });
    restore();

    expect(calls.join('')).toBe(expected);
  });
});
