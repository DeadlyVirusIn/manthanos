// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Canonical payload projection for Anthropic Claude responses.
// See ADAPTER_SPEC.md §3.1 — the contract that decouples audit hashes
// from raw SDK response shape.

import type {
  CanonicalAgentPayload,
  ContentPart,
  FinishReason,
  ToolCallPart,
} from '@manthanos/adapters-sdk';

/**
 * Minimal shape we depend on from the Anthropic SDK Message response.
 * We do not import the SDK type here — we project from a structural
 * shape so we can recreate the projection for replay fixtures without
 * pulling the SDK in.
 */
export interface AnthropicMessageLike {
  readonly model: string;
  readonly content: ReadonlyArray<AnthropicContentBlock>;
  readonly stop_reason?: AnthropicStopReason | null;
  readonly usage?: { input_tokens?: number; output_tokens?: number };
}

export type AnthropicStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'pause_turn'
  | 'refusal';

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'thinking';
      thinking?: string;
      // Some Claude variants emit 'redacted_thinking' or wrap thinking in
      // an object — we collapse into the 'thinking' projection.
      [key: string]: unknown;
    };

export interface ProjectionOptions {
  /** Per-1k token cost in micro-USD (integer). Required for cost projection. */
  readonly inputUsdMicroPer1k: number;
  readonly outputUsdMicroPer1k: number;
  /** Optional deployment identifier (e.g., region/endpoint). */
  readonly deployment?: string;
}

export interface ProjectionResult {
  readonly canonical: CanonicalAgentPayload;
  readonly text: string;
  readonly content: ContentPart[];
  readonly toolCalls: ToolCallPart[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly usdMicro: number;
  readonly finishReason: FinishReason;
}

/** Map Anthropic stop_reason → canonical FinishReason. */
function mapStopReason(stop: AnthropicStopReason | null | undefined): FinishReason {
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
    case null:
    case undefined:
      // Streaming or unknown — treat as 'stop' to avoid bogus 'error'.
      return 'stop';
    default: {
      // Future stop reasons — surface as 'stop' rather than throwing.
      return 'stop';
    }
  }
}

/** Project an Anthropic message into the canonical payload. */
export function projectAnthropic(
  message: AnthropicMessageLike,
  opts: ProjectionOptions,
): ProjectionResult {
  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;

  // Order preservation is critical for replay byte-identity.
  const content: ContentPart[] = [];
  const toolCalls: ToolCallPart[] = [];
  let text = '';

  for (const block of message.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
      text += block.text;
    } else if (block.type === 'tool_use') {
      const tc: ToolCallPart = {
        type: 'tool_call',
        id: block.id,
        name: block.name,
        arguments: block.input,
      };
      content.push(tc);
      toolCalls.push(tc);
    } else if (block.type === 'thinking') {
      // We intentionally do NOT include thinking content in the canonical
      // text or content array. Thinking content is provider-internal and
      // its inclusion would (a) be a leak of model internal state into the
      // audit blob and (b) churn audit hashes across Claude versions that
      // alter the thinking format. Hashing-relevant: we record the presence
      // of a thinking block as a marker only.
      content.push({ type: 'text', text: '[claude:thinking-block-elided]' });
    }
    // Unknown block kinds are dropped from the canonical projection but
    // retained in `raw` (the full SDK response is preserved in the blob).
  }

  const usdMicro =
    Math.round((inputTokens * opts.inputUsdMicroPer1k) / 1000) +
    Math.round((outputTokens * opts.outputUsdMicroPer1k) / 1000);

  const finishReason = mapStopReason(message.stop_reason ?? null);

  const canonical: CanonicalAgentPayload = {
    schema_version: 1,
    model: message.model,
    content,
    text,
    tool_calls: toolCalls,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      usd_micro: usdMicro,
    },
    finish_reason: finishReason,
    identifiers: opts.deployment ? { deployment: opts.deployment } : {},
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
  };
}
