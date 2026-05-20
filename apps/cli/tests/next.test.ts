// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX-2C: `manthan next` — workflow-guidance state inspector.
//
// Two test surfaces:
//   1. Pure-function tests of `formatWorkflowState` — pin the
//      exact rendered shape for every state branch, exact
//      command line wording, banned-vocabulary discipline,
//      copy-paste safety of the trailing command line.
//   2. Integration tests of `inspectWorkflowState` — exercise
//      each state via a prepared workspace; verify the
//      inspector returns the expected discriminated state.

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
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import { PLAN_TOOL_NAME, promoteFact, runPlanWorkflow } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';
import {
  type WorkflowState,
  formatWorkflowState,
  inspectWorkflowState,
} from '../src/commands/next.js';

const BANNED = [
  'recommended by ai',
  'best action',
  'smart suggestion',
  'optimal workflow',
  'intelligent routing',
  'optimal',
  'guaranteed',
  'remembered',
  'understood',
  'magical',
  'ai will',
  'ai is',
];

function render(state: WorkflowState): string {
  return formatWorkflowState(state).join('\n');
}

function trailingCommand(state: WorkflowState): string {
  const lines = formatWorkflowState(state);
  // The command line is the last non-empty line of the recommendation
  // block, indented. By UX-2B discipline, it trims to a valid shell
  // command.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (line.trim().length > 0 && line.startsWith(' ')) {
      return line.trim();
    }
  }
  return '';
}

