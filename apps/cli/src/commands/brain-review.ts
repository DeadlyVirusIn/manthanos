// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan brain review` — Phase 2 deliverable #6 (promotion UX).
//
// One screen, batch decisions, minimal typing. T0 facts are listed with
// inline provenance and entropy hints (decay-band, dedup-cluster). The
// user marks each as promote/promote-corroborated/skip via short
// commands, sees a confirmation summary, and applies all in one pass.
//
// Out of scope (anti-discipline):
//   - AI-suggested trust decisions
//   - Auto-promotion heuristics
//   - Moderation queues or assignments
//   - Hidden state — every action is auditable, every selection visible.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
  AsyncMutex,
  type BlobStore,
  type ManthanSqliteHandle,
  createBlobStore,
  openDb,
} from '@manthanos/memory';
import {
  BrainTrustError,
  DECAY_THRESHOLDS,
  type DecayProfile,
  demoteFact,
  promoteFact,
} from '@manthanos/orchestrator';
import { getPlatform } from '@manthanos/platform';

function approver(): string {
  try {
    return `${userInfo().username}@${hostname()}`;
  } catch {
    return `unknown@${hostname()}`;
  }
}

async function openWorkspace(cwd: string): Promise<{
  workspaceId: string;
  m: Awaited<ReturnType<typeof openDb>>;
  blobs: BlobStore;
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

interface ReviewFact {
  factId: string;
  area: string;
  statement: string;
  confidence: number;
  lastCorroborated: string;
  ageDays: number;
  provenanceWorkflowId: string | null;
  decayBand: 'fresh' | 'warn' | 'demote' | 'archive';
  similarTrustedIds: string[];
}

async function resolveProvenanceBrief(
  db: ManthanSqliteHandle,
  blobs: BlobStore,
  workflowId: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(workflowId)) return cache.get(workflowId) ?? null;
  const row = db
    .prepare(
      `SELECT payload_hash FROM audit_events
       WHERE action = 'workflow.start' AND actor = ?
       ORDER BY seq DESC LIMIT 1`,
    )
    .get(`workflow:plan#${workflowId}`) as { payload_hash: string | null } | undefined;
  if (!row?.payload_hash) {
    cache.set(workflowId, null);
    return null;
  }
  try {
    const content = await readFile(blobs.pathFor(row.payload_hash), 'utf8');
    const parsed = JSON.parse(content) as { task_brief?: string };
    cache.set(workflowId, parsed.task_brief ?? null);
    return parsed.task_brief ?? null;
  } catch {
    cache.set(workflowId, null);
    return null;
  }
}

function classifyDecayBand(ageDays: number, profile: DecayProfile): ReviewFact['decayBand'] {
  const w = DECAY_THRESHOLDS[profile];
  if (ageDays < w.warn) return 'fresh';
  if (ageDays < w.demote) return 'warn';
  if (ageDays < w.archive) return 'demote';
  return 'archive';
}

async function loadCandidates(
  db: ManthanSqliteHandle,
  workspaceId: string,
  opts: { area?: string; limit: number; profile: DecayProfile },
): Promise<ReviewFact[]> {
  const rows = db
    .prepare(
      `SELECT id, area, statement, confidence, last_corroborated, provenance_workflow_id
       FROM semantic_facts
       WHERE workspace_id = ? AND tier = 'T0'
         ${opts.area ? 'AND area = ?' : ''}
       ORDER BY last_corroborated ASC
       LIMIT ?`,
    )
    .all(
      ...(opts.area ? [workspaceId, opts.area, opts.limit] : [workspaceId, opts.limit]),
    ) as Array<{
    id: string;
    area: string;
    statement: string;
    confidence: number;
    last_corroborated: string;
    provenance_workflow_id: string | null;
  }>;

  // For "similar to existing trusted fact" hints, cross-reference dedup against
  // T+1/T+2/T+3 facts using the existing detector. We construct candidate-style
  // pseudo-rows that the human reviews against the brain's trusted layer.
  // (Note: findDuplicateClusters only looks at trusted facts; we additionally
  // do a coarse same-area substring check for the candidate vs trusted.)
  const trusted = db
    .prepare(
      `SELECT id, area, statement FROM semantic_facts
       WHERE workspace_id = ? AND tier IN ('T+1','T+2','T+3')`,
    )
    .all(workspaceId) as Array<{ id: string; area: string; statement: string }>;

  const now = Date.now();
  const result: ReviewFact[] = [];
  for (const r of rows) {
    const ageMs = now - Date.parse(r.last_corroborated);
    const ageDays = Math.max(0, Math.round(ageMs / (24 * 60 * 60 * 1000)));
    const similar = trusted.filter(
      (t) => t.area === r.area && tokenJaccard(t.statement, r.statement) >= 0.3,
    );
    result.push({
      factId: r.id,
      area: r.area,
      statement: r.statement,
      confidence: r.confidence,
      lastCorroborated: r.last_corroborated,
      ageDays,
      provenanceWorkflowId: r.provenance_workflow_id,
      decayBand: classifyDecayBand(ageDays, opts.profile),
      similarTrustedIds: similar.map((t) => t.id),
    });
  }
  return result;
}

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
]);

function tokenSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const tok of text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))) {
    out.add(tok);
  }
  return out;
}

function tokenJaccard(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
}

function decayBadge(b: ReviewFact['decayBand']): string {
  switch (b) {
    case 'fresh':
      return '';
    case 'warn':
      return ' ⚠ warn-band';
    case 'demote':
      return ' ⚠ demote-band';
    case 'archive':
      return ' ⚠ archive-band';
  }
}

async function renderCandidates(
  candidates: ReviewFact[],
  db: ManthanSqliteHandle,
  blobs: BlobStore,
): Promise<void> {
  process.stdout.write(`Pending T0 review queue — ${candidates.length} fact(s).\n\n`);
  const briefCache = new Map<string, string | null>();
  let idx = 0;
  for (const c of candidates) {
    idx += 1;
    const sim =
      c.similarTrustedIds.length > 0
        ? `  ◇ similar to ${c.similarTrustedIds.length} trusted ${c.similarTrustedIds.length === 1 ? 'fact' : 'facts'} in same area\n`
        : '';
    const provBrief = c.provenanceWorkflowId
      ? await resolveProvenanceBrief(db, blobs, c.provenanceWorkflowId, briefCache)
      : null;
    const provLine = c.provenanceWorkflowId
      ? `  source: ${shortId(c.provenanceWorkflowId)}${provBrief ? ` — "${provBrief.length > 70 ? `${provBrief.slice(0, 67)}...` : provBrief}"` : ''}\n`
      : '';
    process.stdout.write(
      `[${String(idx).padStart(2)}] ${c.area} · T0 · conf=${c.confidence.toFixed(2)} · age=${c.ageDays}d${decayBadge(c.decayBand)}\n`,
    );
    process.stdout.write(`     "${c.statement}"\n`);
    if (provLine) process.stdout.write(provLine);
    if (sim) process.stdout.write(sim);
    process.stdout.write('\n');
  }
}

// --------------------------------------------------------------------------
// Selection grammar
//
// Tokens: `p`, `P`, `d`, `s`, `u`, `q`, `a`, `?`.
// `p`/`P`/`d`/`s` are followed by a range spec: `1`, `1-5`, `1 3 5`, `1-3 7-9`.
// --------------------------------------------------------------------------

type SelectionAction = 'promote-t1' | 'promote-t2' | 'demote-t-minus-1' | 'skip';
const ACTION_LABEL: Record<SelectionAction, string> = {
  'promote-t1': 'promote → T+1',
  'promote-t2': 'promote → T+2',
  'demote-t-minus-1': 'demote → T-1 (contradicted)',
  skip: 'skip',
};

function parseRanges(spec: string, max: number): number[] | string {
  // Returns either a sorted unique list of 1-based indices, or an error string.
  const out = new Set<number>();
  const tokens = spec
    .trim()
    .split(/[,\s]+/)
    .filter((t) => t.length > 0);
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      const n = Number.parseInt(t, 10);
      if (n < 1 || n > max) return `index ${n} out of range (1..${max})`;
      out.add(n);
      continue;
    }
    const m = /^(\d+)-(\d+)$/.exec(t);
    if (!m || !m[1] || !m[2]) return `invalid range token: "${t}"`;
    const a = Number.parseInt(m[1], 10);
    const b = Number.parseInt(m[2], 10);
    if (a < 1 || b > max || a > b) return `bad range: "${t}" (1..${max})`;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

const HELP_TEXT = [
  'Commands:',
  '  p <range>    promote to T+1            (e.g. "p 1 3-5")',
  '  P <range>    promote to T+2 (corroborated)',
  '  d <range>    demote to T-1 (contradicted)',
  '  s <range>    explicit skip',
  '  u            undo last selection (in-session only)',
  '  c            clear all selections',
  '  l            list current selections',
  '  q            apply all selections + quit',
  '  a            abort (discard selections)',
  '  ?            this help',
  '',
  'Example:  `p 1 3-5` to promote facts 1, 3, 4, 5 then `q` to commit.',
  'Tiers:    T0=quarantine  T+1=trusted  T+2=corroborated  T-1=contradicted',
].join('\n');

interface Selection {
  factId: string;
  action: SelectionAction;
}

