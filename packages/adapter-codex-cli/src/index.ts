// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal Codex CLI adapter for the E6 cross-model continuity experiment.
// Shells out to `codex exec` using the user's ChatGPT subscription auth.
// Intentionally narrow: text in, text out, no structured-output enforcement.

import {
  AdapterError,
  type AgentAdapter,
  type AgentMetadata,
  type AgentRequest,
  type AgentResponse,
  type CanonicalAgentPayload,
} from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';

export interface CodexCliAdapterConfig {
  readonly displayName?: string;
  readonly binPath?: string;
  readonly now?: () => number;
}

const ADAPTER_VERSION = '0.0.1';

export function createCodexCliAdapter(cfg: CodexCliAdapterConfig = {}): AgentAdapter {
  const now = cfg.now ?? (() => Date.now());

  const metadata: AgentMetadata = {
    id: 'openai-cli:codex-default',
    displayName: cfg.displayName ?? 'OpenAI Codex (via codex exec, ChatGPT subscription)',
    provider: 'openai-cli',
    model: 'codex-default',
    capabilities: {
      contextTokens: 200_000,
      maxOutputTokens: 16_000,
      toolUse: false,
      vision: false,
      streaming: false,
      fileAccess: 'none',
      reasoningStrength: 4,
      implementationStrength: 4,
      webBrowsing: false,
      structuredOutput: false,
    },
    cost: {
      // Subscription quota burn; codex doesn't expose per-call USD via exec stdout.
      inputUsdMicroPer1k: 0,
      outputUsdMicroPer1k: 0,
    },
    latencyClass: 'medium',
    recommendedFor: ['implementation', 'review'],
    adapterVersion: ADAPTER_VERSION,
  };

  return {
    metadata,

    async invoke(req: AgentRequest): Promise<AgentResponse> {
      const platform = getPlatform();
      const start = now();

      const binPath = cfg.binPath ?? (await platform.process.which('codex'));
      if (!binPath) {
        throw new AdapterError({
          code: 'internal',
          message: '`codex` CLI not found on PATH. Install OpenAI Codex CLI first.',
          retriable: false,
        });
      }

      // Combine system + user into one stdin prompt. Codex exec has no
      // separate --system flag, so we structure the prompt explicitly.
      const systemText = extractSystem(req);
      const userText = extractUser(req);
      const combinedStdin =
        systemText.length > 0
          ? `=== SYSTEM CONTEXT ===\n${systemText}\n\n=== USER REQUEST ===\n${userText}`
          : userText;

      const result = await platform.process.spawn({
        command: binPath,
        args: [
          'exec',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '--color',
          'never',
          '-', // read prompt from stdin
        ],
        stdin: combinedStdin,
        abortSignal: req.abortSignal,
        timeoutMs: 600_000,
      });

      if (result.code !== 0 && result.stdout.trim().length === 0) {
        throw new AdapterError({
          code: 'internal',
          message: `codex exec failed: ${result.stderr.trim() || `exit ${result.code}`}`,
          retriable: false,
          cause: { stdout: result.stdout, stderr: result.stderr },
        });
      }

      const { text, inputTokens, outputTokens } = parseCodexOutput(result.stdout);

      const canonical: CanonicalAgentPayload = {
        schema_version: 1,
        model: 'codex-default',
        content: [{ type: 'text', text }],
        text,
        tool_calls: [],
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          usd_micro: 0,
        },
        finish_reason: 'stop',
        identifiers: { deployment: 'codex-cli' },
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
        raw: { stdout: result.stdout },
        canonical,
        latencyMs: now() - start,
      };
    },
  };
}

/** Parse `codex exec` stdout. Format observed (Codex 0.121.0):
 *
 *   <metadata header lines>
 *   --------
 *   user
 *   <echoed user prompt>
 *
 *   codex
 *   <model response>
 *   tokens used
 *   <total tokens, as a number with thousand-separators>
 *   <model response again, repeated>          ← duplicated trailing block
 *
 * Strategy: find the LAST "codex\n" heading before "tokens used", grab the
 * block between them. Tokens come from the "tokens used" footer.
 */
function parseCodexOutput(stdout: string): {
  text: string;
  inputTokens: number;
  outputTokens: number;
} {
  const lines = stdout.split('\n');

  // Find the "tokens used" line.
  let tokensUsedIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.trim() === 'tokens used') {
      tokensUsedIndex = i;
      break;
    }
  }

  let totalTokens = 0;
  if (tokensUsedIndex >= 0 && tokensUsedIndex + 1 < lines.length) {
    const numRaw = (lines[tokensUsedIndex + 1] ?? '').trim();
    totalTokens = Number.parseInt(numRaw.replace(/[\s,_]/g, ''), 10) || 0;
  }

  // Find the LAST "codex" heading before tokensUsedIndex (or before end).
  const upperBound = tokensUsedIndex >= 0 ? tokensUsedIndex : lines.length;
  let codexHeadingIndex = -1;
  for (let i = upperBound - 1; i >= 0; i--) {
    if (lines[i]?.trim() === 'codex') {
      codexHeadingIndex = i;
      break;
    }
  }

  let text = '';
  if (codexHeadingIndex >= 0) {
    const blockLines: string[] = [];
    for (let i = codexHeadingIndex + 1; i < upperBound; i++) {
      blockLines.push(lines[i] ?? '');
    }
    text = blockLines.join('\n').trim();
  } else {
    // Fallback: take everything except the metadata header (split on the
    // first '--------' separator after metadata).
    const sepIdx = lines.findIndex((l) => l.trim() === '--------');
    text =
      sepIdx >= 0
        ? lines
            .slice(sepIdx + 1)
            .join('\n')
            .trim()
        : stdout.trim();
  }

  // We don't have a clean input/output split. Estimate input as half the
  // total (rough), output as the other half. The token-accounting fidelity
  // is intentionally low for this minimal adapter — the experiment cares
  // about response content, not token-accounting precision.
  const inputTokens = Math.floor(totalTokens * 0.7);
  const outputTokens = totalTokens - inputTokens;

  return { text, inputTokens, outputTokens };
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
