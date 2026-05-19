#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import type { ClaudePresetId } from '@manthanos/adapter-claude';
import { Command } from 'commander';
import { runAuth } from './commands/auth.js';
import { computeDoctorExitCode, runDoctor } from './commands/doctor.js';
import { InitError, runInit } from './commands/init.js';
import { runNext } from './commands/next.js';
import { runPlan } from './commands/plan.js';
import { runReplay } from './commands/replay.js';
import { runVersion } from './commands/version.js';
import { CLI_VERSION } from './version-const.js';

const program = new Command();

program
  .name('manthan')
  .description('ManthanOS — persistent AI engineering runtime')
  .version(CLI_VERSION, '-v, --version', 'output the version');

program
  .command('version')
  .description('Show CLI and platform version detail')
  .action(async () => {
    await runVersion();
  });

program
  .command('init')
  .description('Initialize a ManthanOS workspace in the current directory')
  .option('--force', 'Overwrite an existing .manthan/ directory')
  .action(async (opts: { force?: boolean }) => {
    try {
      const result = await runInit({ cwd: process.cwd(), force: opts.force });
      process.stdout.write(`\n✓ Initialized at ${result.manthanDir}\n`);
      process.stdout.write(`  workspace_id:   ${result.workspaceId}\n`);
      process.stdout.write(`  genesis_seq:    ${result.genesisSeq}\n`);
      process.stdout.write(`  charter_facts:  ${result.charterFacts} (tier T0, quarantined)\n`);
      process.stdout.write(`  elapsed:        ${result.elapsedMs}ms\n`);
      process.stdout.write('\nNext: `manthan doctor` to verify health.\n');
    } catch (err) {
      if (err instanceof InitError) {
        process.stderr.write(`manthan init: ${err.message}\n`);
        process.exitCode = err.code === 'ALREADY_INITIALIZED' ? 2 : 1;
        return;
      }
      throw err;
    }
  });

program
  .command('doctor')
  .description('Diagnose the current workspace and runtime health')
  .option('--strict', 'Exit non-zero if recovery status is corrupted or unrecoverable')
  .action(async (opts: { strict?: boolean }) => {
    const strict = opts.strict ?? false;
    const report = await runDoctor({ cwd: process.cwd(), strict });
    process.exitCode = computeDoctorExitCode(report, strict);
  });

program
  .command('next')
  .description('Show the current workflow state and the obvious next step')
  .option('--no-color', 'disable ANSI color (NO_COLOR env is also honored)')
  .option('--force-color', 'force ANSI color even when stdout is not a TTY')
  .action(async (opts: { color?: boolean; forceColor?: boolean }) => {
    const noColor = opts.color === false;
    const code = await runNext({
      cwd: process.cwd(),
      noColor,
      forceColor: opts.forceColor,
    });
    process.exitCode = code;
  });

program
  .command('auth')
  .description('Configure provider credentials (Anthropic in Phase 1)')
  .option('--set <target>', 'Store key for global or workspace (reads from stdin)')
  .action(async (opts: { set?: string }) => {
    let target: 'global' | 'workspace' | undefined;
    if (opts.set === 'global' || opts.set === 'workspace') target = opts.set;
    else if (opts.set !== undefined) {
      process.stderr.write("manthan auth: --set must be 'global' or 'workspace'\n");
      process.exitCode = 2;
      return;
    }
    await runAuth({ cwd: process.cwd(), set: target });
  });

