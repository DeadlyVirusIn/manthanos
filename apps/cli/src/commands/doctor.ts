// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan doctor` — read-only health check.
// Phase 0 scope:
//   - print platform info
//   - check git on PATH
//   - if a .manthan/ exists in cwd: open DB, verify chain, count rows
//   - scan git hooks per SAFETY §11d (informational)

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBlobStore, openDb, runRecovery } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { scanGitHooks } from '@manthanos/safety';

export interface DoctorOptions {
  readonly cwd: string;
}

export interface DoctorReport {
  readonly platform: { os: string; arch: string; isWSL: boolean };
  readonly node: string;
  readonly gitVersion: string | null;
  readonly workspaceInitialized: boolean;
  readonly chainOk?: boolean;
  readonly auditEvents?: number;
  readonly gitHooksDetected?: number;
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

  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(opts.cwd);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const initialized = existsSync(manthanDir);

  // Always print platform info.
  process.stdout.write('manthan doctor\n');
  process.stdout.write(`  platform: ${platform.info.os}/${platform.info.arch}`);
  if (platform.info.isWSL) process.stdout.write(' (WSL)');
  process.stdout.write('\n');
  process.stdout.write(`  node:     ${process.version}\n`);
  process.stdout.write(`  git:      ${gitVersion ?? '(not found on PATH)'}\n`);
  process.stdout.write(`  cwd:      ${workspaceRoot}\n`);
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
      gitVersion,
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
        gitVersion,
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
    process.stdout.write(`  audit chain: ${report.chainOk ? 'ok' : 'FAILED'}`);
    if (!report.chainOk) {
      process.stdout.write(` (at seq=${report.chainFailedAtSeq})`);
    }
    process.stdout.write('\n');
    process.stdout.write(`  events:      ${report.chainCheckedEvents}\n`);
    process.stdout.write(`  orphan blobs: ${report.orphanBlobsFound}\n`);
    if (hooks.length > 0) {
      process.stdout.write(`  git hooks detected: ${hooks.length}\n`);
      for (const h of hooks) {
        process.stdout.write(`    - ${h.path}  ${h.sha256.slice(0, 12)}…\n`);
      }
      process.stdout.write('    (Phase 0 informational only; refusal flow lands in Phase 1.)\n');
    }

    return {
      platform: {
        os: platform.info.os,
        arch: platform.info.arch,
        isWSL: platform.info.isWSL,
      },
      node: process.version,
      gitVersion,
      workspaceInitialized: true,
      chainOk: report.chainOk,
      auditEvents: report.chainCheckedEvents,
      gitHooksDetected: hooks.length,
    };
  } finally {
    m.close();
  }
}
