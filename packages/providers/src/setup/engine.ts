// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Provider-setup state machine.
//
// One entrypoint: `runSetup(opts)`. The function iterates providers in
// priority order (already-runnable skipped briefly; eligible providers
// stepped through DETECT → CONFIRM → INSTALL → AUTH → POSTINSTALL →
// VERIFY). Every phase returns a PhaseResult; failures are turned into
// one-line user-visible status, never stack traces.

import { applySupersession, defaultLocalHttpProbe, probeProviderHealth } from '../health.js';
import { PROVIDER_REGISTRY } from '../registry.js';
import type { ProviderEntry, ProviderHealth } from '../types.js';
import { type DeferredItem, emitDeferredScript } from './defer.js';
import { createDefaultIo, isInteractiveTty } from './io.js';
import { defaultRunners } from './runners.js';
import type {
  PhaseResult,
  PromptIo,
  ProviderSetupResult,
  SetupEngineOptions,
  SetupRunners,
  SetupSummary,
} from './types.js';

function priorityOrdered(entries: ReadonlyArray<ProviderEntry>): ReadonlyArray<ProviderEntry> {
  // implemented first, then detected-only, then planned; within tier,
  // registry order is preserved.
  return [
    ...entries.filter((e) => e.status === 'implemented'),
    ...entries.filter((e) => e.status === 'detected-only'),
    ...entries.filter((e) => e.status === 'planned'),
  ];
}

function isEligible(entry: ProviderEntry): boolean {
  // The engine only attempts providers it knows how to install OR
  // authenticate. A registry entry with neither install nor auth is
  // pure discovery — setup has nothing to do.
  return Boolean(entry.install || entry.auth);
}

function deriveOutcome(phases: ReadonlyArray<PhaseResult>): ProviderSetupResult['outcome'] {
  // Failure beats deferral beats success.
  if (phases.some((p) => p.status === 'failed')) return 'failed';
  if (phases.some((p) => p.status === 'deferred')) return 'deferred';
  if (phases.some((p) => p.status === 'ok')) return 'ready';
  return 'skipped';
}

async function defaultProbe(entry: ProviderEntry): Promise<{ runnable: boolean; detail: string }> {
  // Probe this entry and any provider it lists in supersededBy. If any
  // of those is runnable, treat this entry as covered (runnable for the
  // user's setup intent — they don't need to configure it separately).
  const own = await probeProviderHealth(entry, { probeLocal: defaultLocalHttpProbe });
  if (!entry.supersededBy || entry.supersededBy.length === 0) {
    return { runnable: own.runnable, detail: own.nextAction || own.auth.detail };
  }
  const byId = new Map<string, ProviderHealth>();
  for (const otherId of entry.supersededBy) {
    const other = PROVIDER_REGISTRY.find((p) => p.id === otherId);
    if (!other) continue;
    const otherHealth = await probeProviderHealth(other, { probeLocal: defaultLocalHttpProbe });
    byId.set(otherId, otherHealth);
  }
  const resolved = applySupersession(own, entry, byId);
  if (resolved.supersededBy) {
    return {
      runnable: true,
      detail: `covered by ${resolved.supersededBy.displayName}`,
    };
  }
  return { runnable: own.runnable, detail: own.nextAction || own.auth.detail };
}