async function runInteractive(
  candidates: ReviewFact[],
): Promise<{ selections: Selection[]; aborted: boolean }> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const selections = new Map<string, SelectionAction>();
  const history: Array<{ factId: string; prev: SelectionAction | undefined }> = [];

  function indicesToFactIds(indices: number[]): string[] {
    return indices
      .map((i) => candidates[i - 1])
      .filter((c): c is ReviewFact => c !== undefined)
      .map((c) => c.factId);
  }

  process.stdout.write(`${HELP_TEXT}\n\n`);

  while (true) {
    const line = (await rl.question('> ')).trim();
    if (line.length === 0) continue;
    if (line === '?') {
      process.stdout.write(`${HELP_TEXT}\n`);
      continue;
    }
    if (line === 'q') {
      rl.close();
      return { selections: collect(selections, candidates), aborted: false };
    }
    if (line === 'a') {
      rl.close();
      return { selections: [], aborted: true };
    }
    if (line === 'c') {
      selections.clear();
      history.length = 0;
      process.stdout.write('selections cleared.\n');
      continue;
    }
    if (line === 'l') {
      if (selections.size === 0) {
        process.stdout.write('(no selections yet)\n');
        continue;
      }
      for (const c of candidates) {
        const a = selections.get(c.factId);
        if (a) process.stdout.write(`  ${shortId(c.factId)}  ${ACTION_LABEL[a]}\n`);
      }
      continue;
    }
    if (line === 'u') {
      const last = history.pop();
      if (!last) {
        process.stdout.write('(nothing to undo)\n');
        continue;
      }
      if (last.prev === undefined) selections.delete(last.factId);
      else selections.set(last.factId, last.prev);
      process.stdout.write(`undid ${shortId(last.factId)}.\n`);
      continue;
    }
    const m = /^([pPds])\s+(.+)$/.exec(line);
    if (!m || !m[1] || !m[2]) {
      process.stdout.write('Unrecognized input. Type `?` for help.\n');
      continue;
    }
    const action: SelectionAction =
      m[1] === 'p'
        ? 'promote-t1'
        : m[1] === 'P'
          ? 'promote-t2'
          : m[1] === 'd'
            ? 'demote-t-minus-1'
            : 'skip';
    const parsed = parseRanges(m[2], candidates.length);
    if (typeof parsed === 'string') {
      process.stdout.write(`error: ${parsed}\n`);
      continue;
    }
    const factIds = indicesToFactIds(parsed);
    for (const id of factIds) {
      history.push({ factId: id, prev: selections.get(id) });
      selections.set(id, action);
    }
    process.stdout.write(`  marked ${factIds.length} → ${ACTION_LABEL[action]}\n`);
  }
}

function collect(map: Map<string, SelectionAction>, candidates: ReviewFact[]): Selection[] {
  // Preserve candidate order so audit events apply in a predictable sequence.
  const out: Selection[] = [];
  for (const c of candidates) {
    const a = map.get(c.factId);
    if (a) out.push({ factId: c.factId, action: a });
  }
  return out;
}

