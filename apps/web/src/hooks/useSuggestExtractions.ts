// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useSuggestExtractions — Sprint 3B.6.
//
// On-demand read-only query wrapping suggestExtractions. The candidate
// suggestions are computed by the daemon every call and are never
// persisted, so the query stays DISABLED until the user explicitly asks
// for them (the "Suggest facts" button flips `enabled` to true). Once
// fetched it behaves like any other cached query — re-opening the panel
// reuses the cached candidates rather than recomputing.
//
// The underlying client already degrades a malformed/unreachable
// response to `{ candidates: [] }` (parse-don't-cast), so this hook's
// data is always a well-formed SuggestExtractionsResult.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { type SuggestExtractionsResult, extractionKeys, suggestExtractions } from '../api/index.js';

export function useSuggestExtractions(
  workspaceId: string | undefined,
  conversationId: string | undefined,
  enabled: boolean,
): UseQueryResult<SuggestExtractionsResult, Error> {
  const ready = enabled && workspaceId !== undefined && conversationId !== undefined;
  return useQuery<SuggestExtractionsResult, Error>({
    queryKey: ready
      ? extractionKeys.suggestions(workspaceId, conversationId)
      : extractionKeys.suggestions('__none__', '__none__'),
    queryFn: () => suggestExtractions(workspaceId as string, conversationId as string),
    enabled: ready,
  });
}
