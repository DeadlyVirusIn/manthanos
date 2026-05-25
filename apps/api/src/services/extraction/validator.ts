// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.7C — LLM validator interface + JSON-only output contract.
//
// The validator is an OPTIONAL hook that may (later, flag-on, with a
// provider) re-score a deterministic candidate. In 3B.7 there is NO live
// client — this module ships the interface, the output schema, and a
// parse-don't-cast parser. The model can ONLY:
//   • abstain, or
//   • return an adjusted confidence_score and/or reason_flags.
// It may NOT change the statement/area, set model_used/tier, or assert
// approval. Any such fields in the model output are DROPPED here, never
// trusted (threat model §4–§5). Malformed/non-JSON → null → caller keeps
// the deterministic candidate.

import { type ConfidenceReasonFlag, clampConfidence, parseReasonFlags } from './confidence.js';

/**
 * The live model transport. NO implementation ships in 3B.7 — the runner is
 * gated off (no provider) so this is never invoked in production. Tests
 * inject fakes (malicious output, malformed JSON, timeouts). `validate`
 * returns the model's RAW string output (JSON expected); it may reject or
 * hang (the runner enforces a timeout).
 */
export interface ValidatorClient {
  validate(prompt: string, signal?: AbortSignal): Promise<string>;
}

/**
 * The ONLY shape we accept from the model. Deliberately minimal: abstain,
 * or an adjusted score + reason flags. No statement, no tier, no model_used,
 * no approval — those are stamped/owned by ManthanOS, never the model.
 */
export interface ValidatorVerdict {
  readonly abstain: boolean;
  /** Adjusted extraction-confidence (0..1), already clamped. Absent = leave as-is. */
  readonly confidence_score?: number;
  /** Adjusted reason flags (drop-unknown filtered). Absent = leave as-is. */
  readonly reason_flags?: ConfidenceReasonFlag[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse a raw model response into a ValidatorVerdict. Parse-don't-cast:
 *   • non-JSON / parse error → null
 *   • non-object JSON (array, number, string, null) → null
 *   • abstain === true → { abstain: true } (all other fields ignored)
 *   • otherwise → { abstain: false, confidence_score?, reason_flags? } with
 *     the score clamped to [0,1] and unknown reason flags dropped; EVERY
 *     other field (model_used, tier, statement, human_approved, …) ignored.
 * Returns null so the caller falls back to the deterministic candidate.
 */
export function parseValidatorResponse(raw: string): ValidatorVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  if (parsed.abstain === true) {
    return { abstain: true };
  }

  const verdict: {
    abstain: boolean;
    confidence_score?: number;
    reason_flags?: ConfidenceReasonFlag[];
  } = { abstain: false };
  if (typeof parsed.confidence_score === 'number' && Number.isFinite(parsed.confidence_score)) {
    verdict.confidence_score = clampConfidence(parsed.confidence_score);
  }
  if (parsed.reason_flags !== undefined) {
    verdict.reason_flags = parseReasonFlags(parsed.reason_flags);
  }
  return verdict;
}