program
  .command('plan')
  .description('Produce a structured implementation plan via Claude')
  .argument('<brief>', 'one-paragraph engineering task')
  .option(
    '-m, --model <id>',
    "Model alias ('sonnet'/'opus' for cli; preset id like 'claude-sonnet-4-5' for api)",
    'sonnet',
  )
  .option(
    '--adapter <mode>',
    "one of: 'cli' (Claude Code subscription, default) | 'api' (needs ANTHROPIC_API_KEY) | 'codex-cli' | 'gemini-cli'",
    'cli',
  )
  .option('--budget <usd>', 'budget in USD (e.g. 0.10)', '0.50')
  .option('--max-output <n>', 'max output tokens', '4096')
  .option('--context-budget <n>', 'max input tokens for context bundle', '60000')
  .option('--file <path...>', 'explicit file(s) to include (repeatable)')
  .option('--include-quarantine', 'include T0 quarantined facts in the context bundle')
  .option('--show-trusted', 'print trusted facts that will be injected into this prompt')
  .action(
    async (
      brief: string,
      cmdOpts: {
        model: string;
        adapter: string;
        budget: string;
        maxOutput: string;
        contextBudget: string;
        file?: string[];
        includeQuarantine?: boolean;
        showTrusted?: boolean;
      },
    ) => {
      const usd = Number.parseFloat(cmdOpts.budget);
      if (!Number.isFinite(usd) || usd <= 0) {
        process.stderr.write('manthan plan: --budget must be a positive USD value\n');
        process.exitCode = 2;
        return;
      }
      const validAdapters = ['cli', 'api', 'codex-cli', 'gemini-cli'];
      if (!validAdapters.includes(cmdOpts.adapter)) {
        process.stderr.write(
          `manthan plan: --adapter must be one of: ${validAdapters.join(', ')}\n`,
        );
        process.exitCode = 2;
        return;
      }
      const code = await runPlan({
        cwd: process.cwd(),
        taskBrief: brief,
        model: cmdOpts.model as ClaudePresetId,
        adapterMode: cmdOpts.adapter as 'cli' | 'api' | 'codex-cli' | 'gemini-cli',
        maxUsdMicro: Math.round(usd * 1_000_000),
        maxOutputTokens: Number.parseInt(cmdOpts.maxOutput, 10),
        contextTokenBudget: Number.parseInt(cmdOpts.contextBudget, 10),
        explicitFiles: cmdOpts.file,
        includeQuarantine: cmdOpts.includeQuarantine ?? false,
        showTrusted: cmdOpts.showTrusted ?? false,
      });
      process.exitCode = code;
    },
  );

program
  .command('replay')
  .description('Replay a recorded workflow run from audit + blobs (no network)')
  .argument('<runId>', 'workflow run id (e.g. wf_...)')
  .option('--show-text', 'print the recorded response text')
  .option('--json', 'emit the full ReplayResult as JSON; suppress human-readable output')
  .option('--no-color', 'disable ANSI color (NO_COLOR env is also honored)')
  .option('--force-color', 'force ANSI color even when stdout is not a TTY')
  .action(
    async (
      runId: string,
      opts: { showText?: boolean; json?: boolean; color?: boolean; forceColor?: boolean },
    ) => {
      // commander maps `--no-color` to `opts.color === false`.
      const noColor = opts.color === false;
      const code = await runReplay({
        cwd: process.cwd(),
        runId,
        showText: opts.showText,
        json: opts.json,
        noColor,
        forceColor: opts.forceColor,
      });
      process.exitCode = code;
    },
  );

const brain = program.command('brain').description('Inspect the Project Brain');

brain
  .command('stats')
  .description('Show counts and totals for the current workspace brain')
  .action(async () => {
    const { runBrainStats } = await import('./commands/brain.js');
    process.exitCode = await runBrainStats({ cwd: process.cwd() });
  });

brain
  .command('facts')
  .description('List semantic facts')
  .option('--area <area>', 'filter by area (e.g. auth)')
  .option('--tier <tier>', 'filter by tier (T0, T+1, T+2, T+3, T-1, T-2)')
  .action(async (opts: { area?: string; tier?: string }) => {
    const { runBrainFacts } = await import('./commands/brain.js');
    process.exitCode = await runBrainFacts({
      cwd: process.cwd(),
      area: opts.area,
      tier: opts.tier,
    });
  });

brain
  .command('issues')
  .description('List open issues')
  .option('--all', 'include closed issues')
  .action(async (opts: { all?: boolean }) => {
    const { runBrainIssues } = await import('./commands/brain.js');
    process.exitCode = await runBrainIssues({ cwd: process.cwd(), all: opts.all });
  });

