// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal smoke test for the Gemini CLI adapter factory.
// Verifies the metadata shape returned by createGeminiCliAdapter
// without invoking the subprocess. No live provider.

import { describe, expect, it } from 'vitest';
import { createGeminiCliAdapter } from '../src/index.js';

describe('createGeminiCliAdapter', () => {
  it('returns an adapter with expected metadata shape (default model)', () => {
    const adapter = createGeminiCliAdapter();
    expect(adapter.metadata.id).toBe('google-cli:default');
    expect(adapter.metadata.provider).toBe('google-cli');
    expect(adapter.metadata.model).toBe('default');
    expect(adapter.metadata.adapterVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('embeds an explicit model in the adapter id', () => {
    const adapter = createGeminiCliAdapter({ model: 'gemini-3-flash' });
    expect(adapter.metadata.id).toBe('google-cli:gemini-3-flash');
    expect(adapter.metadata.model).toBe('gemini-3-flash');
  });

  it('declares Gemini-class context window (≥ 1M tokens)', () => {
    const adapter = createGeminiCliAdapter();
    expect(adapter.metadata.capabilities.contextTokens).toBeGreaterThanOrEqual(1_000_000);
  });

  it('reports subscription-style zero cost', () => {
    const adapter = createGeminiCliAdapter();
    expect(adapter.metadata.cost.inputUsdMicroPer1k).toBe(0);
    expect(adapter.metadata.cost.outputUsdMicroPer1k).toBe(0);
  });

  it('honors displayName override', () => {
    const adapter = createGeminiCliAdapter({ displayName: 'custom-gemini' });
    expect(adapter.metadata.displayName).toBe('custom-gemini');
  });

  it('exposes an invoke method', () => {
    const adapter = createGeminiCliAdapter();
    expect(typeof adapter.invoke).toBe('function');
  });
});
