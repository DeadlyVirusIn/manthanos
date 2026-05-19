// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P1.6 + UX-2B: post-plan continuity summary.
//
// P1.6 introduced the calm two-line summary. UX-2B (2026-05-19)
// expanded it to four lines so the replay command lives on its own
// indented line — a real first-user mistook the previous one-line
// "run logged: wf_… — replay with: manthan replay wf_…" form for a
// single copy-pasteable command and pasted the whole thing
// (commander silently dropped the extra args; would have been a
// wrong-run-id replay if the ids differed).
//
// Tests pin the new four-line shape and verify the indented
// command line stands alone.

import type { RunPlanResult } from '@manthanos/orchestrator';
import { describe, expect, it } from 'vitest';
import { formatPlanSummary } from '../src/commands/plan.js';

function makeResult(overrides: Partial<RunPlanResult> = {}): RunPlanResult {
  return {
    runId: 'wf_test_runid_0001',
    workspaceId: 'ws_test',
    bundleHash: '0'.repeat(64),
    auditSeqStart: 1,
    auditSeqEnd: 5,
    usage: { inputTokens: 10, outputTokens: 10, usdMicro: 100 },
    finishReason: 'tool_use',
    rawText: '',
    redacted: [],
    plan: null,
    planParseError: null,
    extractMethod: 'tool_use',
    compound: { openIssuesCreated: 0, factsQuarantined: 0, auditEventsWritten: 0 },
    bundleMetrics: {
      trustedFactsInBundle: 3,
      quarantineFactsInBundle: 0,
      quarantineFactsExcluded: 7,
      omittedFactsCount: 2,
      trustedTokens: 0,
      untrustedTokens: 0,
    },
    gitHooksWarning: null,
    elapsedMs: 1,
    ...overrides,
  };
}

describe('formatPlanSummary', () => {
  it('emits exactly four lines', () => {
    const lines = formatPlanSummary(makeResult());
    expect(lines).toHaveLength(4);
  });

  it('first line carries the three counts in the exact pattern', () => {
    const lines = formatPlanSummary(
      makeResult({
        bundleMetrics: {
          trustedFactsInBundle: 5,
          quarantineFactsInBundle: 1,
          quarantineFactsExcluded: 9,
          omittedFactsCount: 4,
          trustedTokens: 0,
          untrustedTokens: 0,
        },
      }),
    );
    expect(lines[0]).toBe(
      '[manthan] context: 5 trusted facts injected | 9 quarantine facts excluded | 4 omitted',
    );
  });

  it('zero counts render explicitly (no implicit skipping)', () => {
    const lines = formatPlanSummary(
      makeResult({
        bundleMetrics: {
          trustedFactsInBundle: 0,
          quarantineFactsInBundle: 0,
          quarantineFactsExcluded: 0,
          omittedFactsCount: 0,
          trustedTokens: 0,
          untrustedTokens: 0,
        },
      }),
    );
    expect(lines[0]).toBe(
      '[manthan] context: 0 trusted facts injected | 0 quarantine facts excluded | 0 omitted',
    );
  });

  it('second line carries the run id alone, with no command on the same line', () => {
    const lines = formatPlanSummary(makeResult({ runId: 'wf_abc_123' }));
    expect(lines[1]).toBe('[manthan] run logged: wf_abc_123');
    // The em-dash + "replay with: …" tail from the pre-UX-2B form
    // must not reappear on this line.
    expect(lines[1]).not.toContain('—');
    expect(lines[1]).not.toContain('replay');
    expect(lines[1]).not.toContain('manthan replay');
  });

  it('third line is the imperative label for the command on the fourth line', () => {
    const lines = formatPlanSummary(makeResult({ runId: 'wf_abc_123' }));
    expect(lines[2]).toBe('[manthan] to replay this run, run:');
  });

  it('fourth line is the bare indented replay command, copy-pasteable on its own', () => {
    const lines = formatPlanSummary(makeResult({ runId: 'wf_abc_123' }));
    expect(lines[3]).toBe('            manthan replay wf_abc_123');
    // Critical UX-2B property: the command line, when copied alone,
    // is a valid shell command. No `[manthan]` prefix, no em-dash,
    // no surrounding prose.
    const trimmed = lines[3]?.trim() ?? '';
    expect(trimmed).toBe('manthan replay wf_abc_123');
  });

  it('uses the exact runId from the result on both the id line and the command line', () => {
    const lines = formatPlanSummary(
      makeResult({ runId: 'wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8' }),
    );
    expect(lines[1]).toContain('wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8');
    expect(lines[3]).toContain('manthan replay wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8');
  });

  it('avoids anthropomorphic / hype wording', () => {
    const lines = formatPlanSummary(makeResult());
    const joined = lines.join('\n').toLowerCase();
    for (const banned of [
      'ai remembered',
      'successfully understood',
      'guaranteed',
      'remembered',
      'understood',
      'thinks',
      'learned',
    ]) {
      expect(joined).not.toContain(banned);
    }
  });
});
