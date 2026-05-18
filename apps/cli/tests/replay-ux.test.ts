// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX-1 — pin the restyled `manthan replay` output.
//
// Two snapshots: verified (the calm baseline) and corrupted (the
// load-bearing severity case). These become long-term stability
// anchors for the CLI design language.
//
// Plus invariant checks across all four statuses:
//   - banned anthropomorphic vocabulary never appears
//   - --no-color produces ANSI-free output
//   - run id and full hashes appear verbatim (no truncation /
//     reformatting of identifiers)
//   - reserved status / per-check vocabulary appears literally

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
    summary: 'replay-ux test plan',
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
    content: [{ type: 'tool_call', id: 'toolu_u', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 'toolu_u', name: PLAN_TOOL_NAME, arguments: args }],
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
    raw: { stub: 'ux' },
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

const WS = 'ws_replay_ux';

async function setupRun(): Promise<{ workspaceRoot: string; runId: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-replay-ux-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, workspaceRoot, new Date().toISOString());
  m.close();

  const r = await runPlanWorkflow({
    workspaceRoot,
    taskBrief: 'ux',
    adapter: makeStubAdapter(),
    maxUsdMicro: 10_000_000,
    contextTokenBudget: 60_000,
  });
  return { workspaceRoot, runId: r.runId };
}

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    calls.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { calls, restore: () => spy.mockRestore() };
}

/**
 * Replace volatile fields in the captured output so snapshots are
 * stable across runs. Specifically: the run id, hashes, and the
 * `started` timestamp. The shape is what we are pinning, not the
 * specific bytes that depend on wall-clock or random data.
 */
function normalize(out: string, runId: string): string {
  let s = out;
  s = s.replaceAll(runId, '<runId>');
  s = s.replace(/\b[0-9a-f]{64}\b/g, '<sha256>');
  s = s.replace(/started:\s+\S+/, 'started:         <ts>');
  return s;
}

const BANNED = [
  'successfully',
  'remembered',
  'understood',
  'intelligent',
  'smart',
  'magical',
  'ai team',
  'ai agent',
  'guaranteed',
];

describe('manthan replay — UX-1 restyle', () => {
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

  it('verified: no-color snapshot is stable', async () => {
    const { calls, restore } = captureStdout();
    const code = await runReplay({ cwd: workspaceRoot, runId, noColor: true });
    restore();
    expect(code).toBe(0);
    const out = normalize(calls.join(''), runId);
    expect(out).toMatchInlineSnapshot(`
      "manthan replay — <runId>
        (integrity check of recorded artifacts; no model re-invocation)

        status:         verified
        chain:          ok
        blobs:          5 checked, 0 mismatched, 0 missing
        canonical_hash: ok
        bundle_hash:    ok

        audit events:   5 for this run
        started:         <ts>
        workflow status: completed
        bundle_hash:    <sha256>
        canonical_hash: <sha256>
        tokens:         in=10 out=10
        cost:           $0.000100 (100 micro)
        finish reason:  tool_use
      "
    `);
  });

  it('corrupted: no-color snapshot is stable, status uppercased', async () => {
    // Mutate the agent.invoke blob.
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
    const code = await runReplay({ cwd: workspaceRoot, runId, noColor: true });
    restore();
    expect(code).toBe(3);

    const out = normalize(calls.join(''), runId);
    // The status banner uppercases on `corrupted` per the design
    // system case-shift rule.
    expect(out).toContain('status:         CORRUPTED');
    // Per-check failed outcome uppercase, severity-loud.
    expect(out).toContain('blobs:          5 checked, 1 mismatched, 0 missing');
    // Failure block present with [check] tag + the canonical detail
    // wording from the verifier (not paraphrased by the renderer).
    expect(out).toContain('failures:');
    expect(out).toContain('[blob] blob content does not hash to recorded payload_hash');
    // Forensic next-action arrow appears only on corruption.
    expect(out).toContain('-> inspect .manthan/audit-corruption.log');
    // Final-shape snapshot of the leading section (deterministic).
    const head = out.split('\n').slice(0, 8).join('\n');
    expect(head).toMatchInlineSnapshot(`
      "manthan replay — <runId>
        (integrity check of recorded artifacts; no model re-invocation)

        status:         CORRUPTED — an explicit hash mismatch was detected
        chain:          ok
        blobs:          5 checked, 1 mismatched, 0 missing
        canonical_hash: ok
        bundle_hash:    ok"
    `);
  });

  it('--no-color produces ANSI-free output across all four statuses', async () => {
    // Build each scenario inline; assert no ANSI escape codes.
    const ESC = String.fromCharCode(0x1b);

    // VERIFIED (fresh run)
    {
      const { calls, restore } = captureStdout();
      await runReplay({ cwd: workspaceRoot, runId, noColor: true });
      restore();
      expect(calls.join('').includes(`${ESC}[`)).toBe(false);
    }

    // CORRUPTED
    {
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
      await runReplay({ cwd: workspaceRoot, runId, noColor: true });
      restore();
      expect(calls.join('').includes(`${ESC}[`)).toBe(false);

      // Restore the blob so the next scenario starts fresh-ish.
      await writeFile(blobPath, raw, 'utf8');
    }

    // UNVERIFIABLE
    {
      const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
      const m = await openDb({ dbPath });
      m.handle.prepare('DELETE FROM context_snapshots WHERE workflow_id = ?').run(runId);
      m.close();
      const { calls, restore } = captureStdout();
      await runReplay({ cwd: workspaceRoot, runId, noColor: true });
      restore();
      expect(calls.join('').includes(`${ESC}[`)).toBe(false);
    }
  });

  it('no banned anthropomorphic vocabulary in any rendered output', async () => {
    const { calls, restore } = captureStdout();
    await runReplay({ cwd: workspaceRoot, runId, noColor: true });
    restore();
    const lowered = calls.join('').toLowerCase();
    for (const word of BANNED) {
      expect(lowered).not.toContain(word);
    }
  });

  it('reserved vocabulary appears verbatim (case-sensitive where required)', async () => {
    const { calls, restore } = captureStdout();
    await runReplay({ cwd: workspaceRoot, runId, noColor: true });
    restore();
    const out = calls.join('');
    // Verified status is lowercase per the design system.
    expect(out).toContain('status:         verified');
    // Per-check outcomes use the literal token "ok".
    expect(out).toMatch(/chain:\s+ok\b/);
    expect(out).toMatch(/canonical_hash:\s+ok\b/);
    expect(out).toMatch(/bundle_hash:\s+ok\b/);
  });

  it('full sha256 hashes render lowercase and unmodified', async () => {
    const { calls, restore } = captureStdout();
    await runReplay({ cwd: workspaceRoot, runId, noColor: true });
    restore();
    const out = calls.join('');
    // Find the two standalone hashes in the metadata block.
    const matches = out.match(/\b[0-9a-f]{64}\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // No uppercase hex.
    expect(out.match(/\b[0-9A-F]{64}\b/)).toBeNull();
  });

  it('color output contains ANSI escapes when forced', async () => {
    const { calls, restore } = captureStdout();
    await runReplay({ cwd: workspaceRoot, runId, forceColor: true });
    restore();
    const ESC = String.fromCharCode(0x1b);
    expect(calls.join('').includes(`${ESC}[`)).toBe(true);
  });
});
