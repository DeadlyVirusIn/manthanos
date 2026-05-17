// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Convert ManthanOS AgentRequest → Anthropic SDK message-create params,
// and Anthropic Message → ManthanOS AgentResponse.

import type { AgentRequest, Message, ToolSpec } from '@manthanos/adapters-sdk';

export interface AnthropicCreateParams {
  readonly model: string;
  readonly max_tokens: number;
  readonly system?: string;
  readonly messages: AnthropicSdkMessage[];
  readonly tools?: AnthropicSdkTool[];
  readonly temperature?: number;
  readonly metadata?: Record<string, string>;
}

export interface AnthropicSdkMessage {
  readonly role: 'user' | 'assistant';
  readonly content: AnthropicSdkContentBlock[];
}

export type AnthropicSdkContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string | AnthropicSdkContentBlock[];
      is_error?: boolean;
    };

export interface AnthropicSdkTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

const ROLE_MAP: Record<Message['role'], 'user' | 'assistant' | 'system' | null> = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
  // 'tool' is represented inline as a tool_result content block in the
  // previous assistant turn; Anthropic does not have a top-level 'tool' role.
  tool: null,
};

function encodeContent(message: Message): AnthropicSdkContentBlock[] {
  const blocks: AnthropicSdkContentBlock[] = [];
  for (const part of message.content) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text });
    } else if (part.type === 'image') {
      if (part.source.kind === 'data') {
        // The 'data' kind expects a base64 string + mediaType.
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mediaType,
            data: part.source.data,
          },
        });
      } else {
        // Path-kind images need to be encoded by the caller before invocation.
        // The adapter does not read files; this is enforced by ADAPTER_SPEC.
        throw new Error(
          'adapter-claude: path-kind image source must be resolved by caller before invocation',
        );
      }
    } else if (part.type === 'tool_call') {
      blocks.push({
        type: 'tool_use',
        id: part.id,
        name: part.name,
        input: part.arguments,
      });
    } else if (part.type === 'tool_result') {
      blocks.push({
        type: 'tool_result',
        tool_use_id: part.toolCallId,
        content:
          typeof part.content === 'string'
            ? part.content
            : ([
                { type: 'text', text: JSON.stringify(part.content) },
              ] as AnthropicSdkContentBlock[]),
        is_error: part.isError,
      });
    }
  }
  return blocks;
}

function encodeTools(tools: readonly ToolSpec[] | undefined): AnthropicSdkTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export interface EncodeOptions {
  readonly model: string;
  readonly defaultMaxOutputTokens: number;
}

export function encodeRequest(req: AgentRequest, opts: EncodeOptions): AnthropicCreateParams {
  // Anthropic's API takes `system` separately; if the AgentRequest's first
  // message is 'system', or if `req.system` is set, hoist it.
  let systemText: string | undefined = req.system;
  const sdkMessages: AnthropicSdkMessage[] = [];

  for (const m of req.messages) {
    const mapped = ROLE_MAP[m.role];
    if (mapped === 'system') {
      // Concatenate multiple system blocks (rare) with newline.
      const flat = m.content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter((s) => s.length > 0)
        .join('\n');
      systemText = systemText ? `${systemText}\n${flat}` : flat;
    } else if (mapped === 'user' || mapped === 'assistant') {
      sdkMessages.push({ role: mapped, content: encodeContent(m) });
    }
    // mapped === null (tool) — skip; tool_result is encoded inside the user
    // message that follows the assistant's tool_use, per Anthropic's API.
  }

  // Ensure messages alternate role and start with 'user' (Anthropic requirement).
  // The orchestrator is responsible for assembling well-formed conversations;
  // we don't try to repair them here, but we surface a clear error.
  if (sdkMessages.length === 0) {
    throw new Error('adapter-claude: no user/assistant messages to send');
  }
  if (sdkMessages[0]?.role !== 'user') {
    throw new Error('adapter-claude: first message must be from user');
  }

  const params: AnthropicCreateParams = {
    model: opts.model,
    max_tokens: req.maxOutputTokens ?? opts.defaultMaxOutputTokens,
    system: systemText,
    messages: sdkMessages,
    tools: encodeTools(req.tools),
    temperature: req.temperature,
    metadata: req.correlationId ? { user_id: req.correlationId } : undefined,
  };
  return params;
}
