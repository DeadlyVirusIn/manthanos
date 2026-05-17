// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Canonical JSON encoder per DEBATE_PROTOCOL.md §7.1.
//
// Rules:
//   - Object keys sorted alphabetically, recursive.
//   - Arrays preserve insertion order.
//   - No whitespace (no indentation).
//   - Strings NFC-normalized when they contain non-ASCII.
//   - Numbers: shortest round-trip representation; NaN/Infinity forbidden.
//   - RFC 8259 minimal escapes; forward slash NOT escaped.
//   - Non-ASCII emitted directly (after NFC), not \uXXXX.
//   - `null` preserved; absent keys not synthesized.
//
// This is the ONLY canonical-encoding entry point. Lint forbids direct
// JSON.stringify in persistence paths.

// Check whether all codepoints are within the ASCII range (≤ 0x7F).
// Done without a regex to avoid the control-char-in-regex lint that the
// straightforward character-class form trips.
function isAsciiOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function normalizeString(s: string): string {
  return isAsciiOnly(s) ? s : s.normalize('NFC');
}

function escapeString(s: string): string {
  // RFC 8259 minimal escapes: only \" \\ and control chars require escaping.
  // We do not escape '/' (allowed unescaped in JSON).
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) {
      out += '\\"';
    } else if (c === 0x5c) {
      out += '\\\\';
    } else if (c === 0x08) {
      out += '\\b';
    } else if (c === 0x0c) {
      out += '\\f';
    } else if (c === 0x0a) {
      out += '\\n';
    } else if (c === 0x0d) {
      out += '\\r';
    } else if (c === 0x09) {
      out += '\\t';
    } else if (c < 0x20) {
      out += `\\u${c.toString(16).padStart(4, '0')}`;
    } else {
      out += s[i];
    }
  }
  out += '"';
  return out;
}

function encodeNumber(n: number): string {
  if (Number.isNaN(n)) {
    throw new JsonCanonError('NaN is not permitted in canonical JSON');
  }
  if (!Number.isFinite(n)) {
    throw new JsonCanonError('Infinity is not permitted in canonical JSON');
  }
  // Number.prototype.toString produces the shortest round-trip form
  // for finite numbers; JS uses IEEE-754 doubles consistently.
  return n.toString();
}

function encodeValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) {
    // undefined is not representable in JSON; we reject rather than
    // silently dropping. Callers should not include undefined.
    throw new JsonCanonError('undefined is not permitted in canonical JSON');
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return encodeNumber(v);
  if (typeof v === 'bigint') {
    // bigint is not standard JSON. We forbid it explicitly.
    throw new JsonCanonError('bigint is not permitted in canonical JSON');
  }
  if (typeof v === 'string') return escapeString(normalizeString(v));
  if (Array.isArray(v)) {
    return `[${v.map(encodeValue).join(',')}]`;
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const val = obj[k];
      if (val === undefined) continue;
      parts.push(`${escapeString(normalizeString(k))}:${encodeValue(val)}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new JsonCanonError(`unsupported type in canonical JSON: ${typeof v}`);
}

export class JsonCanonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonCanonError';
  }
}

export const JsonCanon = {
  /** Canonical JSON serialization. */
  stringify(v: unknown): string {
    return encodeValue(v);
  },
  /** Parse JSON (uses standard JSON.parse — parsing has only one answer). */
  parse<T = unknown>(s: string): T {
    return JSON.parse(s) as T;
  },
} as const;
