// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Default runners for install / auth / post-install phases.
// Each runner:
//  - returns a PhaseResult (never throws)
//  - prints concise progress via the supplied PromptIo
//  - leaves stack traces / raw stderr suppressed from the user

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';
import type { ProviderEntry } from '../types.js';
import { isInteractiveTty } from './io.js';
import type { PhaseResult, PromptIo, SetupRunners } from './types.js';

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

async function runShellCommand(
  command: string,
  opts: { inherit: boolean; timeoutMs?: number; env?: Readonly<Record<string, string>> },
): Promise<{ code: number | null; stdoutTail: string; stderrTail: string }> {
  // Use `bash -c <command>` so we can honor `|`, `&&`, `curl | sh`. The
  // command is registry-controlled, not user input.
  const platform = getPlatform();
  const result = await platform.process.spawn({
    command: '/bin/bash',
    args: ['-c', command],
    inherit: opts.inherit,
    timeoutMs: opts.timeoutMs ?? 300_000,
    env: opts.env,
  });
  // Tail the last ~6 lines from each stream for diagnostics.
  const tail = (s: string): string =>
    s.split('\n').filter(Boolean).slice(-6).join(' · ').slice(0, 240);
  return { code: result.code, stdoutTail: tail(result.stdout), stderrTail: tail(result.stderr) };
}

export async function installRunner(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  if (!entry.install) {
    return { phase: 'install', status: 'skipped', detail: 'no install metadata' };
  }
  const platform = getPlatform();
  // Skip if binary already on PATH (for CLI providers).
  if (entry.executable) {
    const already = await platform.process.which(entry.executable);
    if (already) {
      return {
        phase: 'install',
        status: 'skipped',
        detail: `already installed at ${already}`,
      };
    }
  }

  const inherit = entry.install.riskLevel === 'prompt-user' || entry.install.requiresSudo;
  if (inherit && !isInteractiveTty()) {
    return {
      phase: 'install',
      status: 'deferred',
      detail: `install needs a real terminal (sudo/elevated). Run later: ${entry.install.command}`,
    };
  }

  io.status('  Installing...');
  const res = await runShellCommand(entry.install.command, { inherit });
  if (res.code !== 0) {
    return {
      phase: 'install',
      status: 'failed',
      detail: `install exit ${res.code}${res.stderrTail ? `: ${res.stderrTail}` : ''}`,
    };
  }

  // Verify install via verifyCommand (default: <bin> --version).
  if (entry.executable) {
    const verifyCmd = entry.install.verifyCommand ?? `${entry.executable} --version`;
    const verify = await runShellCommand(verifyCmd, { inherit: false, timeoutMs: 10_000 });
    if (verify.code !== 0) {
      return {
        phase: 'install',
        status: 'failed',
        detail: `installed but verify command failed (${verifyCmd})`,
      };
    }
  }
  io.log('  Installing...   ✓ done');
  return { phase: 'install', status: 'ok', detail: 'installed' };
}

// ---------------------------------------------------------------------------
// auth — dispatcher
// ---------------------------------------------------------------------------

export async function authRunner(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  if (!entry.auth) {
    return { phase: 'auth', status: 'skipped', detail: 'no auth metadata' };
  }
  switch (entry.auth.flavor) {
    case 'oauth-browser':
      return runOauthBrowser(entry, io);
    case 'oauth-device-code':
      // Currently dispatched the same way as oauth-browser; device-code
      // providers attach their code to stdout. Engine inherits stdio so the
      // user sees it directly. Distinct flavor reserved for future
      // protocol-aware polling.
      return runOauthBrowser(entry, io);
    case 'api-key-paste':
      return runApiKeyPaste(entry, io);
    case 'manual-only':
      return runManualOnly(entry, io);
    default:
      return { phase: 'auth', status: 'failed', detail: 'unknown auth flavor' };
  }
}