function parseBatchSpec(spec: string, count: number): Selection[] | string {
  // Single-shot syntax: "1p 2-3p 4P 5s" — letter suffix per token.
  // Returns selections in input order.
  const tokens = spec
    .trim()
    .split(/[,\s]+/)
    .filter((t) => t.length > 0);
  const seen = new Map<number, SelectionAction>();
  for (const t of tokens) {
    const m = /^(\d+(?:-\d+)?)([pPds])$/.exec(t);
    if (!m || !m[1] || !m[2])
      return `invalid batch token: "${t}" (expected like 1p, 2-4P, 5d, 6s)`;
    const ranges = parseRanges(m[1], count);
    if (typeof ranges === 'string') return ranges;
    const action: SelectionAction =
      m[2] === 'p'
        ? 'promote-t1'
        : m[2] === 'P'
          ? 'promote-t2'
          : m[2] === 'd'
            ? 'demote-t-minus-1'
            : 'skip';
    for (const i of ranges) seen.set(i, action);
  }
  const selections: Selection[] = [];
  for (const [i, a] of [...seen.entries()].sort((x, y) => x[0] - y[0])) {
    selections.push({ factId: `__index_${i}__`, action: a });
    // We'll resolve the fact id at apply time using the candidates array.
  }
  return selections;
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export interface ReviewOpts {
  readonly cwd: string;
  readonly area?: string;
  readonly limit: number;
  readonly batch?: string;
  readonly dryRun: boolean;
  readonly thresholdProfile: DecayProfile;
}

export async function runReview(opts: ReviewOpts): Promise<number> {
  const ws = await openWorkspace(opts.cwd);
  if (!ws) return 2;
  try {
    const candidates = await loadCandidates(ws.m.handle, ws.workspaceId, {
      area: opts.area,
      limit: opts.limit,
      profile: opts.thresholdProfile,
    });
    if (candidates.length === 0) {
      process.stdout.write(
        `manthan brain review: T0 queue is empty${opts.area ? ` for area ${opts.area}` : ''}.\n`,
      );
      return 0;
    }

    await renderCandidates(candidates, ws.m.handle, ws.blobs);

    let selections: Selection[] = [];
    if (opts.batch !== undefined) {
      const parsed = parseBatchSpec(opts.batch, candidates.length);
      if (typeof parsed === 'string') {
        process.stderr.write(`manthan brain review: ${parsed}\n`);
        return 2;
      }
      // Resolve placeholder ids to real ones using the candidate order.
      selections = parsed
        .map((s) => {
          const m = /^__index_(\d+)__$/.exec(s.factId);
          const idx = m?.[1] ? Number.parseInt(m[1], 10) : -1;
          const cand = candidates[idx - 1];
          return cand ? { factId: cand.factId, action: s.action } : null;
        })
        .filter((s): s is Selection => s !== null);
    } else if (process.stdin.isTTY) {
      const r = await runInteractive(candidates);
      if (r.aborted) {
        process.stdout.write('aborted — no changes applied.\n');
        return 4;
      }
      selections = r.selections;
    } else {
      process.stderr.write(
        'manthan brain review: stdin is not a TTY; pass --batch "1p 2-3p ..." for non-interactive use.\n',
      );
      return 3;
    }

    if (selections.length === 0) {
      process.stdout.write('\nNo selections made.\n');
      return 0;
    }

    // Pre-commit summary.
    process.stdout.write('\nSelections to apply:\n');
    const byAction = new Map<SelectionAction, string[]>();
    for (const s of selections) {
      const arr = byAction.get(s.action) ?? [];
      arr.push(s.factId);
      byAction.set(s.action, arr);
    }
    for (const action of ['promote-t1', 'promote-t2', 'skip'] as SelectionAction[]) {
      const ids = byAction.get(action);
      if (!ids || ids.length === 0) continue;
      process.stdout.write(`  ${ACTION_LABEL[action]}: ${ids.length}\n`);
      for (const id of ids) process.stdout.write(`    ${shortId(id)}\n`);
    }

    if (opts.dryRun) {
      process.stdout.write('\nDry run — no audit events written.\n');
      return 0;
    }

    // Apply.
    const ctx = {
      db: ws.m.handle,
      blobs: ws.blobs,
      jsonlPath: ws.jsonlPath,
      mutex: new AsyncMutex(),
    };
    let promoted = 0;
    let demoted = 0;
    let errors = 0;
    const applied: Array<{ factId: string; tier: string; seq: number }> = [];
    for (const s of selections) {
      if (s.action === 'skip') continue;
      try {
        if (s.action === 'demote-t-minus-1') {
          const result = await demoteFact({
            ctx,
            db: ws.m.handle,
            workspaceId: ws.workspaceId,
            factId: s.factId,
            targetTier: 'T-1',
            approver: approver(),
            reason: 'brain-review: demoted via interactive review',
          });
          demoted += 1;
          applied.push({ factId: s.factId, tier: result.toTier, seq: result.auditSeq });
        } else {
          const target: 'T+1' | 'T+2' = s.action === 'promote-t2' ? 'T+2' : 'T+1';
          const result = await promoteFact({
            ctx,
            db: ws.m.handle,
            workspaceId: ws.workspaceId,
            factId: s.factId,
            targetTier: target,
            approver: approver(),
          });
          promoted += 1;
          applied.push({ factId: s.factId, tier: result.toTier, seq: result.auditSeq });
        }
      } catch (err) {
        errors += 1;
        if (err instanceof BrainTrustError) {
          process.stderr.write(`  ✗ ${shortId(s.factId)}: ${err.code} — ${err.message}\n`);
        } else {
          process.stderr.write(`  ✗ ${shortId(s.factId)}: ${(err as Error).message}\n`);
        }
      }
    }

    const skippedCount = selections.filter((s) => s.action === 'skip').length;
    process.stdout.write(
      `\n✓ ${promoted} promoted, ${demoted} demoted, ${errors} failed, ${skippedCount} skipped.\n`,
    );
    if (applied.length > 0) {
      process.stdout.write('\nUndo any of these within 7 days:\n');
      for (const a of applied) {
        process.stdout.write(`  manthan brain undo-correction ${a.seq}  → ${shortId(a.factId)}\n`);
      }
    }
    return errors > 0 ? 1 : 0;
  } finally {
    ws.m.close();
  }
}
