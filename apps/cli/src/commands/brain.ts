// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain ...` — read-only inspection of the Project Brain.
// Phase 1.5 surfaces what compounding actually produced.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { type ManthanSqliteHandle, openDb } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';

export interface BrainOptions {
  readonly cwd: string;
}

async function withDb<T>(
  cwd: string,
  fn: (handle: ManthanSqliteHandle, workspaceId: string) => Promise<T>,
): Promise<T | null> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  if (!existsSync(dbPath)) {
    process.stderr.write('manthan brain: workspace not initialized; run `manthan init` first\n');
    return null;
  }
  const m = await openDb({ dbPath });
  try {
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) {
      process.stderr.write('manthan brain: workspaces row missing — re-run `manthan init`\n');
      return null;
    }
    return await fn(m.handle, ws.id);
  } finally {
    m.close();
  }
}

export async function runBrainStats(opts: BrainOptions): Promise<number> {
  const result = await withDb(opts.cwd, async (db, wsId) => {
    const stats = {
      facts: db
        .prepare(
          `SELECT tier, COUNT(*) AS n FROM semantic_facts
           WHERE workspace_id = ? GROUP BY tier ORDER BY tier`,
        )
        .all(wsId) as Array<{ tier: string; n: number }>,
      issues: db
        .prepare(
          `SELECT COUNT(*) AS open_n,
                  SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END) AS closed_n
           FROM open_issues WHERE workspace_id = ?`,
        )
        .get(wsId) as { open_n: number; closed_n: number },
      workflows: db
        .prepare(
          `SELECT status, COUNT(*) AS n FROM workflows
           WHERE workspace_id = ? GROUP BY status ORDER BY status`,
        )
        .all(wsId) as Array<{ status: string; n: number }>,
      auditTotal: db
        .prepare('SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ?')
        .get(wsId) as { n: number },
      blobs: db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as { n: number },
      totalUsdMicro: db
        .prepare(
          `SELECT COALESCE(SUM(total_usd_micro), 0) AS s FROM workflows
           WHERE workspace_id = ?`,
        )
        .get(wsId) as { s: number },
    };
    return stats;
  });
  if (!result) return 2;

  process.stdout.write('Project Brain — stats\n\n');
  process.stdout.write('Semantic facts by tier:\n');
  if (result.facts.length === 0) {
    process.stdout.write('  (none)\n');
  } else {
    for (const f of result.facts) {
      process.stdout.write(`  ${f.tier.padEnd(4)}  ${f.n}\n`);
    }
  }
  const openCount = result.issues.open_n - (result.issues.closed_n ?? 0);
  const closedFragment = result.issues.closed_n ? `, ${result.issues.closed_n} closed` : '';
  process.stdout.write(`\nOpen issues:  ${openCount} open${closedFragment}\n`);
  process.stdout.write('\nWorkflows by status:\n');
  if (result.workflows.length === 0) {
    process.stdout.write('  (none)\n');
  } else {
    for (const w of result.workflows) {
      process.stdout.write(`  ${w.status.padEnd(28)}  ${w.n}\n`);
    }
  }
  process.stdout.write(`\nAudit events:     ${result.auditTotal.n}\n`);
  process.stdout.write(`Blob references:  ${result.blobs.n}\n`);
  process.stdout.write(
    `Total spend:      $${(result.totalUsdMicro.s / 1_000_000).toFixed(6)} (${result.totalUsdMicro.s} micro)\n`,
  );
  return 0;
}

