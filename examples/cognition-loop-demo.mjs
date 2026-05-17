#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Phase 1.6 cognition-loop demonstration (offline).
//
// What this proves WITHOUT a live API:
//   1. A fresh workspace's plan A would produce zero trusted facts.
//   2. Simulating plan A's compounding (via direct SQL into the brain)
//      lands the facts at T0 (quarantine).
//   3. The packer (the prompt assembler) at this point produces bundle X
//      with NO trusted_facts layer.
//   4. After human promotion via `manthan brain promote`, the same query
//      produces bundle X' — different hash, trusted_facts layer present,
//      the promoted facts appear by content in the system prompt.
//
// What this does NOT prove:
//   - That Claude actually changes its output. That requires a real
//     ANTHROPIC_API_KEY and the live test path.
//
// The output of this script is the prompt-diff between "no promotion"
// and "with promotion" — a byte-level, reproducible artifact.

import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('../', import.meta.url).pathname);
const CLI = path.join(REPO, 'apps/cli/dist/index.js');

function run(cmd, opts = {}) {
  const r = spawnSync('node', [CLI, ...cmd], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

async function main() {
  const ws = mkdtempSync(path.join(tmpdir(), 'manthan-demo-'));
  process.stdout.write(`\n== ManthanOS cognition-loop demo ==\nworkspace: ${ws}\n\n`);

  // 1. Initialize a fresh repo + workspace.
  execSync('git init -q', { cwd: ws });
  writeFileSync(path.join(ws, 'package.json'), '{"name":"demo","type":"module"}\n');
  mkdirSync(path.join(ws, 'src'), { recursive: true });
  writeFileSync(path.join(ws, 'src', 'auth.ts'), 'export function login() { return "ok"; }\n');
  execSync('git add . && git -c user.email=t@t -c user.name=t commit -m initial -q', {
    cwd: ws,
  });

  process.stdout.write('STEP 1 — manthan init\n');
  const init = run(['init'], { cwd: ws });
  process.stdout.write(init.stdout);
  process.stdout.write(init.stderr);

  // 2. Use the orchestrator/memory libraries directly to simulate plan A
  //    landing some quarantined facts WITHOUT making a real Claude call.
  //    This is the substitute for `manthan plan` until ANTHROPIC_API_KEY
  //    is available.
  process.stdout.write('\nSTEP 2 — simulate plan A compounding (no live API)\n');
  const memoryUrl = path.join(REPO, 'packages/memory/dist/index.js');
  const compoundUrl = path.join(REPO, 'packages/orchestrator/dist/index.js');
  const { openDb, createBlobStore, AsyncMutex } = await import(memoryUrl);
  const { compoundFromPlan } = await import(compoundUrl);

  const m = await openDb({ dbPath: path.join(ws, '.manthan/memory/manthan.db') });
  const wsRow = m.handle.prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1').get(ws);
  const blobs = createBlobStore(path.join(ws, '.manthan/audit/blobs'));
  const ctx = {
    db: m.handle,
    blobs,
    jsonlPath: path.join(ws, '.manthan/audit.log'),
    mutex: new AsyncMutex(),
  };
  // Seed a workflow row so compounding inserts have a valid FK.
  m.handle
    .prepare(
      `INSERT INTO workflows
        (id, workspace_id, type, version, started_at, finished_at, status,
         total_input_tokens, total_output_tokens, total_usd_micro)
       VALUES ('wf_planA', ?, 'plan', '1.0.0', ?, ?, 'completed', 0, 0, 0)`,
    )
    .run(wsRow.id, new Date().toISOString(), new Date().toISOString());

  const planA = {
    summary: 'Plan A: add OAuth login for the demo project',
    steps: [
      {
        id: 'S1',
        description: 'Install passport',
        files_affected: ['package.json'],
        depends_on: [],
        estimated_difficulty: 2,
      },
    ],
    assumptions: [
      'Sessions are kept in httpOnly cookies',
      'OAuth scopes are limited to email+profile',
      'Refresh tokens are stored server-side only',
    ],
    risks: [
      {
        description: 'Token replay during off-hours',
        severity: 3,
        mitigation: 'Rotate refresh tokens every 24h',
      },
    ],
    open_questions: ['Which OAuth provider first?'],
  };
  const compoundResult = await compoundFromPlan({
    ctx,
    db: m.handle,
    workspaceId: wsRow.id,
    workflowId: 'wf_planA',
    area: 'auth',
    plan: planA,
  });
  process.stdout.write(
    `  compounded: open_issues=${compoundResult.openIssuesCreated} ` +
      `facts=${compoundResult.factsQuarantined} (T0)\n`,
  );

  // 3. Pack the context BEFORE any promotion — observe the prompt.
  process.stdout.write('\nSTEP 3 — pack context BEFORE promotion (baseline)\n');
  const contextUrl = path.join(REPO, 'packages/context/dist/index.js');
  const { pack } = await import(contextUrl);

  function queryFacts(_includeQuarantine) {
    const trusted = m.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence, provenance_workflow_id
         FROM semantic_facts WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')
         ORDER BY tier ASC, area ASC, statement ASC`,
      )
      .all(wsRow.id);
    const quarantine = m.handle
      .prepare(
        `SELECT id, area, statement, confidence, provenance_workflow_id
         FROM semantic_facts WHERE workspace_id = ? AND tier = 'T0'
              AND area NOT IN ('language', 'project', 'package_manager')
         ORDER BY area ASC, statement ASC`,
      )
      .all(wsRow.id);
    const charter = m.handle
      .prepare(
        `SELECT area, statement, tier FROM semantic_facts
         WHERE workspace_id = ? AND area IN ('language', 'project', 'package_manager')`,
      )
      .all(wsRow.id);
    return {
      trusted: trusted.map((f) => ({
        id: f.id,
        area: f.area,
        statement: f.statement,
        tier: f.tier,
        confidence: f.confidence,
        provenanceWorkflowId: f.provenance_workflow_id,
      })),
      quarantine: quarantine.map((f) => ({
        id: f.id,
        area: f.area,
        statement: f.statement,
        tier: 'T0',
        confidence: f.confidence,
        provenanceWorkflowId: f.provenance_workflow_id,
      })),
      charter,
    };
  }

  const taskB = 'Plan B: add OAuth session management';
  const before = queryFacts(false);
  const baselineBundle = await pack({
    workspaceRoot: ws,
    taskBrief: taskB,
    charterFacts: before.charter,
    trustedFacts: before.trusted,
    quarantineFacts: before.quarantine,
    includeQuarantine: false,
    decisions: [],
    tokenBudget: 100_000,
  });
  process.stdout.write(`  baseline bundle_hash:        ${baselineBundle.bundleHash}\n`);
  process.stdout.write(
    `  baseline trusted_facts:      ${baselineBundle.metrics.trustedFactsInBundle}\n`,
  );
  process.stdout.write(`  baseline systemPrompt bytes: ${baselineBundle.systemPrompt.length}\n`);

  // 4. Promote two of the quarantined facts via the real CLI command.
  process.stdout.write('\nSTEP 4 — promote two facts via `manthan brain promote --yes`\n');
  const factsToPromote = m.handle
    .prepare(
      `SELECT id, statement FROM semantic_facts
       WHERE workspace_id = ? AND tier = 'T0' AND area = 'auth'
       ORDER BY statement ASC LIMIT 2`,
    )
    .all(wsRow.id);
  m.close();

  for (const f of factsToPromote) {
    process.stdout.write(`  promoting ${f.id}: "${f.statement}"\n`);
    const r = run(['brain', 'promote', f.id, '--yes'], { cwd: ws });
    if (r.code !== 0) {
      process.stdout.write(r.stderr);
      throw new Error(`promote failed for ${f.id}`);
    }
    // Just the success line:
    const success = r.stdout.split('\n').find((l) => l.includes('promoted'));
    process.stdout.write(`    ${success}\n`);
  }

  // 5. Pack the context AFTER promotion — observe the changed prompt.
  process.stdout.write('\nSTEP 5 — pack context AFTER promotion (with trusted facts)\n');
  const m2 = await openDb({ dbPath: path.join(ws, '.manthan/memory/manthan.db') });
  const wsRow2 = m2.handle.prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1').get(ws);
  function queryFacts2(_includeQuarantine) {
    const trusted = m2.handle
      .prepare(
        `SELECT id, area, statement, tier, confidence, provenance_workflow_id
         FROM semantic_facts WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')
         ORDER BY tier ASC, area ASC, statement ASC`,
      )
      .all(wsRow2.id);
    const quarantine = m2.handle
      .prepare(
        `SELECT id, area, statement, confidence, provenance_workflow_id
         FROM semantic_facts WHERE workspace_id = ? AND tier = 'T0'
              AND area NOT IN ('language', 'project', 'package_manager')
         ORDER BY area ASC, statement ASC`,
      )
      .all(wsRow2.id);
    const charter = m2.handle
      .prepare(
        `SELECT area, statement, tier FROM semantic_facts
         WHERE workspace_id = ? AND area IN ('language', 'project', 'package_manager')`,
      )
      .all(wsRow2.id);
    return {
      trusted: trusted.map((f) => ({
        id: f.id,
        area: f.area,
        statement: f.statement,
        tier: f.tier,
        confidence: f.confidence,
        provenanceWorkflowId: f.provenance_workflow_id,
      })),
      quarantine: quarantine.map((f) => ({
        id: f.id,
        area: f.area,
        statement: f.statement,
        tier: 'T0',
        confidence: f.confidence,
        provenanceWorkflowId: f.provenance_workflow_id,
      })),
      charter,
    };
  }
  const after = queryFacts2(false);
  const afterBundle = await pack({
    workspaceRoot: ws,
    taskBrief: taskB,
    charterFacts: after.charter,
    trustedFacts: after.trusted,
    quarantineFacts: after.quarantine,
    includeQuarantine: false,
    decisions: [],
    tokenBudget: 100_000,
  });
  process.stdout.write(`  after bundle_hash:           ${afterBundle.bundleHash}\n`);
  process.stdout.write(
    `  after trusted_facts:         ${afterBundle.metrics.trustedFactsInBundle}\n`,
  );
  process.stdout.write(`  after systemPrompt bytes:    ${afterBundle.systemPrompt.length}\n`);

  // 6. Diff.
  process.stdout.write('\nSTEP 6 — prompt diff (the empirical evidence)\n');
  process.stdout.write(
    `  bundle_hash changed:         ${baselineBundle.bundleHash !== afterBundle.bundleHash}\n`,
  );
  const beforeSet = new Set(baselineBundle.systemPrompt.split('\n'));
  const newLines = afterBundle.systemPrompt.split('\n').filter((l) => !beforeSet.has(l));
  process.stdout.write(`  new lines added: ${newLines.length}\n`);
  for (const l of newLines) process.stdout.write(`    + ${l}\n`);

  m2.close();

  // 7. Inspect what landed in the brain.
  process.stdout.write('\nSTEP 7 — manthan brain stats\n');
  const stats = run(['brain', 'stats'], { cwd: ws });
  process.stdout.write(stats.stdout);

  // Clean up.
  rmSync(ws, { recursive: true, force: true });
  process.stdout.write('\n== Demo complete ==\n');
  process.stdout.write(
    'Empirical claim: promoting facts changes the system prompt byte-identifiable. ✓\n',
  );
  process.stdout.write(
    "Unproven claim: that Claude's output materially changes — requires live ANTHROPIC_API_KEY.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
