// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain age-facts` — Phase 2 deliverable #4 (decay).

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import {
  type DecayCandidate,
  type DecayPlan,
  type DecayProfile,
  planDecay,
  runDecay,
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

function actionLabel(c: DecayCandidate): string {
  switch (c.action) {
    case 'confidence_reduce':
      return `reduce conf  ${c.fromConfidence.toFixed(2)} → ${c.toConfidence.toFixed(2)}`;
    case 'tier_demote':
      return `demote       ${c.fromTier} → ${c.toTier}`;
    case 'archive':
      return `archive      ${c.fromTier} → T-2`;
    case 'none':
      return c.band === 'fresh' ? 'fresh' : `warn (no-op, band=${c.band})`;
  }
}

function renderPlan(plan: DecayPlan, header: string): void {
  process.stdout.write(`${header}\n\n`);
  process.stdout.write(
    `Profile: ${plan.profile}  (warn=${plan.windows.warn}d, demote=${plan.windows.demote}d, archive=${plan.windows.archive}d)\n`,
  );
  process.stdout.write(`As-of:   ${plan.asOf}\n`);
  if (plan.area) process.stdout.write(`Area:    ${plan.area}\n`);
  process.stdout.write(`Scanned: ${plan.scanned} facts in tiers T+3/T+2/T+1/T0\n`);

  process.stdout.write('\nSummary\n');
  process.stdout.write(`  no change:           ${plan.summary.noChange}\n`);
  process.stdout.write(`  warned (no-op):      ${plan.summary.warned}\n`);
  process.stdout.write(`  confidence-reduced:  ${plan.summary.confidenceReduced}\n`);
  process.stdout.write(`  tier-demoted:        ${plan.summary.demoted}\n`);
  process.stdout.write(`  archived (→ T-2):    ${plan.summary.archived}\n`);

  const beforeTokens = plan.trustedTokensBefore;
  const afterTokens = plan.trustedTokensAfter;
  const delta = afterTokens - beforeTokens;
  process.stdout.write('\nTrusted-bundle impact\n');
  process.stdout.write(`  trusted tokens before: ${beforeTokens}\n`);
  process.stdout.write(
    `  trusted tokens after:  ${afterTokens}  (${delta >= 0 ? '+' : ''}${delta})\n`,
  );

  if (plan.byArea.length > 0) {
    process.stdout.write('\nBy area (touched / total scanned)\n');
    for (const a of plan.byArea) {
      process.stdout.write(`  ${a.area.padEnd(10)} ${a.touched} / ${a.ofTotal}\n`);
    }
  }

  const actionable = plan.candidates.filter((c) => c.action !== 'none');
  if (actionable.length > 0) {
    process.stdout.write('\nTop candidates (oldest first)\n');
    for (const c of actionable.slice(0, 15)) {
      process.stdout.write(
        `  ${shortId(c.factId).padEnd(13)} ${c.area.padEnd(8)} age=${String(c.ageDays).padStart(5)}d  ${actionLabel(c)}\n`,
      );
      process.stdout.write(`                  "${c.statement}"\n`);
    }
    if (actionable.length > 15) {
      process.stdout.write(`  … and ${actionable.length - 15} more.\n`);
    }
  }
}

export interface AgeFactsOpts {
  readonly cwd: string;
  readonly profile: DecayProfile;
  readonly area?: string;
  readonly asOf?: Date;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export async function runAgeFacts(opts: AgeFactsOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const plan = planDecay({
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      profile: opts.profile,
      area: opts.area,
      asOf: opts.asOf,
    });

    renderPlan(plan, `manthan brain age-facts  (${opts.dryRun ? 'DRY RUN' : 'plan preview'})`);

    const actionable = plan.candidates.filter((c) => c.action !== 'none').length;

    if (opts.dryRun) {
      process.stdout.write('\nDry run — no audit events written.\n');
      process.stdout.write('Re-run without --dry-run to apply.\n');
      return 0;
    }

    if (actionable === 0) {
      process.stdout.write('\nNo actions needed — every fact is fresh under this profile.\n');
      return 0;
    }

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          '\nmanthan brain age-facts: stdin not a TTY; pass --yes to authorize the write.\n',
        );
        return 3;
      }
      process.stdout.write(`\nAbout to write ${actionable} audit event(s). Continue? [y/N] `);
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
    const result = await runDecay({
      ctx,
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      profile: opts.profile,
      area: opts.area,
      asOf: opts.asOf,
      approver: os.userInfo().username || 'cli',
    });

    process.stdout.write('\n✓ Decay pass complete.\n');
    process.stdout.write(`  audit events written: ${result.auditEventsWritten}\n`);
    process.stdout.write(
      `  trusted tokens:       ${plan.trustedTokensBefore} → ${plan.trustedTokensAfter}\n`,
    );
    process.stdout.write('\nVerify chain integrity with: manthan doctor\n');
    return 0;
  } finally {
    ws.m.close();
  }
}
