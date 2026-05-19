// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan plan "<brief>"` — runs the built-in plan workflow against Claude.

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  type ClaudePresetId,
  createClaudeAdapter,
  presetToConfig as presetToConfigApi,
} from '@manthanos/adapter-claude';
import {
  type ClaudeCliPresetId,
  createClaudeCliAdapter,
  presetToConfig as presetToConfigCli,
} from '@manthanos/adapter-claude-cli';
import { createCodexCliAdapter } from '@manthanos/adapter-codex-cli';
import { createGeminiCliAdapter } from '@manthanos/adapter-gemini-cli';
import type { AgentAdapter } from '@manthanos/adapters-sdk';
import { openDb } from '@manthanos/memory';
import {
  type PhaseEvent,
  RunPlanError,
  type RunPlanResult,
  runPlanWorkflow,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';
import { resolveAuth } from '../auth-store.js';

export type PlanAdapterMode = 'api' | 'cli' | 'codex-cli' | 'gemini-cli';

export interface PlanOptions {
  readonly cwd: string;
  readonly taskBrief: string;
  readonly model: ClaudePresetId | ClaudeCliPresetId;
  /** Which Claude path to use. Defaults to CLI (subscription); API requires ANTHROPIC_API_KEY. */
  readonly adapterMode: PlanAdapterMode;
  readonly maxUsdMicro?: number;
  readonly maxOutputTokens?: number;
  readonly contextTokenBudget?: number;
  readonly explicitFiles?: readonly string[];
  readonly includeQuarantine?: boolean;
  /**
   * When true, print the trusted facts (T+1/T+2/T+3) that will be
   * injected into the system prompt, before the LLM call runs.
   */
  readonly showTrusted?: boolean;
}

/**
 * Print the trusted facts that will appear in this plan's bundle.
 * Reads directly from the workspace DB so the user sees the injected
 * content before the LLM call burns quota.
 */
async function printTrustedFactsPreview(cwd: string): Promise<void> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    process.stdout.write(
      'Trusted facts entering this prompt: (workspace not initialized — run `manthan init`)\n\n',
    );
    return;
  }
  const m = await openDb({ dbPath });
  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) {
      process.stdout.write(
        'Trusted facts entering this prompt: (workspaces row missing — re-run `manthan init`)\n\n',
      );
      return;
    }
    const rows = m.handle
      .prepare(
        `SELECT area, statement, tier, confidence FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')
         ORDER BY
           CASE tier WHEN 'T+3' THEN 1 WHEN 'T+2' THEN 2 ELSE 3 END,
           area ASC, statement ASC`,
      )
      .all(ws.id) as Array<{
      area: string;
      statement: string;
      tier: string;
      confidence: number;
    }>;
    process.stdout.write(`Trusted facts entering this prompt (${rows.length}):\n`);
    if (rows.length === 0) {
      process.stdout.write('  (none — promote facts after the run to see them next time)\n');
    } else {
      for (const r of rows) {
        process.stdout.write(
          `  [${r.tier} · ${r.area} · conf=${r.confidence.toFixed(2)}] ${r.statement}\n`,
        );
      }
    }
    process.stdout.write('\n');
  } finally {
    m.close();
  }
}

