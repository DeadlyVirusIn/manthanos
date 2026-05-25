// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.7D — capability-gated runner: gate, timeout, abstain, malformed,
// adjust, and the production no-op path. All via injected fake clients —
// no live LLM.

import { describe, expect, it, vi } from 'vitest';
import type { ConfidenceReasonFlag } from '../src/services/extraction/confidence.js';
import type { ValidatorClient } from '../src/services/extraction/validator.js';
import {
  type ValidatableCandidate,
  noLiveValidatorClient,
  runValidator,
  validateCandidates,
} from '../src/services/extraction/validatorRunner.js';

function candidate(overrides: Partial<ValidatableCandidate> = {}): ValidatableCandidate {
  return {
    statement: 'Founders abandon discovery tools.',
    area: 'general',
    confidence_score: 0.5,
    confidence_reasons: ['has_clear_claim'] as ConfidenceReasonFlag[],
    ...overrides,
  };
}

const untrusted = { quotes: ['we dropped it on day three'], summary: null };

function fixedClient(response: string): ValidatorClient {
  return { validate: () => Promise.resolve(response) };
}

describe('runValidator — gating', () => {
  it('gate OFF → deterministic no-op, client never called', async () => {
    const client: ValidatorClient = { validate: vi.fn() };
    const out = await runValidator(candidate(), untrusted, { enabled: false, client });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('gate_off');
    expect(out.candidate.confidence_score).toBe(0.5);
    expect(client.validate).not.toHaveBeenCalled();
  });
});

describe('runValidator — failure modes all fall back deterministically', () => {
  it('malformed (non-JSON) → keep deterministic candidate', async () => {
    const out = await runValidator(candidate(), untrusted, {
      enabled: true,
      client: fixedClient('totally not json'),
    });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('malformed');
    expect(out.candidate.confidence_score).toBe(0.5);
  });

  it('thrown client error → keep deterministic candidate', async () => {
    const out = await runValidator(candidate(), untrusted, {
      enabled: true,
      client: { validate: () => Promise.reject(new Error('network down')) },
    });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('error');
    expect(out.candidate.confidence_score).toBe(0.5);
  });

  it('timeout → keep deterministic candidate (never hangs)', async () => {
    const hangingClient: ValidatorClient = { validate: () => new Promise<string>(() => {}) };
    const out = await runValidator(candidate(), untrusted, {
      enabled: true,
      client: hangingClient,
      timeoutMs: 20,
    });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('timeout');
  });

  it('abstain → keep deterministic candidate, flagged needs_human_review', async () => {
    const out = await runValidator(candidate({ confidence_reasons: [] }), untrusted, {
      enabled: true,
      client: fixedClient('{"abstain":true}'),
    });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('abstain');
    expect(out.candidate.confidence_reasons).toContain('needs_human_review');
    expect(out.candidate.confidence_score).toBe(0.5); // unchanged
  });
});

describe('runValidator — valid adjustment', () => {
  it('applies a clamped score + filtered reason flags; never changes statement', async () => {
    const out = await runValidator(candidate(), untrusted, {
      enabled: true,
      client: fixedClient('{"confidence_score":0.9,"reason_flags":["quote_backed","bogus"]}'),
    });
    expect(out.validated).toBe(true);
    expect(out.candidate.confidence_score).toBe(0.9);
    expect(out.candidate.confidence_reasons).toEqual(['quote_backed']); // bogus dropped
    expect(out.candidate.statement).toBe('Founders abandon discovery tools.'); // untouched
  });
});

describe('validateCandidates — list-level', () => {
  it('gate OFF returns the same candidates unchanged (production path)', async () => {
    const cs = [candidate({ statement: 'a' }), candidate({ statement: 'b' })];
    const out = await validateCandidates(cs, untrusted, {
      enabled: false,
      client: noLiveValidatorClient,
    });
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.statement)).toEqual(['a', 'b']);
  });

  it('the production no-op never invokes noLiveValidatorClient (which throws)', async () => {
    // If the gate leaked, noLiveValidatorClient.validate would throw.
    await expect(
      validateCandidates([candidate()], untrusted, {
        enabled: false,
        client: noLiveValidatorClient,
      }),
    ).resolves.toHaveLength(1);
  });
});
