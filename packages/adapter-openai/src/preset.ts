// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Minimal OpenAI preset for E6.1. One model only: gpt-4o-2024-08-06.
// Chosen because it is the earliest snapshot with stable
// `response_format: json_schema` support, and its pricing is the
// least volatile point of comparison against Claude Sonnet's preset.
//
// Prices captured 2026-05-16 from OpenAI's published rate card.

import type { OpenAIAdapterConfig } from './adapter.js';

export type OpenAIPresetId = 'gpt-4o';

export const PRESETS = {
  'gpt-4o': {
    model: 'gpt-4o-2024-08-06',
    displayName: 'OpenAI gpt-4o (2024-08-06)',
    cost: {
      // $2.50 / 1M = 2_500 micro per 1k input tokens.
      inputUsdMicroPer1k: 2_500,
      // $10.00 / 1M = 10_000 micro per 1k output tokens.
      outputUsdMicroPer1k: 10_000,
    },
    capabilities: {
      contextTokens: 128_000,
      maxOutputTokens: 16_384,
      toolUse: true,
      vision: true,
      streaming: true,
      fileAccess: 'none' as const,
      reasoningStrength: 4 as const,
      implementationStrength: 4 as const,
      webBrowsing: false,
      structuredOutput: true,
    },
    latencyClass: 'medium' as const,
    recommendedFor: ['implementation', 'review'] as const,
  },
} as const;

export function presetToConfig(
  preset: OpenAIPresetId,
  apiKey: string,
  overrides: Partial<OpenAIAdapterConfig> = {},
): OpenAIAdapterConfig {
  const p = PRESETS[preset];
  return {
    apiKey,
    model: p.model,
    displayName: p.displayName,
    cost: p.cost,
    capabilities: p.capabilities,
    latencyClass: p.latencyClass,
    recommendedFor: [...p.recommendedFor],
    ...overrides,
  };
}
