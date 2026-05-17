// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import type { AgentResponse, CanonicalAgentPayload } from '@manthanos/adapters-sdk';
import { describe, expect, it } from 'vitest';
import { extractPlan } from '../src/plan-extract.js';
import { PLAN_TOOL_NAME } from '../src/plan-tool.js';

function makeResponse(opts: {
  text?: string;
  toolCallName?: string;
  toolCallArgs?: unknown;
}): AgentResponse {
  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: 'claude-sonnet-4-5',
    content: opts.toolCallName
      ? [
          {
            type: 'tool_call',
            id: 'toolu_test',
            name: opts.toolCallName,
            arguments: opts.toolCallArgs,
          },
        ]
      : [{ type: 'text', text: opts.text ?? '' }],
    text: opts.text ?? '',
    tool_calls: opts.toolCallName
      ? [
          {
            type: 'tool_call',
            id: 'toolu_test',
            name: opts.toolCallName,
            arguments: opts.toolCallArgs,
          },
        ]
      : [],
    usage: { input_tokens: 10, output_tokens: 10, usd_micro: 100 },
    finish_reason: opts.toolCallName ? 'tool_use' : 'stop',
    identifiers: {},
  };
  return {
    text: opts.text ?? '',
    content: canonical.content,
    toolCalls: canonical.tool_calls,
    usage: { inputTokens: 10, outputTokens: 10, usdMicro: 100 },
    finishReason: canonical.finish_reason,
    raw: {},
    canonical,
    latencyMs: 1,
  };
}

const VALID_PLAN_ARGS = {
  summary: 'Add OAuth login.',
  steps: [
    {
      id: 'S1',
      description: 'Install passport',
      files_affected: ['package.json'],
      depends_on: [],
      estimated_difficulty: 2,
    },
  ],
  assumptions: ['Node.js >= 20'],
  risks: [{ description: 'Token leak', severity: 4, mitigation: 'Use httpOnly cookies' }],
  open_questions: ['Which providers?'],
};

describe('extractPlan', () => {
  it('uses tool_use when present', () => {
    const r = extractPlan(
      makeResponse({ toolCallName: PLAN_TOOL_NAME, toolCallArgs: VALID_PLAN_ARGS }),
    );
    expect(r.ok).toBe(true);
    expect(r.method).toBe('tool_use');
    expect(r.plan?.summary).toBe('Add OAuth login.');
    expect(r.plan?.steps[0]?.id).toBe('S1');
    expect(r.plan?.risks[0]?.severity).toBe(4);
  });

  it('falls back to fenced JSON when no tool_call is present', () => {
    const text = `Here you go:\n\n\`\`\`json\n${JSON.stringify(VALID_PLAN_ARGS)}\n\`\`\`\n`;
    const r = extractPlan(makeResponse({ text }));
    expect(r.ok).toBe(true);
    expect(r.method).toBe('fenced_json');
  });

  it('falls back to fenced JSON when tool_call has malformed args', () => {
    const text = `Recovered:\n\n\`\`\`json\n${JSON.stringify(VALID_PLAN_ARGS)}\n\`\`\``;
    const r = extractPlan(
      makeResponse({
        toolCallName: PLAN_TOOL_NAME,
        toolCallArgs: { not: 'a plan' },
        text,
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.method).toBe('fenced_json');
  });

  it('reports an error when both paths fail', () => {
    const r = extractPlan(makeResponse({ toolCallName: PLAN_TOOL_NAME, toolCallArgs: {} }));
    expect(r.ok).toBe(false);
    expect(r.method).toBe('tool_use');
    expect(r.error).toContain('summary missing');
  });

  it('clamps out-of-range difficulty and severity', () => {
    const r = extractPlan(
      makeResponse({
        toolCallName: PLAN_TOOL_NAME,
        toolCallArgs: {
          summary: 'x',
          steps: [
            {
              id: 'S1',
              description: 'd',
              files_affected: [],
              depends_on: [],
              estimated_difficulty: 17,
            },
          ],
          assumptions: [],
          risks: [{ description: 'x', severity: 'high', mitigation: '' }],
          open_questions: [],
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.plan?.steps[0]?.estimated_difficulty).toBe(3);
    expect(r.plan?.risks[0]?.severity).toBe(3);
  });
});
