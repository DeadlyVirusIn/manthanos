// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — AI capability gate (deterministic, no LLM).
//
// A pure function computing what AI affordances the daemon currently
// offers, from feature flags only. In deterministic Sprint 3B there is
// NO LLM provider: `provider_configured` is hard `false` and `model` is
// `null`, so the LLM-validator flag has no effect yet (it additionally
// requires a provider). 3B.7 will replace the hard-false provider check
// with real provider detection. This file performs NO network call, NO
// LLM call, and reads NO secrets — it only reflects config flags.

export interface AiCapabilities {
  /** Whether the deterministic "Suggest facts" affordance is available
   *  (the endpoint is always wired; this reflects the opt-in flag). */
  readonly ai_extraction_available: boolean;
  /** Whether an LLM provider is configured. Always false in 3B. */
  readonly provider_configured: boolean;
  /** Effective LLM-validator state (flag AND provider). False in 3B. */
  readonly llm_validator_enabled: boolean;
  /** Configured model id, or null when no provider. Null in 3B. */
  readonly model: string | null;
}

export interface AiCapabilityFlags {
  readonly extractionAssistEnabled?: boolean;
  readonly llmValidatorEnabled?: boolean;
}

export function computeAiCapabilities(flags: AiCapabilityFlags): AiCapabilities {
  // No provider exists in deterministic 3B. Hard false here is the single
  // chokepoint a future phase flips on once real provider detection lands.
  const providerConfigured = false;
  const aiExtractionAvailable = flags.extractionAssistEnabled === true;
  // The LLM validator requires BOTH its flag and a configured provider.
  const llmValidatorEnabled = providerConfigured && flags.llmValidatorEnabled === true;
  return {
    ai_extraction_available: aiExtractionAvailable,
    provider_configured: providerConfigured,
    llm_validator_enabled: llmValidatorEnabled,
    model: null,
  };
}
