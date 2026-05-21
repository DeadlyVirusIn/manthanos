// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { buildIsolatedEnv } from '../src/env-iso.js';

describe('buildIsolatedEnv', () => {
  it('passes PATH and HOME through by default', () => {
    const env = buildIsolatedEnv({
      source: { PATH: '/usr/bin', HOME: '/home/x' },
    });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/x');
  });

  it('drops unrelated keys that are not allow-listed', () => {
    const env = buildIsolatedEnv({
      source: {
        PATH: '/usr/bin',
        HOME: '/h',
        OPENAI_API_KEY: 'sk-leak',
        GEMINI_API_KEY: 'g-leak',
        PERPLEXITY_API_KEY: 'p-leak',
        OPENROUTER_API_KEY: 'o-leak',
        SOMETHING_ELSE: 'x',
      },
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.PERPLEXITY_API_KEY).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.SOMETHING_ELSE).toBeUndefined();
  });

  it('passes only the requested provider keys through', () => {
    const env = buildIsolatedEnv({
      source: {
        PATH: '/usr/bin',
        HOME: '/h',
        OPENAI_API_KEY: 'sk-only',
        GEMINI_API_KEY: 'g-leak',
      },
      allowKeys: ['OPENAI_API_KEY'],
    });
    expect(env.OPENAI_API_KEY).toBe('sk-only');
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('omits allow-listed keys that have no value', () => {
    const env = buildIsolatedEnv({
      source: { PATH: '/usr/bin', HOME: '/h' },
      allowKeys: ['OPENAI_API_KEY'],
    });
    expect('OPENAI_API_KEY' in env).toBe(false);
  });

  it('honors extraBaseline (e.g. SSL_CERT_FILE)', () => {
    const env = buildIsolatedEnv({
      source: { PATH: '/usr/bin', HOME: '/h', SSL_CERT_FILE: '/etc/ssl/cacerts.pem' },
      extraBaseline: ['SSL_CERT_FILE'],
    });
    expect(env.SSL_CERT_FILE).toBe('/etc/ssl/cacerts.pem');
  });
});
