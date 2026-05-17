// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain simulate-aging` and `manthan brain metrics` — Phase 2
// unblocking deliverables.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import {
  ALPHA_SERVICE_CORPUS,
  type AgingResult,
  type BrainMetrics,
  computeBrainMetrics,
  runAging,
  summarizeCorpus,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

async function openWorkspace(cwd: string): Promise<{
  manthanDir: string;
  workspaceId: string;
  m: Awaited<ReturnType<typeof openDb>>;
  blobs: ReturnType<typeof createBlobStore>;
  jsonlPath: string;
} | null> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    process.stderr.write('manthan brain: workspace not initialized\n');
    return null;
  }
  const m = await openDb({ dbPath });
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const jsonlPath = path.join(manthanDir, 'audit.log');
  const ws = m.handle
    .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
    .get(workspaceRoot) as { id: string } | undefined;
  if (!ws) {
    m.close();
    process.stderr.write('manthan brain: workspaces row missing\n');
    return null;
  }
  return { manthanDir, workspaceId: ws.id, m, blobs, jsonlPath };
}

export interface SimulateAgingOpts {
  readonly cwd: string;
  readonly spanWeeks: number;
  readonly seed: number;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export async function runSimulateAging(opts: SimulateAgingOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const summary = summarizeCorpus();

    process.stdout.write('manthan brain simulate-aging\n\n');
    process.stdout.write('Corpus: ALPHA_SERVICE (canonical)\n');
    process.stdout.write(`  total facts:        ${summary.total}\n`);
    process.stdout.write(`  by area:            ${JSON.stringify(summary.byArea)}\n`);
    process.stdout.write(`  by target tier:     ${JSON.stringify(summary.byTier)}\n`);
    process.stdout.write(`  paraphrase groups:  ${summary.paraphraseGroups.join('; ')}\n`);
    process.stdout.write(`  contradiction pairs:${summary.contradictionPairs.length}\n`);
    for (const c of summary.contradictionPairs) {
      process.stdout.write(`    - ${c}\n`);
    }
    process.stdout.write(`  abandoned approaches:${summary.abandonedApproaches.join(', ')}\n`);
    process.stdout.write(`  forgotten area:     ${summary.forgottenArea}\n`);
    process.stdout.write('\nSimulation params:\n');
    process.stdout.write(`  span:    ${opts.spanWeeks} weeks\n`);
    process.stdout.write(`  seed:    0x${opts.seed.toString(16)}\n`);
    process.stdout.write(`  dry-run: ${opts.dryRun}\n\n`);

    if (!opts.yes && !opts.dryRun) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'manthan brain simulate-aging: stdin not a TTY; pass --yes to authorize the write.\n',
        );
        return 3;
      }
      process.stdout.write('This will write ~150 audit events to the workspace. Continue? [y/N] ');
      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase()));
      });
      if (answer !== 'y' && answer !== 'yes') {
        process.stdout.write('aborted.\n');
        return 4;
      }
    }

    const ctx = {
      db: ws.m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      mutex: new AsyncMutex(),
    };

    const result: AgingResult = await runAging({
      ctx,
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      spanWeeks: opts.spanWeeks,
      seed: opts.seed,
      dryRun: opts.dryRun,
      corpus: ALPHA_SERVICE_CORPUS,
    });

    process.stdout.write('\n');
    process.stdout.write(opts.dryRun ? 'Dry run summary:\n' : '✓ Simulation complete.\n');
    process.stdout.write(`  facts inserted:    ${result.factsInserted}\n`);
    process.stdout.write(`  facts promoted:    ${result.factsPromoted}\n`);
    process.stdout.write(`  facts corroborated:${result.factsCorroborated}\n`);
    process.stdout.write(`  audit events:      ${result.auditEventsWritten}\n`);
    process.stdout.write(`  span:              ${result.spanDays} days\n`);
    process.stdout.write(`  first event:       ${result.firstEventTs}\n`);
    process.stdout.write(`  last event:        ${result.lastEventTs}\n`);
    if (!opts.dryRun) {
      process.stdout.write('\nInspect with: manthan brain stats / facts / metrics\n');
    }
    return 0;
  } finally {
    ws.m.close();
  }
}

export async function runMetrics(opts: { cwd: string }): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const m: BrainMetrics = computeBrainMetrics(ws.m.handle, ws.workspaceId);

    process.stdout.write('manthan brain metrics\n\n');
    process.stdout.write('Trusted layer\n');
    process.stdout.write(`  facts (T+1/T+2/T+3): ${m.trustedFacts}\n`);
    process.stdout.write(`  estimated tokens:    ${m.trustedTokensEstimated}\n`);
    if (m.trustedByArea.length > 0) {
      process.stdout.write('  by area:\n');
      for (const a of m.trustedByArea) {
        process.stdout.write(
          `    ${a.area.padEnd(10)} ${String(a.count).padStart(3)} facts  ~${a.estimatedTokens} tokens\n`,
        );
      }
    }

    process.stdout.write('\nEntropy signals\n');
    process.stdout.write(`  stale facts (>60d):  ${m.staleFacts}\n`);
    process.stdout.write(`  stale ratio:         ${(m.staleRatio * 100).toFixed(1)}%\n`);
    process.stdout.write(
      `  high-overlap pairs:  ${m.highOverlapPairs}  (coarse dup/contradiction signal)\n`,
    );

    process.stdout.write('\nUsage\n');
    process.stdout.write(`  workflows recorded:        ${m.workflowsRecorded}\n`);
    process.stdout.write(
      `  avg trusted-facts/bundle:  ${m.avgTrustedFactsPerBundle.toFixed(1)} (approx)\n`,
    );

    if (m.trustedGrowthByWeek.length > 0) {
      process.stdout.write('\nTrusted-layer growth (events per week)\n');
      for (const w of m.trustedGrowthByWeek.slice(-8)) {
        const bar = '█'.repeat(Math.min(w.added, 30));
        process.stdout.write(`  ${w.weekStart}  ${String(w.added).padStart(3)}  ${bar}\n`);
      }
      if (m.trustedGrowthByWeek.length > 8) {
        process.stdout.write(`  (showing last 8 of ${m.trustedGrowthByWeek.length} weeks)\n`);
      }
    }

    process.stdout.write('\nWindow\n');
    process.stdout.write(`  first event: ${m.windowStart || '(none)'}\n`);
    process.stdout.write(`  last event:  ${m.windowEnd || '(none)'}\n`);

    // PHASE2_THEORY.md §3 — flag the metrics that hint at entropy stress.
    const warnings: string[] = [];
    if (m.trustedFacts >= 30) {
      warnings.push(`trusted set has ${m.trustedFacts} facts — bundle bloat risk; consider dedup`);
    }
    if (m.staleRatio >= 0.3) {
      warnings.push(
        `${(m.staleRatio * 100).toFixed(0)}% of trusted facts are stale — run age-facts when shipped`,
      );
    }
    if (m.highOverlapPairs >= 3) {
      warnings.push(
        `${m.highOverlapPairs} high-overlap pairs in same area — possible duplicates or contradictions`,
      );
    }
    if (warnings.length > 0) {
      process.stdout.write('\n⚠ Entropy warnings\n');
      for (const w of warnings) process.stdout.write(`  - ${w}\n`);
    }

    return 0;
  } finally {
    ws.m.close();
  }
}
