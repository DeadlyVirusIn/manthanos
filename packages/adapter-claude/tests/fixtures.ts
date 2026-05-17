// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Synthetic Anthropic SDK responses representing the shapes the adapter
// must handle. These are NOT live recordings — they are deliberately
// constructed to exercise specific projection / canonicalization paths.
//
// When `MANTHAN_ADAPTER_LIVE=1` is set, a separate suite hits the real
// API and verifies these projections match real-world responses.

import type { AnthropicMessageLike } from '../src/canonical.js';

export const FIXTURE_TEXT_ONLY: AnthropicMessageLike = {
  model: 'claude-sonnet-4-5',
  content: [{ type: 'text', text: 'Hello, world!' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 5 },
};

export const FIXTURE_WITH_TOOL_CALL: AnthropicMessageLike = {
  model: 'claude-sonnet-4-5',
  content: [
    { type: 'text', text: 'Let me check that file.' },
    {
      type: 'tool_use',
      id: 'toolu_01ABCD',
      name: 'read_file',
      input: { path: 'src/api.ts' },
    },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 240, output_tokens: 38 },
};

export const FIXTURE_MAX_TOKENS: AnthropicMessageLike = {
  model: 'claude-sonnet-4-5',
  content: [{ type: 'text', text: 'long answer truncated...' }],
  stop_reason: 'max_tokens',
  usage: { input_tokens: 100, output_tokens: 4096 },
};

export const FIXTURE_REFUSAL: AnthropicMessageLike = {
  model: 'claude-sonnet-4-5',
  content: [{ type: 'text', text: 'I cannot help with that request.' }],
  stop_reason: 'refusal',
  usage: { input_tokens: 80, output_tokens: 12 },
};

export const FIXTURE_THINKING_BLOCK: AnthropicMessageLike = {
  model: 'claude-opus-4-5',
  content: [
    { type: 'thinking', thinking: 'Internal reasoning about the problem.' },
    { type: 'text', text: 'Here is my conclusion.' },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 300, output_tokens: 60 },
};

export const FIXTURE_TWO_TOOL_CALLS: AnthropicMessageLike = {
  model: 'claude-sonnet-4-5',
  content: [
    { type: 'text', text: 'I will check both files.' },
    { type: 'tool_use', id: 'toolu_A', name: 'read_file', input: { path: 'a.ts' } },
    { type: 'tool_use', id: 'toolu_B', name: 'read_file', input: { path: 'b.ts' } },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 500, output_tokens: 90 },
};

export const FIXTURE_EMPTY_USAGE: AnthropicMessageLike = {
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'ok' }],
  stop_reason: 'end_turn',
  // No usage field — should project as zeros without throwing.
};

/**
 * A response containing fields the canonical projection deliberately
 * elides. Used to prove that adding such fields does not affect the
 * canonical hash.
 */
export const FIXTURE_WITH_FUTURE_FIELDS: AnthropicMessageLike & {
  request_id?: string;
  server_processing_time_ms?: number;
} = {
  model: 'claude-sonnet-4-5',
  content: [{ type: 'text', text: 'Hello.' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 4, output_tokens: 2 },
  request_id: 'req_THIS_VARIES_BY_REQUEST',
  server_processing_time_ms: 234,
};
