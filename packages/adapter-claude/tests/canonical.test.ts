// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { JsonCanon, hashCanonicalPayload } from '@manthanos/adapters-sdk';
import { describe, expect, it } from 'vitest';
import { projectAnthropic } from '../src/canonical.js';
import {
  FIXTURE_EMPTY_USAGE,
  FIXTURE_MAX_TOKENS,
  FIXTURE_REFUSAL,
  FIXTURE_TEXT_ONLY,
  FIXTURE_THINKING_BLOCK,
  FIXTURE_TWO_TOOL_CALLS,
  FIXTURE_WITH_FUTURE_FIELDS,
  FIXTURE_WITH_TOOL_CALL,
} from './fixtures.js';

const OPTS = { inputUsdMicroPer1k: 3000, outputUsdMicroPer1k: 15000 } as const;

describe('projectAnthropic — canonical projection', () => {
  it('text-only response projects cleanly', () => {
    const p = projectAnthropic(FIXTURE_TEXT_ONLY, OPTS);
    expect(p.text).toBe('Hello, world!');
    expect(p.finishReason).toBe('stop');
    expect(p.inputTokens).toBe(12);
    expect(p.outputTokens).toBe(5);
    // cost: 12/1000*3000 + 5/1000*15000 = 36 + 75 = 111 micro = $0.000111
    expect(p.usdMicro).toBe(111);
    expect(p.toolCalls).toEqual([]);
    expect(p.canonical.schema_version).toBe(1);
  });

  it('preserves tool call order and ids', () => {
    const p = projectAnthropic(FIXTURE_TWO_TOOL_CALLS, OPTS);
    expect(p.toolCalls.length).toBe(2);
    expect(p.toolCalls[0]?.id).toBe('toolu_A');
    expect(p.toolCalls[1]?.id).toBe('toolu_B');
    expect(p.finishReason).toBe('tool_use');
  });

  it('maps max_tokens to length', () => {
    const p = projectAnthropic(FIXTURE_MAX_TOKENS, OPTS);
    expect(p.finishReason).toBe('length');
  });

  it('maps refusal to content_filter', () => {
    const p = projectAnthropic(FIXTURE_REFUSAL, OPTS);
    expect(p.finishReason).toBe('content_filter');
  });

  it('elides thinking content but records its presence', () => {
    const p = projectAnthropic(FIXTURE_THINKING_BLOCK, OPTS);
    // Text only contains the non-thinking parts.
    expect(p.text).toBe('Here is my conclusion.');
    // Content array records the elision marker for ordering preservation.
    expect(p.content.length).toBe(2);
    expect(p.content[0]).toEqual({ type: 'text', text: '[claude:thinking-block-elided]' });
  });

  it('handles missing usage gracefully', () => {
    const p = projectAnthropic(FIXTURE_EMPTY_USAGE, OPTS);
    expect(p.inputTokens).toBe(0);
    expect(p.outputTokens).toBe(0);
    expect(p.usdMicro).toBe(0);
  });

  it('elides future/transient SDK fields from canonical', () => {
    const p1 = projectAnthropic(FIXTURE_WITH_FUTURE_FIELDS, OPTS);
    // Same projection, omitting the SDK-added fields.
    const p2 = projectAnthropic(
      {
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'Hello.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 4, output_tokens: 2 },
      },
      OPTS,
    );
    const h1 = hashCanonicalPayload(p1.canonical).payloadHash;
    const h2 = hashCanonicalPayload(p2.canonical).payloadHash;
    expect(h1).toBe(h2);
  });

  it('is byte-identical across repeat projections (replay stability)', () => {
    const p1 = projectAnthropic(FIXTURE_WITH_TOOL_CALL, OPTS);
    const p2 = projectAnthropic(FIXTURE_WITH_TOOL_CALL, OPTS);
    expect(JsonCanon.stringify(p1.canonical)).toBe(JsonCanon.stringify(p2.canonical));
    expect(hashCanonicalPayload(p1.canonical).payloadHash).toBe(
      hashCanonicalPayload(p2.canonical).payloadHash,
    );
  });

  it('produces stable hash regardless of usage micro-unit rounding edges', () => {
    // Tokens at boundary that produce rounding.
    const f = { ...FIXTURE_TEXT_ONLY, usage: { input_tokens: 333, output_tokens: 167 } };
    const p = projectAnthropic(f, OPTS);
    // 333/1000*3000 = 999 ; 167/1000*15000 = 2505 ; total = 3504
    expect(p.usdMicro).toBe(3504);
  });
});
