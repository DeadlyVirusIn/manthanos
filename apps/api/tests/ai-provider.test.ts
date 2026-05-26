// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8A — provider detection + capability gating (fail-closed).

import { describe, expect, it } from 'vitest';
import { computeAiCapabilities } from '../src/services/ai/capabilities.js';
import { detectProvider } from '../src/services/ai/provider.js';

describe('detectProvider — fail-closed', () => {
  it('not configured when env is empty', () => {
    expect(detectProvider({})).toEqual({ configured: false, model: null });
  });

  it('configured only when BOTH key and model are present', () => {
    expect(
      detectProvider({
        MANTHANOS_VALIDATOR_API_KEY: 'sk-test',
        MANTHANOS_VALIDATOR_MODEL: 'claude-haiku-4-5',
      }),
    ).toEqual({ configured: true, model: 'claude-haiku-4-5' });
  });

  it('not configured when key is missing/blank (model alone is not enough)', () => {
    expect(detectProvider({ MANTHANOS_VALIDATOR_MODEL: 'claude-haiku-4-5' }).configured).toBe(
      false,
    );
    expect(
      detectProvider({
        MANTHANOS_VALIDATOR_API_KEY: '   ',
        MANTHANOS_VALIDATOR_MODEL: 'claude-haiku-4-5',
      }).configured,
    ).toBe(false);
  });

  it('not configured when model is missing/blank', () => {
    expect(detectProvider({ MANTHANOS_VALIDATOR_API_KEY: 'sk-test' }).configured).toBe(false);
    expect(
      detectProvider({ MANTHANOS_VALIDATOR_API_KEY: 'sk-test', MANTHANOS_VALIDATOR_MODEL: '' })
        .configured,
    ).toBe(false);
  });

  it('never returns the secret', () => {
    const r = detectProvider({
      MANTHANOS_VALIDATOR_API_KEY: 'sk-super-secret',
      MANTHANOS_VALIDATOR_MODEL: 'm',
    });
    expect(JSON.stringify(r)).not.toContain('sk-super-secret');
  });
});

describe('computeAiCapabilities — provider gating', () => {
  it('default (no provider arg) stays deterministic-only', () => {
    const caps = computeAiCapabilities({
      extractionAssistEnabled: true,
      llmValidatorEnabled: true,
    });
    expect(caps.provider_configured).toBe(false);
    expect(caps.llm_validator_enabled).toBe(false);
    expect(caps.model).toBeNull();
  });

  it('configured provider + flag ON → validator enabled, model surfaced', () => {
    const caps = computeAiCapabilities(
      { extractionAssistEnabled: true, llmValidatorEnabled: true },
      { configured: true, model: 'claude-haiku-4-5' },
    );
    expect(caps.provider_configured).toBe(true);
    expect(caps.llm_validator_enabled).toBe(true);
    expect(caps.model).toBe('claude-haiku-4-5');
  });

  it('configured provider but flag OFF → validator stays disabled (default OFF)', () => {
    const caps = computeAiCapabilities(
      { extractionAssistEnabled: true },
      { configured: true, model: 'claude-haiku-4-5' },
    );
    expect(caps.provider_configured).toBe(true);
    expect(caps.llm_validator_enabled).toBe(false);
  });

  it('flag ON but provider NOT configured → validator stays disabled (fail-closed)', () => {
    const caps = computeAiCapabilities(
      { llmValidatorEnabled: true },
      { configured: false, model: null },
    );
    expect(caps.llm_validator_enabled).toBe(false);
    expect(caps.model).toBeNull();
  });
});
