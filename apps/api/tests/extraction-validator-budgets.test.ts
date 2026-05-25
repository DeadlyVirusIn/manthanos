// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8B — eligibility filter, per-request cap, input/response caps,
// retry policy. All via injected fakes; no live LLM.

import { describe, expect, it, vi } from 'vitest';
import type { ConfidenceReasonFlag } from '../src/services/extraction/confidence.js';
import type { ValidatorClient } from '../src/services/extraction/validator.js';
import {
  MAX_RESPONSE_CHARS,
  MAX_VALIDATED_PER_REQUEST,
  type ValidatableCandidate,
  isEligibleForValidation,
  runValidator,
  validateCandidates,
} from '../src/services/extraction/validatorRunner.js';

function candidate(overrides: Partial<ValidatableCandidate> = {}): ValidatableCandidate {
  return {
    statement: 's',
    area: 'general',
    confidence_score: 0.3,
    confidence_reasons: [] as ConfidenceReasonFlag[],
    ...overrides,
  };
}
const untrusted = { quotes: ['q'], summary: null };
const ok = (s = '{"confidence_score":0.9}'): ValidatorClient => ({
  validate: () => Promise.resolve(s),
});

describe('isEligibleForValidation — deterministic-first', () => {
  it('eligible when sub-threshold or ambiguous; not when confident', () => {
    expect(isEligibleForValidation(candidate({ confidence_score: 0.3 }))).toBe(true);
    expect(
      isEligibleForValidation(
        candidate({ confidence_score: 0.95, confidence_reasons: ['ambiguous'] }),
      ),
    ).toBe(true);
    expect(isEligibleForValidation(candidate({ confidence_score: 0.9 }))).toBe(false);
  });
});

describe('validateCandidates — eligibility + per-request cap', () => {
  it('skips confident candidates (client never called for them)', async () => {
    const client = { validate: vi.fn(() => Promise.resolve('{"confidence_score":0.9}')) };
    const out = await validateCandidates([candidate({ confidence_score: 0.9 })], untrusted, {
      enabled: true,
      client,
    });
    expect(client.validate).not.toHaveBeenCalled();
    expect(out[0]?.confidence_score).toBe(0.9);
  });

  it('validates at most MAX_VALIDATED_PER_REQUEST eligible candidates', async () => {
    const client = { validate: vi.fn(() => Promise.resolve('{"confidence_score":0.8}')) };
    const eligible = Array.from({ length: MAX_VALIDATED_PER_REQUEST + 3 }, (_, i) =>
      candidate({ statement: `s${i}`, confidence_score: 0.2 }),
    );
    const out = await validateCandidates(eligible, untrusted, { enabled: true, client });
    expect(client.validate).toHaveBeenCalledTimes(MAX_VALIDATED_PER_REQUEST);
    // The first N were validated (0.8); the rest kept their deterministic 0.2.
    expect(out.filter((c) => c.confidence_score === 0.8)).toHaveLength(MAX_VALIDATED_PER_REQUEST);
    expect(out.filter((c) => c.confidence_score === 0.2)).toHaveLength(3);
  });
});

describe('runValidator — caps + retry', () => {
  it('treats an over-long response as malformed', async () => {
    const huge = `{"confidence_score":0.9,"x":"${'a'.repeat(MAX_RESPONSE_CHARS + 10)}"}`;
    const out = await runValidator(candidate(), untrusted, { enabled: true, client: ok(huge) });
    expect(out.validated).toBe(false);
    expect(out.fallback_reason).toBe('malformed');
  });

  it('retries once on a thrown transient error, then succeeds', async () => {
    let calls = 0;
    const flaky: ValidatorClient = {
      validate: () => {
        calls++;
        return calls === 1
          ? Promise.reject(new Error('5xx'))
          : Promise.resolve('{"confidence_score":0.7}');
      },
    };
    const out = await runValidator(candidate(), untrusted, { enabled: true, client: flaky });
    expect(calls).toBe(2);
    expect(out.validated).toBe(true);
    expect(out.candidate.confidence_score).toBe(0.7);
  });

  it('gives up after one retry → error fallback', async () => {
    let calls = 0;
    const alwaysFails: ValidatorClient = {
      validate: () => {
        calls++;
        return Promise.reject(new Error('down'));
      },
    };
    const out = await runValidator(candidate(), untrusted, { enabled: true, client: alwaysFails });
    expect(calls).toBe(2); // initial + 1 retry
    expect(out.fallback_reason).toBe('error');
  });

  it('does NOT retry on timeout (budget already spent)', async () => {
    let calls = 0;
    const hang: ValidatorClient = {
      validate: () => {
        calls++;
        return new Promise<string>(() => {});
      },
    };
    const out = await runValidator(candidate(), untrusted, {
      enabled: true,
      client: hang,
      timeoutMs: 20,
    });
    expect(calls).toBe(1);
    expect(out.fallback_reason).toBe('timeout');
  });
});