brain
  .command('history')
  .description('List recent workflow runs')
  .option('--limit <n>', 'how many to show', '20')
  .action(async (opts: { limit: string }) => {
    const { runBrainHistory } = await import('./commands/brain.js');
    process.exitCode = await runBrainHistory({
      cwd: process.cwd(),
      limit: Number.parseInt(opts.limit, 10),
    });
  });

brain
  .command('promote')
  .description('Promote a quarantined fact (T0 → T+1) or T+1 → T+2 with human approval')
  .argument('<factId>')
  .option('--to <tier>', 'target tier (T+1 or T+2)', '')
  .option('--note <text>', 'optional note recorded with the audit event')
  .option('--yes', 'skip the confirmation prompt')
  .action(async (factId: string, opts: { to: string; note?: string; yes?: boolean }) => {
    const { runBrainPromote } = await import('./commands/brain-trust.js');
    let target: 'T+1' | 'T+2' | undefined;
    if (opts.to === 'T+1' || opts.to === 'T+2') target = opts.to;
    else if (opts.to !== '') {
      process.stderr.write("manthan brain promote: --to must be 'T+1' or 'T+2'\n");
      process.exitCode = 2;
      return;
    }
    process.exitCode = await runBrainPromote({
      cwd: process.cwd(),
      factId,
      targetTier: target,
      note: opts.note,
      yes: opts.yes,
    });
  });

brain
  .command('demote')
  .description('Demote a trusted fact (e.g., back to quarantine or reject)')
  .argument('<factId>')
  .requiredOption('--reason <text>', 'why the demotion is necessary')
  .option('--to <tier>', 'target tier (T0, T-1, T-2)', '')
  .option('--yes', 'skip the confirmation prompt')
  .action(async (factId: string, opts: { reason: string; to: string; yes?: boolean }) => {
    const { runBrainDemote } = await import('./commands/brain-trust.js');
    let target: 'T0' | 'T-1' | 'T-2' | undefined;
    if (opts.to === 'T0' || opts.to === 'T-1' || opts.to === 'T-2') target = opts.to;
    else if (opts.to !== '') {
      process.stderr.write("manthan brain demote: --to must be 'T0', 'T-1', or 'T-2'\n");
      process.exitCode = 2;
      return;
    }
    process.exitCode = await runBrainDemote({
      cwd: process.cwd(),
      factId,
      targetTier: target,
      reason: opts.reason,
      yes: opts.yes,
    });
  });

brain
  .command('simulate-aging')
  .description('Inject a back-dated synthetic project history (Phase 2 unblocker)')
  .option('--span-weeks <n>', 'how many weeks of history to simulate', '8')
  .option('--seed <n>', 'PRNG seed in decimal (default: 0xC0FFEE)', '12648430')
  .option('--dry-run', 'report what would be written without writing')
  .option('--yes', 'skip the confirmation prompt (required for non-TTY)')
  .action(async (opts: { spanWeeks: string; seed: string; dryRun?: boolean; yes?: boolean }) => {
    const spanWeeks = Number.parseInt(opts.spanWeeks, 10);
    const seed = Number.parseInt(opts.seed, 10);
    if (!Number.isInteger(spanWeeks) || spanWeeks <= 0 || spanWeeks > 52) {
      process.stderr.write(
        'manthan brain simulate-aging: --span-weeks must be an integer in [1, 52]\n',
      );
      process.exitCode = 2;
      return;
    }
    if (!Number.isInteger(seed) || seed < 0) {
      process.stderr.write('manthan brain simulate-aging: --seed must be a non-negative integer\n');
      process.exitCode = 2;
      return;
    }
    const { runSimulateAging } = await import('./commands/brain-sim.js');
    process.exitCode = await runSimulateAging({
      cwd: process.cwd(),
      spanWeeks,
      seed,
      dryRun: opts.dryRun ?? false,
      yes: opts.yes ?? false,
    });
  });

