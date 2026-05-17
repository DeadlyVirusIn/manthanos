// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// OpenAI adapter — minimal implementation built for E6.1.
//
// Scope (STABILIZATION §5):
//   - One model snapshot (gpt-4o-2024-08-06).
//   - response_format: json_schema only. NO fallback parser.
//   - First tool in AgentRequest.tools is the response schema; its name
//     becomes the synthesized ToolCallPart.name so plan-extract finds it.
//   - No retry beyond the OpenAI SDK's defaults.
//   - No streaming.
//
// What this adapter is NOT:
//   - A generalized OpenAI integration. Multi-turn, vision, web tools,
//     function-calling with multiple tools — none of that is in scope
//     for E6.1.
//   - A drop-in for production. The Phase 3 question is binary: does
//     a healthy brain influence the second model's output?

import OpenAI from 'openai';
import type {
  AgentAdapter,
  AgentMetadata,
  AgentRequest,
  AgentResponse,
  CanonicalAgentPayload,
  ContentPart,
  FinishReason,
  Message,
  ToolCallPart,
} from '@manthanos/adapters-sdk';

export interface OpenAIAdapterConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly displayName: string;
  readonly cost: AgentMetadata['cost'];
  readonly capabilities: AgentMetadata['capabilities'];
  readonly latencyClass: AgentMetadata['latencyClass'];
  readonly recommendedFor: AgentMetadata['recommendedFor'];
  readonly baseURL?: string;
  readonly defaultMaxOutputTokens?: number;
  readonly now?: () => number;
}

export const ADAPTER_VERSION = '0.1.0';

// ── helpers ────────────────────────────────────────────────────────────────

function flattenTextContent(msg: Message): string {
  // E6.1 scope: we only handle text. Image / tool_result parts are not
  // produced by the plan workflow's user/assistant messages.
  const parts: string[] = [];
  for (const c of msg.content) {
    if (c.type === 'text') parts.push(c.text);
  }
  return parts.join('');
}

function mapFinishReason(stop: string | null | undefined): FinishReason {
  switch (stop) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    case 'tool_calls':
      return 'tool_use';
    case null:
    case undefined:
      return 'stop';
    default:
      return 'stop';
  }
}

function buildResponseFormat(req: AgentRequest):
  | OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format']
  | undefined {
  // E6.1: if a tool is declared, use its input_schema as the strict
  // json_schema response_format. We do NOT use OpenAI's tools/function
  // calling — that path has its own quirks; the user explicitly chose
  // response_format. The first tool wins; subsequent tools ignored.
  const tool = req.tools?.[0];
  if (!tool) return undefined;
  return {
    type: 'json_schema',
    json_schema: {
      name: tool.name,
      description: tool.description,
      // STABILIZATION §5.2: strict mode required for E6.1's binary test.
      strict: true,
      schema: tool.inputSchema as Record<string, unknown>,
    },
  };
}

function synthesizeToolCallFromJson(
  toolName: string,
  rawJson: string,
): ToolCallPart {
  // E6.1: response_format guarantees the content is valid JSON conforming
  // to the schema. parse failures throw, which is the documented stopping
  // condition — NO fallback per STABILIZATION §5.2.
  const args = JSON.parse(rawJson) as unknown;
  return {
    type: 'tool_call',
    id: `openai_synth_${Date.now().toString(36)}`,
    name: toolName,
    arguments: args,
  };
}

// ── factory ────────────────────────────────────────────────────────────────

