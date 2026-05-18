// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P0.3 Commit B: prove `manthan replay` distinguishes
//   verified / legacy / unverifiable / corrupted
// for the four verification checks (chain, blob, canonical_hash,
// bundle_hash). Each test exercises ONE failure mode, the rest of
// the artifacts intact, so the test pins exactly which check is
// supposed to catch which corruption.
//
// Corruption always wins: even if canonical_hash and chain are ok,
// a single mutated layer in layers_json must surface as `corrupted`.

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
import { getPlatform } from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPlanWorkflow } from '../src/plan-runner.js';
import { PLAN_TOOL_NAME } from '../src/plan-tool.js';
import { replayRun } from '../src/replay.js';

function makeStubAdapter(): AgentAdapter {
  const args = {
    summary: 'Replay verifier stub plan',
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

const WS = 'ws_replay_verifier';

async function setupRun(): Promise<{ workspaceRoot: string; runId: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-replay-verifier-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  const m = await openDb({ dbPath });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, workspaceRoot, new Date().toISOString());
  m.close();

  const adapter = makeStubAdapter();
  const result = await runPlanWorkflow({
    workspaceRoot,
    taskBrief: 'replay verifier test',
    adapter,
    maxUsdMicro: 10_000_000,
    contextTokenBudget: 60_000,
  });
  return { workspaceRoot, runId: result.runId };
}

describe('replay verifier', () => {
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

  it('verified — fresh run with all integrity checks passing', async () => {
    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.status).toBe('verified');
    expect(r.verification.checks.chain).toBe('ok');
    expect(r.verification.checks.canonicalHash).toBe('ok');
    expect(r.verification.checks.bundleHash).toBe('ok');
    expect(r.verification.checks.blobs.failed).toBe(0);
    expect(r.verification.failures).toHaveLength(0);
    expect(r.verification.legacy).toHaveLength(0);
    expect(r.verification.unverifiable).toHaveLength(0);
  });

  it('corrupted — mutated audit blob is detected by blob-hash check', async () => {
    // Locate the agent.invoke blob and flip a byte in its content.
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
    // Insert a junk field; preserves valid JSON but changes the hash.
    const tampered = raw.replace(/^\{/, '{"injected":"x",');
    await writeFile(blobPath, tampered, 'utf8');

    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.status).toBe('corrupted');
    expect(r.verification.failures.some((f) => f.check === 'blob')).toBe(true);
  });

  it('corrupted — mutated context_snapshots.bundle_hash is detected by bundle-hash recompute', async () => {
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    // Flip the recorded bundle_hash to a different value; recompute
    // from the (untouched) layers_json will not match.
    m.handle
      .prepare('UPDATE context_snapshots SET bundle_hash = ? WHERE workflow_id = ?')
      .run('0'.repeat(64), runId);
    m.close();

    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.status).toBe('corrupted');
    expect(r.verification.failures.some((f) => f.check === 'bundle_hash')).toBe(true);
  });

  it('corrupted — mutated layer in layers_json is detected by bundle-hash recompute', async () => {
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    const row = m.handle
      .prepare('SELECT layers_json FROM context_snapshots WHERE workflow_id = ?')
      .get(runId) as { layers_json: string };
    const parsed = JSON.parse(row.layers_json) as Array<{ content_sha256: string }>;
    // Flip one hex digit in the first layer's content_sha256.
    const first = parsed[0];
    if (!first) throw new Error('expected at least one stored layer');
    first.content_sha256 = `${first.content_sha256[0] === '0' ? '1' : '0'}${first.content_sha256.slice(1)}`;
    m.handle
      .prepare('UPDATE context_snapshots SET layers_json = ? WHERE workflow_id = ?')
      .run(JSON.stringify(parsed), runId);
    m.close();

    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.status).toBe('corrupted');
    expect(r.verification.failures.some((f) => f.check === 'bundle_hash')).toBe(true);
  });

  it('legacy — agent.invoke blob without canonical_hash field surfaces as legacy', async () => {
    // Rewrite the blob to drop canonical_hash but keep a valid blob
    // shape, then update SQLite's payload_hash row + recompute the
    // chain self_hash forward so the chain itself still verifies.
    // This isolates the canonical_hash check from the chain and blob
    // checks.
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });

    const eventRow = m.handle
      .prepare(
        `SELECT seq, payload_hash FROM audit_events
         WHERE workspace_id = ? AND action = 'agent.invoke'
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(WS) as { seq: number; payload_hash: string };
    const blobPathOriginal = path.join(
      workspaceRoot,
      '.manthan',
      'audit',
      'blobs',
      eventRow.payload_hash.slice(0, 2),
      `${eventRow.payload_hash.slice(2)}.json`,
    );
    const raw = await readFile(blobPathOriginal, 'utf8');
    const rawParsed = JSON.parse(raw) as Record<string, unknown>;
    const { canonical_hash: _droppedForLegacyTest, ...parsed } = rawParsed;
    void _droppedForLegacyTest;

    // Rehash the new blob, write it, update payload_hash in
    // audit_events, then re-derive all subsequent self_hash values so
    // verifyChain still returns ok.
    const { JsonCanon } = await import('@manthanos/adapters-sdk');
    const { computeSelfHash, sha256Hex } = await import('@manthanos/safety');

    const newCanonical = JsonCanon.stringify(parsed);
    const newHash = sha256Hex(newCanonical);
    const newBlobPath = path.join(
      workspaceRoot,
      '.manthan',
      'audit',
      'blobs',
      newHash.slice(0, 2),
      `${newHash.slice(2)}.json`,
    );
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(newBlobPath), { recursive: true });
    await writeFile(newBlobPath, newCanonical, 'utf8');

    // Update the event's payload_hash. Then recompute self_hash for
    // this event and every subsequent event in the workspace.
    m.handle
      .prepare('UPDATE audit_events SET payload_hash = ? WHERE workspace_id = ? AND seq = ?')
      .run(newHash, WS, eventRow.seq);

    const rows = m.handle
      .prepare(
        `SELECT workspace_id, seq, ts, actor, action, kind, payload_hash, decision, prev_hash, self_hash
         FROM audit_events WHERE workspace_id = ? ORDER BY seq ASC`,
      )
      .all(WS) as Array<{
      workspace_id: string;
      seq: number;
      ts: string;
      actor: string;
      action: string;
      kind: string;
      payload_hash: string | null;
      decision: 'human-approved' | 'auto-approve';
      prev_hash: string | null;
      self_hash: string;
    }>;

    let prevHash: string | null = null;
    for (const r of rows) {
      if (r.seq < eventRow.seq) {
        prevHash = r.self_hash;
        continue;
      }
      const newSelfHash = computeSelfHash(prevHash, {
        workspace_id: r.workspace_id,
        seq: r.seq,
        ts: r.ts,
        actor: r.actor,
        action: r.action,
        kind: r.kind,
        payload_hash: r.payload_hash,
        decision: r.decision,
      });
      m.handle
        .prepare(
          'UPDATE audit_events SET prev_hash = ?, self_hash = ? WHERE workspace_id = ? AND seq = ?',
        )
        .run(prevHash, newSelfHash, WS, r.seq);
      prevHash = newSelfHash;
    }
    m.close();

    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.checks.chain).toBe('ok');
    expect(r.verification.checks.canonicalHash).toBe('legacy');
    expect(r.verification.status).toBe('legacy');
    expect(r.verification.legacy.some((l) => l.check === 'canonical_hash')).toBe(true);
  });

  it('unverifiable — missing context_snapshots row surfaces as unverifiable for bundle_hash', async () => {
    const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    m.handle.prepare('DELETE FROM context_snapshots WHERE workflow_id = ?').run(runId);
    m.close();

    const r = await replayRun({ workspaceRoot, runId });
    expect(r.verification.checks.bundleHash).toBe('unverifiable');
    // Chain and blobs and canonical_hash are still intact, so the
    // overall status is unverifiable (no corruption, no legacy).
    expect(r.verification.status).toBe('unverifiable');
    expect(r.verification.unverifiable.some((u) => u.check === 'bundle_hash')).toBe(true);
  });
});