brain
  .command('metrics')
  .description('Show brain observability metrics (Phase 2 deliverable)')
  .action(async () => {
    const { runMetrics } = await import('./commands/brain-sim.js');
    process.exitCode = await runMetrics({ cwd: process.cwd() });
  });

brain
  .command('duplicates')
  .description('Detect paraphrase clusters in the trusted brain (Phase 2 dedup)')
  .option('--threshold <n>', 'Jaccard threshold for clustering (0..1)', '0.25')
  .option('--area <area>', 'limit detection to one area')
  .action(async (opts: { threshold: string; area?: string }) => {
    const threshold = Number.parseFloat(opts.threshold);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      process.stderr.write('manthan brain duplicates: --threshold must be in (0, 1]\n');
      process.exitCode = 2;
      return;
    }
    const { runDuplicates } = await import('./commands/brain-dedup.js');
    process.exitCode = await runDuplicates({
      cwd: process.cwd(),
      threshold,
      area: opts.area,
    });
  });

brain
  .command('review')
  .description('Batch-review the T0 quarantine queue (promote/skip with one screen)')
  .option('--area <area>', 'restrict to one area')
  .option('--limit <n>', 'max facts per session', '20')
  .option('--batch <spec>', 'non-interactive selections, e.g. "1p 2-4P 5s"')
  .option('--dry-run', 'show selections + summary without applying')
  .option(
    '--threshold-profile <profile>',
    'decay profile for warn-band hints (conservative|normal|aggressive)',
    'normal',
  )
  .action(
    async (opts: {
      area?: string;
      limit: string;
      batch?: string;
      dryRun?: boolean;
      thresholdProfile: string;
    }) => {
      const limit = Number.parseInt(opts.limit, 10);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        process.stderr.write('manthan brain review: --limit must be an integer in [1, 100]\n');
        process.exitCode = 2;
        return;
      }
      const valid = ['conservative', 'normal', 'aggressive'];
      if (!valid.includes(opts.thresholdProfile)) {
        process.stderr.write(
          `manthan brain review: --threshold-profile must be one of: ${valid.join(', ')}\n`,
        );
        process.exitCode = 2;
        return;
      }
      const { runReview } = await import('./commands/brain-review.js');
      process.exitCode = await runReview({
        cwd: process.cwd(),
        area: opts.area,
        limit,
        batch: opts.batch,
        dryRun: opts.dryRun ?? false,
        thresholdProfile: opts.thresholdProfile as 'conservative' | 'normal' | 'aggressive',
      });
    },
  );

brain
  .command('trust-log')
  .description('Recent trust mutations (promote/demote/dedup-merge), with undo seqs')
  .option('--limit <n>', 'how many recent events to show', '20')
  .option('--include-decay', 'include automatic decay events (hidden by default)')
  .action(async (opts: { limit: string; includeDecay?: boolean }) => {
    const limit = Number.parseInt(opts.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      process.stderr.write('manthan brain trust-log: --limit must be an integer in [1, 500]\n');
      process.exitCode = 2;
      return;
    }
    const { runTrustLog } = await import('./commands/brain-trust-log.js');
    process.exitCode = await runTrustLog({
      cwd: process.cwd(),
      limit,
      includeDecay: opts.includeDecay ?? false,
    });
  });

brain
  .command('queue-health')
  .description('Operational diagnostic: T0 backlog pressure, aging buckets, projection')
  .action(async () => {
    const { runQueueHealth } = await import('./commands/brain-queue-health.js');
    process.exitCode = await runQueueHealth({ cwd: process.cwd() });
  });

