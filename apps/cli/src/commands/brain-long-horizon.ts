// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain simulate-long-horizon` — Phase 2 operational stress test.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AsyncMutex, type BlobStore, createBlobStore, openDb } from '@manthanos/memory';
import {
  type LongHorizonResult,
  type LongHorizonSnapshot,
  runLongHorizon,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

async function openWorkspace(cwd: string): Promise<
  | {
      manthanDir: string;
      workspaceId: string;
      m: Awaited<ReturnType<typeof openDb>>;
      blobs: BlobStore;
      jsonlPath: string;
    }
  | null
> {
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

export interface LongHorizonOpts {
  readonly cwd: string;
  readonly weeks: number;
  readonly corpusCycles: number;
  readonly reviewCadenceWeeks: number;
  readonly humanAttention: number;
  readonly decayCadenceWeeks: number;
  readonly dedupCadenceWeeks: number;
  readonly seed: number;
  readonly out?: string;
  readonly yes: boolean;
}

function summarize(result: LongHorizonResult): string {
  const lines: string[] = [];
  const s = result.snapshots;
  if (s.length === 0) return 'no snapshots\n';

  const first = s[0];
  const last = s[s.length - 1];
  if (!first || !last) return 'no snapshots\n';

  const peak = (key: keyof LongHorizonSnapshot) =>
    s.reduce((m, x) => (typeof x[key] === 'number' && (x[key] as number) > m ? (x[key] as number) : m), 0);

  lines.push('Long-horizon experiment complete.\n');
  lines.push(`  duration:           ${result.weeks} weeks (${result.corpusCycles} corpus cycles)`);
  lines.push(`  simulated start:    ${result.startDate}`);
  lines.push(`  simulated end:      ${result.endDate}`);
  lines.push(`  snapshots written:  ${s.length}  → ${result.outPath}`);
  lines.push('');
  lines.push('Totals across run');
  lines.push(`  introductions:     ${result.totalIntroductions}`);
  lines.push(`  promotions:        ${result.totalPromotions}`);
  lines.push(`  decay events:      ${result.totalDecayEvents}`);
  lines.push(`  dedup merges:      ${result.totalDedupMerges}`);
  lines.push('');
  lines.push('Final state');
  lines.push(`  T0 queue:          ${last.t0Count}`);
  lines.push(`  trusted facts:     ${last.trustedCount}`);
  lines.push(`  archived (T-2):    ${last.archivedCount}`);
  lines.push(`  contradicted:      ${last.contradictedCount}`);
  lines.push(`  trusted tokens:    ${last.trustedTokens}`);
  lines.push(`  stale ratio:       ${(last.staleRatio * 100).toFixed(1)}%`);
  lines.push(`  duplicate clusters:${last.duplicateClusters}`);
  lines.push(`  oldest T0:         ${last.oldestT0AgeDays}d`);
  lines.push('');
  lines.push('Peaks');
  lines.push(`  peak T0 queue:     ${peak('t0Count')}`);
  lines.push(`  peak trusted toks: ${peak('trustedTokens')}`);
  lines.push(`  peak dup clusters: ${peak('duplicateClusters')}`);
  lines.push('');

  // Trend lines (very simple: first vs last, no curve fitting).
  const dt0 = last.t0Count - first.t0Count;
  const dTokens = last.trustedTokens - first.trustedTokens;
  const dStale = last.staleRatio - first.staleRatio;
  lines.push('Trend (first snapshot → last)');
  lines.push(`  T0 queue:          ${first.t0Count} → ${last.t0Count}  (${dt0 >= 0 ? '+' : ''}${dt0})`);
  lines.push(
    `  trusted tokens:    ${first.trustedTokens} → ${last.trustedTokens}  (${dTokens >= 0 ? '+' : ''}${dTokens})`,
  );
  lines.push(
    `  stale ratio:       ${(first.staleRatio * 100).toFixed(1)}% → ${(last.staleRatio * 100).toFixed(1)}%  (${dStale >= 0 ? '+' : ''}${(dStale * 100).toFixed(1)}pp)`,
  );

  // Equilibrium heuristic: look at the last 4 snapshots. If T0 oscillates
  // within ±15% of the median, call it equilibrium; if it's monotonically
  // increasing, call it runaway.
  const tail = s.slice(-4);
  if (tail.length === 4) {
    const t0s = tail.map((x) => x.t0Count);
    const median = [...t0s].sort((a, b) => a - b)[2] ?? 0;
    const allWithin = t0s.every((v) => Math.abs(v - median) <= Math.max(2, median * 0.15));
    const monotonicUp = t0s.every((v, i) => i === 0 || v >= (t0s[i - 1] ?? 0));
    lines.push('');
    lines.push('Equilibrium heuristic (last 4 snapshots)');
    if (allWithin) lines.push('  signal: T0 queue is within ±15% of its tail median → equilibrium-shaped');
    else if (monotonicUp) lines.push('  signal: T0 queue strictly increasing → runaway-shaped');
    else lines.push('  signal: T0 queue oscillating, not yet at equilibrium');
  }

  return `${lines.join('\n')}\n`;
}

export async function runBrainLongHorizon(opts: LongHorizonOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const out =
      opts.out ??
      path.join(
        ws.manthanDir,
        'experiments',
        `long-horizon-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
      );

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'manthan brain simulate-long-horizon: stdin not a TTY; pass --yes to authorize the write.\n',
        );
        return 3;
      }
      process.stdout.write(
        `About to run ${opts.weeks}-week long-horizon simulation against this workspace.\n`,
      );
      process.stdout.write(`Output JSONL: ${out}\n`);
      process.stdout.write('Continue? [y/N] ');
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

    process.stdout.write(`\nRunning long-horizon experiment (${opts.weeks} weeks)…\n`);
    const result = await runLongHorizon({
      ctx,
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      weeks: opts.weeks,
      corpusCycles: opts.corpusCycles,
      reviewCadenceWeeks: opts.reviewCadenceWeeks,
      humanAttentionFactor: opts.humanAttention,
      decayCadenceWeeks: opts.decayCadenceWeeks,
      dedupCadenceWeeks: opts.dedupCadenceWeeks,
      seed: opts.seed,
      outPath: out,
    });

    process.stdout.write(`\n${summarize(result)}\n`);
    process.stdout.write(`Inspect:  cat ${out} | head\n`);
    process.stdout.write(`Doctor:   manthan doctor\n`);
    process.stdout.write(`State:    manthan brain health / queue-health / token-pressure\n`);

    // Sanity: print first and last JSONL row as a quick visual check.
    try {
      const raw = readFileSync(out, 'utf8').trim().split('\n');
      if (raw.length > 0) {
        process.stdout.write(`\nFirst snapshot:  ${raw[0]?.slice(0, 200)}...\n`);
        if (raw.length > 1)
          process.stdout.write(`Last snapshot:   ${raw[raw.length - 1]?.slice(0, 200)}...\n`);
      }
    } catch {
      // ignore — the file may be missing if the run crashed mid-way
    }

    return 0;
  } finally {
    ws.m.close();
  }
}
