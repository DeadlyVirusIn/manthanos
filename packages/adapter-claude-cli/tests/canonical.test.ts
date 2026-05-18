// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal smoke tests for the Claude Code CLI canonical projection.
// Verifies the pure-function shape mapping from the CLI's JSON
// response to ManthanOS's canonical AgentPayload. No subprocess,
// no live provider.

import { describe, expect, it } from 'vitest';
import { projectClaudeCli } from '../src/canonical.js';
import type { ClaudeCliResultJson } from '../src/types.js';

const baseResponse: ClaudeCliResultJson = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1234,
  duration_api_ms: 1000,
  num_turns: 1,
  session_id: 'sess-abc',
  total_cost_usd: 0.0023,
  usage: { input_tokens: 100, output_tokens: 200 },
  modelUsage: { 'claude-sonnet-4-5': { inputTokens: 100, outputTokens: 200 } },
  result: 'plain text answer',
  stop_reason: 'end_turn',
};

describe('projectClaudeCli', () => {
  it('produces a canonical payload with text content when no structured_output', () => {
    const r = projectClaudeCli(baseResponse);
    expect(r.canonical.schema_version).toBe(1);
    expect(r.canonical.model).toBe('claude-sonnet-4-5');
    expect(r.canonical.text).toBe('plain text answer');
    expect(r.canonical.tool_calls).toEqual([]);
    expect(r.canonical.usage.input_tokens).toBe(100);
    expect(r.canonical.usage.output_tokens).toBe(200);
    expect(r.canonical.usage.usd_micro).toBe(2300);
    expect(r.canonical.finish_reason).toBe('stop');
    expect(r.canonical.identifiers.deployment).toBe('claude-code-cli');
  });

  it('synthesizes a record_plan tool_call when structured_output is present', () => {
    const r = projectClaudeCli({
      ...baseResponse,
      structured_output: { plan: { summary: 'test plan', steps: [] } },
    });
    expect(r.canonical.tool_calls).toHaveLength(1);
    expect(r.canonical.tool_calls[0]?.name).toBe('record_plan');
    expect(r.canonical.tool_calls[0]?.id).toBe('cli_sess-abc');
    expect(r.structuredOutput).toEqual({ plan: { summary: 'test plan', steps: [] } });
  });

  it('falls back to "claude-cli:unknown" when modelUsage is missing', () => {
    const { modelUsage: _unused, ...withoutModel } = baseResponse;
    const r = projectClaudeCli(withoutModel as ClaudeCliResultJson);
    expect(r.canonical.model).toBe('claude-cli:unknown');
  });

  it('respects model override via opts', () => {
    const r = projectClaudeCli(baseResponse, { model: 'override:model' });
    expect(r.canonical.model).toBe('override:model');
  });

  it('maps stop_reason "max_tokens" to "length"', () => {
    const r = projectClaudeCli({ ...baseResponse, stop_reason: 'max_tokens' });
    expect(r.canonical.finish_reason).toBe('length');
  });

  it('handles zero cost and missing tokens gracefully', () => {
    const r = projectClaudeCli({
      ...baseResponse,
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect(r.canonical.usage.usd_micro).toBe(0);
    expect(r.canonical.text).toBe('plain text answer');
  });
});