brain
  .command('simulate-long-horizon')
  .description('Pressure-test the hygiene loop over simulated months (Phase 2 #7)')
  .option('--weeks <n>', 'simulated weeks', '26')
  .option('--corpus-cycles <n>', 'number of corpus injection cycles', '3')
  .option('--review-cadence-weeks <n>', 'human review every N weeks', '2')
  .option('--human-attention <f>', 'mean fraction of T0 reviewed per session (0..1)', '0.4')
  .option('--decay-cadence-weeks <n>', 'decay pass every N weeks', '4')
  .option('--dedup-cadence-weeks <n>', 'dedup pass every N weeks', '4')
  .option('--seed <n>', 'PRNG seed (decimal)', '14600158') // 0xDECADE
  .option('--out <path>', 'JSONL output path (default: .manthan/experiments/...)')
  .option('--yes', 'skip confirmation prompt (required for non-TTY)')
  .action(
    async (opts: {
      weeks: string;
      corpusCycles: string;
      reviewCadenceWeeks: string;
      humanAttention: string;
      decayCadenceWeeks: string;
      dedupCadenceWeeks: string;
      seed: string;
      out?: string;
      yes?: boolean;
    }) => {
      const weeks = Number.parseInt(opts.weeks, 10);
      if (!Number.isInteger(weeks) || weeks <= 0 || weeks > 156) {
        process.stderr.write(
          'manthan brain simulate-long-horizon: --weeks must be an integer in [1, 156]\n',
        );
        process.exitCode = 2;
        return;
      }
      const cycles = Number.parseInt(opts.corpusCycles, 10);
      const reviewC = Number.parseInt(opts.reviewCadenceWeeks, 10);
      const attention = Number.parseFloat(opts.humanAttention);
      const decayC = Number.parseInt(opts.decayCadenceWeeks, 10);
      const dedupC = Number.parseInt(opts.dedupCadenceWeeks, 10);
      const seed = Number.parseInt(opts.seed, 10);
      if (
        !Number.isInteger(cycles) ||
        cycles < 1 ||
        !Number.isInteger(reviewC) ||
        reviewC < 1 ||
        !Number.isFinite(attention) ||
        attention < 0 ||
        attention > 1 ||
        !Number.isInteger(decayC) ||
        decayC < 1 ||
        !Number.isInteger(dedupC) ||
        dedupC < 1 ||
        !Number.isInteger(seed) ||
        seed < 0
      ) {
        process.stderr.write('manthan brain simulate-long-horizon: invalid numeric option\n');
        process.exitCode = 2;
        return;
      }
      const { runBrainLongHorizon } = await import('./commands/brain-long-horizon.js');
      process.exitCode = await runBrainLongHorizon({
        cwd: process.cwd(),
        weeks,
        corpusCycles: cycles,
        reviewCadenceWeeks: reviewC,
        humanAttention: attention,
        decayCadenceWeeks: decayC,
        dedupCadenceWeeks: dedupC,
        seed,
        out: opts.out,
        yes: opts.yes ?? false,
      });
    },
  );

brain
  .command('health')
  .description('Overall brain status: tier counts, recent activity, hygiene pressure')
  .action(async () => {
    const { runHealth } = await import('./commands/brain-observability.js');
    process.exitCode = await runHealth({ cwd: process.cwd() });
  });

brain
  .command('entropy')
  .description('Entropy signals: aging breakdown, dup pressure, recent decay activity')
  .option('--threshold-profile <profile>', 'conservative | normal | aggressive', 'normal')
  .action(async (opts: { thresholdProfile: string }) => {
    const valid = ['conservative', 'normal', 'aggressive'];
    if (!valid.includes(opts.thresholdProfile)) {
      process.stderr.write(
        `manthan brain entropy: --threshold-profile must be one of: ${valid.join(', ')}\n`,
      );
      process.exitCode = 2;
      return;
    }
    const { runEntropy } = await import('./commands/brain-observability.js');
    process.exitCode = await runEntropy({
      cwd: process.cwd(),
      profile: opts.thresholdProfile as 'conservative' | 'normal' | 'aggressive',
    });
  });

