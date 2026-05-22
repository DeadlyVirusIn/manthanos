// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Combine binary detection + auth detection + (optional) local probe into
// a single "is this provider runnable right now?" answer with a concise
// next-action string for the operator.

import { getPlatform } from '@manthanos/platform';
import { type DetectAuthOptions, detectAuth } from './auth.js';
import { PROVIDER_REGISTRY } from './registry.js';
import type { ProviderEntry, ProviderHealth } from './types.js';

export interface ProviderHealthOptions extends DetectAuthOptions {
  /** Override `platform.process.which` for tests. */
  readonly which?: (bin: string) => Promise<string | null>;
}

/**
 * Apply ProviderEntry.supersededBy resolution against a set of
 * already-computed healths. Returns a new ProviderHealth with
 * `supersededBy` populated when one of the listed providers is
 * runnable. Pure function — does not re-probe anything.
 */
export function applySupersession(
  health: ProviderHealth,
  entry: ProviderEntry,
  healthByProviderId: ReadonlyMap<string, ProviderHealth>,
): ProviderHealth {
  if (!entry.supersededBy || entry.supersededBy.length === 0) return health;
  for (const otherId of entry.supersededBy) {
    const otherHealth = healthByProviderId.get(otherId);
    if (!otherHealth?.runnable) continue;
    const other = PROVIDER_REGISTRY.find((p) => p.id === otherId);
    return {
      ...health,
      supersededBy: {
        providerId: otherId,
        displayName: other?.displayName ?? otherId,
      },
    };
  }
  return health;
}

/**
 * Default reachability probe for 'local' providers. Issues a GET with a
 * short timeout; returns true iff the response is 2xx. Network errors,
 * non-2xx, and timeouts all classify as "not reachable".
 *
 * Kept here (rather than in doctor) so any consumer that needs to know
 * whether a local provider is live can use the same primitive.
 */
export async function defaultLocalHttpProbe(endpoint: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeProviderHealth(
  entry: ProviderEntry,
  opts: ProviderHealthOptions = {},
): Promise<ProviderHealth> {
  const which = opts.which ?? ((bin: string) => getPlatform().process.which(bin));

  let binaryFound = true;
  let binaryPath: string | undefined;
  if (entry.executable) {
    const resolved = await which(entry.executable);
    binaryFound = resolved !== null;
    binaryPath = resolved ?? undefined;
  }

  const auth = await detectAuth(entry, opts);

  const localReachable = entry.integrationType === 'local' ? auth.source === 'local' : undefined;

  // Runnability rules:
  //   - CLI providers: need binary present AND a non-'none' auth source.
  //     OAuth that has expired is treated as not-runnable.
  //     Exception: when entry.runnableIfBinary is true, the CLI manages
  //     its own auth state inside its host and the binary's presence
  //     alone is the strongest signal we can mechanically detect.
  //   - API providers: need env auth (no binary required).
  //   - Local providers: need binary present AND localReachable.
  let runnable: boolean;
  switch (entry.integrationType) {
    case 'cli':
      runnable =
        binaryFound &&
        ((auth.source !== 'none' && auth.expired !== true) || entry.runnableIfBinary === true);
      break;
    case 'api':
      runnable = auth.source === 'env';
      break;
    case 'local':
      runnable = binaryFound && localReachable === true;
      break;
    default:
      runnable = false;
  }

  // Concise next-step. Empty when runnable.
  let nextAction = '';
  if (!runnable) {
    if (entry.executable && !binaryFound) {
      nextAction = `install \`${entry.executable}\` and place it on PATH`;
    } else if (entry.integrationType === 'local' && localReachable === false) {
      nextAction = `start the local ${entry.displayName} service (probed ${entry.localEndpoint})`;
    } else if (auth.expired === true) {
      nextAction = `re-authenticate ${entry.displayName} (token expired)`;
    } else if (auth.source === 'none') {
      const credHint = entry.credentialFiles[0]?.homeRelative;
      const envHint = entry.envVars[0];
      if (credHint && envHint) {
        nextAction = `sign in (writes ~/${credHint}) or set $${envHint}`;
      } else if (credHint) {
        nextAction = `sign in to create ~/${credHint}`;
      } else if (envHint) {
        nextAction = `set $${envHint}`;
      } else {
        nextAction = `configure ${entry.displayName}`;
      }
    }
  }

  return {
    providerId: entry.id,
    binaryFound,
    binaryPath,
    auth,
    localReachable,
    runnable,
    nextAction,
  };
}
