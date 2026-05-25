// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8A — single-provider detection (fail-closed).
//
// Resolves whether ONE LLM validator provider is configured, from env/config
// only. No multi-provider selection, no network call, no secret in the
// result. Fail-closed: anything missing/blank ⇒ not configured ⇒ the gate
// stays off ⇒ deterministic-only. Never throws.

export interface ProviderDetection {
  readonly configured: boolean;
  /** Resolved model id (never the secret). Null when not configured. */
  readonly model: string | null;
}

/** Stable "not configured" result — the safe default everywhere. */
export const PROVIDER_NOT_CONFIGURED: ProviderDetection = { configured: false, model: null };

/**
 * Detect the single validator provider from env. Configured ONLY when both
 * a non-blank API key AND a model id are present. The key itself is never
 * returned or logged — only `configured` + the model id.
 */
export function detectProvider(env: NodeJS.ProcessEnv = process.env): ProviderDetection {
  const key = env.MANTHANOS_VALIDATOR_API_KEY?.trim();
  const model = env.MANTHANOS_VALIDATOR_MODEL?.trim();
  if (key === undefined || key === '' || model === undefined || model === '') {
    return PROVIDER_NOT_CONFIGURED;
  }
  return { configured: true, model };
}
