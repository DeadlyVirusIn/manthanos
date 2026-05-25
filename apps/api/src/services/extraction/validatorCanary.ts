// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8E — canary allow-list + PII-free telemetry.
//
// Two small, pure pieces for the opt-in canary:
//   1. an allow-list so the live validator runs ONLY for explicitly listed
//      workspaces (empty list ⇒ nobody — extra safety on top of the flag);
//   2. a telemetry record builder that captures the outcome WITHOUT any PII
//      (candidate identity is hashed; no quote text / prompt / raw output).

import { createHash } from 'node:crypto';
import type { ValidatorFallbackReason } from './validatorRunner.js';

/** Parse the comma-separated canary workspace allow-list from env. */
export function parseCanaryWorkspaces(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.MANTHANOS_VALIDATOR_CANARY_WORKSPACES?.trim();
  if (raw === undefined || raw === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A workspace is in the canary ONLY when explicitly allow-listed. An empty
 *  list allows nobody — the live validator stays off even if the flag and a
 *  provider are configured. */
export function isWorkspaceAllowedForCanary(
  workspaceId: string,
  allowList: readonly string[],
): boolean {
  return allowList.includes(workspaceId);
}

/** Telemetry for one validation attempt. No PII: candidate identity is a
 *  hash; conversation text / prompt / raw output are NEVER recorded. */
export interface ValidatorTelemetryRecord {
  readonly request_id: string;
  /** SHA-256 of (workspace + area + statement); never the plaintext. */
  readonly candidate_key_hash: string;
  readonly model: string | null;
  readonly cache_hit: boolean;
  readonly validated: boolean;
  /** Why the deterministic candidate was kept; null when validated (amendment). */
  readonly fallback_reason: ValidatorFallbackReason | null;
  readonly latency_ms: number;
  readonly retry_count: number;
}

export interface BuildTelemetryInput {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly area: string;
  readonly statement: string;
  readonly model: string | null;
  readonly cacheHit: boolean;
  readonly validated: boolean;
  readonly fallbackReason?: ValidatorFallbackReason;
  readonly latencyMs: number;
  readonly retryCount: number;
}

export function buildValidatorTelemetry(input: BuildTelemetryInput): ValidatorTelemetryRecord {
  const candidateKeyHash = createHash('sha256')
    .update([input.workspaceId, input.area, input.statement].join(' '))
    .digest('hex');
  return {
    request_id: input.requestId,
    candidate_key_hash: candidateKeyHash,
    model: input.model,
    cache_hit: input.cacheHit,
    validated: input.validated,
    fallback_reason: input.validated ? null : (input.fallbackReason ?? null),
    latency_ms: input.latencyMs,
    retry_count: input.retryCount,
  };
}
