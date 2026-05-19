// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan next` — workflow-guidance state inspector.
//
// PURPOSE
//
//   Answer the operator's question "what do I do now?" by reporting
//   the current workspace state and the obvious next step. Closer in
//   spirit to `git status` than to an agent: pure substrate state
//   inspection, deterministic rules, calm wording.
//
// NOT THIS COMMAND
//
//   This command does not interpret prompts, infer semantic intent,
//   rank actions by confidence, invoke adapters, or modify state. It
//   reads workspace state and prints one of a fixed set of
//   recommendations. Same input → same output, every time.
//
// STATE INSPECTION ORDER (highest urgency first)
//
//   1. No workspace in cwd → recommend `manthan init`.
//   2. Recovery status not clean/partial → recommend audit-log
//      inspection.
//   3. Last plan run failed / stranded → recommend `manthan doctor`.
//   4. No plan runs yet → recommend running the first plan.
//   5. New quarantine facts present → recommend `manthan brain review`.
//   6. Idle workspace (queue empty, has trusted facts) → recommend
//      another plan run.
//   7. Idle workspace (queue empty, no trusted facts yet) → recommend
//      another plan run to build context.
//
// Each branch returns a single calm recommendation. The "decision" is
// the operator's; the substrate just names the obvious next move.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBlobStore, openDb, runRecovery } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { cyan, setColorMode } from '../render.js';

export interface NextOptions {
  readonly cwd: string;
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
}

export type WorkflowState =
  | { readonly kind: 'no_workspace'; readonly cwd: string }
  | { readonly kind: 'workspace_row_missing'; readonly cwd: string }
  | {
      readonly kind: 'recovery_not_clean';
      readonly recoveryStatus: 'corrupted' | 'unrecoverable';
      readonly findingCount: number;
    }
  | {
      readonly kind: 'last_plan_failed';
      readonly runId: string;
      readonly status: string;
    }
  | { readonly kind: 'no_plans_yet' }
  | {
      readonly kind: 'has_quarantine';
      readonly quarantineCount: number;
      readonly latestRunId: string | null;
    }
  | {
      readonly kind: 'idle_with_trust';
      readonly trustedCount: number;
      readonly latestRunId: string | null;
    }
  | {
      readonly kind: 'idle_empty_trust';
      readonly latestRunId: string | null;
    };

/**
 * Inspect the workspace and return a single state. Deterministic —
 * no rankings, no thresholds beyond literal counts, no model calls.
 *
 * Exported for direct unit testing against a prepared workspace.
 */
export async function inspectWorkflowState(opts: {
  cwd: string;
}): Promise<WorkflowState> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(opts.cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');

  if (!existsSync(manthanDir)) {
    return { kind: 'no_workspace', cwd: workspaceRoot };
  }

  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    return { kind: 'workspace_row_missing', cwd: workspaceRoot };
  }

  const jsonlPath = path.join(manthanDir, 'audit.log');
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const m = await openDb({ dbPath });

  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) {
      return { kind: 'workspace_row_missing', cwd: workspaceRoot };
    }
    const workspaceId = ws.id;

    // Recovery status — first thing to check. If the chain is not
    // clean/partial, every other recommendation is moot until the
    // operator inspects the corruption record.
    const recovery = await runRecovery({
      db: m.handle,
      blobs,
      jsonlPath,
      workspaceId,
    });
    if (recovery.status === 'corrupted' || recovery.status === 'unrecoverable') {
      return {
        kind: 'recovery_not_clean',
        recoveryStatus: recovery.status,
        findingCount: recovery.findings.length,
      };
    }

    // Latest workflow row.
    const latestWorkflow = m.handle
      .prepare(
        `SELECT id, status FROM workflows
         WHERE workspace_id = ?
         ORDER BY started_at DESC
         LIMIT 1`,
      )
      .get(workspaceId) as { id: string; status: string } | undefined;

    if (!latestWorkflow) {
      return { kind: 'no_plans_yet' };
    }

    if (
      latestWorkflow.status === 'failed' ||
      latestWorkflow.status === 'crashed_recoverable' ||
      latestWorkflow.status === 'running'
    ) {
      return {
        kind: 'last_plan_failed',
        runId: latestWorkflow.id,
        status: latestWorkflow.status,
      };
    }

    // Quarantine count — T0 non-charter facts (the operator's
    // review queue).
    const quarantineRow = m.handle
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier = 'T0'
               AND area NOT IN ('language','project','package_manager','testing')`,
      )
      .get(workspaceId) as { n: number };
    const quarantineCount = quarantineRow.n;

    if (quarantineCount > 0) {
      return {
        kind: 'has_quarantine',
        quarantineCount,
        latestRunId: latestWorkflow.id,
      };
    }

    // Trusted facts (T+1 or higher).
    const trustedRow = m.handle
      .prepare(
        `SELECT COUNT(*) AS n FROM semantic_facts
         WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')`,
      )
      .get(workspaceId) as { n: number };
    const trustedCount = trustedRow.n;

    if (trustedCount > 0) {
      return {
        kind: 'idle_with_trust',
        trustedCount,
        latestRunId: latestWorkflow.id,
      };
    }

    return {
      kind: 'idle_empty_trust',
      latestRunId: latestWorkflow.id,
    };
  } finally {
    m.close();
  }
}

