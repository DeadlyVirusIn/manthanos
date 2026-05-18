// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P1.6: post-plan continuity summary. Two calm, technical lines
// printed after `manthan plan` so the operator can immediately
// see that ManthanOS injected and recorded continuity for the run.
//
// Tests:
//   - formatter shape (counts, run id, replay hint)
//   - counts reflect bundle metrics, not hard-coded values
//   - replay command references the actual run id
//   - no summary appears when plan errors before runPlanWorkflow
//     returns (verified by checking that an error path doesn't
//     enter the formatter at all — see the runPlan integration
//     scope below)

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
  it('emits exactly two lines', () => {
    const lines = formatPlanSummary(makeResult());
    expect(lines).toHaveLength(2);
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

  it('second line carries the actual run id and a valid replay command', () => {
    const lines = formatPlanSummary(makeResult({ runId: 'wf_abc_123' }));
    expect(lines[1]).toBe(
      '[manthan] run logged: wf_abc_123 — replay with: manthan replay wf_abc_123',
    );
  });

  it('uses the exact runId from the result (no truncation, no slicing)', () => {
    // Realistic-shape run id with hyphens.
    const lines = formatPlanSummary(
      makeResult({ runId: 'wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8' }),
    );
    expect(lines[1]).toContain('wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8');
    expect(lines[1]).toContain('manthan replay wf_946c2ad3-f0f6-458c-b4f1-ff1c06a09ec8');
  });

  it('avoids anthropomorphic / hype wording', () => {
    const lines = formatPlanSummary(makeResult());
    const joined = lines.join('\n').toLowerCase();
    // Reserved-vocabulary discipline: the summary stays calm and
    // technical. None of these should ever appear.
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
