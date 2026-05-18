// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan replay <runId>` — recorded-run inspection.
//
// Scope honesty (per OCTO_REVIEW §B6 / TRUTH_CHECKPOINT §2.4):
// "Replay" here means READ the audit-chain records for a past run
// and re-display them. It is NOT byte-identity bundle reconstruction
// + re-hash verification — the rendered prompt is not stored today,
// so we cannot deterministically reconstruct the original bytes.
// Bundle-hash reconstruction is a Phase 2.5 design target.
//
// What this command does today:
//   - Verifies the audit hash chain is intact through the run's events.
//   - Reports the recorded bundle_hash, payload_hash, usage, finish reason.
//   - With --show-text, prints the recorded adapter response (redacted as written).
//
// What this command does NOT do today:
//   - Re-execute the adapter call.
//   - Re-render the system/user prompts from layer metadata and verify
//     the recorded bundle_hash matches a recomputed one.

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
    process.stdout.write(
      '  (recorded-run inspection; not byte-identity bundle reconstruction — see SAFETY_MODEL §7)\n',
    );
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
