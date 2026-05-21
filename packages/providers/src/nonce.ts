// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Anti-injection nonce wrapper for raw CLI/agent stdout.
//
// Untrusted provider output may contain text that *looks like* instructions
// to a downstream consumer (another LLM, a log scraper, etc.). Wrapping
// such output with per-call random markers makes the boundary explicit and
// unforgeable: anything between BEGIN/END markers is content, never directive.
//
// ManthanOS-native; no external dependency.

import { randomBytes } from 'node:crypto';

const NONCE_BYTES = 16; // 128-bit, 32 hex chars
const PREFIX = 'MANTHAN_UNTRUSTED';

export interface NonceWrap {
  readonly wrapped: string;
  readonly nonce: string;
  readonly beginMarker: string;
  readonly endMarker: string;
}

function makeNonce(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

export interface WrapOptions {
  /** Override the nonce (tests only — never pass in production). */
  readonly nonce?: string;
}

export function wrapWithNonce(text: string, opts: WrapOptions = {}): NonceWrap {
  const nonce = opts.nonce ?? makeNonce(NONCE_BYTES);
  const beginMarker = `${PREFIX}_BEGIN_${nonce}`;
  const endMarker = `${PREFIX}_END_${nonce}`;
  const wrapped = `${beginMarker}\n${text}\n${endMarker}`;
  return { wrapped, nonce, beginMarker, endMarker };
}

/**
 * Reverse `wrapWithNonce`. Returns the original text iff `wrapped` contains
 * exactly one matching nonce pair at the outermost layer; otherwise null.
 */
export function unwrapNonce(wrapped: string, nonce: string): string | null {
  const beginMarker = `${PREFIX}_BEGIN_${nonce}`;
  const endMarker = `${PREFIX}_END_${nonce}`;
  const begin = wrapped.indexOf(beginMarker);
  const end = wrapped.lastIndexOf(endMarker);
  if (begin < 0 || end < 0 || end <= begin) return null;
  // Strip exactly one newline after begin and one before end if present.
  let start = begin + beginMarker.length;
  if (wrapped.charAt(start) === '\n') start += 1;
  let stop = end;
  if (stop > 0 && wrapped.charAt(stop - 1) === '\n') stop -= 1;
  return wrapped.slice(start, stop);
}

/**
 * Returns true iff `text` contains a literal occurrence of the nonce's
 * begin or end marker. Used to verify a candidate nonce is collision-free
 * against the content being wrapped — callers SHOULD regenerate the nonce
 * when this returns true (vanishingly rare with 128-bit nonces).
 */
export function nonceCollidesWithText(text: string, nonce: string): boolean {
  return text.includes(`${PREFIX}_BEGIN_${nonce}`) || text.includes(`${PREFIX}_END_${nonce}`);
}