export async function runPlan(opts: PlanOptions): Promise<number> {
  let adapter: AgentAdapter;
  if (opts.adapterMode === 'api') {
    const auth = await resolveAuth(opts.cwd);
    if (!auth) {
      process.stderr.write(
        'manthan plan --adapter=api: ANTHROPIC_API_KEY not configured. ' +
          'Either set it (manthan auth --set global) or use the CLI adapter (drop --adapter=api).\n',
      );
      return 1;
    }
    adapter = createClaudeAdapter(
      presetToConfigApi(opts.model as ClaudePresetId, auth.apiKey, {
        recommendedFor: ['architecture', 'implementation'],
      }),
    );
  } else if (opts.adapterMode === 'codex-cli') {
    adapter = createCodexCliAdapter();
  } else if (opts.adapterMode === 'gemini-cli') {
    adapter = createGeminiCliAdapter();
  } else {
    adapter = createClaudeCliAdapter(
      presetToConfigCli(opts.model as ClaudeCliPresetId, {
        recommendedFor: ['architecture', 'implementation'],
      }),
    );
  }

  const ac = new AbortController();
  // Forward SIGINT cancellation to the adapter.
  const handleSigint = () => ac.abort();
  process.on('SIGINT', handleSigint);

  try {
    process.stdout.write(`manthan plan — adapter=${adapter.metadata.id}\n`);
    process.stdout.write(`  budget: $${((opts.maxUsdMicro ?? 100_000) / 1_000_000).toFixed(4)}\n`);
    process.stdout.write(`  brief:  ${opts.taskBrief}\n\n`);

    if (opts.showTrusted) {
      await printTrustedFactsPreview(opts.cwd);
    }

    const result = await runPlanWorkflow({
      workspaceRoot: opts.cwd,
      taskBrief: opts.taskBrief,
      adapter,
      maxUsdMicro: opts.maxUsdMicro,
      maxOutputTokens: opts.maxOutputTokens,
      contextTokenBudget: opts.contextTokenBudget,
      explicitFiles: opts.explicitFiles,
      includeQuarantine: opts.includeQuarantine,
      abortSignal: ac.signal,
      onPhase: (event) => {
        for (const line of formatPhaseEvent(event)) {
          process.stdout.write(`${line}\n`);
        }
      },
    });

    if (result.gitHooksWarning) {
      process.stdout.write(`⚠ ${result.gitHooksWarning}\n\n`);
    }

    if (result.plan) {
      process.stdout.write('## Plan\n\n');
      process.stdout.write(`**Summary:** ${result.plan.summary}\n\n`);
      if (result.plan.steps.length > 0) {
        process.stdout.write('**Steps:**\n');
        for (const s of result.plan.steps) {
          process.stdout.write(`  ${s.id}. (D${s.estimated_difficulty}) ${s.description}\n`);
          if (s.files_affected.length > 0) {
            process.stdout.write(`     files: ${s.files_affected.join(', ')}\n`);
          }
          if (s.depends_on.length > 0) {
            process.stdout.write(`     depends_on: ${s.depends_on.join(', ')}\n`);
          }
        }
        process.stdout.write('\n');
      }
      if (result.plan.risks.length > 0) {
        process.stdout.write('**Risks:**\n');
        for (const r of result.plan.risks) {
          process.stdout.write(`  - [S${r.severity}] ${r.description}\n`);
          if (r.mitigation) process.stdout.write(`    mitigation: ${r.mitigation}\n`);
        }
        process.stdout.write('\n');
      }
      if (result.plan.assumptions.length > 0) {
        process.stdout.write('**Assumptions:**\n');
        for (const a of result.plan.assumptions) {
          process.stdout.write(`  - ${a}\n`);
        }
        process.stdout.write('\n');
      }
      if (result.plan.open_questions.length > 0) {
        process.stdout.write('**Open questions:**\n');
        for (const q of result.plan.open_questions) {
          process.stdout.write(`  - ${q}\n`);
        }
        process.stdout.write('\n');
      }
    } else {
      process.stdout.write('## Plan (unparsed)\n\n');
      process.stdout.write(`⚠ Plan output could not be parsed: ${result.planParseError}\n\n`);
      process.stdout.write('--- raw response ---\n');
      process.stdout.write(result.rawText);
      process.stdout.write('\n--- end ---\n\n');
    }

    process.stdout.write('## Run summary\n');
    process.stdout.write(`  run_id:       ${result.runId}\n`);
    process.stdout.write(`  bundle_hash:  ${result.bundleHash.slice(0, 16)}…\n`);
    process.stdout.write(`  extract:      ${result.extractMethod}\n`);
    process.stdout.write(
      `  tokens:       in=${result.usage.inputTokens} out=${result.usage.outputTokens}\n`,
    );
    process.stdout.write(
      `  cost:         $${(result.usage.usdMicro / 1_000_000).toFixed(6)} (${result.usage.usdMicro} micro)\n`,
    );
    process.stdout.write(`  finish:       ${result.finishReason}\n`);
    process.stdout.write(`  elapsed:      ${result.elapsedMs}ms\n`);
    process.stdout.write(`  audit:        seq=${result.auditSeqStart}..${result.auditSeqEnd}\n`);
    process.stdout.write(
      `  compound:     open_issues=${result.compound.openIssuesCreated} facts=${result.compound.factsQuarantined} (T0)\n`,
    );
    if (result.redacted.length > 0) {
      process.stdout.write(
        `  redactions:   ${result.redacted.map((r) => `${r.pattern}×${r.count}`).join(', ')}\n`,
      );
    }

    // P1.6: post-plan continuity summary. Two calm, technical lines
    // so the operator can see at a glance that ManthanOS actually
    // injected and recorded continuity for this run.
    process.stdout.write('\n');
    for (const line of formatPlanSummary(result)) {
      process.stdout.write(`${line}\n`);
    }

    // UX-2D first-session guided flow: if this was the first plan
    // in the workspace, add a calm context block that explains the
    // quarantine concept and points at brain review in task-oriented
    // language. Detection is deterministic — a single `COUNT(*)`
    // on `workflows`. The block does not appear on subsequent plans;
    // the existing bold review nudge carries the call-to-action for
    // returning operators who already understand the pattern.
    const factsCount = result.compound?.factsQuarantined ?? 0;
    const isFirstPlanInWorkspace = await checkIsFirstPlan(opts.cwd);
    if (isFirstPlanInWorkspace) {
      process.stdout.write('\n');
      for (const line of formatFirstPlanGuidance(factsCount)) {
        process.stdout.write(`${line}\n`);
      }
    } else if (factsCount > 0) {
      // Post-plan review hint — the load-bearing UX nudge for
      // returning operators. Suppressed on the first plan because
      // the calmer first-plan guidance already explains the same
      // action without the loud rule.
      const isTty = process.stdout.isTTY;
      const bold = isTty ? '\x1b[1;33m' : '';
      const reset = isTty ? '\x1b[0m' : '';
      const rule = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
      process.stdout.write(`\n${bold}${rule}${reset}\n`);
      process.stdout.write(
        `${bold}${factsCount} fact${factsCount === 1 ? '' : 's'} captured in quarantine.${reset}\n`,
      );
      process.stdout.write('Run `manthan brain review` to promote facts you trust.\n');
      process.stdout.write(
        '  (Type `p 1 2 3` to promote facts 1-3, `s 4` to skip, `q` to commit.)\n',
      );
      process.stdout.write("Promoted facts will appear in this project's next plan.\n");
      process.stdout.write(`${bold}${rule}${reset}\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof RunPlanError) {
      process.stderr.write(`manthan plan: ${err.code}: ${err.message}\n`);
      if (err.details) {
        for (const [k, v] of Object.entries(err.details)) {
          process.stderr.write(`  ${k}: ${JSON.stringify(v)}\n`);
        }
      }
      return err.code === 'BUDGET_EXCEEDED' ? 3 : 1;
    }
    throw err;
  } finally {
    process.off('SIGINT', handleSigint);
  }
}

/**
 * Format the post-plan continuity summary as four lines.
 *
 * Returns plain text. No styling, no anthropomorphism. The lines
 * answer one question: did ManthanOS actually inject continuity
 * into this run, and where can the operator look to verify it?
 *
 * UX-2B: the replay command lives on its own indented line so that
 * a casual copy-paste of "the command at the end of the summary"
 * is unambiguous. The previous one-line form ("run logged: wf_… —
 * replay with: manthan replay wf_…") used an em-dash separator that
 * was easily mis-copied as a single command. The runId still
 * appears on its own line for readability, and the executable
 * command appears separately so an operator who picks up just the
 * indented command line gets exactly what they need.
 *
 * Exported for direct unit testing.
 */
export function formatPlanSummary(result: RunPlanResult): readonly string[] {
  const m = result.bundleMetrics;
  return [
    `[manthan] context: ${m.trustedFactsInBundle} trusted facts injected | ${m.quarantineFactsExcluded} quarantine facts excluded | ${m.omittedFactsCount} omitted`,
    `[manthan] run logged: ${result.runId}`,
    '[manthan] to replay this run, run:',
    `            manthan replay ${result.runId}`,
  ];
}

/**
 * Format a phase event as one or more `[manthan]` lines for stdout.
 *
 * Each line is plain text. Every value emitted is a real substrate
 * value — no fabricated progress, no synthetic ETAs, no
 * anthropomorphic wording. The heartbeat exists purely to make
 * elapsed time visible during the long adapter call so an operator
 * does not assume the process is hung.
 *
 * Exported for direct unit testing.
 */
export function formatPhaseEvent(event: PhaseEvent): readonly string[] {
  switch (event.kind) {
    case 'bundle_ready': {
      const costStr = `$${(event.estCostUsdMicro / 1_000_000).toFixed(4)}`;
      return [
        `[manthan] bundle ready: ${event.trustedFactsInBundle} trusted facts, ${event.quarantineFactsExcluded} quarantine excluded, ~${event.estimatedTokens} tokens, est input cost ${costStr}`,
      ];
    }
    case 'adapter_invoke_start':
      return [`[manthan] calling ${event.adapterId}...`];
    case 'adapter_invoke_heartbeat': {
      const sec = Math.round(event.elapsedMs / 1000);
      return [`[manthan] still waiting (${sec}s elapsed)`];
    }
    case 'adapter_invoke_done': {
      const sec = Math.round(event.elapsedMs / 1000);
      return [`[manthan] response received: ${event.outputTokens} tokens in ${sec}s`];
    }
    case 'extracted':
      return [
        `[manthan] extracted plan; recorded ${event.factsRecorded} new fact${event.factsRecorded === 1 ? '' : 's'} for review`,
      ];
  }
}

/**
 * Return true iff this workspace has exactly one workflow row.
 *
 * Called immediately after `runPlanWorkflow` returns, so the just-
 * finished plan is already counted. count == 1 → this was the first
 * plan in the workspace. Used by the UX-2D first-session guided
 * flow to decide whether to print the calm orientation block.
 *
 * Returns false on any missing-DB/missing-row condition so a partial
 * workspace never surprises the operator with first-session text.
 */
async function checkIsFirstPlan(cwd: string): Promise<boolean> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const dbPath = path.join(workspaceRoot, '.manthan', 'memory', 'manthan.db');
  if (!existsSync(dbPath)) return false;
  const m = await openDb({ dbPath });
  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) return false;
    const row = m.handle
      .prepare('SELECT COUNT(*) AS n FROM workflows WHERE workspace_id = ?')
      .get(ws.id) as { n: number };
    return row.n === 1;
  } finally {
    m.close();
  }
}

/**
 * Format the UX-2D first-session orientation block. Called exactly
 * once per workspace — after the very first plan run completes.
 *
 * The wording carries three pieces of context that a novice operator
 * cannot derive from the run summary alone:
 *   1. "Quarantine" is a holding area, not a rejection.
 *   2. Nothing has entered continuity yet — promotion is the
 *      operator's explicit step.
 *   3. The single literal command to take that step.
 *
 * No anthropomorphism, no progressive promises, no "magic". The
 * facts-captured count is the only dynamic value.
 *
 * Exported for direct unit testing.
 */
export function formatFirstPlanGuidance(factsCaptured: number): readonly string[] {
  if (factsCaptured === 0) {
    return [
      '[manthan] First plan complete in this workspace.',
      '          No new facts were captured for review this time. The run is recorded',
      '          and can be replayed with the command above.',
      '',
      '          Run `manthan next` at any time to see what is recommended now.',
    ];
  }
  const factWord = factsCaptured === 1 ? 'fact' : 'facts';
  const wereWas = factsCaptured === 1 ? 'was' : 'were';
  return [
    '[manthan] First plan complete in this workspace.',
    `          ${factsCaptured} ${factWord} ${wereWas} captured in quarantine (T0). Quarantine = held aside`,
    '          for your review. Nothing has been added to continuity yet.',
    '',
    '          Next step — decide which facts to keep:',
    '              manthan brain review',
    '',
    '          Facts you promote will appear in future plan bundles. Facts you',
    '          skip stay in quarantine until you choose. You can run `manthan next`',
    '          at any time to see what is recommended now.',
  ];
}
