// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Stable model presets — keep these versioned with the model identifiers
// Anthropic publishes. Prices in USD micro-units (1 USD = 1,000,000 micro)
// per 1k tokens, captured at adapter-version 0.1.0 (May 2026).
//
// IMPORTANT (per Gemini hardening review): provider price volatility breaks
// budget estimation. The orchestrator must NOT hardcode these — it pulls
// `cost` from adapter metadata at call time. Presets are convenience
// defaults; users override in config.yaml.

import type { ClaudeAdapterConfig } from './adapter.js';

export const PRESETS = {
  'claude-opus-4-5': {
    model: 'claude-opus-4-5',
    displayName: 'Anthropic Claude Opus 4.5',
    cost: {
      mode: 'api' as const,
      inputUsdMicroPer1k: 15_000, // $15 / 1M = $0.015 / 1k = 15_000 micro
      outputUsdMicroPer1k: 75_000,
    },
    capabilities: {
      contextTokens: 200_000,
      maxOutputTokens: 64_000,
      toolUse: true,
      vision: true,
      streaming: true,
      fileAccess: 'none' as const,
      reasoningStrength: 5 as const,
      implementationStrength: 5 as const,
      webBrowsing: false,
      structuredOutput: true,
    },
    latencyClass: 'slow' as const,
    recommendedFor: [
      'architecture',
      'forensic-debug',
      'security-review',
      'arbitration',
      'large-context-analysis',
    ] as const,
  },
  'claude-sonnet-4-5': {
    model: 'claude-sonnet-4-5',
    displayName: 'Anthropic Claude Sonnet 4.5',
    cost: {
      mode: 'api' as const,
      inputUsdMicroPer1k: 3_000, // $3 / 1M
      outputUsdMicroPer1k: 15_000,
    },
    capabilities: {
      contextTokens: 200_000,
      maxOutputTokens: 64_000,
      toolUse: true,
      vision: true,
      streaming: true,
      fileAccess: 'none' as const,
      reasoningStrength: 4 as const,
      implementationStrength: 5 as const,
      webBrowsing: false,
      structuredOutput: true,
    },
    latencyClass: 'medium' as const,
    recommendedFor: ['implementation', 'review', 'summarization'] as const,
  },
  'claude-haiku-4-5': {
    model: 'claude-haiku-4-5',
    displayName: 'Anthropic Claude Haiku 4.5',
    cost: {
      mode: 'api' as const,
      inputUsdMicroPer1k: 1_000, // $1 / 1M
      outputUsdMicroPer1k: 5_000,
    },
    capabilities: {
      contextTokens: 200_000,
      maxOutputTokens: 8_192,
      toolUse: true,
      vision: true,
      streaming: true,
      fileAccess: 'none' as const,
      reasoningStrength: 3 as const,
      implementationStrength: 3 as const,
      webBrowsing: false,
      structuredOutput: true,
    },
    latencyClass: 'fast' as const,
    recommendedFor: ['summarization', 'ui-critique'] as const,
  },
} as const;

export type ClaudePresetId = keyof typeof PRESETS;

export function presetToConfig(
  preset: ClaudePresetId,
  apiKey: string,
  overrides: Partial<ClaudeAdapterConfig> = {},
): ClaudeAdapterConfig {
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