describe('formatWorkflowState (pure)', () => {
  it('no_workspace: instructs init', () => {
    const out = render({ kind: 'no_workspace', cwd: '/tmp/example' });
    expect(out).toContain('No ManthanOS workspace here');
    expect(out).toContain('Initialize one for this project');
    expect(trailingCommand({ kind: 'no_workspace', cwd: '/x' })).toBe('manthan init');
  });

  it('workspace_row_missing: instructs init --force', () => {
    const state: WorkflowState = { kind: 'workspace_row_missing', cwd: '/tmp/example' };
    expect(render(state)).toContain('partially initialized');
    expect(trailingCommand(state)).toBe('manthan init --force');
  });

  it('recovery_not_clean (corrupted): instructs corruption inspection then doctor', () => {
    const state: WorkflowState = {
      kind: 'recovery_not_clean',
      recoveryStatus: 'corrupted',
      findingCount: 3,
    };
    const out = render(state);
    expect(out).toContain('Audit chain status: corrupted (3 findings)');
    expect(out).toContain('cat .manthan/audit-corruption.log');
    expect(out).toContain('manthan doctor');
  });

  it('recovery_not_clean (unrecoverable, single finding) uses singular wording', () => {
    const out = render({
      kind: 'recovery_not_clean',
      recoveryStatus: 'unrecoverable',
      findingCount: 1,
    });
    expect(out).toContain('Audit chain status: unrecoverable (1 finding)');
  });

  it('last_plan_failed: instructs doctor', () => {
    const state: WorkflowState = {
      kind: 'last_plan_failed',
      runId: 'wf_abc_123',
      status: 'crashed_recoverable',
    };
    const out = render(state);
    expect(out).toContain('did not finish: status=crashed_recoverable');
    expect(out).toContain('Run id: wf_abc_123');
    expect(trailingCommand(state)).toBe('manthan doctor');
  });

  it('no_plans_yet: instructs first plan run', () => {
    const state: WorkflowState = { kind: 'no_plans_yet' };
    expect(render(state)).toContain('No plans run yet');
    expect(trailingCommand(state)).toBe('manthan plan "add a README"');
  });

  it('no_plans_yet: trailing command is shell-safe (no chevrons, no placeholder syntax)', () => {
    const state: WorkflowState = { kind: 'no_plans_yet' };
    const cmd = trailingCommand(state) ?? '';
    expect(cmd).not.toContain('<');
    expect(cmd).not.toContain('>');
    // The brief must be in matched double quotes so a copy-paste runs.
    expect(cmd).toMatch(/^manthan plan "[^"]+"$/);
  });

  it('has_quarantine (N>1): instructs review', () => {
    const state: WorkflowState = {
      kind: 'has_quarantine',
      quarantineCount: 3,
      latestRunId: 'wf_abc',
    };
    const out = render(state);
    expect(out).toContain('3 new facts captured for review');
    expect(trailingCommand(state)).toBe('manthan brain review');
  });

  it('has_quarantine (N=1) uses singular wording', () => {
    const state: WorkflowState = {
      kind: 'has_quarantine',
      quarantineCount: 1,
      latestRunId: null,
    };
    expect(render(state)).toContain('1 new fact captured for review');
  });

  it('idle_with_trust: instructs another plan or facts inspection', () => {
    const state: WorkflowState = {
      kind: 'idle_with_trust',
      trustedCount: 6,
      latestRunId: 'wf_abc',
    };
    const out = render(state);
    expect(out).toContain('Workspace healthy');
    expect(out).toContain('6 trusted facts in continuity');
    expect(out).toContain('Review queue empty');
    expect(out).toContain('manthan plan');
    expect(out).toContain('manthan brain facts');
  });

  it('idle_with_trust (1 trusted) uses singular wording', () => {
    expect(
      render({
        kind: 'idle_with_trust',
        trustedCount: 1,
        latestRunId: null,
      }),
    ).toContain('1 trusted fact in continuity');
  });

  it('idle_empty_trust: instructs first plan-style call', () => {
    const state: WorkflowState = { kind: 'idle_empty_trust', latestRunId: 'wf_abc' };
    expect(render(state)).toContain('No trusted facts recorded yet');
    expect(trailingCommand(state)).toBe('manthan plan "describe the next change"');
  });

  it('idle states never print a placeholder-chevron suggestion', () => {
    // Cross-state regression check — the BATCH1 validation surfaced
    // that an operator who copy-pastes `manthan plan "<a brief>"`
    // verbatim runs the placeholder as the literal brief.
    const states: WorkflowState[] = [
      { kind: 'no_plans_yet' },
      { kind: 'idle_empty_trust', latestRunId: null },
      { kind: 'idle_with_trust', trustedCount: 1, latestRunId: null },
    ];
    for (const s of states) {
      const out = render(s);
      expect(out).not.toContain('"<');
      expect(out).not.toContain('>"');
    }
  });

  it('recent_correction_no_plans: acknowledges continuity update before any plan', () => {
    const state: WorkflowState = {
      kind: 'recent_correction_no_plans',
      correctionCount: 1,
      trustedCount: 1,
      quarantineCount: 2,
    };
    const out = render(state);
    expect(out).toContain('Continuity updated');
    expect(out).toContain('1 correction recorded');
    expect(out).toContain('1 trusted fact');
    expect(out).toContain('2 still in quarantine');
    expect(trailingCommand(state)).toBe('manthan plan "describe the next change"');
  });

  it('recent_correction_no_plans (multi-correction) uses plural wording', () => {
    const state: WorkflowState = {
      kind: 'recent_correction_no_plans',
      correctionCount: 3,
      trustedCount: 2,
      quarantineCount: 0,
    };
    const out = render(state);
    expect(out).toContain('3 corrections recorded');
    expect(out).toContain('2 trusted facts');
  });

  it('every state starts with the `manthan next` title line', () => {
    const cases: WorkflowState[] = [
      { kind: 'no_workspace', cwd: '/x' },
      { kind: 'workspace_row_missing', cwd: '/x' },
      { kind: 'recovery_not_clean', recoveryStatus: 'corrupted', findingCount: 1 },
      { kind: 'last_plan_failed', runId: 'wf_x', status: 'failed' },
      { kind: 'no_plans_yet' },
      {
        kind: 'recent_correction_no_plans',
        correctionCount: 1,
        trustedCount: 1,
        quarantineCount: 0,
      },
      { kind: 'has_quarantine', quarantineCount: 1, latestRunId: null },
      { kind: 'idle_with_trust', trustedCount: 1, latestRunId: null },
      { kind: 'idle_empty_trust', latestRunId: null },
    ];
    for (const s of cases) {
      expect(formatWorkflowState(s)[0]).toBe('manthan next');
    }
  });

  it('no banned-vocabulary / agent-flavored wording in any state', () => {
    const cases: WorkflowState[] = [
      { kind: 'no_workspace', cwd: '/x' },
      { kind: 'workspace_row_missing', cwd: '/x' },
      { kind: 'recovery_not_clean', recoveryStatus: 'corrupted', findingCount: 2 },
      { kind: 'last_plan_failed', runId: 'wf_x', status: 'failed' },
      { kind: 'no_plans_yet' },
      {
        kind: 'recent_correction_no_plans',
        correctionCount: 2,
        trustedCount: 1,
        quarantineCount: 1,
      },
      { kind: 'has_quarantine', quarantineCount: 4, latestRunId: 'wf_x' },
      { kind: 'idle_with_trust', trustedCount: 6, latestRunId: 'wf_x' },
      { kind: 'idle_empty_trust', latestRunId: 'wf_x' },
    ];
    for (const s of cases) {
      const lower = render(s).toLowerCase();
      for (const banned of BANNED) {
        expect(lower).not.toContain(banned);
      }
    }
  });

  it('trailing command lines are valid bare shell commands after trim', () => {
    const cases: WorkflowState[] = [
      { kind: 'no_workspace', cwd: '/x' },
      { kind: 'workspace_row_missing', cwd: '/x' },
      { kind: 'last_plan_failed', runId: 'wf_x', status: 'failed' },
      { kind: 'no_plans_yet' },
      {
        kind: 'recent_correction_no_plans',
        correctionCount: 1,
        trustedCount: 1,
        quarantineCount: 0,
      },
      { kind: 'has_quarantine', quarantineCount: 1, latestRunId: null },
      { kind: 'idle_with_trust', trustedCount: 1, latestRunId: null },
      { kind: 'idle_empty_trust', latestRunId: null },
    ];
    for (const s of cases) {
      const cmd = trailingCommand(s);
      // Trimmed command starts with `manthan`, `cat`, or similar —
      // no prefix junk, no leading marker, no surrounding prose.
      expect(/^[a-z]+ /.test(cmd)).toBe(true);
    }
  });

  it('output never contains ANSI escape sequences when caller sets no-color', () => {
    // formatWorkflowState renders through the render helpers, which
    // respect setColorMode. The unit test environment is not a TTY
    // and NO_COLOR-aware. Confirm the rendered text is ANSI-free.
    const out = render({
      kind: 'has_quarantine',
      quarantineCount: 3,
      latestRunId: 'wf_x',
    });
    const ESC = String.fromCharCode(0x1b);
    expect(out.includes(`${ESC}[`)).toBe(false);
  });
});