/**
 * Render a workflow state as plain text. Each branch returns a fixed
 * shape. The command line that the operator would copy is always on
 * its own indented line (UX-2B discipline).
 *
 * Exported for direct unit testing.
 */
export function formatWorkflowState(state: WorkflowState): readonly string[] {
  const arrow = cyan('->');
  switch (state.kind) {
    case 'no_workspace':
      return [
        'manthan next',
        '',
        '  No ManthanOS workspace here.',
        '',
        `${arrow} Initialize one for this project:`,
        '            manthan init',
      ];
    case 'workspace_row_missing':
      return [
        'manthan next',
        '',
        '  Workspace partially initialized (missing internal row).',
        '',
        `${arrow} Re-initialize this workspace:`,
        '            manthan init --force',
      ];
    case 'recovery_not_clean': {
      const findingsWord = state.findingCount === 1 ? 'finding' : 'findings';
      return [
        'manthan next',
        '',
        `  Audit chain status: ${state.recoveryStatus} (${state.findingCount} ${findingsWord}).`,
        '',
        `${arrow} Inspect the corruption record:`,
        '            cat .manthan/audit-corruption.log',
        '',
        '   Then re-check workspace health:',
        '            manthan doctor',
      ];
    }
    case 'last_plan_failed':
      return [
        'manthan next',
        '',
        `  The latest plan run did not finish: status=${state.status}.`,
        `  Run id: ${state.runId}`,
        '',
        `${arrow} Diagnose with:`,
        '            manthan doctor',
      ];
    case 'no_plans_yet':
      return [
        'manthan next',
        '',
        '  Workspace initialized. No plans run yet.',
        '',
        `${arrow} Run your first plan:`,
        '            manthan plan "<a brief>"',
      ];
    case 'has_quarantine': {
      const factWord = state.quarantineCount === 1 ? 'fact' : 'facts';
      return [
        'manthan next',
        '',
        `  ${state.quarantineCount} new ${factWord} captured for review (T0 quarantine).`,
        '',
        `${arrow} Review them now:`,
        '            manthan brain review',
      ];
    }
    case 'idle_with_trust': {
      const factWord = state.trustedCount === 1 ? 'fact' : 'facts';
      return [
        'manthan next',
        '',
        `  Workspace healthy. ${state.trustedCount} trusted ${factWord} in continuity. Review queue empty.`,
        '',
        `${arrow} Run another plan:`,
        '            manthan plan "<a brief>"',
        '',
        '   Or inspect what is recorded:',
        '            manthan brain facts',
      ];
    }
    case 'idle_empty_trust':
      return [
        'manthan next',
        '',
        '  Workspace healthy. No trusted facts recorded yet.',
        '',
        `${arrow} Run another plan to start building project context:`,
        '            manthan plan "<a brief>"',
      ];
  }
}

export async function runNext(opts: NextOptions): Promise<number> {
  if (opts.noColor) setColorMode('never');
  else if (opts.forceColor) setColorMode('always');
  else setColorMode('auto');

  const state = await inspectWorkflowState({ cwd: opts.cwd });
  for (const line of formatWorkflowState(state)) {
    process.stdout.write(`${line}\n`);
  }
  return 0;
}