export function createOpenAIAdapter(cfg: OpenAIAdapterConfig): AgentAdapter {
  const now = cfg.now ?? (() => Date.now());

  let client: OpenAI | null = null;
  const getClient = (): OpenAI => {
    if (!client) {
      client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    }
    return client;
  };

  const metadata: AgentMetadata = {
    id: `openai:${cfg.model}`,
    displayName: cfg.displayName,
    provider: 'openai',
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

      // Build OpenAI messages array.
      const oaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (req.system && req.system.length > 0) {
        oaiMessages.push({ role: 'system', content: req.system });
      }
      for (const m of req.messages) {
        if (m.role === 'system') {
          oaiMessages.push({ role: 'system', content: flattenTextContent(m) });
        } else if (m.role === 'user') {
          oaiMessages.push({ role: 'user', content: flattenTextContent(m) });
        } else if (m.role === 'assistant') {
          oaiMessages.push({ role: 'assistant', content: flattenTextContent(m) });
        }
        // 'tool' role: out of scope for E6.1 (plan workflow doesn't use it).
      }

      const responseFormat = buildResponseFormat(req);
      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: cfg.model,
        messages: oaiMessages,
        max_tokens: req.maxOutputTokens ?? defaultMax,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      };

      let raw: OpenAI.Chat.Completions.ChatCompletion;
      try {
        raw = await getClient().chat.completions.create(params, {
          signal: req.abortSignal,
        });
      } catch (err) {
        // STABILIZATION §5.2: do not implement a fallback. Surface the
        // error to the orchestrator and let the workflow abort cleanly.
        throw new Error(
          `adapter-openai: chat.completions.create failed: ${(err as Error).message}`,
        );
      }

      const choice = raw.choices[0];
      if (!choice) {
        throw new Error('adapter-openai: empty choices array');
      }
      const messageContent =
        typeof choice.message.content === 'string' ? choice.message.content : '';

      // Build toolCalls. If we used response_format with a tool's schema,
      // synthesize a ToolCallPart so plan-extract.ts finds it.
      const toolCalls: ToolCallPart[] = [];
      const firstTool = req.tools?.[0];
      if (firstTool && messageContent.length > 0) {
        try {
          toolCalls.push(synthesizeToolCallFromJson(firstTool.name, messageContent));
        } catch (err) {
          // STABILIZATION §5.6: malformed JSON is an explicit stopping
          // condition; surface it.
          throw new Error(
            `adapter-openai: response_format returned malformed JSON: ${(err as Error).message}`,
          );
        }
      }

      const content: ContentPart[] = [];
      if (messageContent.length > 0) {
        content.push({ type: 'text', text: messageContent });
      }
      for (const tc of toolCalls) content.push(tc);

      const usage = raw.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const inputTokens = usage.prompt_tokens;
      const outputTokens = usage.completion_tokens;
      const usdMicro =
        Math.round((inputTokens / 1000) * cfg.cost.inputUsdMicroPer1k) +
        Math.round((outputTokens / 1000) * cfg.cost.outputUsdMicroPer1k);

      const finishReason = mapFinishReason(choice.finish_reason);

      const canonical: CanonicalAgentPayload = {
        schema_version: 1,
        model: cfg.model,
        content,
        text: messageContent,
        tool_calls: toolCalls,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          usd_micro: usdMicro,
        },
        finish_reason: finishReason,
        identifiers: {
          deployment: raw.model,
          // Stable hash of the response_format schema — used for replay
          // equivalence checks across SDK versions.
          response_format_hash: responseFormat
            ? hashString(JSON.stringify(responseFormat))
            : undefined,
        },
      };

      return {
        text: messageContent,
        content,
        toolCalls,
        usage: { inputTokens, outputTokens, usdMicro },
        finishReason,
        raw,
        canonical,
        latencyMs: now() - start,
      };
    },

    async healthCheck() {
      const t0 = now();
      try {
        await getClient().chat.completions.create({
          model: cfg.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        });
        return { ok: true, latencyMs: now() - t0 };
      } catch (err) {
        return {
          ok: false,
          message: (err as Error).message,
          latencyMs: now() - t0,
        };
      }
    },
  };
}

// Tiny stable hash for the canonical's response_format_hash field. Not
// cryptographic — we use SDK-version-independent identity, not collision
// resistance. (Same need adapter-claude has.)
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