brain
  .command('token-pressure')
  .description('Project trusted-layer token cost at various shaping budgets')
  .option('--min-confidence <n>', 'omit trusted facts below this confidence (0..1)')
  .option('--priority-area <area...>', 'pack these areas first (repeatable)')
  .action(async (opts: { minConfidence?: string; priorityArea?: string[] }) => {
    let minConfidence: number | undefined;
    if (opts.minConfidence !== undefined) {
      const v = Number.parseFloat(opts.minConfidence);
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        process.stderr.write('manthan brain token-pressure: --min-confidence must be in [0, 1]\n');
        process.exitCode = 2;
        return;
      }
      minConfidence = v;
    }
    const { runTokenPressure } = await import('./commands/brain-observability.js');
    process.exitCode = await runTokenPressure({
      cwd: process.cwd(),
      minConfidence,
      priorityAreas: opts.priorityArea,
    });
  });

brain
  .command('age-facts')
  .description('Apply stale-fact decay (confidence reduce / demote / archive)')
  .option('--threshold-profile <profile>', 'conservative | normal | aggressive', 'normal')
  .option('--area <area>', 'limit decay to one area')
  .option('--as-of <date>', 'treat <date> as "now" (YYYY-MM-DD or ISO)')
  .option('--dry-run', 'compute the plan but write no audit events')
  .option('--yes', 'skip the confirmation prompt')
  .action(
    async (opts: {
      thresholdProfile: string;
      area?: string;
      asOf?: string;
      dryRun?: boolean;
      yes?: boolean;
    }) => {
      const valid = ['conservative', 'normal', 'aggressive'];
      if (!valid.includes(opts.thresholdProfile)) {
        process.stderr.write(
          `manthan brain age-facts: --threshold-profile must be one of: ${valid.join(', ')}\n`,
        );
        process.exitCode = 2;
        return;
      }
      let asOf: Date | undefined;
      if (opts.asOf) {
        // Accept either YYYY-MM-DD (interpret as UTC midnight) or any ISO string.
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(opts.asOf)
          ? `${opts.asOf}T00:00:00.000Z`
          : opts.asOf;
        const parsed = new Date(dateOnly);
        if (Number.isNaN(parsed.getTime())) {
          process.stderr.write(
            `manthan brain age-facts: --as-of "${opts.asOf}" is not a valid date\n`,
          );
          process.exitCode = 2;
          return;
        }
        asOf = parsed;
      }
      const { runAgeFacts } = await import('./commands/brain-age-facts.js');
      process.exitCode = await runAgeFacts({
        cwd: process.cwd(),
        profile: opts.thresholdProfile as 'conservative' | 'normal' | 'aggressive',
        area: opts.area,
        asOf,
        dryRun: opts.dryRun ?? false,
        yes: opts.yes ?? false,
      });
    },
  );

brain
  .command('merge')
  .description('Merge duplicate facts: keep <survivor>, demote the rest to T-2')
  .argument('<survivorId>')
  .argument('<supersededIds...>', 'one or more fact ids to supersede')
  .option('--note <text>', 'note recorded in the dedup_merge audit event')
  .option('--yes', 'skip the confirmation prompt')
  .action(
    async (survivorId: string, supersededIds: string[], opts: { note?: string; yes?: boolean }) => {
      if (supersededIds.length === 0) {
        process.stderr.write('manthan brain merge: provide at least one superseded fact id\n');
        process.exitCode = 2;
        return;
      }
      const { runMerge } = await import('./commands/brain-dedup.js');
      process.exitCode = await runMerge({
        cwd: process.cwd(),
        survivorId,
        supersededIds,
        note: opts.note,
        yes: opts.yes ?? false,
      });
    },
  );

brain
  .command('undo-correction')
  .description('Undo a recent brain.correction (within 7 days)')
  .argument('<auditSeq>', 'audit_seq of the correction event')
  .option('--yes', 'skip the confirmation prompt')
  .action(async (auditSeq: string, opts: { yes?: boolean }) => {
    const { runBrainUndo } = await import('./commands/brain-trust.js');
    const seq = Number.parseInt(auditSeq, 10);
    if (!Number.isInteger(seq) || seq <= 0) {
      process.stderr.write(
        'manthan brain undo-correction: <auditSeq> must be a positive integer\n',
      );
      process.exitCode = 2;
      return;
    }
    process.exitCode = await runBrainUndo({ cwd: process.cwd(), auditSeq: seq, yes: opts.yes });
  });

