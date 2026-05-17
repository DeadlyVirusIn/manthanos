// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan experiments cpt-probe` — Phase 3 measurement harness.
//
// Runs the same task brief against multiple workspaces, captures bundle
// shape + LLM output (or just bundle in --dry-run), computes objective
// shared-vocabulary metrics, and writes a side-by-side comparison.
//
// This harness produces SIGNAL, not SCORES. The qualitative judgment
// belongs in the rubric pass that a human performs after reading the
// captured outputs. See docs/PHASE3_CPT.md §7.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type ClaudeCliPresetId,
  createClaudeCliAdapter,
  presetToConfig as presetToConfigCli,
} from '@manthanos/adapter-claude-cli';
import {
  type OpenAIPresetId,
  createOpenAIAdapter,
  presetToConfig as presetToConfigOpenAI,
} from '@manthanos/adapter-openai';
import type { AgentAdapter } from '@manthanos/adapters-sdk';
import { pack } from '@manthanos/context';
import { openDb } from '@manthanos/memory';
import { type RunPlanResult, runPlanWorkflow } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

interface WorkspaceFacts {
  trusted: Array<{
    id: string;
    area: string;
    statement: string;
    tier: 'T+1' | 'T+2' | 'T+3';
    confidence: number;
    provenanceWorkflowId: string | null;
  }>;
  quarantine: Array<{
    id: string;
    area: string;
    statement: string;
    confidence: number;
    provenanceWorkflowId: string | null;
  }>;
  charter: Array<{ area: string; statement: string; tier: string }>;
  decisions: Array<{
    area: string;
    summary: string;
    rationale: string;
    signed_at: string | null;
  }>;
  archivedStatements: Array<{ id: string; area: string; statement: string; tier: 'T-1' | 'T-2' }>;
  workspaceId: string;
  workspaceRoot: string;
}

async function loadWorkspaceFacts(cwd: string): Promise<WorkspaceFacts | null> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) return null;
  const m = await openDb({ dbPath });
  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) return null;
    const workspaceId = ws.id;

    const trustedRows = m.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence, provenance_workflow_id
         FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')
         ORDER BY area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{
      id: string;
      area: string;
      statement: string;
      tier: 'T+1' | 'T+2' | 'T+3';
      confidence: number;
      provenance_workflow_id: string | null;
    }>;
    const quarantineRows = m.handle
      .prepare(
        `SELECT id, area, statement, confidence, provenance_workflow_id
         FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
              AND area NOT IN ('language','project','package_manager','testing')
         ORDER BY area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{
      id: string;
      area: string;
      statement: string;
      confidence: number;
      provenance_workflow_id: string | null;
    }>;
    const charterRows = m.handle
      .prepare(
        `SELECT area, statement, tier FROM semantic_facts
         WHERE workspace_id = ? AND area IN ('language','project','package_manager','testing')
         ORDER BY area ASC, statement ASC`,
      )
      .all(workspaceId) as Array<{ area: string; statement: string; tier: string }>;
    const decisionRows = m.handle
      .prepare(
        `SELECT area, summary, rationale, signed_at FROM decisions
         WHERE workspace_id = ? ORDER BY signed_at DESC NULLS LAST, summary ASC LIMIT 20`,
      )
      .all(workspaceId) as Array<{
      area: string;
      summary: string;
      rationale: string;
      signed_at: string | null;
    }>;
    const archivedRows = m.handle
      .prepare(
        `SELECT id, area, statement, tier FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T-1','T-2')`,
      )
      .all(workspaceId) as Array<{
      id: string;
      area: string;
      statement: string;
      tier: 'T-1' | 'T-2';
    }>;

    return {
      trusted: trustedRows.map((r) => ({
        id: r.id,
        area: r.area,
        statement: r.statement,
        tier: r.tier,
        confidence: r.confidence,
        provenanceWorkflowId: r.provenance_workflow_id,
      })),
      quarantine: quarantineRows.map((r) => ({
        id: r.id,
        area: r.area,
        statement: r.statement,
        confidence: r.confidence,
        provenanceWorkflowId: r.provenance_workflow_id,
      })),
      charter: charterRows,
      decisions: decisionRows,
      archivedStatements: archivedRows,
      workspaceId,
      workspaceRoot,
    };
  } finally {
    m.close();
  }
}

