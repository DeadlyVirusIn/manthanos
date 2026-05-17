// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ClaudeCliAdapter — implements AgentAdapter by shelling out to
// `claude --print`. Uses the user's Claude Code subscription auth;
// no Anthropic API key required.

import {
  AdapterError,
  type AgentAdapter,
  type AgentMetadata,
  type AgentRequest,
  type AgentResponse,
} from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';
import { projectClaudeCli } from './canonical.js';
import { mapCliFailure } from './errors.js';
import { encodeRequest } from './messages.js';
import type { ClaudeCliResultJson } from './types.js';

export interface ClaudeCliAdapterConfig {
  /** Model alias or full id (e.g., 'sonnet', 'opus', 'claude-sonnet-4-6'). */
  readonly model: string;
  readonly displayName: string;
  readonly capabilities: AgentMetadata['capabilities'];
  readonly cost: AgentMetadata['cost'];
  readonly latencyClass: AgentMetadata['latencyClass'];
  readonly recommendedFor: AgentMetadata['recommendedFor'];
  /** Override the binary path. Defaults to whichever `claude` is on PATH. */
  readonly binPath?: string;
  /** Default output-token cap if request omits one. */
  readonly defaultMaxOutputTokens?: number;
  /** Optional clock override for tests. */
  readonly now?: () => number;
}

const ADAPTER_VERSION = '0.1.0';

export function createClaudeCliAdapter(cfg: ClaudeCliAdapterConfig): AgentAdapter {
  const now = cfg.now ?? (() => Date.now());

  const metadata: AgentMetadata = {
    id: `anthropic-cli:${cfg.model}`,
    displayName: cfg.displayName,
    provider: 'anthropic-cli',
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
      const platform = getPlatform();
      const start = now();

      const binPath = cfg.binPath ?? (await platform.process.which('claude'));
      if (!binPath) {
        throw new AdapterError({
          code: 'internal',
          message: '`claude` CLI not found on PATH. Install Claude Code (https://claude.com/claude-code) first.',
          retriable: false,
        });
      }

      const { argv, stdin } = encodeRequest(req, {
        model: cfg.model,
        defaultMaxOutputTokens: defaultMax,
      });

      const result = await platform.process.spawn({
        command: binPath,
        args: argv,
        stdin,
        abortSignal: req.abortSignal,
        timeoutMs: 600_000, // 10 min — generous; Claude Code spins up child caches
      });

      if (result.code !== 0 || result.stdout.trim().length === 0) {
        throw mapCliFailure({
          exitCode: result.code,
          signal: result.signal,
          stderr: result.stderr,
          stdout: result.stdout,
          cancelled: req.abortSignal?.aborted ?? false,
        });
      }

      let parsed: ClaudeCliResultJson;
      try {
        parsed = JSON.parse(result.stdout.trim()) as ClaudeCliResultJson;
      } catch (err) {
        throw new AdapterError({
          code: 'internal',
          message: `claude --print returned non-JSON output: ${(err as Error).message}`,
          retriable: false,
          cause: { stdout: result.stdout, stderr: result.stderr },
        });
      }

      if (parsed.is_error) {
        throw mapCliFailure({
          exitCode: result.code,
          signal: result.signal,
          stderr: result.stderr,
          stdout: result.stdout,
        });
      }

      const proj = projectClaudeCli(parsed, { model: cfg.model });

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
        raw: parsed,
        canonical: proj.canonical,
        latencyMs: now() - start,
      };
    },

    async healthCheck(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
      const t0 = now();
      try {
        const resp = await this.invoke({
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Reply with the single word PING.' }] },
          ],
          maxOutputTokens: 4,
        });
        const ok = resp.text.toUpperCase().includes('PING');
        return { ok, message: ok ? 'ping ok' : 'unexpected reply', latencyMs: now() - t0 };
      } catch (err) {
        const ae = err as AdapterError;
        return { ok: false, message: `${ae.code}: ${ae.message}`, latencyMs: now() - t0 };
      }
    },
  };
}

export { ADAPTER_VERSION };
