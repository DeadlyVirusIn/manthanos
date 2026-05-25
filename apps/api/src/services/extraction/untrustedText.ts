// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.7B — untrusted conversation-text isolation.
//
// Conversation quotes/summary are HOSTILE, attacker-controlled DATA, never
// instructions (see SPRINT3B7_THREAT_MODEL.md §1–§3). Before any such text
// is placed in an LLM prompt it MUST be wrapped in a fixed, closed tag
// vocabulary AND escaped so it cannot forge a tag boundary and "break out"
// of its data block.
//
// Pure functions only: no IO, no network, no LLM. Deterministic.
//
// Escaping strategy: replace the three characters that could participate in
// a tag (`&`, `<`, `>`) with HTML-style entities. Because no raw `<`/`>`
// survives, the untrusted content cannot reproduce ANY delimiter (opener or
// closer) of ANY tag — breakout is structurally impossible, not regex-best-
// effort. `&` is escaped first so existing entity-looking text stays literal.

/** The CLOSED set of tags used to wrap untrusted conversation data. The
 *  system prompt tells the model this set is fixed and everything between
 *  the tags is inert data to analyze, never instructions to follow. */
export const UNTRUSTED_QUOTE_TAG = 'untrusted_conversation_quote';
export const UNTRUSTED_SUMMARY_TAG = 'untrusted_conversation_summary';

export const UNTRUSTED_TAGS = [UNTRUSTED_QUOTE_TAG, UNTRUSTED_SUMMARY_TAG] as const;

/**
 * Escape untrusted text so it cannot forge a tag boundary. Order matters:
 * `&` first, then `<` and `>`. After this, the string contains no literal
 * `<` or `>`, so it cannot reproduce any opening or closing delimiter.
 */
export function escapeUntrusted(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wrap escaped untrusted text in one of the fixed tags. */
function wrap(tag: (typeof UNTRUSTED_TAGS)[number], text: string): string {
  return `<${tag}>${escapeUntrusted(text)}</${tag}>`;
}

export function wrapUntrustedQuote(text: string): string {
  return wrap(UNTRUSTED_QUOTE_TAG, text);
}

export function wrapUntrustedSummary(text: string): string {
  return wrap(UNTRUSTED_SUMMARY_TAG, text);
}

export interface UntrustedConversationInput {
  readonly quotes: readonly string[];
  readonly summary?: string | null;
}

/**
 * Render a conversation's quotes (+ optional summary) as a single block of
 * tagged, escaped, untrusted data ready to interpolate into a prompt. Each
 * quote on its own line; the summary (if present) last. Deterministic.
 */
export function renderUntrustedConversation(input: UntrustedConversationInput): string {
  const parts = input.quotes.map(wrapUntrustedQuote);
  if (typeof input.summary === 'string' && input.summary.trim().length > 0) {
    parts.push(wrapUntrustedSummary(input.summary));
  }
  return parts.join('\n');
}

/** True if the rendered block contains no un-escaped tag delimiter from the
 *  untrusted content (i.e. only the wrapper tags we added). Exposed so the
 *  runner / tests can assert the breakout invariant. */
export function hasNoForgedDelimiter(rendered: string): boolean {
  // Strip the wrapper tags we legitimately added, then assert no `<`/`>`
  // survive in the remaining (escaped) content.
  let stripped = rendered;
  for (const tag of UNTRUSTED_TAGS) {
    stripped = stripped.split(`<${tag}>`).join('').split(`</${tag}>`).join('');
  }
  return !stripped.includes('<') && !stripped.includes('>');
}
