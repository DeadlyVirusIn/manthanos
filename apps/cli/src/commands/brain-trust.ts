// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain promote / demote / undo-correction` CLI commands.
// Phase 1.6 — the human-approved trust gate that activates compounding cognition.

import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import { BrainTrustError, demoteFact, promoteFact, undoCorrection } from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

interface BaseOpts {
  readonly cwd: string;
}

function approverName(): string {
  try {
    return `${userInfo().username}@${hostname()}`;
  } catch {
    return `unknown@${hostname()}`;
  }
}

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

export interface PromoteOpts extends BaseOpts {
  readonly factId: string;
  readonly targetTier?: 'T+1' | 'T+2';
  readonly note?: string;
  readonly yes?: boolean;
}

export async function runBrainPromote(opts: PromoteOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const ctx = {
      db: ws.m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      mutex: new AsyncMutex(),
    };

    // Show the fact + ask for confirmation unless --yes.
    const fact = ws.m.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence, provenance_workflow_id
         FROM semantic_facts WHERE workspace_id = ? AND id = ?`,
      )
      .get(ws.workspaceId, opts.factId) as
      | {
          id: string;
          area: string;
          statement: string;
          tier: string;
          confidence: number;
          provenance_workflow_id: string | null;
        }
      | undefined;
    if (!fact) {
      process.stderr.write(`manthan brain promote: fact not found: ${opts.factId}\n`);
      return 3;
    }
    const target = opts.targetTier ?? defaultUpTier(fact.tier);
    process.stdout.write('Promoting fact:\n');
    process.stdout.write(`  id:         ${fact.id}\n`);
    process.stdout.write(`  area:       ${fact.area}\n`);
    process.stdout.write(`  statement:  ${fact.statement}\n`);
    process.stdout.write(
      `  transition: ${fact.tier} (conf=${fact.confidence.toFixed(2)}) → ${target}\n`,
    );
    if (fact.provenance_workflow_id) {
      process.stdout.write(`  provenance: ${fact.provenance_workflow_id}\n`);
    }
    if (!opts.yes && !(await confirmYes())) {
      process.stdout.write('aborted (use --yes to skip prompt)\n');
      return 4;
    }

    const result = await promoteFact({
      ctx,
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      factId: opts.factId,
      targetTier: opts.targetTier,
      approver: approverName(),
      note: opts.note,
    });

    process.stdout.write(
      `\n✓ promoted ${result.fromTier} → ${result.toTier} ` +
        `(conf ${result.fromConfidence.toFixed(2)} → ${result.toConfidence.toFixed(2)}); ` +
        `audit_seq=${result.auditSeq}\n`,
    );
    process.stdout.write(`  undo with: manthan brain undo-correction ${result.auditSeq}\n`);
    return 0;
  } catch (err) {
    if (err instanceof BrainTrustError) {
      process.stderr.write(`manthan brain promote: ${err.code}: ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    ws.m.close();
  }
}

export interface DemoteOpts extends BaseOpts {
  readonly factId: string;
  readonly targetTier?: 'T0' | 'T-1' | 'T-2';
  readonly reason: string;
  readonly yes?: boolean;
}

export async function runBrainDemote(opts: DemoteOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const ctx = {
      db: ws.m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      mutex: new AsyncMutex(),
    };
    const fact = ws.m.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence
         FROM semantic_facts WHERE workspace_id = ? AND id = ?`,
      )
      .get(ws.workspaceId, opts.factId) as
      | { id: string; area: string; statement: string; tier: string; confidence: number }
      | undefined;
    if (!fact) {
      process.stderr.write(`manthan brain demote: fact not found: ${opts.factId}\n`);
      return 3;
    }
    const target = opts.targetTier ?? defaultDownTier(fact.tier);
    process.stdout.write('Demoting fact:\n');
    process.stdout.write(`  id:         ${fact.id}\n`);
    process.stdout.write(`  statement:  ${fact.statement}\n`);
    process.stdout.write(`  transition: ${fact.tier} → ${target}\n`);
    process.stdout.write(`  reason:     ${opts.reason}\n`);
    if (!opts.yes && !(await confirmYes())) {
      process.stdout.write('aborted (use --yes to skip prompt)\n');
      return 4;
    }

    const result = await demoteFact({
      ctx,
      db: ws.m.handle,
      workspaceId: ws.workspaceId,
      factId: opts.factId,
      targetTier: opts.targetTier,
      approver: approverName(),
      reason: opts.reason,
    });
    process.stdout.write(
      `\n✓ demoted ${result.fromTier} → ${result.toTier}; audit_seq=${result.auditSeq}\n`,
    );
    process.stdout.write(`  undo with: manthan brain undo-correction ${result.auditSeq}\n`);
    return 0;
  } catch (err) {
    if (err instanceof BrainTrustError) {
      process.stderr.write(`manthan brain demote: ${err.code}: ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    ws.m.close();
  }
}

export interface UndoOpts extends BaseOpts {
  readonly auditSeq: number;
  readonly yes?: boolean;
}

export async function runBrainUndo(opts: UndoOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const ctx = {
      db: ws.m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      mutex: new AsyncMutex(),
    };
    process.stdout.write(`Undoing brain.correction at seq=${opts.auditSeq}\n`);
    if (!opts.yes && !(await confirmYes())) {
      process.stdout.write('aborted (use --yes to skip prompt)\n');
      return 4;
    }

    const result = await undoCorrection({
      ctx,
      db: ws.m.handle,
      blobs: ws.blobs,
      workspaceId: ws.workspaceId,
      auditSeq: opts.auditSeq,
      approver: approverName(),
    });
    process.stdout.write(
      `\n✓ undone: fact ${result.factId} now at ${result.toTier} (was ${result.fromTier}); ` +
        `new audit_seq=${result.auditSeq}\n`,
    );
    return 0;
  } catch (err) {
    if (err instanceof BrainTrustError) {
      process.stderr.write(`manthan brain undo-correction: ${err.code}: ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    ws.m.close();
  }
}

function defaultUpTier(t: string): string {
  if (t === 'T0') return 'T+1';
  if (t === 'T+1') return 'T+2';
  return t;
}
function defaultDownTier(t: string): string {
  if (t === 'T+2') return 'T+1';
  if (t === 'T+1') return 'T0';
  if (t === 'T0') return 'T-2';
  if (t === 'T-1') return 'T-2';
  return t;
}

async function confirmYes(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive: refuse without explicit --yes to avoid silent mutation.
    process.stderr.write(
      'manthan brain: stdin is not a TTY; pass --yes to authorize this mutation explicitly\n',
    );
    return false;
  }
  process.stdout.write('Confirm? [y/N] ');
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase()));
  });
  return answer === 'y' || answer === 'yes';
}
