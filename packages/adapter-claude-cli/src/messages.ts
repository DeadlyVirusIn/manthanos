// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Encode a ManthanOS AgentRequest into argv + stdin for `claude --print`.

import type { AgentRequest, ToolSpec } from '@manthanos/adapters-sdk';
import { DENIED_TOOLS } from './types.js';

export interface CliInvocation {
  readonly argv: string[];
  /** The user prompt (flows on stdin to avoid argv length limits). */
  readonly stdin: string;
}

export interface EncodeOptions {
  /** The model alias or full id (e.g., 'sonnet', 'opus', 'claude-sonnet-4-6'). */
  readonly model: string;
  /** Defaults to 4096 unless the request specifies. */
  readonly defaultMaxOutputTokens: number;
}

function extractText(req: AgentRequest): { system: string; user: string } {
  // System text: req.system + any role=system message content.
  let system = req.system ?? '';
  const userBlocks: string[] = [];

  for (const m of req.messages) {
    if (m.role === 'system') {
      const flat = m.content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join('\n');
      system = system ? `${system}\n${flat}` : flat;
    } else if (m.role === 'user') {
      for (const p of m.content) {
        if (p.type === 'text') userBlocks.push(p.text);
      }
    }
    // 'assistant' and 'tool' roles cannot be expressed through `claude
    // --print` non-interactively. The first MVP path supports user-only
    // turns (which is exactly what `manthan plan` produces).
  }

  return { system, user: userBlocks.join('\n\n') };
}

function buildSchemaJson(req: AgentRequest): string | undefined {
  // We map a single tool spec → --json-schema when present. Multiple tools
  // are unsupported in the CLI adapter (Claude Code's --json-schema is one
  // schema per call).
  const tools = req.tools;
  if (!tools || tools.length === 0) {
    if (req.outputSchema) {
      return JSON.stringify(req.outputSchema);
    }
    return undefined;
  }
  // First tool's inputSchema becomes the structured-output schema.
  const t: ToolSpec | undefined = tools[0];
  if (!t) return undefined;
  return JSON.stringify(t.inputSchema);
}

export function encodeRequest(req: AgentRequest, opts: EncodeOptions): CliInvocation {
  const { system, user } = extractText(req);
  const maxTokens = req.maxOutputTokens ?? opts.defaultMaxOutputTokens;

  const argv: string[] = [
    '--print',
    '--output-format',
    'json',
    '--model',
    opts.model,
    '--no-session-persistence',
    '--disallowedTools',
    DENIED_TOOLS.join(' '),
  ];

  if (system) {
    argv.push('--system-prompt', system);
  }

  const schema = buildSchemaJson(req);
  if (schema) {
    argv.push('--json-schema', schema);
  }

  // Anthropic-style temperature is not exposed in Claude Code's CLI; deterministic
  // behavior is approximated by stable inputs + cache. We document this limit.
  // maxTokens isn't a direct CLI flag either; we rely on Claude Code's defaults.
  void maxTokens;

  // The prompt itself goes on stdin so we don't blow ARG_MAX with packed bundles.
  return { argv, stdin: user };
}
