// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Project a Claude Code CLI JSON response into ManthanOS's canonical
// AgentResponse payload. Mirrors @manthanos/adapter-claude/src/canonical.ts
// but reads from the CLI's JSON shape instead of the SDK's Message object.

import type {
  CanonicalAgentPayload,
  ContentPart,
  FinishReason,
  ToolCallPart,
} from '@manthanos/adapters-sdk';
import type { ClaudeCliResultJson } from './types.js';

export interface ProjectionResult {
  readonly canonical: CanonicalAgentPayload;
  readonly text: string;
  readonly content: ContentPart[];
  readonly toolCalls: ToolCallPart[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly usdMicro: number;
  readonly finishReason: FinishReason;
  /** The structured_output object from Claude Code, if --json-schema was used. */
  readonly structuredOutput: unknown;
}

function mapStopReason(stop: string): FinishReason {
  switch (stop) {
    case 'end_turn':
    case 'stop_sequence':
    case 'pause_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_use';
    case 'refusal':
      return 'content_filter';
    default:
      return 'stop';
  }
}

export interface ProjectionOptions {
  /** Optional override for the model identifier in the canonical payload.
   *  When omitted, we pull from modelUsage (the model Claude Code actually
   *  used). When neither is available we default to "claude-cli:unknown". */
  readonly model?: string;
}

export function projectClaudeCli(
  resp: ClaudeCliResultJson,
  opts: ProjectionOptions = {},
): ProjectionResult {
  // Resolve model identity from the modelUsage map (whose only key is the
  // canonical model name Claude Code used). Falls back to the override or
  // to a sentinel.
  let modelId = opts.model;
  if (!modelId && resp.modelUsage) {
    const keys = Object.keys(resp.modelUsage).sort();
    modelId = keys[0];
  }
  if (!modelId) modelId = 'claude-cli:unknown';

  const inputTokens = resp.usage.input_tokens ?? 0;
  const outputTokens = resp.usage.output_tokens ?? 0;
  // Cost: Claude Code reports total_cost_usd. We convert to integer micro-USD
  // for the canonical payload. Under subscription this represents quota
  // burn, not USD billed.
  const usdMicro = Math.round((resp.total_cost_usd ?? 0) * 1_000_000);

  const finishReason = mapStopReason(resp.stop_reason);

  // Content: the CLI's `result` text is the free-text answer. tool_use is
  // intentionally NOT supported in this adapter — we use --json-schema for
  // structured output, and we deny all tools to keep the child Claude Code
  // from acting as an agent.
  const text = resp.result ?? '';
  const content: ContentPart[] = text.length > 0 ? [{ type: 'text', text }] : [];
  // If structured_output exists, also encode it as a synthetic tool_call so
  // existing ManthanOS extraction paths (which look for tool calls) keep
  // working. The "tool" name is `record_plan` to match the API adapter's
  // PLAN_TOOL_NAME. This keeps adapter outputs swap-compatible.
  const toolCalls: ToolCallPart[] = [];
  if (resp.structured_output !== undefined && resp.structured_output !== null) {
    const tc: ToolCallPart = {
      type: 'tool_call',
      id: `cli_${resp.session_id ?? 'unknown'}`,
      name: 'record_plan',
      arguments: resp.structured_output,
    };
    toolCalls.push(tc);
    content.push(tc);
  }

  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: modelId,
    content,
    text,
    tool_calls: toolCalls,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      usd_micro: usdMicro,
    },
    finish_reason: finishReason,
    identifiers: {
      deployment: 'claude-code-cli',
    },
  };

  return {
    canonical,
    text,
    content,
    toolCalls,
    inputTokens,
    outputTokens,
    usdMicro,
    finishReason,
    structuredOutput: resp.structured_output ?? null,
  };
}
