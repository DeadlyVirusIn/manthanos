// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan init` per BOOTSTRAP_PROTOCOL.md.
// Phase 0 scope:
//   - detect workspace (git repo)
//   - create .manthan/ scaffold
//   - open SQLite, run migrations
//   - write genesis audit event
//   - emit bootstrap charter facts at T0 (quarantined)
//
// Phase 0 does NOT prompt for adapter auth, does NOT call any provider,
// does NOT index files for content (the cheap structural index is the
// extent of bootstrap before Phase 1).

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AsyncMutex,
  type AuditedWriteContext,
  auditedWrite,
  createBlobStore,
  openDb,
  runRecovery,
} from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';

export interface InitOptions {
  readonly cwd: string;
  readonly force?: boolean;
}

export interface InitResult {
  readonly workspaceId: string;
  readonly manthanDir: string;
  readonly charterFacts: number;
  readonly genesisSeq: number;
  readonly elapsedMs: number;
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const t0 = Date.now();
  const platform = getPlatform();

  // 1. Canonicalize workspace root.
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(opts.cwd);
  const isRepo = existsSync(path.join(workspaceRoot, '.git'));
  if (!isRepo) {
    // OCTO_REVIEW §B7 / §14: distinguish "not in a git repo" from
    // "inside a git repo but not at root". The former needs `git init`;
    // the latter needs `cd` to the repo root. Walk up to disambiguate.
    const ancestor = findGitAncestor(workspaceRoot);
    if (ancestor !== null) {
      throw new InitError(
        'NOT_A_GIT_REPO',
        `${workspaceRoot} is not the git repo root. Run \`manthan init\` from the repo root instead:\n  cd ${ancestor}\n  manthan init`,
      );
    }
    throw new InitError(
      'NOT_A_GIT_REPO',
      `${workspaceRoot} is not a git repository. Initialize one with \`git init\` first.`,
    );
  }

  const manthanDir = platform.path.join(workspaceRoot, '.manthan');
  if (existsSync(manthanDir) && !opts.force) {
    throw new InitError(
      'ALREADY_INITIALIZED',
      `Workspace already initialized at ${manthanDir}. Use --force to overwrite.`,
    );
  }

  // 2. Create directory structure.
  await platform.fs.ensureDir(manthanDir);
  await platform.fs.ensureDir(path.join(manthanDir, 'memory'));
  await platform.fs.ensureDir(path.join(manthanDir, 'audit', 'blobs'));
  await platform.fs.ensureDir(path.join(manthanDir, 'workflows'));
  await platform.fs.ensureDir(path.join(manthanDir, 'protocols'));
  await platform.fs.ensureDir(path.join(manthanDir, 'locks'));

  // 3. Write a minimal config.yaml.
  await platform.fs.atomicWrite(
    path.join(manthanDir, 'config.yaml'),
    [
      '# ManthanOS workspace configuration.',
      '# See ARCHITECTURE.md and SAFETY_MODEL.md for the full schema.',
      'version: 1',
      'routing:',
      '  policy: cost-first',
      '  budgets:',
      '    plan: { max_usd_micro: 100000 }      # $0.10 default',
      '    debate: { max_usd_micro: 500000 }    # $0.50 default',
      '    review: { max_usd_micro: 100000 }',
      'safety:',
      "  yes_scopes: []  # never includes 'git-remote', 'secret-access', or 'deploy'",
      '',
    ].join('\n'),
  );

  // 4. .manthan/.gitignore — keep internal state out of git.
  await platform.fs.atomicWrite(
    path.join(manthanDir, '.gitignore'),
    ['# ManthanOS workspace state — do not commit.', '*', '!.gitignore', ''].join('\n'),
  );

  // 5. Open SQLite, run migrations.
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  const jsonlPath = path.join(manthanDir, 'audit.log');
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const m = await openDb({ dbPath });

  try {
    // 6. Determine workspace id (deterministic from canonical path).
    const workspaceId = await deriveWorkspaceId(workspaceRoot);

    m.handle
      .prepare(
        `INSERT OR IGNORE INTO workspaces (id, root_path, git_remote_hash, created_at)
         VALUES (?, ?, NULL, ?)`,
      )
      .run(workspaceId, workspaceRoot, new Date().toISOString());

    const ctx = { db: m.handle, blobs, jsonlPath, mutex: new AsyncMutex() };

    // 7. Genesis event per CRASH_CONSISTENCY.md §11.
    const genesis = await auditedWrite(ctx, {
      workspaceId,
      actor: 'system:bootstrap',
      action: 'workspace.created',
      kind: 'system',
      decision: 'auto-approve',
      payload: { manthanos: 'genesis', schema: 1 },
    });

    // 8. Bootstrap charter facts (T0 quarantine).
    const charterFacts = await persistCharterFacts({
      ctx,
      workspaceId,
      workspaceRoot,
    });

    // 9. Update .gitignore at the repo root to ignore .manthan/.
    await ensureRepoGitignore(workspaceRoot);

    // 10. Run recovery now — verifies chain after the first writes.
    const report = await runRecovery({
      db: m.handle,
      blobs,
      jsonlPath,
      workspaceId,
    });
    if (!report.chainOk) {
      throw new InitError(
        'CHAIN_INTEGRITY_FAILED',
        `Audit chain failed verification at seq=${report.chainFailedAtSeq}. This should never happen on a fresh init.`,
      );
    }

    return {
      workspaceId,
      manthanDir,
      charterFacts,
      genesisSeq: genesis.seq,
      elapsedMs: Date.now() - t0,
    };
  } finally {
    m.close();
  }
}