export async function runBrainFacts(
  opts: BrainOptions & { area?: string; tier?: string },
): Promise<number> {
  const result = await withDb(opts.cwd, async (db, wsId) => {
    let sql = `SELECT id, area, statement, tier, confidence, last_corroborated,
                      provenance_workflow_id
               FROM semantic_facts WHERE workspace_id = ?`;
    const params: unknown[] = [wsId];
    if (opts.area) {
      sql += ' AND area = ?';
      params.push(opts.area);
    }
    if (opts.tier) {
      sql += ' AND tier = ?';
      params.push(opts.tier);
    }
    sql += ` ORDER BY CASE tier
                   WHEN 'T+3' THEN 1 WHEN 'T+2' THEN 2 WHEN 'T+1' THEN 3
                   WHEN 'T0' THEN 4 WHEN 'T-1' THEN 5 ELSE 6 END ASC,
                 area ASC, statement ASC`;
    return db.prepare(sql).all(...params) as Array<{
      id: string;
      area: string;
      statement: string;
      tier: string;
      confidence: number;
      last_corroborated: string;
      provenance_workflow_id: string | null;
    }>;
  });
  if (!result) return 2;

  process.stdout.write(`Project Brain — facts (${result.length} matching)\n\n`);
  if (result.length === 0) {
    process.stdout.write('  (none)\n');
    return 0;
  }
  for (const f of result) {
    process.stdout.write(`  ${f.id}\n`);
    process.stdout.write(
      `    [${f.tier}] conf=${f.confidence.toFixed(2)}  ${f.area}: ${f.statement}\n`,
    );
    process.stdout.write(`    last_corroborated: ${f.last_corroborated}`);
    if (f.provenance_workflow_id) {
      process.stdout.write(`  src: ${f.provenance_workflow_id}`);
    }
    process.stdout.write('\n');
  }
  process.stdout.write('\nPromote with:  manthan brain promote <fact-id>\n');
  process.stdout.write('Demote with:   manthan brain demote <fact-id> --reason="..."\n');
  return 0;
}

export async function runBrainIssues(opts: BrainOptions & { all?: boolean }): Promise<number> {
  const result = await withDb(opts.cwd, async (db, wsId) => {
    const sql = opts.all
      ? `SELECT area, summary, severity, opened_at, closed_at FROM open_issues
         WHERE workspace_id = ?
         ORDER BY closed_at IS NULL DESC, severity DESC, opened_at DESC`
      : `SELECT area, summary, severity, opened_at, closed_at FROM open_issues
         WHERE workspace_id = ? AND closed_at IS NULL
         ORDER BY severity DESC, opened_at DESC`;
    return db.prepare(sql).all(wsId) as Array<{
      area: string;
      summary: string;
      severity: number;
      opened_at: string;
      closed_at: string | null;
    }>;
  });
  if (!result) return 2;

  const open = result.filter((r) => r.closed_at === null).length;
  const closed = result.length - open;
  process.stdout.write(
    `Project Brain — open issues (${open} open${opts.all ? `, ${closed} closed` : ''})\n\n`,
  );
  if (result.length === 0) {
    process.stdout.write('  (none)\n');
    return 0;
  }
  for (const r of result) {
    const mark = r.closed_at ? '✓' : '!';
    process.stdout.write(`  ${mark} [S${r.severity}] ${r.area}: ${r.summary}\n`);
    process.stdout.write(
      `      opened: ${r.opened_at}${r.closed_at ? `  closed: ${r.closed_at}` : ''}\n`,
    );
  }
  return 0;
}

export async function runBrainHistory(opts: BrainOptions & { limit?: number }): Promise<number> {
  const limit = opts.limit ?? 20;
  const result = await withDb(opts.cwd, async (db, wsId) => {
    return db
      .prepare(
        `SELECT id, type, started_at, finished_at, status,
                total_input_tokens, total_output_tokens, total_usd_micro
         FROM workflows
         WHERE workspace_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(wsId, limit) as Array<{
      id: string;
      type: string;
      started_at: string;
      finished_at: string | null;
      status: string;
      total_input_tokens: number;
      total_output_tokens: number;
      total_usd_micro: number;
    }>;
  });
  if (!result) return 2;

  process.stdout.write(`Project Brain — workflow history (last ${result.length})\n\n`);
  if (result.length === 0) {
    process.stdout.write('  (none)\n');
    return 0;
  }
  for (const r of result) {
    process.stdout.write(
      `  ${r.id}  ${r.type}  ${r.status}  in=${r.total_input_tokens} out=${r.total_output_tokens} $${(
        r.total_usd_micro / 1_000_000
      ).toFixed(6)}\n`,
    );
    process.stdout.write(`      ${r.started_at} → ${r.finished_at ?? '(running)'}\n`);
  }
  return 0;
}
