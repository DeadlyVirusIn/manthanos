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
import {
  checkOutcome,
  commandTitle,
  cyan,
  dim,
  kv,
  setColorMode,
  statusBanner,
  yellow,
} from '../render.js';

export interface ReplayOptions {
  readonly cwd: string;
  readonly runId: string;
  readonly showText?: boolean;
  /**
   * When true, emit the full `ReplayResult` as JSON on stdout and
   * suppress all human-readable rendering. The emitted JSON is
   * byte-identical to `JSON.stringify(result, null, 2)` — no
   * rendering transforms, no inferred fields, no flattening.
   * Designed for `manthan replay <runId> --json | jq`.
   *
   * Exit codes are unchanged. ANSI is never emitted in JSON mode.
   */
  readonly json?: boolean;
  /** Disable ANSI color output. Honors NO_COLOR env automatically. */
  readonly noColor?: boolean;
  /** Force color on even when stdout is not a TTY. */
  readonly forceColor?: boolean;
}

// Short qualifier text appended to the top-level status banner.
// Reserved wording; not paraphrased per the CLI design system.
function statusQualifier(status: VerificationReport['status']): string | undefined {
  switch (status) {
    case 'verified':
      return undefined;
    case 'legacy':
      return 'some integrity fields predate the verifier';
    case 'unverifiable':
      return 'a required artifact is missing';
    case 'corrupted':
      return 'an explicit hash mismatch was detected';
  }
}

// Short detail appended to per-check legacy / unverifiable outcomes.
function checkQualifier(
  outcome: 'ok' | 'mismatch' | 'legacy' | 'unverifiable' | 'failed',
): string | undefined {
  switch (outcome) {
    case 'legacy':
      return 'recompute not possible from stored data';
    case 'unverifiable':
      return 'artifact missing';
    default:
      return undefined;
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
  // Resolve color mode once per invocation. JSON mode forces no
  // color; explicit --no-color wins over implicit TTY detection;
  // --color=always forces color on (useful when piping into a pager
  // that handles ANSI).
  if (opts.json || opts.noColor) {
    setColorMode('never');
  } else if (opts.forceColor) {
    setColorMode('always');
  } else {
    setColorMode('auto');
  }

  try {
    const result = await replayRun({ workspaceRoot: opts.cwd, runId: opts.runId });
    const v = result.verification;

    if (opts.json) {
      // Byte-identical to the underlying struct. Two-space indent
      // matches the standard `JSON.stringify(_, null, 2)` shape so
      // `--json | jq .` round-trips without surprises. Exit code
      // semantics unchanged.
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return exitCodeFor(v.status);
    }

    const out = process.stdout;

    // Title + scope disclaimer. Calm and explicit; the disclaimer
    // is never re-styled because it carries the substrate's honesty
    // claim about what replay does and does not verify.
    out.write(`${commandTitle('replay', result.runId)}\n`);
    out.write(`  ${dim('(integrity check of recorded artifacts; no model re-invocation)')}\n`);
    out.write('\n');

    // Status block. The reserved 4-state vocabulary appears once,
    // colored by severity per the design system.
    out.write(`${kv('status', statusBanner(v.status, statusQualifier(v.status)))}\n`);
    out.write(`${kv('chain', checkOutcome(v.checks.chain))}\n`);
    out.write(
      `${kv(
        'blobs',
        `${v.checks.blobs.checked} checked, ${v.checks.blobs.failed} mismatched, ${v.checks.blobs.missing} missing`,
      )}\n`,
    );
    out.write(
      `${kv('canonical_hash', checkOutcome(v.checks.canonicalHash, checkQualifier(v.checks.canonicalHash)))}\n`,
    );
    out.write(
      `${kv('bundle_hash', checkOutcome(v.checks.bundleHash, checkQualifier(v.checks.bundleHash)))}\n`,
    );

    // Run metadata. All metadata stays default-color; long hashes
    // are dimmed to keep the eye on the status block above.
    out.write('\n');
    out.write(`${kv('audit events', `${result.auditEvents} for this run`)}\n`);
    out.write(`${kv('started', result.originalStartedAt ?? '(unknown)')}\n`);
    out.write(`${kv('workflow status', result.originalStatus ?? '(unknown)')}\n`);
    out.write(
      `${kv('bundle_hash', result.bundleHashRecorded ? dim(result.bundleHashRecorded) : '(missing)')}\n`,
    );
    out.write(
      `${kv('canonical_hash', result.canonicalHashRecorded ? dim(result.canonicalHashRecorded) : '(missing)')}\n`,
    );
    if (result.usage) {
      out.write(
        `${kv('tokens', `in=${result.usage.inputTokens} out=${result.usage.outputTokens}`)}\n`,
      );
      out.write(
        `${kv(
          'cost',
          `$${(result.usage.usdMicro / 1_000_000).toFixed(6)} (${result.usage.usdMicro} micro)`,
        )}\n`,
      );
    }
    if (result.finishReason) {
      out.write(`${kv('finish reason', result.finishReason)}\n`);
    }

    // Findings / legacy / unverifiable blocks. Each block is a
    // bulleted list, the [check] tag carries the colored marker so
    // the bullet line itself stays default. Hash values inside
    // expected/actual pairs are dimmed; the rest is plain.
    if (v.failures.length > 0) {
      out.write('\n');
      out.write('  failures:\n');
      for (const f of v.failures) {
        const tag = `[${f.check}]`;
        const seqSuffix = f.failedAtSeq !== undefined ? ` ${dim(`(seq=${f.failedAtSeq})`)}` : '';
        out.write(`    - ${tag} ${f.detail}${seqSuffix}\n`);
        if (f.expected !== undefined && f.actual !== undefined) {
          out.write(`        expected: ${dim(f.expected)}\n`);
          out.write(`        actual:   ${dim(f.actual)}\n`);
        }
      }
    }
    if (v.legacy.length > 0) {
      out.write('\n');
      out.write(
        `  ${yellow('legacy notes')} ${dim('(not corruption, but not verified either)')}:\n`,
      );
      for (const l of v.legacy) {
        const tag = `[${l.check}]`;
        const seqSuffix = l.seq !== undefined ? ` ${dim(`(seq=${l.seq})`)}` : '';
        out.write(`    - ${tag} ${l.detail}${seqSuffix}\n`);
      }
    }
    if (v.unverifiable.length > 0) {
      out.write('\n');
      out.write(`  ${yellow('unverifiable notes')}:\n`);
      for (const u of v.unverifiable) {
        const tag = `[${u.check}]`;
        const seqSuffix = u.seq !== undefined ? ` ${dim(`(seq=${u.seq})`)}` : '';
        out.write(`    - ${tag} ${u.detail}${seqSuffix}\n`);
      }
    }

    // Recorded response body. Bordered with plain fences; the body
    // itself is never re-styled — it is the model's output, not
    // ours to format.
    if (opts.showText && result.recordedText.length > 0) {
      out.write('\n--- recorded response (redacted as written) ---\n');
      out.write(result.recordedText);
      out.write('\n--- end ---\n');
    }

    // Next-action hint. Only emitted on corruption: the operator
    // has a clear forensic step to take.
    if (v.status === 'corrupted') {
      out.write('\n');
      out.write(`${cyan('->')} inspect .manthan/audit-corruption.log for the recorded findings.\n`);
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