async function runOauthBrowser(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  if (!entry.auth?.command) {
    return { phase: 'auth', status: 'failed', detail: 'auth.command missing for oauth flow' };
  }
  if (entry.auth.needsTty && !isInteractiveTty()) {
    return {
      phase: 'auth',
      status: 'deferred',
      detail: 'OAuth needs a real terminal; deferred to script',
    };
  }
  io.log(
    `  Authenticating... (running \`${entry.auth.command}\`; complete the prompts that follow)`,
  );
  const result = await runShellCommand(entry.auth.command, { inherit: true, timeoutMs: 600_000 });
  if (result.code !== 0) {
    return {
      phase: 'auth',
      status: 'failed',
      detail: `auth command exit ${result.code}`,
    };
  }
  io.log('  Authenticating...   ✓ done');
  return { phase: 'auth', status: 'ok', detail: 'auth completed' };
}

async function runApiKeyPaste(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  if (!entry.auth?.keyDestination) {
    return { phase: 'auth', status: 'failed', detail: 'api-key-paste needs keyDestination' };
  }
  if (!isInteractiveTty()) {
    return {
      phase: 'auth',
      status: 'deferred',
      detail: 'key paste needs a real terminal',
    };
  }
  if (entry.auth.keyIssueUrl) {
    io.log(`  Issue a key at: ${entry.auth.keyIssueUrl}`);
  }
  const key = await io.askSecret('  Paste your API key (or press Enter to skip):');
  if (key.length === 0) {
    return { phase: 'auth', status: 'skipped', detail: 'no key supplied' };
  }
  if (key.length < 8) {
    return { phase: 'auth', status: 'failed', detail: 'key looks too short' };
  }
  const dest = path.join(homedir(), ...entry.auth.keyDestination.homeRelativePath.split('/'));
  await mkdir(path.dirname(dest), { recursive: true });
  const line = `${entry.auth.keyDestination.envVarName}=${key}\n`;
  // Append-or-replace: read existing, strip prior assignment, append.
  const fs = await import('node:fs/promises');
  let prior = '';
  try {
    prior = await fs.readFile(dest, 'utf8');
  } catch {
    /* file missing, fine */
  }
  const filtered = prior
    .split('\n')
    .filter((l) => !l.startsWith(`${entry.auth?.keyDestination?.envVarName}=`))
    .join('\n');
  const next = `${filtered}${filtered && !filtered.endsWith('\n') ? '\n' : ''}${line}`;
  await writeFile(dest, next, { mode: 0o600 });
  // Make the verify step succeed in this process.
  process.env[entry.auth.keyDestination.envVarName] = key;
  io.log(`  Saved to ${dest} (mode 600). Add \`source ${dest}\` to your shell profile to persist.`);
  return { phase: 'auth', status: 'ok', detail: 'key saved' };
}

async function runManualOnly(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  const steps = entry.auth?.manualSteps ?? [];
  if (steps.length === 0) {
    return { phase: 'auth', status: 'skipped', detail: 'no manual steps documented' };
  }
  io.log('  This provider needs manual steps:');
  for (const [i, step] of steps.entries()) {
    io.log(`    ${i + 1}. ${step}`);
  }
  return {
    phase: 'auth',
    status: 'deferred',
    detail: 'follow the steps above and re-run `manthan doctor`',
  };
}

// ---------------------------------------------------------------------------
// post-install
// ---------------------------------------------------------------------------

export async function postInstallRunner(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult> {
  if (!entry.postInstall) {
    return { phase: 'post-install', status: 'skipped', detail: 'no post-install metadata' };
  }
  if (entry.postInstall.optional) {
    const accepted = await io.confirm(`  ${entry.postInstall.description}?`, { default: true });
    if (!accepted) {
      return { phase: 'post-install', status: 'skipped', detail: 'user declined' };
    }
  }
  io.status(`  Running: ${entry.postInstall.command}`);
  const res = await runShellCommand(entry.postInstall.command, {
    inherit: true,
    timeoutMs: 1_800_000,
  });
  if (res.code !== 0) {
    return {
      phase: 'post-install',
      status: 'failed',
      detail: `post-install exit ${res.code}`,
    };
  }
  io.log('  Post-install...   ✓ done');
  return { phase: 'post-install', status: 'ok', detail: 'completed' };
}

export const defaultRunners: SetupRunners = {
  install: installRunner,
  auth: authRunner,
  postInstall: postInstallRunner,
};