// --- Integration tests against a real workspace -------------------

const WS = 'ws_next_test';

async function setupEmpty(): Promise<{ workspaceRoot: string }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-next-'));
  const workspaceRoot = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
  return { workspaceRoot };
}

async function setupInitialized(): Promise<{ workspaceRoot: string }> {
  const { workspaceRoot } = await setupEmpty();
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

function makeStubAdapter(extractedFactsCount = 2): AgentAdapter {
  const assumptions = Array.from({ length: extractedFactsCount }, (_, i) => `assumption ${i + 1}`);
  const args = {
    summary: 'stub',
    steps: [
      {
        id: 'S1',
        description: 'noop',
        files_affected: [],
        depends_on: [],
        estimated_difficulty: 1,
      },
    ],
    assumptions,
    risks: [],
    open_questions: [],
  };
  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: 'stub',
    content: [{ type: 'tool_call', id: 't', name: PLAN_TOOL_NAME, arguments: args }],
    text: '',
    tool_calls: [{ type: 'tool_call', id: 't', name: PLAN_TOOL_NAME, arguments: args }],
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
    raw: {},
    canonical,
    latencyMs: 1,
  };
  return {
    metadata: {
      id: 'stub:next',
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

describe('inspectWorkflowState (integration)', () => {
  let workspaceRoot: string | undefined;

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = undefined;
    }
  });

  it('no_workspace when .manthan/ does not exist', async () => {
    const env = await setupEmpty();
    workspaceRoot = env.workspaceRoot;
    const state = await inspectWorkflowState({ cwd: env.workspaceRoot });
    expect(state.kind).toBe('no_workspace');
  });

  it('no_plans_yet when initialized but no workflows', async () => {
    const env = await setupInitialized();
    workspaceRoot = env.workspaceRoot;
    const state = await inspectWorkflowState({ cwd: env.workspaceRoot });
    expect(state.kind).toBe('no_plans_yet');
  });

  it('has_quarantine after a successful plan that captured assumptions', async () => {
    const env = await setupInitialized();
    workspaceRoot = env.workspaceRoot;
    await runPlanWorkflow({
      workspaceRoot: env.workspaceRoot,
      taskBrief: 'test',
      adapter: makeStubAdapter(2),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });
    const state = await inspectWorkflowState({ cwd: env.workspaceRoot });
    expect(state.kind).toBe('has_quarantine');
    if (state.kind === 'has_quarantine') {
      // Charter facts (3) live in language/project areas; only
      // non-charter T0 facts count. The two stub-generated
      // assumptions are in a non-charter area.
      expect(state.quarantineCount).toBeGreaterThanOrEqual(2);
    }
  });

  it('idle_empty_trust when latest plan had no extractable assumptions', async () => {
    const env = await setupInitialized();
    workspaceRoot = env.workspaceRoot;
    await runPlanWorkflow({
      workspaceRoot: env.workspaceRoot,
      taskBrief: 'test',
      adapter: makeStubAdapter(0), // 0 assumptions → no quarantine facts
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });
    const state = await inspectWorkflowState({ cwd: env.workspaceRoot });
    expect(state.kind).toBe('idle_empty_trust');
  });

  it('recent_correction_no_plans: brain.correction audit event before any plan', async () => {
    // Validation regression: a charter-fact promotion via
    // `manthan brain review` writes a `brain.correction` audit
    // event, but the operator may not have run any plan yet. The
    // original `no_plans_yet` state ignored these corrections; the
    // new state recognizes them. This test exercises the real
    // init → promote-charter-fact path the validation transcript
    // hit.
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'manthan-next-rcnp-'));
    const root = await getPlatform().path.canonicalizeWorkspaceRoot(tmp);
    workspaceRoot = root;
    execSync('git init -q', { cwd: root, stdio: 'ignore' });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'rcnp-fixture', type: 'module' }),
    );
    const initResult = await runInit({ cwd: root });
    expect(initResult.charterFacts).toBeGreaterThan(0);

    // Promote one charter fact (deterministic: pick the first non-
    // charter-area T0 fact would fail because charter facts ARE in
    // charter areas; the inspector's quarantine count excludes them.
    // We promote a charter fact directly — the brain.correction event
    // still fires.).
    const dbPath = path.join(root, '.manthan', 'memory', 'manthan.db');
    const jsonlPath = path.join(root, '.manthan', 'audit.log');
    const blobs = createBlobStore(path.join(root, '.manthan', 'audit', 'blobs'));
    const m = await openDb({ dbPath });
    const factRow = m.handle
      .prepare(
        `SELECT id FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0' LIMIT 1`,
      )
      .get(initResult.workspaceId) as { id: string } | undefined;
    expect(factRow).toBeDefined();
    if (!factRow) throw new Error('no charter fact found');
    try {
      const promotion = await promoteFact({
        ctx: { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() },
        db: m.handle,
        workspaceId: initResult.workspaceId,
        factId: factRow.id,
        approver: 'rcnp-test',
      });
      expect(promotion.toTier).toBe('T+1');
    } finally {
      m.close();
    }

    const state = await inspectWorkflowState({ cwd: root });
    expect(state.kind).toBe('recent_correction_no_plans');
    if (state.kind === 'recent_correction_no_plans') {
      expect(state.correctionCount).toBe(1);
      expect(state.trustedCount).toBe(1);
    }
  });

  it('idle_with_trust after a fact is promoted to T+1', async () => {
    const env = await setupInitialized();
    workspaceRoot = env.workspaceRoot;
    await runPlanWorkflow({
      workspaceRoot: env.workspaceRoot,
      taskBrief: 'test',
      adapter: makeStubAdapter(1),
      maxUsdMicro: 10_000_000,
      contextTokenBudget: 60_000,
    });
    // Promote a fact directly via SQL (skipping the brain-trust
    // wrapper to keep this test fast and deterministic).
    const dbPath = path.join(env.workspaceRoot, '.manthan', 'memory', 'manthan.db');
    const m = await openDb({ dbPath });
    m.handle
      .prepare(
        `UPDATE semantic_facts SET tier = 'T+1', confidence = 0.7
         WHERE workspace_id = ?
               AND area NOT IN ('language','project','package_manager','testing')`,
      )
      .run(WS);
    m.close();
    const state = await inspectWorkflowState({ cwd: env.workspaceRoot });
    expect(state.kind).toBe('idle_with_trust');
    if (state.kind === 'idle_with_trust') {
      expect(state.trustedCount).toBeGreaterThanOrEqual(1);
    }
  });
});
