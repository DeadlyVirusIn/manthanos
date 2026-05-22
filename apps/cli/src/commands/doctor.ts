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
import {
  PROVIDER_REGISTRY,
  type ProviderEntry,
  type ProviderHealth,
  applySupersession,
  defaultLocalHttpProbe,
  probeProviderHealth,
} from '@manthanos/providers';
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
  /** Provider id from the registry (e.g. 'codex-cli', 'openai'). */
  readonly id: string;
  readonly displayName: string;
  readonly status: ProviderEntry['status'];
  readonly costMode: ProviderEntry['costMode'];
  readonly supportsCptProbe: boolean;
  readonly binaryFound: boolean;
  readonly binaryPath?: string;
  readonly authSource: ProviderHealth['auth']['source'];
  readonly credentialPath?: string;
  readonly runnable: boolean;
  /** Empty when runnable. */
  readonly nextAction: string;
  /** Set when supersededBy in the registry resolves to a runnable provider. */
  readonly supersededBy?: ProviderHealth['supersededBy'];
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

function healthToAvailability(entry: ProviderEntry, health: ProviderHealth): AdapterAvailability {
  return {
    id: entry.id,
    displayName: entry.displayName,
    status: entry.status,
    costMode: entry.costMode,
    supportsCptProbe: entry.supportsCptProbe,
    binaryFound: health.binaryFound,
    binaryPath: health.binaryPath,
    authSource: health.auth.source,
    credentialPath: health.auth.credentialPath,
    runnable: health.runnable,
    nextAction: health.nextAction,
    supersededBy: health.supersededBy,
  };
}

async function checkAdapters(): Promise<AdapterAvailability[]> {
  // Order: implemented first, then detected-only, then planned.
  // Within each tier preserve registry order.
  const ordered = [
    ...PROVIDER_REGISTRY.filter((p) => p.status === 'implemented'),
    ...PROVIDER_REGISTRY.filter((p) => p.status === 'detected-only'),
    ...PROVIDER_REGISTRY.filter((p) => p.status === 'planned'),
  ];
  // First pass: probe every provider.
  const rawHealths = new Map<string, ProviderHealth>();
  for (const entry of ordered) {
    const health = await probeProviderHealth(entry, { probeLocal: defaultLocalHttpProbe });
    rawHealths.set(entry.id, health);
  }
  // Second pass: apply supersededBy resolution now that we know which
  // providers are runnable.
  const out: AdapterAvailability[] = [];
  for (const entry of ordered) {
    const raw = rawHealths.get(entry.id);
    if (!raw) continue;
    const resolved = applySupersession(raw, entry, rawHealths);
    out.push(healthToAvailability(entry, resolved));
  }
  return out;
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
  const adapters = await checkAdapters();

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

  // Provider availability section. Registry-driven; runnable providers
  // first, then detected-only, then planned. cpt-probe column shows
  // whether `--adapter <id>` is accepted today.
  process.stdout.write('  providers:\n');
  process.stdout.write(
    `    ${'PROVIDER'.padEnd(14)} ${'STATUS'.padEnd(14)} ${'AUTH'.padEnd(8)} ${'COST'.padEnd(12)} ${'CPT'.padEnd(4)} DETAIL\n`,
  );
  for (const a of adapters) {
    const mark = a.runnable ? '✓' : a.supersededBy ? '→' : a.status === 'implemented' ? '✗' : '·';
    const cpt = a.supportsCptProbe ? 'yes' : '-';
    const authCell = a.supersededBy ? 'covered' : a.authSource;
    const detail = a.supersededBy
      ? `covered by ${a.supersededBy.displayName} — no separate setup needed`
      : a.runnable
        ? a.binaryPath
          ? `${a.binaryPath}${a.credentialPath ? ` · ${a.credentialPath}` : ''}`
          : (a.credentialPath ?? 'runnable')
        : a.nextAction || 'unavailable';
    process.stdout.write(
      `    ${mark} ${a.id.padEnd(12)} ${a.status.padEnd(14)} ${authCell.padEnd(8)} ${a.costMode.padEnd(12)} ${cpt.padEnd(4)} ${detail}\n`,
    );
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
