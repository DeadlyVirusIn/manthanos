// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import {
  runManthanProviderInstall,
  runManthanProviderLogin,
  runManthanSetup,
} from '../src/commands/setup.js';

describe('manthan setup CLI surface', () => {
  it('setup --dry-run exits 0 without throwing', async () => {
    const code = await runManthanSetup({ providerIds: ['claude-cli'], dryRun: true });
    expect(code).toBe(0);
  });

  it('rejects unknown provider ids', async () => {
    // Capture stderr so the test output stays clean.
    const original = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await runManthanSetup({ providerIds: ['nope'], dryRun: true });
      expect(code).toBe(2);
      expect(captured).toContain('unknown provider');
    } finally {
      process.stderr.write = original;
    }
  });

  it('provider install --dry-run returns 0 for a known provider', async () => {
    const code = await runManthanProviderInstall({ providerId: 'codex-cli', dryRun: true });
    expect(code).toBe(0);
  });

  it('provider install rejects unknown id', async () => {
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      const code = await runManthanProviderInstall({ providerId: 'nope', dryRun: true });
      expect(code).toBe(2);
    } finally {
      process.stderr.write = original;
    }
  });

  it('provider login --dry-run returns 0 for a provider with auth metadata', async () => {
    const code = await runManthanProviderLogin({ providerId: 'codex-cli', dryRun: true });
    expect(code).toBe(0);
  });

  it('provider login rejects a provider without auth metadata', async () => {
    // Find a provider with no auth (none today have empty auth — vibe/cursor have planned auth)
    // Synthesize via the "no install" rejection path for a provider that only has auth.
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      // 'opencode' is detected-only with no install/auth metadata.
      const code = await runManthanProviderLogin({ providerId: 'opencode', dryRun: true });
      expect(code).toBe(2);
    } finally {
      process.stderr.write = original;
    }
  });
});
