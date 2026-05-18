// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan doctor` — read-only health check.
// Scope:
//   - print platform info
//   - check Node version against minimum required (22.13.0)
//   - check git on PATH
//   - check adapter availability (claude / codex / gemini CLIs, ANTHROPIC_API_KEY)
//   - if a .manthan/ exists in cwd: open DB, verify chain, count rows
//   - scan git hooks per SAFETY §11d (informational only — enforcement is not yet active)

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  type RecoveryFinding,
  type RecoveryStatus,
  createBlobStore,
  openDb,
  runRecovery,
} from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { scanGitHooks } from '@manthanos/safety';

const MIN_NODE_VERSION = { major: 22, minor: 13, patch: 0 } as const;

function parseNodeVersion(v: string): { major: number; minor: number; patch: number } | null {
  // process.version is "vX.Y.Z" (possibly with -nightly suffix).
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return {
    major: Number.parseInt(m[1], 10),
    minor: Number.parseInt(m[2], 10),
    patch: Number.parseInt(m[3], 10),
  };
}

function nodeMeetsMinimum(parsed: { major: number; minor: number; patch: number }): boolean {
  if (parsed.major > MIN_NODE_VERSION.major) return true;
  if (parsed.major < MIN_NODE_VERSION.major) return false;
  if (parsed.minor > MIN_NODE_VERSION.minor) return true;
  if (parsed.minor < MIN_NODE_VERSION.minor) return false;
  return parsed.patch >= MIN_NODE_VERSION.patch;
}

export interface DoctorOptions {
  readonly cwd: string;
  /**
   * Strict mode: non-zero exit on `corrupted` or `unrecoverable`
   * recovery status. Default doctor behavior is read-only and
   * never fails — strict mode is opt-in for CI / pre-commit hooks
   * that want a hard signal.
   */
  readonly strict?: boolean;
}

/**
 * Compute the CLI exit code for a doctor run. Default behavior:
 * always 0 (doctor is diagnostic). Strict mode: 3 on `corrupted`
 * or `unrecoverable` recovery status — mirrors `manthan replay`'s
 * corruption exit code so external CI tooling can use a single
 * non-zero check across both.
 */
export function computeDoctorExitCode(
  report: { readonly recoveryStatus?: RecoveryStatus },
  strict: boolean,
): number {
  if (!strict) return 0;
  if (report.recoveryStatus === 'corrupted' || report.recoveryStatus === 'unrecoverable') {
    return 3;
  }
  return 0;
}

export interface AdapterAvailability {
  readonly id: 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'anthropic-api';
  readonly available: boolean;
  readonly detail: string;
}

export interface DoctorReport {
  readonly platform: { os: string; arch: string; isWSL: boolean };
  readonly node: string;
  readonly nodeOk: boolean;
  readonly gitVersion: string | null;
  readonly adapters: ReadonlyArray<AdapterAvailability>;
  readonly workspaceInitialized: boolean;
  readonly chainOk?: boolean;
  readonly auditEvents?: number;
  readonly gitHooksDetected?: number;
  readonly recoveryStatus?: RecoveryStatus;
  readonly recoveryFindings?: ReadonlyArray<RecoveryFinding>;
}