// --------------------------------------------------------------------------
// Objective metrics — shared vocabulary, NOT quality scores.
// --------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'be',
  'in',
  'of',
  'and',
  'to',
  'for',
  'with',
  'on',
  'as',
  'at',
  'by',
  'from',
  'or',
  'we',
  'our',
  'this',
  'that',
  'use',
  'used',
  'using',
  'will',
  'can',
  'no',
  'not',
  'all',
  'any',
  'should',
  'must',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'it',
  'its',
  'their',
  'there',
]);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text
    .toLowerCase()
    .split(/[^a-z0-9_/.-]+/)
    .filter((s) => s.length >= 3 && !STOPWORDS.has(s))) {
    out.add(t);
  }
  return out;
}

interface FactReferenceSignal {
  factId: string;
  area: string;
  tier: string;
  statement: string;
  sharedTokenCount: number;
  factTokenCount: number;
  overlapRatio: number;
}

function computeFactReferences(
  factList: Array<{ id: string; area: string; statement: string; tier: string }>,
  outputText: string,
  minSharedTokens: number,
): FactReferenceSignal[] {
  const outTokens = tokens(outputText);
  const signals: FactReferenceSignal[] = [];
  for (const f of factList) {
    const factTokens = tokens(f.statement);
    let shared = 0;
    for (const t of factTokens) if (outTokens.has(t)) shared += 1;
    if (shared >= minSharedTokens) {
      signals.push({
        factId: f.id,
        area: f.area,
        tier: f.tier,
        statement: f.statement,
        sharedTokenCount: shared,
        factTokenCount: factTokens.size,
        overlapRatio: factTokens.size === 0 ? 0 : shared / factTokens.size,
      });
    }
  }
  return signals.sort((a, b) => b.overlapRatio - a.overlapRatio);
}

interface ObjectiveMetrics {
  promptTokens: number;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  trustedFactsAvailable: number;
  trustedFactsReferenced: number;
  trustedReferenceSignals: FactReferenceSignal[];
  areasInBrain: string[];
  areasReferencedInOutput: string[];
  archivedFactsEchoed: FactReferenceSignal[];
  outputCharCount: number | null;
}

function computeObjectiveMetrics(
  facts: WorkspaceFacts,
  promptTokens: number,
  outputText: string | null,
  outputTokens: number | null,
  costUsd: number | null,
): ObjectiveMetrics {
  const outputLen = outputText?.length ?? null;

  const trustedSignals =
    outputText === null
      ? []
      : computeFactReferences(
          facts.trusted.map((f) => ({
            id: f.id,
            area: f.area,
            statement: f.statement,
            tier: f.tier,
          })),
          outputText,
          4,
        );

  const archivedSignals =
    outputText === null ? [] : computeFactReferences(facts.archivedStatements, outputText, 4);

  const brainAreas = new Set<string>();
  for (const f of facts.trusted) brainAreas.add(f.area);
  for (const f of facts.charter) brainAreas.add(f.area);

  const areasReferenced: string[] = [];
  if (outputText !== null) {
    const lower = outputText.toLowerCase();
    for (const area of brainAreas) {
      if (lower.includes(area.toLowerCase())) areasReferenced.push(area);
    }
  }

  return {
    promptTokens,
    outputTokens,
    totalTokens: outputTokens === null ? null : promptTokens + outputTokens,
    costUsd,
    trustedFactsAvailable: facts.trusted.length,
    trustedFactsReferenced: trustedSignals.length,
    trustedReferenceSignals: trustedSignals,
    areasInBrain: [...brainAreas].sort(),
    areasReferencedInOutput: areasReferenced.sort(),
    archivedFactsEchoed: archivedSignals,
    outputCharCount: outputLen,
  };
}

// --------------------------------------------------------------------------
// Capture format
// --------------------------------------------------------------------------

interface RunCapture {
  workspacePath: string;
  workspaceLabel: string;
  workspaceRoot: string;
  workspaceId: string;
  mode: 'dry-run' | 'live';
  brief: string;
  bundleHash: string;
  bundleTotalTokens: number;
  bundleTrustedTokens: number;
  bundleQuarantineFactsInBundle: number;
  bundleOmittedFacts: number;
  trustedFactsAvailable: number;
  brainTierCounts: Record<string, number>;
  // Only set for live runs:
  runId?: string;
  outputText?: string;
  outputTokens?: number;
  inputTokens?: number;
  costUsd?: number;
  planParsed?: unknown;
  planParseError?: string | null;
  // Objective metrics:
  metrics: ObjectiveMetrics;
  capturedAt: string;
}

