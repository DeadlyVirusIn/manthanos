// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Follow-up 1 — telemetry emission from the runner. Verifies one PII-free
// record per validation attempt with the required fields, the correct
// outcome/fallback_reason/cache_hit/retry_count, and NO emission on gate-off.

import { describe, expect, it } from 'vitest';
import type { ConfidenceReasonFlag } from '../src/services/extraction/confidence.js';
import type { ValidatorClient } from '../src/services/extraction/validator.js';
import type { ValidatorTelemetryRecord } from '../src/services/extraction/validatorCanary.js';
import { createValidatorCache } from '../src/services/extraction/validatorCache.js';
import {
  type ValidatableCandidate,
  runValidator,
} from '../src/services/extraction/validatorRunner.js';

function candidate(overrides: Partial<ValidatableCandidate> = {}): ValidatableCandidate {
  return {
    statement: 'PII alice@x.test churned after onboarding',
    area: 'discovery_pain',
    confidence_score: 0.3,
    confidence_reasons: [] as ConfidenceReasonFlag[],
    ...overrides,
  };
}
const untrusted = { quotes: ['secret quote text bob@y.test'], summary: null };
const fixed = (s: string): ValidatorClient => ({ validate: () => Promise.resolve(s) });

function sink(): {
  records: ValidatorTelemetryRecord[];
  onTelemetry: (r: ValidatorTelemetryRecord) => void;
} {
  const records: ValidatorTelemetryRecord[] = [];
  return { records, onTelemetry: (r) => records.push(r) };
}

const base = (extra: Record<string, unknown>) => ({
  enabled: true,
  requestId: 'req-1',
  workspaceId: 'ws-1',
  ...extra,
});

describe('telemetry emission', () => {
  it('emits one record with all required fields on a validated outcome', async () => {
    const { records, onTelemetry } = sink();
    let t = 1000;
    await runValidator(candidate(), untrusted, {
      ...base({ client: fixed('{"confidence_score":0.9}'), onTelemetry, now: () => (t += 5) }),
    });
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.request_id).toBe('req-1');
    expect(r.candidate_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.cache_hit).toBe(false);
    expect(r.fallback_reason).toBeNull(); // validated
    expect(r.validated).toBe(true);
    expect(typeof r.latency_ms).toBe('number');
    expect(r.retry_count).toBe(0);
    expect(r.model).toBeNull();
  });

  it('records fallback_reason on malformed and retry_count on transient retry', async () => {
    const { records, onTelemetry } = sink();
    await runValidator(candidate(), untrusted, {
      ...base({ client: fixed('not json'), onTelemetry }),
    });
    expect(records[0].validated).toBe(false);
    expect(records[0].fallback_reason).toBe('malformed');

    const { records: r2, onTelemetry: ot2 } = sink();
    let calls = 0;
    const flaky: ValidatorClient = {
      validate: () => {
        calls++;
        return calls === 1
          ? Promise.reject(new Error('5xx'))
          : Promise.resolve('{"confidence_score":0.7}');
      },
    };
    await runValidator(candidate(), untrusted, { ...base({ client: flaky, onTelemetry: ot2 }) });
    expect(r2[0].retry_count).toBe(1);
    expect(r2[0].validated).toBe(true);
  });

  it('reports cache_hit on the second identical call', async () => {
    const { records, onTelemetry } = sink();
    const cache = createValidatorCache();
    const opts = base({
      client: fixed('{"confidence_score":0.8}'),
      cache,
      model: 'm1',
      onTelemetry,
    });
    await runValidator(candidate(), untrusted, opts);
    await runValidator(candidate(), untrusted, opts);
    expect(records[0].cache_hit).toBe(false);
    expect(records[1].cache_hit).toBe(true);
  });

  it('does NOT emit on gate-off (deterministic no-op)', async () => {
    const { records, onTelemetry } = sink();
    await runValidator(candidate(), untrusted, {
      enabled: false,
      requestId: 'r',
      workspaceId: 'w',
      client: fixed('{}'),
      onTelemetry,
    });
    expect(records).toHaveLength(0);
  });

  it('never includes raw quote text / statement / PII in the record', async () => {
    const { records, onTelemetry } = sink();
    await runValidator(candidate(), untrusted, {
      ...base({ client: fixed('{"abstain":true}'), model: 'claude-haiku-4-5', onTelemetry }),
    });
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain('alice@x.test');
    expect(serialized).not.toContain('bob@y.test');
    expect(serialized).not.toContain('churned after onboarding');
  });
});
