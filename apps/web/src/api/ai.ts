// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// AI capability gate client (Sprint 3B.6.5) — read-only.
//
// Wraps GET /api/v1/ai/capabilities. Parse-don't-cast: the response runs
// through parseAiCapabilities and degrades to all-false on drift or an
// unreachable daemon, so the UI hides AI affordances rather than
// crashing or over-promising.

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import { parseAiCapabilities } from './schema.js';
import type { AiCapabilities } from './types.js';

export const aiKeys = {
  all: ['ai'] as const,
  capabilities: () => [...aiKeys.all, 'capabilities'] as const,
} as const;

export async function getAiCapabilities(
  client: ApiClient = defaultApiClient,
): Promise<AiCapabilities> {
  const raw = await client.get<unknown>('/api/v1/ai/capabilities');
  return parseAiCapabilities(raw);
}
