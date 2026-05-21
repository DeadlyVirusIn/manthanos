// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX prototype 9.2 — Inline Replay Verification Panel tests.
//
// These are pure-component tests of the renderInlineVerification
// helper. They construct synthetic `ReplayResult` shapes and
// assert the panel renders the expected text and visibility for
// each verification status, both collapsed and expanded.
//
// We do not invoke `replayRun` here — that path is exercised by
// the orchestrator's replay tests and by the e2e golden path in
// apps/cli. The UI's job is to *present* a result, not to compute
// one. Testing the presentation in isolation keeps these tests
// fast and deterministic.

import type { ReplayResult, VerificationReport } from '@manthanos/orchestrator';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { type InlineVerification, renderInlineVerification } from '../src/screens/run-plan.js';

const rendered: Array<{ unmount: () => void }> = [];
afterEach(() => {
  while (rendered.length > 0) rendered.pop()?.unmount();
});

function makeResult(status: VerificationReport['status']): ReplayResult {
  const report: VerificationReport = {
    status,
    checks: {
      chain: status === 'corrupted' ? 'failed' : 'ok',
      blobs: { checked: 13, failed: 0, missing: 0 },
      canonicalHash: status === 'verified' ? 'ok' : status === 'legacy' ? 'legacy' : 'unverifiable',
      bundleHash: status === 'verified' ? 'ok' : status === 'legacy' ? 'legacy' : 'unverifiable',
    },
    failures: [],
    legacy: [],
    unverifiable: [],
  };
  return {
    runId: 'wf_test_abc123',
    workspaceId: 'ws_test',
    auditEvents: 13,
    bundleHashRecorded: 'bundlehash…',
    canonicalHashRecorded: 'canonhash…',
    recordedText: '',
    usage: { inputTokens: 10, outputTokens: 10, usdMicro: 100 },
    finishReason: 'stop',
    originalStartedAt: '2026-05-20T00:00:00Z',
    originalStatus: 'completed',
    verification: report,
  };
}

describe('renderInlineVerification (pure)', () => {
  it('pending: shows "verifying…" with no expansion content', () => {
    const v: InlineVerification = { state: 'pending' };
    const inst = render(renderInlineVerification(v, false, 'wf_x'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Trust: ');
    expect(frame).toContain('verifying');
    // No 4-check breakdown until verification completes.
    expect(frame).not.toContain('chain:');
    expect(frame).not.toContain('canonical_hash:');
  });

  it('verified, collapsed: one-line summary, no check breakdown', () => {
    const v: InlineVerification = { state: 'complete', result: makeResult('verified') };
    const inst = render(renderInlineVerification(v, false, 'wf_x'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Trust: ');
    expect(frame).toContain('verified');
    expect(frame).toContain('13 blobs checked');
    // Collapsed: per-check lines and CLI equivalent are hidden
    expect(frame).not.toContain('· chain:');
    expect(frame).not.toContain('· canonical_hash:');
    expect(frame).not.toContain('CLI: manthan replay');
  });

  it('verified, expanded: full 4-check breakdown + CLI equivalent', () => {
    const v: InlineVerification = { state: 'complete', result: makeResult('verified') };
    const inst = render(renderInlineVerification(v, true, 'wf_test_abc123'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('Trust: ');
    expect(frame).toContain('verified');
    expect(frame).toContain('chain: ok');
    expect(frame).toContain('canonical_hash: ok');
    expect(frame).toContain('bundle_hash: ok');
    expect(frame).toContain('blobs: 13 checked, 0 failed, 0 missing');
    // The literal CLI command is shown so the operator can reproduce
    // exactly what the inline panel verified.
    expect(frame).toContain('CLI: manthan replay wf_test_abc123');
  });

  it('legacy: shown in yellow context (no alert iconography)', () => {
    const v: InlineVerification = { state: 'complete', result: makeResult('legacy') };
    const inst = render(renderInlineVerification(v, true, 'wf_x'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('legacy');
    // No notification-style framing
    expect(frame).not.toContain('!');
    expect(frame).not.toContain('WARNING');
    expect(frame).not.toContain('ALERT');
  });

  it('corrupted: chain check shows failed', () => {
    const v: InlineVerification = { state: 'complete', result: makeResult('corrupted') };
    const inst = render(renderInlineVerification(v, true, 'wf_x'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('corrupted');
    expect(frame).toContain('chain: failed');
  });

  it('error state: renders the error message without panicking', () => {
    const v: InlineVerification = { state: 'error', message: 'simulated I/O failure' };
    const inst = render(renderInlineVerification(v, false, 'wf_x'));
    rendered.push(inst);
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('verification error');
    expect(frame).toContain('simulated I/O failure');
  });

  it('no anthropomorphic or alert vocabulary in any verification state', () => {
    const banned = ['intelligent', 'magical', 'guaranteed', 'AI knows', 'thinks', 'remembered'];
    const cases: InlineVerification[] = [
      { state: 'pending' },
      { state: 'complete', result: makeResult('verified') },
      { state: 'complete', result: makeResult('legacy') },
      { state: 'complete', result: makeResult('unverifiable') },
      { state: 'complete', result: makeResult('corrupted') },
      { state: 'error', message: 'x' },
    ];
    for (const v of cases) {
      const inst = render(renderInlineVerification(v, true, 'wf_x'));
      rendered.push(inst);
      const lower = (inst.lastFrame() ?? '').toLowerCase();
      for (const b of banned) {
        expect(lower).not.toContain(b.toLowerCase());
      }
    }
  });
});
