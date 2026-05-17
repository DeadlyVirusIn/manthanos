// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { AdapterError, type AdapterErrorCode } from '@manthanos/adapters-sdk';
import type { ClaudeCliResultJson } from './types.js';

/** Map a `claude --print` subprocess failure into the canonical error taxonomy. */
export function mapCliFailure(args: {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly cancelled?: boolean;
}): AdapterError {
  if (args.cancelled || args.signal === 'SIGTERM' || args.signal === 'SIGKILL') {
    return new AdapterError({
      code: 'cancelled',
      message: 'claude --print was aborted',
      retriable: false,
    });
  }

  const text = `${args.stderr}\n${args.stdout}`.toLowerCase();

  // First, try to parse stdout as a JSON error result (Claude Code emits one
  // for content_filter / context_window even on non-zero exits sometimes).
  const json = tryParseResultJson(args.stdout);
  if (json?.is_error) {
    const code = classifyApiError(json.api_error_status, json.subtype, text);
    return new AdapterError({
      code,
      message: json.subtype ?? `claude --print returned error (exit ${args.exitCode})`,
      retriable: code === 'rate_limited' || code === 'overloaded' || code === 'network',
      cause: json,
    });
  }

  // Heuristic fallbacks based on stderr content.
  if (/not authenticated|please log in|run `claude login`/i.test(text)) {
    return new AdapterError({
      code: 'auth',
      message: 'Claude Code CLI is not authenticated. Run `claude login` first.',
      retriable: false,
    });
  }
  if (/rate.?limit|429/i.test(text)) {
    return new AdapterError({
      code: 'rate_limited',
      message: 'Claude rate limit hit',
      retriable: true,
    });
  }
  if (/quota|usage limit|monthly|exhausted/i.test(text)) {
    return new AdapterError({
      code: 'rate_limited',
      message: 'Claude subscription quota exhausted',
      retriable: false,
    });
  }
  if (/context.window|too.long|max.context/i.test(text)) {
    return new AdapterError({
      code: 'context_window',
      message: 'Context window exceeded',
      retriable: false,
    });
  }
  if (/ENOENT|command not found|no such file/i.test(text)) {
    return new AdapterError({
      code: 'internal',
      message: '`claude` binary not found on PATH',
      retriable: false,
    });
  }

  return new AdapterError({
    code: 'internal',
    message:
      args.stderr.trim() || args.stdout.trim() || `claude --print exited with ${args.exitCode}`,
    retriable: false,
  });
}

function tryParseResultJson(stdout: string): ClaudeCliResultJson | null {
  // Claude Code emits a single JSON object on stdout in --output-format json.
  // We try to find a balanced top-level object; defensive against trailing newlines.
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as ClaudeCliResultJson;
  } catch {
    return null;
  }
}

function classifyApiError(
  apiStatus: string | number | null,
  subtype: string | undefined,
  text: string,
): AdapterErrorCode {
  if (apiStatus === 429 || /rate.?limit/i.test(text)) return 'rate_limited';
  if (apiStatus === 401 || apiStatus === 403) return 'auth';
  if (typeof apiStatus === 'number' && apiStatus >= 500) return 'overloaded';
  if (apiStatus === 400 && /context.window/i.test(text)) return 'context_window';
  if (subtype === 'context_filter') return 'content_filter';
  return 'internal';
}
