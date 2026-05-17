// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain duplicates` (detect) and `manthan brain merge` (act) —
// Phase 2 deliverable #3.

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import {
  DedupError,
  type DuplicateCluster,
  findDuplicateClusters,
  mergeDuplicates,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

async function openWorkspace(cwd: string): Promise<{
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
  return { workspaceId: ws.id, m, blobs, jsonlPath };
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function renderCluster(c: DuplicateCluster, idx: number): void {
  process.stdout.write(
    `\n[cluster ${idx + 1}] area=${c.area}  facts=${c.facts.length}  ` +
      `min-jaccard=${c.minPairwiseJaccard.toFixed(2)}\n`,
  );
  for (const f of c.facts) {
    const marker = f.id === c.suggestedSurvivorId ? '★ survivor' : '  superseded';
    process.stdout.write(
      `  ${marker}  ${shortId(f.id).padEnd(13)}  ${f.tier}  conf=${f.confidence.toFixed(2)}\n`,
    );
    process.stdout.write(`                 "${f.statement}"\n`);
  }
  const supersededList = c.facts
    .filter((f) => f.id !== c.suggestedSurvivorId)
    .map((f) => f.id)
    .join(' ');
  process.stdout.write(`  → manthan brain merge ${c.suggestedSurvivorId} ${supersededList}\n`);
}

export interface DuplicatesOpts {
  readonly cwd: string;
  readonly threshold: number;
  readonly area?: string;
}

export async function runDuplicates(opts: DuplicatesOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const clusters = findDuplicateClusters({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      threshold: opts.threshold,
      area: opts.area,
    });

    process.stdout.write(
      `manthan brain duplicates  (threshold=${opts.threshold}${opts.area ? `, area=${opts.area}` : ''})\n`,
    );
    if (clusters.length === 0) {
      process.stdout.write('\nNo duplicate clusters detected.\n');
      return 0;
    }
    process.stdout.write(`\n${clusters.length} cluster(s) found — review each before merging.\n`);
    clusters.forEach((c, i) => renderCluster(c, i));

    process.stdout.write(
      '\nNotes:\n' +
        '  - Detection uses Jaccard similarity over meaningful tokens (same area only).\n' +
        '  - Each merge is human-gated; run the suggested command above to act on a cluster.\n' +
        '  - Lowering --threshold catches looser paraphrases at the cost of more false positives.\n',
    );
    return 0;
  } finally {
    ws.m.close();
  }
}

export interface MergeOpts {
  readonly cwd: string;
  readonly survivorId: string;
  readonly supersededIds: ReadonlyArray<string>;
  readonly note?: string;
  readonly yes: boolean;
}

export async function runMerge(opts: MergeOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'manthan brain merge: stdin not a TTY; pass --yes to authorize the write.\n',
        );
        return 3;
      }
      process.stdout.write(
        `About to demote ${opts.supersededIds.length} fact(s) to T-2 in favour of ${opts.survivorId}.\n`,
      );
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

    try {
      const result = await mergeDuplicates({
        ctx,
        db: ws.m.handle,
        workspaceId: ws.workspaceId,
        survivorId: opts.survivorId,
        supersededIds: opts.supersededIds,
        approver: os.userInfo().username || 'cli',
        note: opts.note,
      });
      process.stdout.write('\n✓ Dedup merge recorded.\n');
      process.stdout.write(`  audit_seq:        ${result.auditSeq}\n`);
      process.stdout.write(`  survivor:         ${result.survivorId}\n`);
      process.stdout.write(`  superseded:       ${result.supersededIds.length} fact(s)\n`);
      for (const id of result.supersededIds) {
        const prevTier = result.previousTiers[id] ?? '?';
        process.stdout.write(`    ${id}  (${prevTier} → T-2)\n`);
      }
      process.stdout.write(
        '\nThe superseded facts remain in the database for audit/replay but are filtered\n' +
          'from the trusted bundle. Inspect with: manthan brain facts --tier T-2\n',
      );
      return 0;
    } catch (err) {
      if (err instanceof DedupError) {
        process.stderr.write(`manthan brain merge: ${err.message}\n`);
        return 5;
      }
      throw err;
    }
  } finally {
    ws.m.close();
  }
}