export async function runSetup(opts: SetupEngineOptions = {}): Promise<SetupSummary> {
  const started = Date.now();
  const io: PromptIo = opts.io ?? createDefaultIo();
  const runners: SetupRunners = opts.runners ?? defaultRunners;
  const probe = opts.probe ?? defaultProbe;
  const ttyAvailable = opts.forceTty ?? isInteractiveTty();
  const nonInteractive = Boolean(opts.nonInteractive) || !ttyAvailable;

  const selected = opts.providerIds
    ? PROVIDER_REGISTRY.filter((e) => opts.providerIds?.includes(e.id))
    : PROVIDER_REGISTRY;
  const ordered = priorityOrdered(selected);

  io.header('ManthanOS setup', 'Connect your AI providers');
  if (opts.dryRun) io.log('(dry-run — no commands will be executed)');
  if (nonInteractive && !opts.dryRun) {
    io.log(
      '(non-interactive shell — interactive flows will be deferred to a script you can run elsewhere)',
    );
  }

  const eligible = ordered.filter(isEligible);
  const total = eligible.length;
  const results: ProviderSetupResult[] = [];
  const deferred: DeferredItem[] = [];

  let skipAll = false;

  // First pass: print a quick survey so the user knows what we found.
  io.log('');
  io.log('Detecting providers...');
  for (const entry of ordered) {
    const { runnable } = await probe(entry);
    const mark = runnable ? '✓' : isEligible(entry) ? '✗' : '·';
    const note = runnable ? 'ready' : isEligible(entry) ? 'needs setup' : 'no setup metadata';
    io.log(`  ${mark} ${entry.displayName.padEnd(40)} ${note}`);
  }

  if (total === 0) {
    io.log('');
    io.log('Nothing to set up.');
    return {
      attempted: [],
      readyCount: 0,
      deferredCount: 0,
      failedCount: 0,
      skippedCount: 0,
      elapsedMs: Date.now() - started,
    };
  }

  let index = 0;
  for (const entry of eligible) {
    index += 1;
    io.header(`Provider ${index} of ${total}`, entry.displayName);

    const phases: PhaseResult[] = [];

    // DETECT
    const detectStart = await probe(entry);
    phases.push({
      phase: 'detect',
      status: detectStart.runnable ? 'ok' : 'skipped',
      detail: detectStart.runnable ? 'already ready' : detectStart.detail,
    });
    if (detectStart.runnable) {
      const reason = detectStart.detail.startsWith('covered by')
        ? `  → ${detectStart.detail} — no separate setup needed`
        : '  ✓ already ready — no action needed';
      io.log(reason);
      results.push({
        providerId: entry.id,
        displayName: entry.displayName,
        outcome: 'ready',
        phases,
      });
      continue;
    }

    // CONFIRM
    if (skipAll) {
      results.push({
        providerId: entry.id,
        displayName: entry.displayName,
        outcome: 'skipped',
        phases: [...phases, { phase: 'install', status: 'skipped', detail: 'skip-all' }],
      });
      continue;
    }

    let approved: boolean;
    if (opts.dryRun) {
      approved = true;
    } else if (nonInteractive) {
      // In non-interactive mode we defer everything interactive but still
      // attempt safe, no-prompt installs. For now: collect everything as
      // deferred. Safe non-interactive installs are reachable via the
      // explicit `manthan provider <id> install` command.
      deferred.push({
        providerId: entry.id,
        displayName: entry.displayName,
        entry,
        reasons: ['interactive shell required'],
      });
      results.push({
        providerId: entry.id,
        displayName: entry.displayName,
        outcome: 'deferred',
        phases: [...phases, { phase: 'install', status: 'deferred', detail: 'non-interactive' }],
      });
      continue;
    } else {
      const ans = await io.ask(`Set up ${entry.displayName}? [Y/n/skip-all]`);
      const trimmed = ans.toLowerCase();
      if (trimmed === 'skip-all') {
        skipAll = true;
        approved = false;
      } else if (trimmed === 'n' || trimmed === 'no') {
        approved = false;
      } else {
        approved = true; // empty = yes
      }
    }

    if (!approved) {
      results.push({
        providerId: entry.id,
        displayName: entry.displayName,
        outcome: 'skipped',
        phases: [...phases, { phase: 'install', status: 'skipped', detail: 'user declined' }],
      });
      continue;
    }

    // INSTALL
    if (opts.dryRun) {
      if (entry.install) {
        io.log(`  [dry-run] would run: ${entry.install.command}`);
      }
    } else {
      const installResult = await runners.install(entry, io);
      phases.push(installResult);
      if (installResult.status === 'failed') {
        io.log(`  ✗ install failed — ${installResult.detail}`);
        results.push({
          providerId: entry.id,
          displayName: entry.displayName,
          outcome: 'failed',
          phases,
        });
        continue;
      }
      if (installResult.status === 'deferred') {
        deferred.push({
          providerId: entry.id,
          displayName: entry.displayName,
          entry,
          reasons: [installResult.detail],
        });
        results.push({
          providerId: entry.id,
          displayName: entry.displayName,
          outcome: 'deferred',
          phases,
        });
        continue;
      }
    }

    // AUTH
    if (opts.dryRun) {
      if (entry.auth) {
        const desc =
          entry.auth.flavor === 'api-key-paste'
            ? `prompt for ${entry.auth.keyDestination?.envVarName ?? 'API key'}`
            : entry.auth.command
              ? `run ${entry.auth.command}`
              : entry.auth.flavor;
        io.log(`  [dry-run] auth would: ${desc}`);
      }
    } else if (entry.auth) {
      const authResult = await runners.auth(entry, io);
      phases.push(authResult);
      if (authResult.status === 'failed') {
        io.log(`  ✗ auth failed — ${authResult.detail}`);
        results.push({
          providerId: entry.id,
          displayName: entry.displayName,
          outcome: 'failed',
          phases,
        });
        continue;
      }
      if (authResult.status === 'deferred') {
        deferred.push({
          providerId: entry.id,
          displayName: entry.displayName,
          entry,
          reasons: [authResult.detail],
        });
        results.push({
          providerId: entry.id,
          displayName: entry.displayName,
          outcome: 'deferred',
          phases,
        });
        continue;
      }
    }

    // POST-INSTALL
    if (opts.dryRun) {
      if (entry.postInstall) {
        io.log(`  [dry-run] post-install would: ${entry.postInstall.command}`);
      }
    } else if (entry.postInstall) {
      const post = await runners.postInstall(entry, io);
      phases.push(post);
    }

    // VERIFY
    if (opts.dryRun) {
      io.log('  [dry-run] verify would re-probe runnable state');
      results.push({
        providerId: entry.id,
        displayName: entry.displayName,
        outcome: 'ready',
        phases,
      });
      continue;
    }
    const verifyResult = await probe(entry);
    phases.push({
      phase: 'verify',
      status: verifyResult.runnable ? 'ok' : 'failed',
      detail: verifyResult.runnable ? 'ready' : verifyResult.detail,
    });
    if (verifyResult.runnable) {
      io.log('  ✓ Ready');
    } else {
      io.log(`  ✗ Couldn't verify — ${verifyResult.detail}`);
    }

    results.push({
      providerId: entry.id,
      displayName: entry.displayName,
      outcome: deriveOutcome(phases),
      phases,
    });
  }

  if (deferred.length > 0 && !opts.dryRun) {
    const scriptPath = await emitDeferredScript(deferred, { scriptDir: opts.scriptDir });
    io.log('');
    io.log(`⚠ ${deferred.length} provider(s) deferred — this shell can't complete them.`);
    io.log(`  Open a real terminal and run:  bash ${scriptPath}`);
    io.log('  Then come back and run:  manthan doctor');
    // Annotate deferred results with the script path.
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      if (!r) continue;
      if (r.outcome === 'deferred') {
        results[i] = { ...r, deferredScriptPath: scriptPath };
      }
    }
  }

  const summary: SetupSummary = {
    attempted: results,
    readyCount: results.filter((r) => r.outcome === 'ready').length,
    deferredCount: results.filter((r) => r.outcome === 'deferred').length,
    failedCount: results.filter((r) => r.outcome === 'failed').length,
    skippedCount: results.filter((r) => r.outcome === 'skipped').length,
    elapsedMs: Date.now() - started,
  };

  io.log('');
  io.log(
    `Setup complete: ${summary.readyCount} ready, ${summary.deferredCount} deferred, ${summary.failedCount} failed, ${summary.skippedCount} skipped.`,
  );
  return summary;
}

// One-off variants for `manthan provider <id> install|login`.

export async function runProviderInstall(
  entry: ProviderEntry,
  opts: { io?: PromptIo; runners?: SetupRunners; dryRun?: boolean } = {},
): Promise<PhaseResult> {
  const io = opts.io ?? createDefaultIo();
  const runners = opts.runners ?? defaultRunners;
  io.header(`Install ${entry.displayName}`);
  if (opts.dryRun) {
    if (entry.install) io.log(`  [dry-run] would run: ${entry.install.command}`);
    return { phase: 'install', status: 'skipped', detail: 'dry-run' };
  }
  return runners.install(entry, io);
}

export async function runProviderLogin(
  entry: ProviderEntry,
  opts: { io?: PromptIo; runners?: SetupRunners; dryRun?: boolean } = {},
): Promise<PhaseResult> {
  const io = opts.io ?? createDefaultIo();
  const runners = opts.runners ?? defaultRunners;
  io.header(`Sign in to ${entry.displayName}`);
  if (opts.dryRun) {
    if (entry.auth?.command) io.log(`  [dry-run] would run: ${entry.auth.command}`);
    return { phase: 'auth', status: 'skipped', detail: 'dry-run' };
  }
  return runners.auth(entry, io);
}
