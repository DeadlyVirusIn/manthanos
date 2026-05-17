// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// AgentAdapter contract types per ADAPTER_SPEC.md §3.
//
// This file is the public plugin API. Backwards-incompatible changes
// require a major version bump of @manthanos/adapters-sdk.

export interface AgentCapabilities {
  /** Max input + output tokens supported in a single call. */
  contextTokens: number;
  /** Max output tokens the model will produce. */
  maxOutputTokens: number;
  /** Supports tool / function calling. */
  toolUse: boolean;
  /** Accepts images in input. */
  vision: boolean;
  /** Supports streaming. */
  streaming: boolean;
  /** Informational only — adapters never touch the filesystem directly. */
  fileAccess: 'none' | 'read' | 'read-write-sandboxed';
  /** Calibrated by the eval harness. */
  reasoningStrength: 1 | 2 | 3 | 4 | 5;
  implementationStrength: 1 | 2 | 3 | 4 | 5;
  webBrowsing: boolean;
  structuredOutput: boolean;
}

export type TaskKind =
  | 'architecture'
  | 'implementation'
  | 'review'
  | 'ui-critique'
  | 'forensic-debug'
  | 'security-review'
  | 'web-research'
  | 'summarization'
  | 'arbitration'
  | 'large-context-analysis';

export interface AgentMetadata {
  /** Stable unique ID, e.g. "anthropic:claude-opus-4-7". */
  id: string;
  displayName: string;
  /** Provider slug, e.g. "anthropic". */
  provider: string;
  /** Model name, e.g. "claude-opus-4-7". */
  model: string;
  capabilities: AgentCapabilities;
  /** Per-1k-tokens USD micro-units (integer arithmetic — ARCH §10.1). */
  cost: {
    inputUsdMicroPer1k: number;
    outputUsdMicroPer1k: number;
    perCallUsdMicro?: number;
    perImageUsdMicro?: number;
  };
  latencyClass: 'fast' | 'medium' | 'slow';
  recommendedFor: TaskKind[];
  adapterVersion: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  mediaType: string;
  source: { kind: 'data'; data: string } | { kind: 'path'; path: string };
}

export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  content: string | unknown;
  isError?: boolean;
}

export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

export interface Message {
  role: MessageRole;
  content: ContentPart[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentRequest {
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
  outputSchema?: Record<string, unknown>;
  budget?: {
    maxTokens: number;
    maxUsdMicro: number;
  };
  abortSignal?: AbortSignal;
  correlationId?: string;
}

export type FinishReason = 'stop' | 'tool_use' | 'length' | 'content_filter' | 'error' | 'aborted';

/**
 * Canonical projection of the provider's response, used for audit
 * hashing and replay. SDK-version-independent.
 * See ADAPTER_SPEC.md §3.1.
 */
export interface CanonicalAgentPayload {
  schema_version: 1;
  model: string;
  content: ContentPart[];
  text: string;
  tool_calls: ToolCallPart[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    usd_micro: number;
  };
  finish_reason: FinishReason;
  identifiers: {
    deployment?: string;
    response_format_hash?: string;
  };
}

export interface AgentResponse {
  text: string;
  content: ContentPart[];
  toolCalls: ToolCallPart[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    usdMicro: number;
  };
  finishReason: FinishReason;
  /** Provider-native payload retained for audit. NEVER hashed directly. */
  raw: unknown;
  /** Canonical projection used for audit hashing. */
  canonical: CanonicalAgentPayload;
  latencyMs: number;
}

export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; arguments: unknown }
  | { type: 'tool_call_end'; id: string }
  | { type: 'usage'; usage: AgentResponse['usage'] }
  | { type: 'finish'; finishReason: FinishReason };

export interface HealthStatus {
  ok: boolean;
  message?: string;
  latencyMs?: number;
}

export interface AgentAdapter {
  readonly metadata: AgentMetadata;
  invoke(req: AgentRequest): Promise<AgentResponse>;
  stream?(req: AgentRequest): AsyncIterable<AgentStreamEvent>;
  embed?(input: string[]): Promise<number[][]>;
  healthCheck?(): Promise<HealthStatus>;
}

export type AdapterErrorCode =
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'invalid_request'
  | 'context_window'
  | 'content_filter'
  | 'network'
  | 'cancelled'
  | 'internal';

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly retriable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly cause: unknown;

  constructor(opts: {
    code: AdapterErrorCode;
    message: string;
    retriable: boolean;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'AdapterError';
    this.code = opts.code;
    this.retriable = opts.retriable;
    this.retryAfterMs = opts.retryAfterMs;
    this.cause = opts.cause;
  }
}
