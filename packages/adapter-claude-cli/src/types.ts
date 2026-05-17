// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Shape of the JSON response from `claude --print --output-format json`.
// Verified against Claude Code 2.1.142.

export interface ClaudeCliResultJson {
  readonly type: 'result';
  readonly subtype: 'success' | 'error' | string;
  readonly is_error: boolean;
  readonly api_error_status: string | number | null;
  readonly duration_ms: number;
  readonly duration_api_ms: number;
  readonly ttft_ms?: number;
  readonly num_turns: number;
  /** Free-text output. Empty when structured_output is used + the model produced no extra prose. */
  readonly result: string;
  readonly stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | string;
  readonly session_id: string;
  /** Subscription-equivalent USD (API rates). Under subscription, this is quota signal, not bill. */
  readonly total_cost_usd: number;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
  readonly modelUsage?: Readonly<
    Record<
      string,
      {
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly cacheReadInputTokens?: number;
        readonly cacheCreationInputTokens?: number;
        readonly costUSD: number;
        readonly contextWindow?: number;
        readonly maxOutputTokens?: number;
      }
    >
  >;
  /** Present when --json-schema was supplied and the model conformed. */
  readonly structured_output?: unknown;
  readonly permission_denials?: ReadonlyArray<unknown>;
  readonly terminal_reason?: string;
  readonly uuid?: string;
}

/** Default tools the adapter denies on every CLI call. Keeps the child Claude
 *  Code from acting as an agent — we want a pure model response. */
export const DENIED_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'NotebookEdit',
] as const;
