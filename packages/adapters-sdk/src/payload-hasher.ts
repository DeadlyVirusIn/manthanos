// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// AdapterPayloadHasher per ADAPTER_SPEC.md §3.1.
//
// Computes the SDK-version-independent payload hash for audit and replay.
// Adapters provide a canonical projection (CanonicalAgentPayload); this
// helper hashes that projection. The raw provider payload is preserved
// in the blob but never used for hashing.

import { createHash } from 'node:crypto';
import { JsonCanon } from './jsoncanon.js';
import type { AgentResponse, CanonicalAgentPayload } from './types.js';

export interface PayloadHashResult {
  /** sha256 hex of JsonCanon(canonical). */
  payloadHash: string;
  /** The canonical content used. */
  canonical: CanonicalAgentPayload;
}

export function hashCanonicalPayload(canonical: CanonicalAgentPayload): PayloadHashResult {
  const json = JsonCanon.stringify(canonical);
  const hash = createHash('sha256').update(json, 'utf8').digest('hex');
  return { payloadHash: hash, canonical };
}

export function hashAgentResponse(resp: AgentResponse): PayloadHashResult {
  return hashCanonicalPayload(resp.canonical);
}

/** Compute USD-micro cost from token counts and per-1k rates (integer math). */
export function computeUsdMicro(
  inputTokens: number,
  outputTokens: number,
  inputUsdMicroPer1k: number,
  outputUsdMicroPer1k: number,
  perCallUsdMicro = 0,
): number {
  // (tokens * rate) / 1000, integer-rounded.
  // We use Math.round to avoid systematic under-billing.
  const input = Math.round((inputTokens * inputUsdMicroPer1k) / 1000);
  const output = Math.round((outputTokens * outputUsdMicroPer1k) / 1000);
  return input + output + perCallUsdMicro;
}
