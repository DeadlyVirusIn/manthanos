// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan setup` — guided provider onboarding. One entrypoint, zero
// documentation reads, zero round-trips to ask for commands.

import {
  PROVIDER_REGISTRY,
  type ProviderEntry,
  type SetupSummary,
  getProvider,
  runProviderInstall,
  runProviderLogin,
  runSetup,
} from '@manthanos/providers';

export interface SetupOptions {
  readonly providerIds?: ReadonlyArray<string>;
  readonly nonInteractive?: boolean;
  readonly dryRun?: boolean;
}

export async function runManthanSetup(opts: SetupOptions): Promise<number> {
  if (opts.providerIds && opts.providerIds.length > 0) {
    const known = new Set(PROVIDER_REGISTRY.map((p) => p.id));
    const unknown = opts.providerIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      process.stderr.write(`manthan setup: unknown provider(s): ${unknown.join(', ')}\n`);
      process.stderr.write(`  known: ${[...known].sort().join(', ')}\n`);
      return 2;
    }
  }
  const summary: SetupSummary = await runSetup({
    providerIds: opts.providerIds,
    nonInteractive: opts.nonInteractive,
    dryRun: opts.dryRun,
  });
  // Non-zero exit when at least one provider failed; deferred is not a
  // failure (the user has a clear next step).
  return summary.failedCount > 0 ? 1 : 0;
}

function resolveProvider(id: string): ProviderEntry | null {
  return getProvider(id) ?? null;
}

export async function runManthanProviderInstall(opts: {
  providerId: string;
  dryRun?: boolean;
}): Promise<number> {
  const entry = resolveProvider(opts.providerId);
  if (!entry) {
    process.stderr.write(`manthan provider: unknown provider '${opts.providerId}'\n`);
    return 2;
  }
  if (!entry.install) {
    process.stderr.write(
      `manthan provider ${opts.providerId} install: this provider has no install command in the registry\n`,
    );
    return 2;
  }
  const result = await runProviderInstall(entry, { dryRun: opts.dryRun });
  return result.status === 'ok'
    ? 0
    : result.status === 'skipped' || result.status === 'deferred'
      ? 0
      : 1;
}

export async function runManthanProviderLogin(opts: {
  providerId: string;
  dryRun?: boolean;
}): Promise<number> {
  const entry = resolveProvider(opts.providerId);
  if (!entry) {
    process.stderr.write(`manthan provider: unknown provider '${opts.providerId}'\n`);
    return 2;
  }
  if (!entry.auth) {
    process.stderr.write(
      `manthan provider ${opts.providerId} login: this provider has no auth flow in the registry\n`,
    );
    return 2;
  }
  const result = await runProviderLogin(entry, { dryRun: opts.dryRun });
  return result.status === 'ok'
    ? 0
    : result.status === 'skipped' || result.status === 'deferred'
      ? 0
      : 1;
}