const experiments = program.command('experiments').description('Phase 3 measurement harnesses');

experiments
  .command('cpt-probe')
  .description('Run the same brief across multiple workspaces; capture bundle + output')
  .requiredOption('--brief <path>', 'task-brief file (UTF-8 text)')
  .option(
    '--workspace <path...>',
    'workspace path(s); repeat for cross-workspace comparison',
    [] as string[],
  )
  .option('--label <text>', 'experiment label (default: derived from brief filename)')
  .option('--out <dir>', 'output directory', './cpt-runs')
  .option('-m, --model <id>', 'CLI preset id', 'sonnet')
  .option('--adapter <name>', "adapter: 'claude-cli' (default) or 'openai' (E6.1)", 'claude-cli')
  .option('--budget <usd>', 'per-run USD budget', '0.50')
  .option('--max-output <n>', 'max output tokens', '4096')
  .option('--context-budget <n>', 'max input tokens for bundle', '60000')
  .option('--dry-run', 'pack bundles only; do not call the LLM')
  .option('--yes', 'skip the live-run confirmation prompt')
  .action(
    async (opts: {
      brief: string;
      workspace: string[];
      label?: string;
      out: string;
      model: string;
      adapter: string;
      budget: string;
      maxOutput: string;
      contextBudget: string;
      dryRun?: boolean;
      yes?: boolean;
    }) => {
      if (!opts.workspace || opts.workspace.length === 0) {
        process.stderr.write(
          'manthan experiments cpt-probe: provide at least one --workspace <path>\n',
        );
        process.exitCode = 2;
        return;
      }
      const usd = Number.parseFloat(opts.budget);
      if (!Number.isFinite(usd) || usd <= 0) {
        process.stderr.write(
          'manthan experiments cpt-probe: --budget must be a positive USD value\n',
        );
        process.exitCode = 2;
        return;
      }
      if (opts.adapter !== 'claude-cli' && opts.adapter !== 'openai') {
        process.stderr.write(
          "manthan experiments cpt-probe: --adapter must be 'claude-cli' or 'openai'\n",
        );
        process.exitCode = 2;
        return;
      }
      const { runCptProbe } = await import('./commands/experiments-cpt-probe.js');
      process.exitCode = await runCptProbe({
        cwd: process.cwd(),
        briefPath: opts.brief,
        workspaces: opts.workspace,
        label: opts.label,
        outDir: opts.out,
        model: opts.model,
        adapter: opts.adapter as 'claude-cli' | 'openai',
        maxUsdMicro: Math.round(usd * 1_000_000),
        maxOutputTokens: Number.parseInt(opts.maxOutput, 10),
        contextTokenBudget: Number.parseInt(opts.contextBudget, 10),
        dryRun: opts.dryRun ?? false,
        yes: opts.yes ?? false,
      });
    },
  );

// Hide power-user / observability / hygiene commands from the default --help
// surface. Each remains functional and reachable by name; they just don't
// appear in the top-level help listing. The visible 5-command slice is:
//   manthan {init, plan, brain (review + promote), doctor, replay}
// plus the operational extras `auth` and `version`.
const HIDE_BRAIN_SUBCOMMANDS = new Set([
  'stats',
  'facts',
  'issues',
  'history',
  'demote',
  'simulate-aging',
  'simulate-long-horizon',
  'metrics',
  'duplicates',
  'trust-log',
  'queue-health',
  'health',
  'entropy',
  'token-pressure',
  'age-facts',
  'merge',
  'undo-correction',
]);
// commander v12 stores `_hidden` internally; it isn't exposed in the public
// .d.ts. Cast through to set it without changing each command's definition.
type CommanderHidable = { _hidden: boolean };
for (const cmd of brain.commands) {
  if (HIDE_BRAIN_SUBCOMMANDS.has(cmd.name())) {
    (cmd as unknown as CommanderHidable)._hidden = true;
  }
}
(experiments as unknown as CommanderHidable)._hidden = true;

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
  process.exitCode = 1;
});
