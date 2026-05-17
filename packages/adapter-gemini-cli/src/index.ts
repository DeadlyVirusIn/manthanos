// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal Gemini CLI adapter for the E6 cross-model continuity experiment.
// Shells out to `gemini -p --output-format json` using Google AI Pro
// subscription auth. Intentionally narrow: text in, text out, free-form
// plan extraction expected from fenced JSON.

import {
  AdapterError,
  type AgentAdapter,
  type AgentMetadata,
  type AgentRequest,
  type AgentResponse,
  type CanonicalAgentPayload,
} from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';

export interface GeminiCliAdapterConfig {
  readonly displayName?: string;
  readonly binPath?: string;
  /** Defaults to gemini's own default (currently gemini-3-flash-preview). */
  readonly model?: string;
  readonly now?: () => number;
}

const ADAPTER_VERSION = '0.0.1';

/** Shape of `gemini -o json` stdout. Captured 2026-05-15. */
interface GeminiJsonResult {
  readonly session_id: string;
  readonly response: string;
  readonly stats?: {
    readonly models?: Record<
      string,
      {
        readonly api?: { readonly totalLatencyMs?: number };
        readonly tokens?: {
          readonly input?: number;
          readonly prompt?: number;
          readonly candidates?: number;
          readonly total?: number;
          readonly cached?: number;
          readonly thoughts?: number;
        };
      }
    >;
  };
}

export function createGeminiCliAdapter(cfg: GeminiCliAdapterConfig = {}): AgentAdapter {
  const now = cfg.now ?? (() => Date.now());

  const metadata: AgentMetadata = {
    id: `google-cli:${cfg.model ?? 'default'}`,
    displayName: cfg.displayName ?? 'Google Gemini (via gemini CLI, AI Pro subscription)',
    provider: 'google-cli',
    model: cfg.model ?? 'default',
    capabilities: {
      contextTokens: 1_000_000,
      maxOutputTokens: 64_000,
      toolUse: false,
      vision: true,
      streaming: false,
      fileAccess: 'none',
      reasoningStrength: 4,
      implementationStrength: 4,
      webBrowsing: false,
      structuredOutput: false,
    },
    cost: {
      inputUsdMicroPer1k: 0,
      outputUsdMicroPer1k: 0,
    },
    latencyClass: 'medium',
    recommendedFor: ['review', 'summarization'],
    adapterVersion: ADAPTER_VERSION,
  };

  return {
    metadata,

    async invoke(req: AgentRequest): Promise<AgentResponse> {
      const platform = getPlatform();
      const start = now();

      const binPath = cfg.binPath ?? (await platform.process.which('gemini'));
      if (!binPath) {
        throw new AdapterError({
          code: 'internal',
          message: '`gemini` CLI not found on PATH. Install Google Gemini CLI first.',
          retriable: false,
        });
      }

      const systemText = extractSystem(req);
      const userText = extractUser(req);
      const combinedPrompt =
        systemText.length > 0
          ? `=== SYSTEM CONTEXT ===\n${systemText}\n\n=== USER REQUEST ===\n${userText}`
          : userText;

      const args: string[] = ['--skip-trust', '-o', 'json'];
      if (cfg.model) {
        args.push('-m', cfg.model);
      }
      // Gemini's -p flag reads the prompt from the argument when small, or
      // from stdin when piped. Long prompts may exceed ARG_MAX; we pipe
      // via stdin and pass an empty -p marker.
      args.push('-p', '');

      const result = await platform.process.spawn({
        command: binPath,
        args,
        stdin: combinedPrompt,
        abortSignal: req.abortSignal,
        timeoutMs: 600_000,
      });

      if (result.code !== 0 && result.stdout.trim().length === 0) {
        throw new AdapterError({
          code: 'internal',
          message: `gemini exited ${result.code}: ${result.stderr.trim() || 'no stderr'}`,
          retriable: false,
          cause: { stdout: result.stdout, stderr: result.stderr },
        });
      }

      let parsed: GeminiJsonResult;
      try {
        parsed = JSON.parse(result.stdout.trim()) as GeminiJsonResult;
      } catch (err) {
        throw new AdapterError({
          code: 'internal',
          message: `gemini returned non-JSON output: ${(err as Error).message}`,
          retriable: false,
          cause: { stdout: result.stdout },
        });
      }

      const text = parsed.response ?? '';

      // Tokens: Gemini reports per-model. We sum across all models for the
      // canonical input/output counts. The 'main' model dominates; the
      // utility-router model is overhead.
      let inputTokens = 0;
      let outputTokens = 0;
      let modelId: string = cfg.model ?? 'unknown';
      if (parsed.stats?.models) {
        for (const [name, m] of Object.entries(parsed.stats.models)) {
          const inT = m.tokens?.prompt ?? m.tokens?.input ?? 0;
          const outT = m.tokens?.candidates ?? 0;
          inputTokens += inT;
          outputTokens += outT;
          // Pick the heaviest model as the canonical model id (the "main").
          if (
            modelId === (cfg.model ?? 'unknown') ||
            modelId === 'unknown' ||
            inT > (parsed.stats.models[modelId]?.tokens?.prompt ?? 0)
          ) {
            modelId = name;
          }
        }
      }

      const canonical: CanonicalAgentPayload = {
        schema_version: 1,
        model: modelId,
        content: [{ type: 'text', text }],
        text,
        tool_calls: [],
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          usd_micro: 0,
        },
        finish_reason: 'stop',
        identifiers: { deployment: 'gemini-cli' },
      };

      return {
        text,
        content: [{ type: 'text', text }],
        toolCalls: [],
        usage: {
          inputTokens,
          outputTokens,
          usdMicro: 0,
        },
        finishReason: 'stop',
        raw: parsed,
        canonical,
        latencyMs: now() - start,
      };
    },
  };
}

function extractSystem(req: AgentRequest): string {
  let s = req.system ?? '';
  for (const m of req.messages) {
    if (m.role !== 'system') continue;
    for (const p of m.content) {
      if (p.type === 'text') s = s ? `${s}\n${p.text}` : p.text;
    }
  }
  return s;
}

function extractUser(req: AgentRequest): string {
  const parts: string[] = [];
  for (const m of req.messages) {
    if (m.role !== 'user') continue;
    for (const p of m.content) {
      if (p.type === 'text') parts.push(p.text);
    }
  }
  return parts.join('\n\n');
}

export { ADAPTER_VERSION };
