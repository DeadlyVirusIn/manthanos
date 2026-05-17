// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/redactor.js';

describe('redactSecrets', () => {
  it('redacts OpenAI project keys', () => {
    const input = 'My key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF and more.';
    const { text, redactions } = redactSecrets(input);
    expect(text).not.toContain('sk-proj-');
    expect(text).toContain('[REDACTED:openai_project_key:');
    expect(redactions.find((r) => r.pattern === 'openai_project_key')?.count).toBe(1);
  });

  it('redacts Anthropic api keys', () => {
    const input = 'sk-ant-api03-deadbeef0123456789ABCDEF01234567890XYZ';
    const { text } = redactSecrets(input);
    expect(text).toContain('[REDACTED:anthropic_api_key:');
  });

  it('redacts Google AI keys', () => {
    const input = 'Try AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8 ok';
    const { text } = redactSecrets(input);
    expect(text).toContain('[REDACTED:google_ai_key:');
  });

  it('redacts GitHub tokens', () => {
    const input = 'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB';
    const { text } = redactSecrets(input);
    expect(text).toContain('[REDACTED:github_token:');
  });

  it('redacts AWS access key IDs', () => {
    const input = 'AKIAIOSFODNN7EXAMPLE in config';
    const { text } = redactSecrets(input);
    expect(text).toContain('[REDACTED:aws_access_key_id:');
  });

  it('redacts PEM private keys', () => {
    const input =
      'head\n-----BEGIN PRIVATE KEY-----\nMIIE...payload...lock\n-----END PRIVATE KEY-----\ntail';
    const { text } = redactSecrets(input);
    expect(text).toContain('[REDACTED:pem_private_key:');
    expect(text).not.toContain('MIIE');
  });

  it('handles multiple distinct patterns in one string', () => {
    const input = 'sk-proj-abcdefghij0123456789ABCDEF0123 and AKIAIOSFODNN7EXAMPLE';
    const { redactions } = redactSecrets(input);
    expect(redactions.map((r) => r.pattern).sort()).toEqual([
      'aws_access_key_id',
      'openai_project_key',
    ]);
  });

  it('leaves benign text untouched', () => {
    const input = 'this string has nothing sensitive in it.';
    const { text, redactions } = redactSecrets(input);
    expect(text).toBe(input);
    expect(redactions).toEqual([]);
  });

  it('redactions array is sorted deterministically', () => {
    const input =
      'AKIAIOSFODNN7EXAMPLE then sk-proj-abc0123456789abcdefghijklmnopqrst then ghp_0123456789abcdefghijklmnopqrstuvwxyzAB';
    const { redactions } = redactSecrets(input);
    const names = redactions.map((r) => r.pattern);
    expect(names).toEqual([...names].sort());
  });
});
