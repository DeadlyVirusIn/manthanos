// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// The Claude adapter — implements AgentAdapter against the Anthropic SDK.

import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentAdapter,
  AgentMetadata,
  AgentRequest,
  AgentResponse,
} from '@manthanos/adapters-sdk';
import {
  type AnthropicMessageLike,
  type ProjectionOptions,
  projectAnthropic,
} from './canonical.js';
import { mapAnthropicError } from './errors.js';
import { encodeRequest } from './messages.js';

export interface ClaudeAdapterConfig {
  /** Anthropic API key. If missing, the adapter throws at invocation time. */
  readonly apiKey: string;
  /** Optional baseURL override (for proxies / Bedrock / Vertex). */
  readonly baseURL?: string;
  /** Defaults to https://api.anthropic.com via SDK. */
  readonly model: string;
  readonly displayName: string;
  readonly cost: AgentMetadata['cost'];
  readonly capabilities: AgentMetadata['capabilities'];
  readonly latencyClass: AgentMetadata['latencyClass'];
  readonly recommendedFor: AgentMetadata['recommendedFor'];
  readonly defaultMaxOutputTokens?: number;
  /** Optional clock for tests; defaults to Date.now. */
  readonly now?: () => number;
}

const ADAPTER_VERSION = '0.1.0';

export function createClaudeAdapter(cfg: ClaudeAdapterConfig): AgentAdapter {
  const now = cfg.now ?? (() => Date.now());

  // Construct the SDK client lazily so tests can stub it.
  let client: Anthropic | null = null;
  const getClient = (): Anthropic => {
    if (!client) {
      client = new Anthropic({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
      });
    }
    return client;
  };

  const metadata: AgentMetadata = {
    id: `anthropic:${cfg.model}`,
    displayName: cfg.displayName,
    provider: 'anthropic',
    model: cfg.model,
    capabilities: cfg.capabilities,
    cost: cfg.cost,
    latencyClass: cfg.latencyClass,
    recommendedFor: cfg.recommendedFor,
    adapterVersion: ADAPTER_VERSION,
  };

  const defaultMax = cfg.defaultMaxOutputTokens ?? 4096;

  return {
    metadata,
    async invoke(req: AgentRequest): Promise<AgentResponse> {
      const start = now();

      // Budget guardrail: if the caller declared a per-request budget,
      // verify the request's encoded payload fits before issuing the call.
      // We do not estimate tokens here (the orchestrator does); we only
      // enforce the absolute byte ceiling.
      const params = encodeRequest(req, {
        model: cfg.model,
        defaultMaxOutputTokens: defaultMax,
      });

      let response: AnthropicMessageLike;
      try {
        // The SDK accepts an `AbortSignal` via the second `options` arg.
        const result = await getClient().messages.create(
          {
            model: params.model,
            max_tokens: params.max_tokens,
            ...(params.system ? { system: params.system } : {}),
            messages: params.messages as unknown as Anthropic.Messages.MessageParam[],
            ...(params.tools
              ? { tools: params.tools as unknown as Anthropic.Messages.Tool[] }
              : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
            ...(params.metadata ? { metadata: params.metadata } : {}),
          },
          {
            signal: req.abortSignal,
          },
        );
        // The SDK returns a typed Message; we project from the structural shape.
        response = result as unknown as AnthropicMessageLike;
      } catch (err) {
        throw mapAnthropicError(err);
      }

      const proj = projectAnthropic(response, {
        inputUsdMicroPer1k: cfg.cost.inputUsdMicroPer1k,
        outputUsdMicroPer1k: cfg.cost.outputUsdMicroPer1k,
      } satisfies ProjectionOptions);

      return {
        text: proj.text,
        content: proj.content,
        toolCalls: proj.toolCalls,
        usage: {
          inputTokens: proj.inputTokens,
          outputTokens: proj.outputTokens,
          usdMicro: proj.usdMicro,
        },
        finishReason: proj.finishReason,
        raw: response,
        canonical: proj.canonical,
        latencyMs: now() - start,
      };
    },

    async healthCheck(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
      const t0 = now();
      try {
        // List models is the cheapest endpoint we can hit. The Anthropic SDK
        // doesn't expose a strict `list` for messages; we issue a 1-token
        // request to validate auth + connectivity.
        await getClient().messages.create({
          model: cfg.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        });
        return { ok: true, latencyMs: now() - t0 };
      } catch (err) {
        const mapped = mapAnthropicError(err);
        return { ok: false, message: `${mapped.code}: ${mapped.message}`, latencyMs: now() - t0 };
      }
    },
  };
}

export { ADAPTER_VERSION };
