// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Presets for the CLI adapter. Cost numbers are subscription-equivalent
// (Claude Code reports total_cost_usd per call regardless of how the user
// is billed). These are informational and roughly track Anthropic API rates.

import type { ClaudeCliAdapterConfig } from './adapter.js';

export const CLI_PRESETS = {
  sonnet: {
    model: 'sonnet',
    displayName: 'Claude Sonnet (via Claude Code CLI)',
    cost: {
      // Subscription-equivalent rates (informational only; CLI returns
      // total_cost_usd per call which we use as the authoritative number).
      inputUsdMicroPer1k: 3_000,
      outputUsdMicroPer1k: 15_000,
    },
    capabilities: {
      contextTokens: 1_000_000,
      maxOutputTokens: 64_000,
      toolUse: true,
      vision: true,
      streaming: false, // CLI is one-shot for --print
      fileAccess: 'none' as const,
      reasoningStrength: 4 as const,
      implementationStrength: 5 as const,
      webBrowsing: false,
      structuredOutput: true,
    },
    latencyClass: 'medium' as const,
    recommendedFor: ['implementation', 'review', 'summarization'] as const,
  },
  opus: {
    model: 'opus',
    displayName: 'Claude Opus (via Claude Code CLI)',
    cost: {
      inputUsdMicroPer1k: 15_000,
      outputUsdMicroPer1k: 75_000,
    },
    capabilities: {
      contextTokens: 1_000_000,
      maxOutputTokens: 64_000,
      toolUse: true,
      vision: true,
      streaming: false,
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
} as const;

export type ClaudeCliPresetId = keyof typeof CLI_PRESETS;

export function presetToConfig(
  preset: ClaudeCliPresetId,
  overrides: Partial<ClaudeCliAdapterConfig> = {},
): ClaudeCliAdapterConfig {
  const p = CLI_PRESETS[preset];
  return {
    model: p.model,
    displayName: p.displayName,
    cost: p.cost,
    capabilities: p.capabilities,
    latencyClass: p.latencyClass,
    recommendedFor: [...p.recommendedFor],
    ...overrides,
  };
}
