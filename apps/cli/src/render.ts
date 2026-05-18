// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal CLI render helper.
//
// Intentionally small. Color discipline (per the private CLI UX
// design system):
//
//   - Color is reinforcement, never the only signal. Every coloured
//     value carries a textual marker so the same information reads
//     correctly under NO_COLOR or when piped to a file.
//   - Statuses, failures, warnings, next-action hints get color.
//     Everything else stays default.
//   - Eight ANSI base colors only, via Node's built-in `util.styleText`.
//     No 256-color, no RGB, no backgrounds.
//
// If this file grows past ~200 lines, the abstraction is wrong and we
// should simplify rather than extend.

import { styleText } from 'node:util';

type ColorMode = 'auto' | 'always' | 'never';

let mode: ColorMode = 'auto';

/**
 * Set the global color mode for this CLI invocation. Called once at
 * command entry when a `--no-color` / `--color=always` flag is seen.
 * Default is `auto`: color enabled iff stdout is a TTY and NO_COLOR
 * is not set in the environment.
 */
export function setColorMode(m: ColorMode): void {
  mode = m;
}

/**
 * Whether ANSI escapes should be emitted right now. Cheap to call;
 * re-evaluates the environment each invocation so changing NO_COLOR
 * mid-test works.
 */
export function colorEnabled(): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  if (typeof process.env.NO_COLOR === 'string' && process.env.NO_COLOR.length > 0) return false;
  return Boolean(process.stdout.isTTY);
}

type Format = Parameters<typeof styleText>[0];

function paint(format: Format, text: string): string {
  if (!colorEnabled()) return text;
  // `validateStream: false` skips Node's own TTY check. We've
  // already decided via `colorEnabled()` — Node's check would
  // strip color when stdout is piped, which is correct for the
  // `auto` mode but wrong for explicit `--force-color`.
  return styleText(format, text, { validateStream: false });
}

// Color primitives. Use sparingly per the design system; most text
// should remain default.
export const dim = (s: string): string => paint('dim', s);
export const bold = (s: string): string => paint('bold', s);
export const green = (s: string): string => paint('green', s);
export const yellow = (s: string): string => paint('yellow', s);
export const red = (s: string): string => paint('red', s);
export const cyan = (s: string): string => paint('cyan', s);
export const boldRed = (s: string): string => paint(['bold', 'red'], s);

/**
 * Pad a `<key>:` column to a fixed width. Width 16 matches the
 * `key:` discipline in the design system: `status:` (7 chars) gets
 * 9 trailing spaces; `canonical_hash:` (15 chars) gets 1. Keys that
 * meet or exceed `width` get a single trailing space and no
 * padding.
 */
export function padKey(key: string, width = 16): string {
  const withColon = `${key}:`;
  if (withColon.length >= width) return `${withColon} `;
  return `${withColon}${' '.repeat(width - withColon.length)}`;
}

/**
 * Two-space-indented `key: value` line ready for stdout (caller
 * appends the newline). Value is rendered verbatim — color goes on
 * the value, not on the key.
 */
export function kv(key: string, value: string): string {
  return `  ${padKey(key)}${value}`;
}

/**
 * Standalone command-title line: `manthan <command>` with optional
 * subject, dim-separated by em-dash. Bold by design memo, but bold
 * is the only emphasis used on the title line — nothing else on the
 * line gets color.
 */
export function commandTitle(command: string, subject?: string): string {
  const head = bold(`manthan ${command}`);
  if (!subject) return head;
  return `${head} ${dim(`— ${subject}`)}`;
}

/**
 * `→` next-action arrow followed by a cyan command suggestion. Used
 * sparingly; only at the very end of a command's output when the
 * operator has a clear next step.
 */
export function nextAction(text: string): string {
  return `${cyan('->')} ${text}`;
}

/**
 * Truncate a 64-hex sha256 to `prefixChars` + `…`. Lowercase
 * preserved. Used for inline hash references. For standalone full
 * hashes, pass the value through `dim()` directly without
 * truncation.
 */
export function hashShort(hex: string, prefixChars = 16): string {
  if (hex.length <= prefixChars) return hex;
  return `${hex.slice(0, prefixChars)}…`;
}

/**
 * Render a per-check outcome ("ok" / "mismatch" / "legacy" /
 * "unverifiable" / "failed") with the design-system case + color
 * discipline:
 *
 *   ok            → green, lowercase
 *   mismatch      → red,   uppercase
 *   legacy        → yellow, lowercase, optional parenthetical detail
 *   unverifiable  → yellow, lowercase, optional parenthetical detail
 *   failed        → red,   uppercase
 *
 * The textual marker carries the information; color is reinforcement.
 */
export function checkOutcome(
  outcome: 'ok' | 'mismatch' | 'legacy' | 'unverifiable' | 'failed',
  detail?: string,
): string {
  switch (outcome) {
    case 'ok':
      return green('ok');
    case 'mismatch':
      return red('MISMATCH');
    case 'failed':
      return red('FAILED');
    case 'legacy':
      return detail ? `${yellow('legacy')} ${dim(`(${detail})`)}` : yellow('legacy');
    case 'unverifiable':
      return detail ? `${yellow('unverifiable')} ${dim(`(${detail})`)}` : yellow('unverifiable');
  }
}

/**
 * Render a top-level status banner for the four-state replay vocabulary.
 *
 *   verified      → green, lowercase
 *   legacy        → yellow, lowercase, parenthetical reason
 *   unverifiable  → yellow, lowercase, parenthetical reason
 *   corrupted     → red+bold, UPPERCASE, em-dash qualifier
 *
 * The case-shift on `corrupted` is intentional — the most severe
 * state stands out even when piped to a no-color sink.
 */
export function statusBanner(
  status: 'verified' | 'legacy' | 'unverifiable' | 'corrupted',
  qualifier?: string,
): string {
  switch (status) {
    case 'verified':
      return green('verified');
    case 'legacy':
      return qualifier ? `${yellow('legacy')} ${dim(`(${qualifier})`)}` : yellow('legacy');
    case 'unverifiable':
      return qualifier
        ? `${yellow('unverifiable')} ${dim(`(${qualifier})`)}`
        : yellow('unverifiable');
    case 'corrupted':
      return qualifier ? `${boldRed('CORRUPTED')} ${red(`— ${qualifier}`)}` : boldRed('CORRUPTED');
  }
}
