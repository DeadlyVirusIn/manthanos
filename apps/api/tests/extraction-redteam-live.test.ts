// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8E — red-team RT-1..RT-8 routed through the LIVE client
// (mocked transport returning hostile model output) + canary allow-list +
// telemetry. No real network. Proves the safety contract holds through the
// real client → extractText → parse → runner path, not just the fakes.

import { describe, expect, it } from 'vitest';
import type { ConfidenceReasonFlag } from '../src/services/extraction/confidence.js';
import {
  type HttpTransport,
  createLiveValidatorClient,
} from '../src/services/extraction/liveValidatorClient.js';
import {
  buildValidatorTelemetry,
  isWorkspaceAllowedForCanary,
  parseCanaryWorkspaces,
} from '../src/services/extraction/validatorCanary.js';
import {
  type ValidatableCandidate,
  runValidator,
} from '../src/services/extraction/validatorRunner.js';

function candidate(overrides: Partial<ValidatableCandidate> = {}): ValidatableCandidate {
  return {
    statement: 'Founders abandon discovery tools.',
    area: 'discovery_pain',
    confidence_score: 0.3,
    confidence_reasons: [] as ConfidenceReasonFlag[],
    ...overrides,
  };
}
const untrusted = { quotes: ['hostile quote'], summary: null };

/** A live client whose provider returns `modelText` as the assistant message. */
function liveClientReturning(modelText: string) {
  const transport: HttpTransport = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ content: [{ type: 'text', text: modelText }] })),
    });
  return createLiveValidatorClient({ apiKey: 'k', model: 'claude-haiku-4-5', transport });
}

function assertSafe(out: { candidate: ValidatableCandidate }, c: ValidatableCandidate): void {
  expect(out.candidate.statement).toBe(c.statement);
  expect(out.candidate.area).toBe(c.area);
  const rec = out.candidate as Record<string, unknown>;
  expect(rec).not.toHaveProperty('model_used');
  expect(rec).not.toHaveProperty('tier');
  expect(rec).not.toHaveProperty('human_approved');
  expect(out.candidate.confidence_score).toBeGreaterThanOrEqual(0);
  expect(out.candidate.confidence_score).toBeLessThanOrEqual(1);
}

describe('RT through the LIVE client (mocked transport)', () => {
  it('RT-1/RT-6: malicious model output (tier/model_used) is dropped by the parser', async () => {
    const c = candidate();
    const out = await runValidator(c, untrusted, {
      enabled: true,
      client: liveClientReturning('{"tier":"T+1","model_used":"gpt-x","confidence_score":1.0}'),
    });
    assertSafe(out, c);
    expect(out.candidate.confidence_score).toBe(1); // only score applied (clamped)
  });

  it('RT-3: a tool-call-shaped response is dropped (no tools, no-op verdict)', async () => {
    const c = candidate();
    const out = await runValidator(c, untrusted, {
      enabled: true,
      client: liveClientReturning('{"tool":"delete_workspace"}'),
    });
    assertSafe(out, c);
    expect(out.candidate.confidence_score).toBe(0.3); // unchanged
  });

  it('RT-4/RT-8: prose / garbage model output → malformed fallback', async () => {
    const c = candidate();
    const prose = await runValidator(c, untrusted, {
      enabled: true,
      client: liveClientReturning('Sure, here is prose not JSON'),
    });
    expect(prose.fallback_reason).toBe('malformed');
    assertSafe(prose, c);
  });

  it('RT-7: abstain keeps deterministic + needs_human_review', async () => {
    const c = candidate({ confidence_reasons: [] });
    const out = await runValidator(c, untrusted, {
      enabled: true,
      client: liveClientReturning('{"abstain":true}'),
    });
    assertSafe(out, c);
    expect(out.candidate.confidence_reasons).toContain('needs_human_review');
  });
});

describe('canary allow-list', () => {
  it('only explicitly listed workspaces are allowed; empty ⇒ nobody', () => {
    expect(isWorkspaceAllowedForCanary('ws-1', [])).toBe(false);
    expect(isWorkspaceAllowedForCanary('ws-1', ['ws-1'])).toBe(true);
    expect(isWorkspaceAllowedForCanary('ws-2', ['ws-1'])).toBe(false);
  });

  it('parses the comma-separated env allow-list', () => {
    expect(parseCanaryWorkspaces({})).toEqual([]);
    expect(
      parseCanaryWorkspaces({ MANTHANOS_VALIDATOR_CANARY_WORKSPACES: ' ws-1 , ws-2 ,, ' }),
    ).toEqual(['ws-1', 'ws-2']);
  });
});

describe('telemetry — PII-free, includes fallback_reason', () => {
  it('hashes candidate identity and records fallback_reason on fallback', () => {
    const rec = buildValidatorTelemetry({
      requestId: 'req-1',
      workspaceId: 'ws-1',
      area: 'pricing',
      statement: 'customer PII alice@x.test said no',
      model: 'claude-haiku-4-5',
      cacheHit: false,
      validated: false,
      fallbackReason: 'timeout',
      latencyMs: 42,
      retryCount: 1,
    });
    expect(rec.candidate_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rec)).not.toContain('alice@x.test'); // no PII
    expect(rec.fallback_reason).toBe('timeout');
    expect(rec.validated).toBe(false);
  });

  it('fallback_reason is null when validated', () => {
    const rec = buildValidatorTelemetry({
      requestId: 'r',
      workspaceId: 'w',
      area: 'a',
      statement: 's',
      model: 'm',
      cacheHit: true,
      validated: true,
      latencyMs: 0,
      retryCount: 0,
    });
    expect(rec.fallback_reason).toBeNull();
  });
});
