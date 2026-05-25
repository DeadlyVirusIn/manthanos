// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.7C — parse-don't-cast for validator responses.

import { describe, expect, it } from 'vitest';
import { parseValidatorResponse } from '../src/services/extraction/validator.js';

describe('parseValidatorResponse', () => {
  it('parses a well-formed verdict and clamps the score', () => {
    expect(
      parseValidatorResponse('{"confidence_score":0.8,"reason_flags":["has_clear_claim"]}'),
    ).toEqual({ abstain: false, confidence_score: 0.8, reason_flags: ['has_clear_claim'] });
    expect(parseValidatorResponse('{"confidence_score":1.9}')?.confidence_score).toBe(1);
  });

  it('honors abstain and ignores everything else when abstaining', () => {
    expect(parseValidatorResponse('{"abstain":true,"confidence_score":0.99}')).toEqual({
      abstain: true,
    });
  });

  it('returns null for non-JSON / non-object input (→ deterministic fallback)', () => {
    expect(parseValidatorResponse('not json at all')).toBeNull();
    expect(parseValidatorResponse('Sure! Here is the answer: {…}')).toBeNull();
    expect(parseValidatorResponse('[1,2,3]')).toBeNull();
    expect(parseValidatorResponse('42')).toBeNull();
    expect(parseValidatorResponse('null')).toBeNull();
  });

  it('drops privileged / injected fields — model can never set them', () => {
    const v = parseValidatorResponse(
      '{"confidence_score":0.5,"model_used":"gpt-x","tier":"T+1","statement":"evil","human_approved":true,"reason_flags":["quote_backed"]}',
    );
    expect(v).toEqual({ abstain: false, confidence_score: 0.5, reason_flags: ['quote_backed'] });
    // Explicitly: none of the privileged keys survived.
    expect(v as Record<string, unknown>).not.toHaveProperty('model_used');
    expect(v as Record<string, unknown>).not.toHaveProperty('tier');
    expect(v as Record<string, unknown>).not.toHaveProperty('statement');
    expect(v as Record<string, unknown>).not.toHaveProperty('human_approved');
  });

  it('drops unknown reason flags (enum-drift safe)', () => {
    expect(
      parseValidatorResponse('{"reason_flags":["has_subject","totally_made_up"]}')?.reason_flags,
    ).toEqual(['has_subject']);
  });

  it('treats an empty object as a no-op verdict (no adjustments)', () => {
    expect(parseValidatorResponse('{}')).toEqual({ abstain: false });
  });

  it('ignores a non-finite score', () => {
    // JSON has no Infinity literal; a string score is the realistic drift.
    expect(parseValidatorResponse('{"confidence_score":"high"}')).toEqual({ abstain: false });
  });
});