async function checkAdapters(
  platform: ReturnType<typeof getPlatform>,
): Promise<AdapterAvailability[]> {
  const [claude, codex, gemini] = await Promise.all([
    platform.process.which('claude'),
    platform.process.which('codex'),
    platform.process.which('gemini'),
  ]);
  const hasAnthropicKey =
    typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 0;
  return [
    {
      id: 'claude-cli',
      available: claude !== null,
      detail: claude ? claude : 'install Claude Code CLI: https://claude.com/code',
    },
    {
      id: 'anthropic-api',
      available: hasAnthropicKey,
      detail: hasAnthropicKey
        ? 'ANTHROPIC_API_KEY set'
        : 'set ANTHROPIC_API_KEY (or run `manthan auth --set global`) for --adapter=api',
    },
    {
      id: 'codex-cli',
      available: codex !== null,
      detail: codex ? codex : 'install Codex CLI (npm install -g @openai/codex)',
    },
    {
      id: 'gemini-cli',
      available: gemini !== null,
      detail: gemini ? gemini : 'install Gemini CLI (https://github.com/google-gemini/gemini-cli)',
    },
  ];
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorReport> {
  const platform = getPlatform();

  // git --version
  let gitVersion: string | null = null;
  const gitPath = await platform.process.which('git');
  if (gitPath) {
    try {
      const result = await platform.process.spawn({
        command: gitPath,
        args: ['--version'],
        timeoutMs: 5000,
      });
      gitVersion = result.code === 0 ? result.stdout.trim() : null;
    } catch {
      gitVersion = null;
    }
  }

  // Node version check
  const parsedNode = parseNodeVersion(process.version);
  const nodeOk = parsedNode !== null && nodeMeetsMinimum(parsedNode);

  // Adapter availability
  const adapters = await checkAdapters(platform);

  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(opts.cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const initialized = existsSync(manthanDir);

  // Always print platform info.
  process.stdout.write('manthan doctor\n');
  process.stdout.write(`  platform: ${platform.info.os}/${platform.info.arch}`);
  if (platform.info.isWSL) process.stdout.write(' (WSL)');
  process.stdout.write('\n');
  const nodeMark = nodeOk
    ? ''
    : `  ✗ requires v${MIN_NODE_VERSION.major}.${MIN_NODE_VERSION.minor}+`;
  process.stdout.write(`  node:     ${process.version}${nodeMark}\n`);
  process.stdout.write(`  git:      ${gitVersion ?? '(not found on PATH)'}\n`);
  process.stdout.write(`  cwd:      ${workspaceRoot}\n`);
  process.stdout.write('\n');

  // Adapter availability section
  process.stdout.write('  adapters:\n');
  for (const a of adapters) {
    const mark = a.available ? '✓' : '✗';
    process.stdout.write(`    ${mark} ${a.id.padEnd(14)} ${a.detail}\n`);
  }
  process.stdout.write('\n');

  if (!initialized) {
    process.stdout.write('  workspace: not initialized (run `manthan init`)\n');
    return {
      platform: {
        os: platform.info.os,
        arch: platform.info.arch,
        isWSL: platform.info.isWSL,
      },
      node: process.version,
      nodeOk,
      gitVersion,
      adapters,
      workspaceInitialized: false,
    };
  }

  // Workspace probe.
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  const jsonlPath = path.join(manthanDir, 'audit.log');
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const m = await openDb({ dbPath });

  try {
    // Identify workspace ID for this row.
    const ws = m.handle
      .prepare('SELECT id FROM workspaces WHERE root_path = ? LIMIT 1')
      .get(workspaceRoot) as { id: string } | undefined;
    if (!ws) {
      process.stdout.write('  workspace: initialized but missing workspaces row\n');
      return {
        platform: {
          os: platform.info.os,
          arch: platform.info.arch,
          isWSL: platform.info.isWSL,
        },
        node: process.version,
        nodeOk,
        gitVersion,
        adapters,
        workspaceInitialized: true,
      };
    }

    const report = await runRecovery({
      db: m.handle,
      blobs,
      jsonlPath,
      workspaceId: ws.id,
    });

    // Git-hook scan (informational only in Phase 0).
    const hooks = await scanGitHooks(workspaceRoot);

    process.stdout.write('  workspace: initialized\n');
    process.stdout.write(`  recovery status: ${statusBanner(report.status)}\n`);
    process.stdout.write(`  audit chain: ${report.chainOk ? 'ok' : 'FAILED'}`);
    if (!report.chainOk) {
      process.stdout.write(` (at seq=${report.chainFailedAtSeq})`);
    }
    process.stdout.write('\n');
    process.stdout.write(`  events:      ${report.chainCheckedEvents}\n`);
    process.stdout.write(`  orphan blobs: ${report.orphanBlobsFound}\n`);
    if (report.findings.length > 0) {
      process.stdout.write('  corruption findings:\n');
      for (const f of report.findings) {
        process.stdout.write(`    - [${f.category}] ${f.detail}`);
        if (f.seq !== undefined) process.stdout.write(`  (seq=${f.seq})`);
        process.stdout.write('\n');
        if (f.expected !== undefined && f.actual !== undefined) {
          process.stdout.write(`        expected: ${f.expected}\n`);
          process.stdout.write(`        actual:   ${f.actual}\n`);
        }
      }
      process.stdout.write('  manual inspection required — see .manthan/audit-corruption.log.\n');
    }
    if (opts.strict && (report.status === 'corrupted' || report.status === 'unrecoverable')) {
      // The exit code itself is set by the CLI entry via
      // computeDoctorExitCode; this banner is the operator-visible
      // wording the spec requires.
      process.stdout.write('  strict mode: non-zero exit due to corruption findings.\n');
    }
    if (hooks.length > 0) {
      process.stdout.write(`  git hooks detected: ${hooks.length}\n`);
      for (const h of hooks) {
        process.stdout.write(`    - ${h.path}  ${h.sha256.slice(0, 12)}…\n`);
      }
      process.stdout.write(
        '    (git hook audit is informational; enforcement is not yet active)\n',
      );
    }

    return {
      platform: {
        os: platform.info.os,
        arch: platform.info.arch,
        isWSL: platform.info.isWSL,
      },
      node: process.version,
      nodeOk,
      gitVersion,
      adapters,
      workspaceInitialized: true,
      chainOk: report.chainOk,
      auditEvents: report.chainCheckedEvents,
      gitHooksDetected: hooks.length,
      recoveryStatus: report.status,
      recoveryFindings: report.findings,
    };
  } finally {
    m.close();
  }
}

function statusBanner(status: RecoveryStatus): string {
  // CLI wording discipline: no "recovered perfectly", "repaired
  // automatically", or "guaranteed integrity". Status terms only.
  switch (status) {
    case 'clean':
      return 'clean';
    case 'partial':
      return 'partial (recoverable reconciliations applied)';
    case 'corrupted':
      return 'CORRUPTED — corruption detected; mutating operations refused';
    case 'unrecoverable':
      return 'UNRECOVERABLE — manual inspection required';
  }
}