export class InitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InitError';
  }
}

/**
 * Walk upward from `start` looking for the nearest directory that
 * contains a `.git` entry. Returns the directory path (forward-slash
 * normalized to match canonicalizeWorkspaceRoot) or null if none is
 * found before reaching the filesystem root.
 *
 * Used only to produce a better error message when `manthan init` is
 * run from a subdirectory of a git repo — see OCTO_REVIEW §B7.
 */
function findGitAncestor(start: string): string | null {
  let cur = start;
  // Cap the walk at 50 levels for safety; real-world repos are nowhere near that depth.
  for (let i = 0; i < 50; i += 1) {
    const parent = path.dirname(cur);
    if (parent === cur) return null; // reached filesystem root
    if (existsSync(path.join(parent, '.git'))) {
      // Normalize to forward-slash to match canonicalizeWorkspaceRoot output.
      return parent.replace(/\\/g, '/');
    }
    cur = parent;
  }
  return null;
}

async function deriveWorkspaceId(workspaceRoot: string): Promise<string> {
  // Stable per canonical path. Deterministic across runs on the same machine.
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(workspaceRoot).digest('hex');
  return `ws_${h.slice(0, 16)}`;
}

interface CharterFactInput {
  area: string;
  statement: string;
}

async function persistCharterFacts(args: {
  ctx: AuditedWriteContext;
  workspaceId: string;
  workspaceRoot: string;
}): Promise<number> {
  const platform = getPlatform();
  const facts: CharterFactInput[] = [];

  // package.json
  try {
    const raw = await readFile(platform.path.join(args.workspaceRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string; type?: string };
    if (pkg.name) facts.push({ area: 'project', statement: `name=${pkg.name}` });
    if (pkg.type) facts.push({ area: 'language', statement: `module_type=${pkg.type}` });
    facts.push({ area: 'language', statement: 'primary=typescript_or_javascript' });
  } catch {
    // not a JS project
  }

  // pyproject.toml
  try {
    await stat(platform.path.join(args.workspaceRoot, 'pyproject.toml'));
    facts.push({ area: 'language', statement: 'primary=python' });
  } catch {
    // not python
  }

  // Cargo.toml
  try {
    await stat(platform.path.join(args.workspaceRoot, 'Cargo.toml'));
    facts.push({ area: 'language', statement: 'primary=rust' });
  } catch {
    // not rust
  }

  // go.mod
  try {
    await stat(platform.path.join(args.workspaceRoot, 'go.mod'));
    facts.push({ area: 'language', statement: 'primary=go' });
  } catch {
    // not go
  }

  let inserted = 0;
  const { createHash } = await import('node:crypto');
  for (const fact of facts) {
    const statementHash = createHash('sha256')
      .update(`${fact.area}::${fact.statement}`)
      .digest('hex');
    await auditedWrite(args.ctx, {
      workspaceId: args.workspaceId,
      actor: 'system:bootstrap',
      action: 'brain.fact_bootstrap',
      kind: 'system',
      decision: 'auto-approve',
      payload: { area: fact.area, statement: fact.statement, tier: 'T0' },
      brainWrites: ({ seq }) => {
        args.ctx.db
          .prepare(
            `INSERT INTO semantic_facts
               (id, workspace_id, area, statement, statement_hash,
                provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
                last_administratively_touched)
             VALUES (?, ?, ?, ?, ?, NULL, 'T0', ?, 0.3, ?, ?)`,
          )
          .run(
            `fact_${randomUUID()}`,
            args.workspaceId,
            fact.area,
            fact.statement,
            statementHash,
            new Date().toISOString(),
            seq,
            new Date().toISOString(),
          );
      },
    });
    inserted += 1;
  }
  return inserted;
}

async function ensureRepoGitignore(workspaceRoot: string): Promise<void> {
  const giPath = path.join(workspaceRoot, '.gitignore');
  let content = '';
  try {
    content = await readFile(giPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
  }
  if (content.split('\n').some((l) => l.trim() === '.manthan' || l.trim() === '.manthan/')) {
    return;
  }
  const next = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`;
  await writeFile(giPath, `${next}\n# ManthanOS workspace state\n.manthan/\n`);
}

// Synchronous helper used in `--version` and similar to avoid importing the
// async openDb. Read just for tests that want to inspect the schema_migrations
// row without an async open.
export function _readSchemaVersionSync(dbPath: string): string | null {
  if (!existsSync(dbPath)) return null;
  const data = readFileSync(dbPath);
  return data.length > 0 ? 'present' : null;
}
