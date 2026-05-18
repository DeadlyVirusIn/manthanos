// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan replay <runId>` — verify the integrity of a recorded run.
//
// What this command verifies:
//   - the audit chain is unbroken,
//   - each audit event's blob still hashes to the recorded payload_hash,
//   - the recorded canonical response hash (P0.1) can be recomputed
//     from the stored canonical projection,
//   - the recorded bundle hash (P0.3) can be recomputed from the
//     stored per-layer metadata in context_snapshots.
//
// What this command does NOT do:
//   - It does not re-invoke the model. No network calls.
//   - It does not claim the model would produce the same response
//     today.
//   - It does not check whether the underlying source files / git
//     state are unchanged since the run.
//   - It does not verify semantic correctness of anything.
//
// Status terms (do not redefine elsewhere):
//   verified     — every applicable check ran and passed.
//   legacy       — artifacts exist but predate a verification field.
//                  Chain still hashes recorded values correctly; the
//                  extra recompute-and-compare check just cannot run.
//                  NOT the same as verified.
//   unverifiable — a required artifact is structurally absent.
//   corrupted    — at least one explicit hash mismatch.
//
// Exit codes:
//   0 verified
//   1 legacy
//   2 unverifiable (or ReplayError)
//   3 corrupted

import { ReplayError, type VerificationReport, replayRun } from '@manthanos/orchestrator';

export interface ReplayOptions {
  readonly cwd: string;
  readonly runId: string;
  readonly showText?: boolean;
}

function statusLabel(status: VerificationReport['status']): string {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'legacy':
      return 'legacy (some integrity fields predate the verifier)';
    case 'unverifiable':
      return 'unverifiable (a required artifact is missing)';
    case 'corrupted':
      return 'CORRUPTED (an explicit hash mismatch was detected)';
  }
}

function checkLabel(outcome: 'ok' | 'mismatch' | 'legacy' | 'unverifiable' | 'failed'): string {
  switch (outcome) {
    case 'ok':
      return 'ok';
    case 'mismatch':
      return 'MISMATCH';
    case 'legacy':
      return 'legacy (recompute not possible from stored data)';
    case 'unverifiable':
      return 'unverifiable (artifact missing)';
    case 'failed':
      return 'FAILED';
  }
}

function exitCodeFor(status: VerificationReport['status']): number {
  switch (status) {
    case 'verified':
      return 0;
    case 'legacy':
      return 1;
    case 'unverifiable':
      return 2;
    case 'corrupted':
      return 3;
  }
}

export async function runReplay(opts: ReplayOptions): Promise<number> {
  try {
    const result = await replayRun({ workspaceRoot: opts.cwd, runId: opts.runId });
    const v = result.verification;

    process.stdout.write(`manthan replay — ${result.runId}\n`);
    process.stdout.write('  (integrity check of recorded artifacts; no model re-invocation)\n');
    process.stdout.write(`  status:           ${statusLabel(v.status)}\n`);
    process.stdout.write(`  chain:            ${checkLabel(v.checks.chain)}\n`);
    process.stdout.write(
      `  blobs:            ${v.checks.blobs.checked} checked, ${v.checks.blobs.failed} mismatched, ${v.checks.blobs.missing} missing\n`,
    );
    process.stdout.write(`  canonical_hash:   ${checkLabel(v.checks.canonicalHash)}\n`);
    process.stdout.write(`  bundle_hash:      ${checkLabel(v.checks.bundleHash)}\n`);
    process.stdout.write(`  audit events:     ${result.auditEvents} for this run\n`);
    process.stdout.write(`  started:          ${result.originalStartedAt ?? '(unknown)'}\n`);
    process.stdout.write(`  workflow status:  ${result.originalStatus ?? '(unknown)'}\n`);
    process.stdout.write(`  bundle_hash:      ${result.bundleHashRecorded ?? '(missing)'}\n`);
    process.stdout.write(`  canonical_hash:   ${result.canonicalHashRecorded ?? '(missing)'}\n`);
    if (result.usage) {
      process.stdout.write(
        `  tokens:           in=${result.usage.inputTokens} out=${result.usage.outputTokens}\n`,
      );
      process.stdout.write(
        `  cost:             $${(result.usage.usdMicro / 1_000_000).toFixed(6)} (${result.usage.usdMicro} micro)\n`,
      );
    }
    if (result.finishReason) {
      process.stdout.write(`  finish reason:    ${result.finishReason}\n`);
    }

    if (v.failures.length > 0) {
      process.stdout.write('\n  failures:\n');
      for (const f of v.failures) {
        process.stdout.write(`    - [${f.check}] ${f.detail}`);
        if (f.failedAtSeq !== undefined) process.stdout.write(`  (seq=${f.failedAtSeq})`);
        process.stdout.write('\n');
        if (f.expected !== undefined && f.actual !== undefined) {
          process.stdout.write(`        expected: ${f.expected}\n`);
          process.stdout.write(`        actual:   ${f.actual}\n`);
        }
      }
    }
    if (v.legacy.length > 0) {
      process.stdout.write('\n  legacy notes (not corruption, but not verified either):\n');
      for (const l of v.legacy) {
        process.stdout.write(`    - [${l.check}] ${l.detail}`);
        if (l.seq !== undefined) process.stdout.write(`  (seq=${l.seq})`);
        process.stdout.write('\n');
      }
    }
    if (v.unverifiable.length > 0) {
      process.stdout.write('\n  unverifiable notes:\n');
      for (const u of v.unverifiable) {
        process.stdout.write(`    - [${u.check}] ${u.detail}`);
        if (u.seq !== undefined) process.stdout.write(`  (seq=${u.seq})`);
        process.stdout.write('\n');
      }
    }

    if (opts.showText && result.recordedText.length > 0) {
      process.stdout.write('\n--- recorded response (redacted as written) ---\n');
      process.stdout.write(result.recordedText);
      process.stdout.write('\n--- end ---\n');
    }

    return exitCodeFor(v.status);
  } catch (err) {
    if (err instanceof ReplayError) {
      process.stderr.write(`manthan replay: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}
