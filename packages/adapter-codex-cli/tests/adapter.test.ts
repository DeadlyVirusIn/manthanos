// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal smoke test for the Codex CLI adapter factory.
// Verifies the metadata shape returned by createCodexCliAdapter
// without invoking the subprocess. No live provider.

import { describe, expect, it } from 'vitest';
import { createCodexCliAdapter } from '../src/index.js';

describe('createCodexCliAdapter', () => {
  it('returns an adapter with expected metadata shape', () => {
    const adapter = createCodexCliAdapter();
    expect(adapter.metadata.id).toBe('openai-cli:codex-default');
    expect(adapter.metadata.provider).toBe('openai-cli');
    expect(adapter.metadata.model).toBe('codex-default');
    expect(adapter.metadata.adapterVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('declares non-toolUse, non-structuredOutput capabilities', () => {
    const adapter = createCodexCliAdapter();
    expect(adapter.metadata.capabilities.toolUse).toBe(false);
    expect(adapter.metadata.capabilities.structuredOutput).toBe(false);
    expect(adapter.metadata.capabilities.streaming).toBe(false);
    expect(adapter.metadata.capabilities.contextTokens).toBeGreaterThan(0);
    expect(adapter.metadata.capabilities.maxOutputTokens).toBeGreaterThan(0);
  });

  it('reports subscription-style zero cost (no per-call USD billing)', () => {
    const adapter = createCodexCliAdapter();
    expect(adapter.metadata.cost.inputUsdMicroPer1k).toBe(0);
    expect(adapter.metadata.cost.outputUsdMicroPer1k).toBe(0);
  });

  it('honors displayName override', () => {
    const adapter = createCodexCliAdapter({ displayName: 'custom-codex' });
    expect(adapter.metadata.displayName).toBe('custom-codex');
  });

  it('exposes an invoke method', () => {
    const adapter = createCodexCliAdapter();
    expect(typeof adapter.invoke).toBe('function');
  });
});
