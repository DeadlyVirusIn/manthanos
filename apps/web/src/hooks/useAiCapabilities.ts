// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useAiCapabilities — Sprint 3B.6.5.
//
// Fetches the daemon's AI capability gate. The underlying client
// degrades a malformed/unreachable response to all-false capabilities,
// so callers can treat `data?.ai_extraction_available` as the single
// gate for the "Suggest facts" affordance and never crash when the
// daemon is old or offline.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { type AiCapabilities, aiKeys, getAiCapabilities } from '../api/index.js';

export function useAiCapabilities(): UseQueryResult<AiCapabilities, Error> {
  return useQuery<AiCapabilities, Error>({
    queryKey: aiKeys.capabilities(),
    queryFn: () => getAiCapabilities(),
  });
}
