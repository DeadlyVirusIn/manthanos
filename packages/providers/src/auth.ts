// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Auth discovery — uniform per-provider answers about whether an operator
// can run the provider right now, without invoking it.
//
// Precedence order, generic for every entry:
//   1. credential files (homeRelative) checked in order
//   2. env vars checked in order
//   3. localEndpoint reachability (local integration type only)
//   4. otherwise: 'none'

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AuthDetectionResult, ProviderEntry } from './types.js';

type EnvReader = (name: string) => string | undefined;

function defaultEnv(name: string): string | undefined {
  return process.env[name];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

function resolveCredentialPath(homeRelative: string, homeOverride?: string): string {
  const home = homeOverride ?? homedir();
  // POSIX-style homeRelative; resolve via path.join which is OS-correct.
  return path.join(home, ...homeRelative.split('/').filter(Boolean));
}

async function readExpiresAtMs(filePath: string, field: string): Promise<number | undefined> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const v = parsed[field];
    if (typeof v === 'number') {
      // Heuristic: epoch seconds < year 2100 in seconds (~4.1e9); higher
      // values are taken as milliseconds.
      return v > 4_500_000_000 ? v : v * 1000;
    }
    if (typeof v === 'string') {
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? ms : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export interface DetectAuthOptions {
  readonly env?: EnvReader;
  readonly homeOverride?: string;
  /** Override `Date.now()` for tests; defaults to the real clock. */
  readonly now?: () => number;
  /**
   * For 'local' integrations: a callback that resolves to true iff the
   * provider's localEndpoint is reachable. Defaults to a no-op (false).
   * Real reachability is operator-environment-specific; tests inject
   * their own.
   */
  readonly probeLocal?: (endpoint: string) => Promise<boolean>;
}

export async function detectAuth(
  entry: ProviderEntry,
  opts: DetectAuthOptions = {},
): Promise<AuthDetectionResult> {
  const env = opts.env ?? defaultEnv;
  const now = opts.now ?? Date.now;

  // 1) credential files
  for (const spec of entry.credentialFiles) {
    const credPath = resolveCredentialPath(spec.homeRelative, opts.homeOverride);
    if (!(await fileExists(credPath))) continue;
    let expiresAtMs: number | undefined;
    let expired: boolean | undefined;
    if (spec.expiresAtField) {
      expiresAtMs = await readExpiresAtMs(credPath, spec.expiresAtField);
      if (expiresAtMs !== undefined) expired = expiresAtMs <= now();
    }
    const detail =
      expired === true
        ? `OAuth credential present at ${credPath} but token expired (${spec.expiresAtField}).`
        : `OAuth credential detected at ${credPath}.`;
    return { source: 'oauth', credentialPath: credPath, expiresAtMs, expired, detail };
  }

  // 2) env vars
  for (const name of entry.envVars) {
    const v = env(name);
    if (typeof v === 'string' && v.length > 0) {
      return { source: 'env', envVar: name, detail: `Auth via $${name}.` };
    }
  }

  // 3) local probe
  if (entry.integrationType === 'local' && entry.localEndpoint) {
    if (opts.probeLocal && (await opts.probeLocal(entry.localEndpoint))) {
      return { source: 'local', detail: `Local endpoint reachable at ${entry.localEndpoint}.` };
    }
    return {
      source: 'none',
      detail: `Local endpoint ${entry.localEndpoint} did not respond.`,
    };
  }

  return { source: 'none', detail: 'No credential file or env var found.' };
}
