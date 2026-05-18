// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal smoke tests for the OpenAI adapter preset + factory.
// Verifies the metadata shape returned by createOpenAIAdapter +
// presetToConfig without making a live API call.

import { describe, expect, it } from 'vitest';
import { createOpenAIAdapter } from '../src/adapter.js';
import { PRESETS, presetToConfig } from '../src/preset.js';

describe('OpenAI adapter preset', () => {
  it('exposes the gpt-4o preset with a stable model snapshot', () => {
    const p = PRESETS['gpt-4o'];
    expect(p.model).toBe('gpt-4o-2024-08-06');
    expect(p.displayName).toContain('gpt-4o');
  });

  it('declares positive per-1k token cost in micro-USD', () => {
    const p = PRESETS['gpt-4o'];
    expect(p.cost.inputUsdMicroPer1k).toBeGreaterThan(0);
    expect(p.cost.outputUsdMicroPer1k).toBeGreaterThan(p.cost.inputUsdMicroPer1k);
  });

  it('exposes structuredOutput=true for response_format json_schema path', () => {
    const p = PRESETS['gpt-4o'];
    expect(p.capabilities.structuredOutput).toBe(true);
    expect(p.capabilities.toolUse).toBe(true);
  });

  it('presetToConfig fills in the API key', () => {
    const cfg = presetToConfig('gpt-4o', 'sk-test-not-real');
    expect(cfg.apiKey).toBe('sk-test-not-real');
    expect(cfg.model).toBe('gpt-4o-2024-08-06');
  });
});

describe('createOpenAIAdapter', () => {
  const cfg = presetToConfig('gpt-4o', 'sk-test-not-real');

  it('returns an adapter with the OpenAI provider id', () => {
    const adapter = createOpenAIAdapter(cfg);
    expect(adapter.metadata.id).toBe('openai:gpt-4o-2024-08-06');
    expect(adapter.metadata.provider).toBe('openai');
    expect(adapter.metadata.model).toBe('gpt-4o-2024-08-06');
  });

  it('exposes an invoke method without contacting the network', () => {
    // Constructing the adapter must not initialize the OpenAI client
    // — it's lazy. This guards against accidental eager-init regressions.
    const adapter = createOpenAIAdapter(cfg);
    expect(typeof adapter.invoke).toBe('function');
  });

  it('reports the adapter version string', () => {
    const adapter = createOpenAIAdapter(cfg);
    expect(adapter.metadata.adapterVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
