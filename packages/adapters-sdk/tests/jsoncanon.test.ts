// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { JsonCanon, JsonCanonError } from '../src/jsoncanon.js';

describe('JsonCanon', () => {
  it('sorts object keys alphabetically', () => {
    expect(JsonCanon.stringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(JsonCanon.stringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles nested objects with recursive key sorting', () => {
    expect(JsonCanon.stringify({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });

  it('produces no whitespace', () => {
    const s = JsonCanon.stringify({ a: [1, 2, { b: 'c' }] });
    expect(s).toBe('{"a":[1,2,{"b":"c"}]}');
    expect(s.includes(' ')).toBe(false);
    expect(s.includes('\n')).toBe(false);
  });

  it('serializes null and booleans', () => {
    expect(JsonCanon.stringify({ a: null, b: true, c: false })).toBe(
      '{"a":null,"b":true,"c":false}',
    );
  });

  it('drops undefined values from objects', () => {
    expect(JsonCanon.stringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rejects NaN', () => {
    expect(() => JsonCanon.stringify({ x: Number.NaN })).toThrow(JsonCanonError);
  });

  it('rejects Infinity', () => {
    expect(() => JsonCanon.stringify({ x: Number.POSITIVE_INFINITY })).toThrow(JsonCanonError);
  });

  it('rejects bigint', () => {
    expect(() => JsonCanon.stringify({ x: BigInt(1) })).toThrow(JsonCanonError);
  });

  it('rejects undefined at root', () => {
    expect(() => JsonCanon.stringify(undefined)).toThrow(JsonCanonError);
  });

  it('escapes control chars minimally', () => {
    expect(JsonCanon.stringify({ s: 'a\nb' })).toBe('{"s":"a\\nb"}');
    expect(JsonCanon.stringify({ s: 'ab' })).toBe('{"s":"a\\u0001b"}');
  });

  it('does not escape forward slash', () => {
    expect(JsonCanon.stringify({ url: 'a/b/c' })).toBe('{"url":"a/b/c"}');
  });

  it('preserves non-ASCII directly after NFC normalization', () => {
    // 'café' as NFC and as decomposed; both produce the same canonical form.
    const composed = 'café';
    const decomposed = 'café';
    expect(JsonCanon.stringify({ s: composed })).toBe(JsonCanon.stringify({ s: decomposed }));
  });

  it('is deterministic across runs', () => {
    const obj = { b: [{ y: 2, x: 1 }], a: { d: 4, c: 3 } };
    const a = JsonCanon.stringify(obj);
    const b = JsonCanon.stringify(obj);
    expect(a).toBe(b);
  });
});
