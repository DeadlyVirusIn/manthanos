// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan replay <runId>` — no-network replay of a recorded workflow.

import { ReplayError, replayRun } from '@manthanos/orchestrator';

export interface ReplayOptions {
  readonly cwd: string;
  readonly runId: string;
  readonly showText?: boolean;
}

export async function runReplay(opts: ReplayOptions): Promise<number> {
  try {
    const result = await replayRun({ workspaceRoot: opts.cwd, runId: opts.runId });
    process.stdout.write(`manthan replay — ${result.runId}\n`);
    process.stdout.write(`  chain:        ${result.chainOk ? 'verified ok' : 'FAILED'}\n`);
    process.stdout.write(`  audit events: ${result.auditEvents} for this run\n`);
    process.stdout.write(`  started:      ${result.originalStartedAt ?? '(unknown)'}\n`);
    process.stdout.write(`  status:       ${result.originalStatus ?? '(unknown)'}\n`);
    process.stdout.write(`  bundle_hash:  ${result.bundleHashRecorded ?? '(missing)'}\n`);
    process.stdout.write(`  payload_hash: ${result.recordedCanonicalHash ?? '(missing)'}\n`);
    if (result.usage) {
      process.stdout.write(
        `  tokens:       in=${result.usage.inputTokens} out=${result.usage.outputTokens}\n`,
      );
      process.stdout.write(
        `  cost:         $${(result.usage.usdMicro / 1_000_000).toFixed(6)} (${result.usage.usdMicro} micro)\n`,
      );
    }
    if (result.finishReason) {
      process.stdout.write(`  finish:       ${result.finishReason}\n`);
    }
    if (opts.showText && result.recordedText.length > 0) {
      process.stdout.write('\n--- recorded response (redacted as written) ---\n');
      process.stdout.write(result.recordedText);
      process.stdout.write('\n--- end ---\n');
    }
    return result.chainOk ? 0 : 4;
  } catch (err) {
    if (err instanceof ReplayError) {
      process.stderr.write(`manthan replay: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}
