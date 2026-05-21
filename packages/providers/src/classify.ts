// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Generic provider error classifier. Adapters call `classifyProviderError`
// on captured stderr/stdout (or an error message) to decide retriability
// and surface a consistent ProviderErrorClass for diagnostics.
//
// Patterns are kept narrow and explicit. False positives are worse than
// false negatives — when in doubt, classify as 'unknown'.

import type { ClassifiedError, ProviderErrorClass } from './types.js';

interface PatternRule {
  readonly class: ProviderErrorClass;
  readonly retriable: boolean;
  readonly pattern: RegExp;
}

// Order matters: more specific patterns must precede broader ones.
const RULES: ReadonlyArray<PatternRule> = [
  // Auth / credentials.
  {
    class: 'auth',
    retriable: false,
    pattern: /\b(unauthorized|forbidden|401|403|token (?:expired|invalid)|invalid api key)\b/i,
  },
  // Missing binary (raised by spawn layer before any CLI output).
  {
    class: 'missing_binary',
    retriable: false,
    pattern: /\b(?:command not found|ENOENT|not found on PATH)\b/i,
  },
  // Quota / rate-limit exhaustion.
  {
    class: 'quota_exhausted',
    retriable: true,
    pattern:
      /\b(QUOTA_EXHAUSTED|TerminalQuotaError|RetryableQuotaError|insufficient_quota|exhausted your capacity|Attempt\s+\d+\s+failed[^\n]*exhausted)\b/,
  },
  {
    class: 'quota_exhausted',
    retriable: true,
    pattern: /\b(rate[\s_-]?limit(?:ed|\s+exceeded)?|429)\b/i,
  },
  // Model lookup.
  {
    class: 'model_not_found',
    retriable: false,
    pattern: /\bmodel\b[^\n]*?\b(?:not\s+found|unknown|does\s+not\s+exist|no such model)\b/i,
  },
  // Schema rejection (strict-mode JSON schema failures).
  {
    class: 'schema_rejection',
    retriable: false,
    pattern: /\b(?:schema\s+(?:rejected|validation)|response_format|json[_\s-]?schema)\b/i,
  },
  // Timeout.
  {
    class: 'timeout',
    retriable: true,
    pattern: /\b(timed?\s*out|timeout|ETIMEDOUT|deadline\s+exceeded)\b/i,
  },
  // Transient network / server.
  {
    class: 'transient',
    retriable: true,
    pattern: /\b(ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket\s+hang\s+up|5\d\d|server\s+error)\b/i,
  },
];

export function classifyProviderError(text: string): ClassifiedError {
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      return { class: rule.class, retriable: rule.retriable, matchedPattern: match[0] };
    }
  }
  return { class: 'unknown', retriable: false };
}

/**
 * Convenience guard: did this output indicate Gemini quota exhaustion?
 * Used to fail-fast instead of letting Gemini's own ~hours-long retry loop run.
 */
export function isGeminiQuotaExhausted(text: string): boolean {
  return classifyProviderError(text).class === 'quota_exhausted';
}

/**
 * Default Gemini model-not-found fallback chain. Order matters: try the
 * cheapest current model last so it can absorb traffic when newer
 * preview models get deprecated.
 */
export const GEMINI_FALLBACK_MODELS: ReadonlyArray<string> = Object.freeze(['gemini-2.5-flash']);