function defaultLabelForPath(p: string): string {
  return path
    .basename(p)
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-');
}

// --------------------------------------------------------------------------
// Dry-run mode: pack only.
// --------------------------------------------------------------------------

async function dryRunForWorkspace(opts: {
  facts: WorkspaceFacts;
  brief: string;
  contextBudget: number;
}): Promise<{
  bundleHash: string;
  totalTokens: number;
  trustedTokens: number;
  quarantineFactsInBundle: number;
  omittedFacts: number;
}> {
  const bundle = await pack({
    workspaceRoot: opts.facts.workspaceRoot,
    taskBrief: opts.brief,
    charterFacts: opts.facts.charter,
    trustedFacts: opts.facts.trusted,
    quarantineFacts: opts.facts.quarantine.map((f) => ({ ...f, tier: 'T0' as const })),
    decisions: opts.facts.decisions,
    tokenBudget: opts.contextBudget,
    includeQuarantine: false,
  });
  return {
    bundleHash: bundle.bundleHash,
    totalTokens: bundle.totalEstimatedTokens,
    trustedTokens: bundle.metrics.trustedTokens,
    quarantineFactsInBundle: bundle.metrics.quarantineFactsInBundle,
    omittedFacts: bundle.metrics.omittedFacts.length,
  };
}

function tierCountsOf(facts: WorkspaceFacts): Record<string, number> {
  const counts: Record<string, number> = {
    'T+3': 0,
    'T+2': 0,
    'T+1': 0,
    T0: 0,
    'T-1': 0,
    'T-2': 0,
  };
  for (const f of facts.trusted) counts[f.tier] = (counts[f.tier] ?? 0) + 1;
  counts.T0 = facts.quarantine.length;
  for (const f of facts.archivedStatements) counts[f.tier] = (counts[f.tier] ?? 0) + 1;
  return counts;
}

// --------------------------------------------------------------------------
// Live run wiring.
// --------------------------------------------------------------------------

