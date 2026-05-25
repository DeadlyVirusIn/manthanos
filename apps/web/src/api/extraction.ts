// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// AI-assisted extraction API client (Sprint 3B.5) — read-only suggestions.
// Parse, don't cast: the response runs through parseSuggestExtractionsResponse
// and degrades to an empty candidate list on drift (never throws into UI).

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import { parseSuggestExtractionsResponse } from './schema.js';
import type { SuggestExtractionsResult } from './types.js';

// ─────────────────────────────────────────────────────────────────
// Query keys (TanStack Query — consumed by the review UI in 3B.6)
// ─────────────────────────────────────────────────────────────────
export const extractionKeys = {
  all: ['extraction'] as const,
  suggestions: (workspaceId: string, conversationId: string) =>
    [...extractionKeys.all, 'suggestions', workspaceId, conversationId] as const,
} as const;

/**
 * Fetch deterministic extraction-candidate suggestions for a conversation.
 * Read-only; creates nothing. Returns `{ candidates: [] }` on a malformed
 * or unreachable response.
 */
export async function suggestExtractions(
  workspaceId: string,
  conversationId: string,
  client: ApiClient = defaultApiClient,
): Promise<SuggestExtractionsResult> {
  const raw = await client.post<unknown>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(
      conversationId,
    )}/suggest-extractions`,
  );
  return parseSuggestExtractionsResponse(raw);
}