async function loadOpenAIKey(): Promise<string | null> {
  // Minimal reader for OPENAI_API_KEY — no refactor of auth-store, which
  // is Anthropic-specific. STABILIZATION §5 scope: just enough to run E6.1.
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0) {
    return process.env.OPENAI_API_KEY;
  }
  try {
    const home = process.env.HOME ?? '';
    if (!home) return null;
    const content = await readFile(`${home}/.config/manthan/api-keys.env`, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(['"]?)(.*)\1\s*$/.exec(line);
      if (m?.[2] && m[2].length > 0) return m[2];
    }
  } catch {
    /* file missing — fall through */
  }
  return null;
}

async function buildAdapter(opts: {
  adapter: 'claude-cli' | 'openai';
  model: string;
}): Promise<AgentAdapter> {
  if (opts.adapter === 'openai') {
    const apiKey = await loadOpenAIKey();
    if (!apiKey) {
      throw new Error(
        'adapter=openai: OPENAI_API_KEY not found in env or ~/.config/manthan/api-keys.env',
      );
    }
    // E6.1: single preset; model arg ignored for openai.
    return createOpenAIAdapter(
      presetToConfigOpenAI('gpt-4o' as OpenAIPresetId, apiKey, {
        recommendedFor: ['implementation', 'review'],
      }),
    );
  }
  return createClaudeCliAdapter(
    presetToConfigCli(opts.model as ClaudeCliPresetId, {
      recommendedFor: ['architecture', 'implementation'],
    }),
  );
}

async function liveRunForWorkspace(opts: {
  workspaceRoot: string;
  brief: string;
  model: string;
  adapter: 'claude-cli' | 'openai';
  maxUsdMicro: number;
  maxOutputTokens: number;
  contextTokenBudget: number;
}): Promise<RunPlanResult> {
  const adapter = await buildAdapter({ adapter: opts.adapter, model: opts.model });
  return runPlanWorkflow({
    workspaceRoot: opts.workspaceRoot,
    taskBrief: opts.brief,
    adapter,
    maxUsdMicro: opts.maxUsdMicro,
    maxOutputTokens: opts.maxOutputTokens,
    contextTokenBudget: opts.contextTokenBudget,
  });
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export interface CptProbeOpts {
  readonly cwd: string;
  readonly briefPath: string;
  readonly workspaces: ReadonlyArray<string>;
  readonly label?: string;
  readonly outDir: string;
  readonly model: string;
  readonly adapter: 'claude-cli' | 'openai';
  readonly maxUsdMicro: number;
  readonly maxOutputTokens: number;
  readonly contextTokenBudget: number;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export async function runCptProbe(opts: CptProbeOpts): Promise<number> {
  // 1. Read brief.
  const brief = (await readFile(opts.briefPath, 'utf8')).trim();
  if (brief.length === 0) {
    process.stderr.write(`manthan experiments cpt-probe: brief file is empty: ${opts.briefPath}\n`);
    return 2;
  }

  const label = opts.label ?? path.basename(opts.briefPath).replace(/\.[^.]+$/, '');
  const outBase = path.join(opts.outDir, label);
  await mkdir(outBase, { recursive: true });

  // 2. Confirmation gate for live runs.
  if (!opts.dryRun && !opts.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        'manthan experiments cpt-probe: stdin not a TTY; pass --yes to authorize the LLM calls.\n',
      );
      return 3;
    }
    process.stdout.write(`About to run ${opts.workspaces.length} live plan call(s).\n`);
    process.stdout.write(`Brief:      ${opts.briefPath}\n`);
    process.stdout.write(`Workspaces: ${opts.workspaces.join(', ')}\n`);
    process.stdout.write(`Output dir: ${outBase}\n`);
    process.stdout.write('Continue? [y/N] ');
    const answer = await new Promise<string>((resolve) => {
      process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase()));
    });
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write('aborted.\n');
      return 4;
    }
  }

  // 3. For each workspace, run.
  const captures: RunCapture[] = [];
  for (const wsPath of opts.workspaces) {
    const facts = await loadWorkspaceFacts(wsPath);
    if (!facts) {
      process.stderr.write(`  ✗ ${wsPath}: not initialized; skipping\n`);
      continue;
    }
    const wsLabel = defaultLabelForPath(wsPath);
    process.stdout.write(`\n=== ${wsLabel} (${wsPath}) ===\n`);
    process.stdout.write(
      `  brain: trusted=${facts.trusted.length}  quarantine=${facts.quarantine.length}  archived=${facts.archivedStatements.length}\n`,
    );

    if (opts.dryRun) {
      const r = await dryRunForWorkspace({
        facts,
        brief,
        contextBudget: opts.contextTokenBudget,
      });
      const metrics = computeObjectiveMetrics(facts, r.totalTokens, null, null, null);
      process.stdout.write(
        `  [dry-run] bundle_hash=${r.bundleHash.slice(0, 12)}  total_tokens=${r.totalTokens}  trusted_tokens=${r.trustedTokens}  omitted=${r.omittedFacts}\n`,
      );
      const cap: RunCapture = {
        workspacePath: wsPath,
        workspaceLabel: wsLabel,
        workspaceRoot: facts.workspaceRoot,
        workspaceId: facts.workspaceId,
        mode: 'dry-run',
        brief,
        bundleHash: r.bundleHash,
        bundleTotalTokens: r.totalTokens,
        bundleTrustedTokens: r.trustedTokens,
        bundleQuarantineFactsInBundle: r.quarantineFactsInBundle,
        bundleOmittedFacts: r.omittedFacts,
        trustedFactsAvailable: facts.trusted.length,
        brainTierCounts: tierCountsOf(facts),
        metrics,
        capturedAt: new Date().toISOString(),
      };
      captures.push(cap);
      await writeFile(path.join(outBase, `${wsLabel}.json`), `${JSON.stringify(cap, null, 2)}\n`);
    } else {
      try {
        const result = await liveRunForWorkspace({
          workspaceRoot: wsPath,
          brief,
          model: opts.model,
          adapter: opts.adapter,
          maxUsdMicro: opts.maxUsdMicro,
          maxOutputTokens: opts.maxOutputTokens,
          contextTokenBudget: opts.contextTokenBudget,
        });
        const promptTokens = result.usage.inputTokens;
        const metrics = computeObjectiveMetrics(
          facts,
          promptTokens,
          result.rawText,
          result.usage.outputTokens,
          result.usage.usdMicro / 1_000_000,
        );
        process.stdout.write(
          `  [live] run_id=${result.runId}  input=${result.usage.inputTokens}  output=${result.usage.outputTokens}  cost=$${(result.usage.usdMicro / 1_000_000).toFixed(4)}\n`,
        );
        process.stdout.write(
          `  references: trusted=${metrics.trustedFactsReferenced}/${metrics.trustedFactsAvailable}  archived_echoed=${metrics.archivedFactsEchoed.length}  areas=${metrics.areasReferencedInOutput.length}/${metrics.areasInBrain.length}\n`,
        );
        const cap: RunCapture = {
          workspacePath: wsPath,
          workspaceLabel: wsLabel,
          workspaceRoot: facts.workspaceRoot,
          workspaceId: facts.workspaceId,
          mode: 'live',
          brief,
          bundleHash: result.bundleHash,
          bundleTotalTokens: result.usage.inputTokens,
          bundleTrustedTokens: result.bundleMetrics.trustedTokens,
          bundleQuarantineFactsInBundle: result.bundleMetrics.quarantineFactsInBundle,
          bundleOmittedFacts: 0, // not exposed via runPlanWorkflow result; computed from bundle only
          trustedFactsAvailable: facts.trusted.length,
          brainTierCounts: tierCountsOf(facts),
          runId: result.runId,
          outputText: result.rawText,
          outputTokens: result.usage.outputTokens,
          inputTokens: result.usage.inputTokens,
          costUsd: result.usage.usdMicro / 1_000_000,
          planParsed: result.plan ?? null,
          planParseError: result.planParseError,
          metrics,
          capturedAt: new Date().toISOString(),
        };
        captures.push(cap);
        await writeFile(path.join(outBase, `${wsLabel}.json`), `${JSON.stringify(cap, null, 2)}\n`);
      } catch (err) {
        process.stderr.write(`  ✗ ${wsLabel}: ${(err as Error).message}\n`);
      }
    }
  }

  // 4. Write the compare artifact and print a table.
  const compare = {
    label,
    brief,
    briefPath: opts.briefPath,
    mode: opts.dryRun ? 'dry-run' : 'live',
    runs: captures,
    capturedAt: new Date().toISOString(),
  };
  await writeFile(path.join(outBase, 'compare.json'), `${JSON.stringify(compare, null, 2)}\n`);

  process.stdout.write('\n--- Comparison ---\n');
  process.stdout.write(
    `${'workspace'.padEnd(18)} ${'mode'.padEnd(9)} ${'bundle_t'.padEnd(8)} ${'trusted_t'.padEnd(9)} ${'output_t'.padEnd(8)} ${'trusted_refs'.padEnd(12)} ${'areas_ref'.padEnd(9)} ${'archived_echo'.padEnd(13)}\n`,
  );
  for (const c of captures) {
    process.stdout.write(
      `${c.workspaceLabel.padEnd(18)} ${c.mode.padEnd(9)} ${String(c.bundleTotalTokens).padEnd(8)} ${String(c.bundleTrustedTokens).padEnd(9)} ${String(c.outputTokens ?? '-').padEnd(8)} ${`${c.metrics.trustedFactsReferenced}/${c.metrics.trustedFactsAvailable}`.padEnd(12)} ${`${c.metrics.areasReferencedInOutput.length}/${c.metrics.areasInBrain.length}`.padEnd(9)} ${String(c.metrics.archivedFactsEchoed.length).padEnd(13)}\n`,
    );
  }

  process.stdout.write(`\nCaptures written to: ${outBase}\n`);
  process.stdout.write(`Compare artifact:    ${path.join(outBase, 'compare.json')}\n`);
  if (opts.dryRun) {
    process.stdout.write(
      '\nDry-run only — no LLM was called. Re-run without --dry-run (and with --yes) to execute live.\n',
    );
  } else {
    process.stdout.write(
      '\nNext: open the per-workspace JSON files side-by-side and apply the rubric in docs/PHASE3_CPT.md §7.\n',
    );
  }
  return 0;
}
