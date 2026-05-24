// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Validation-page data hooks. Sprint 2 M2 C2.7.
//
// All hooks here are thin useQuery wrappers over endpoints the daemon
// already exposes. Nothing here computes a metric the API does not
// return. Where a count is derived (e.g. follow-up count), the
// derivation is documented and reproducible.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import {
  type FactExtractionStatus,
  type FactTier,
  type ListConversationsResult,
  type ListFactsResult,
  conversationsKeys,
  factsKeys,
  listConversations,
  listFacts,
} from '../api/index.js';

// ─────────────────────────────────────────────────────────────────
// Fact count by tier (one query per tier for exact totals)
// ─────────────────────────────────────────────────────────────────

export function useFactCountByTier(
  projectId: string | undefined,
  tier: FactTier,
): UseQueryResult<ListFactsResult, Error> {
  return useQuery<ListFactsResult, Error>({
    queryKey: projectId
      ? factsKeys.list(projectId, { tier, limit: 1 })
      : factsKeys.list('__none__', { tier, limit: 1 }),
    queryFn: () => listFacts(projectId as string, { tier, limit: 1 }),
    enabled: projectId !== undefined,
  });
}

// ─────────────────────────────────────────────────────────────────
// Follow-up count via API math:
//   followUp = listFacts({}).total - listFacts({exclude_contested:true}).total
// Both queries apply the same default filters (head-only, exclude
// tombstoned, exclude superseded), so the difference is exactly the
// count of contested facts in the active surface.
// ─────────────────────────────────────────────────────────────────

export function useFactTotalIncludingContested(
  projectId: string | undefined,
): UseQueryResult<ListFactsResult, Error> {
  return useQuery<ListFactsResult, Error>({
    queryKey: projectId
      ? factsKeys.list(projectId, { limit: 1 })
      : factsKeys.list('__none__', { limit: 1 }),
    queryFn: () => listFacts(projectId as string, { limit: 1 }),
    enabled: projectId !== undefined,
  });
}

export function useFactTotalExcludingContested(
  projectId: string | undefined,
): UseQueryResult<ListFactsResult, Error> {
  return useQuery<ListFactsResult, Error>({
    queryKey: projectId
      ? factsKeys.list(projectId, { limit: 1, exclude_contested: true })
      : factsKeys.list('__none__', { limit: 1, exclude_contested: true }),
    queryFn: () => listFacts(projectId as string, { limit: 1, exclude_contested: true }),
    enabled: projectId !== undefined,
  });
}

// ─────────────────────────────────────────────────────────────────
// Conversations awaiting fact extraction
// ─────────────────────────────────────────────────────────────────

const PENDING_REVIEW_LIMIT = 10;

export function usePendingConversations(
  projectId: string | undefined,
  pending: FactExtractionStatus,
  limit: number = PENDING_REVIEW_LIMIT,
): UseQueryResult<ListConversationsResult, Error> {
  return useQuery<ListConversationsResult, Error>({
    queryKey: projectId
      ? conversationsKeys.list(projectId, { fact_extraction_status: pending, limit })
      : conversationsKeys.list('__none__', { fact_extraction_status: pending, limit }),
    queryFn: () =>
      listConversations(projectId as string, { fact_extraction_status: pending, limit }),
    enabled: projectId !== undefined,
  });
}

// ─────────────────────────────────────────────────────────────────
// Follow-up queue — facts sample, filtered client-side
//
// The daemon has no "only_contested" filter; the queue is built by
// fetching a sample of head/active facts and filtering for
// is_contested === true. Bounded by `limit` — if the API reports
// has_more=true and the count exceeds the sample, the page surfaces
// an honest disclosure rather than hide it.
// ─────────────────────────────────────────────────────────────────

const FOLLOW_UP_SAMPLE_LIMIT = 20;

export function useFollowUpFactSample(
  projectId: string | undefined,
  limit: number = FOLLOW_UP_SAMPLE_LIMIT,
): UseQueryResult<ListFactsResult, Error> {
  return useQuery<ListFactsResult, Error>({
    queryKey: projectId
      ? factsKeys.list(projectId, { limit })
      : factsKeys.list('__none__', { limit }),
    queryFn: () => listFacts(projectId as string, { limit }),
    enabled: projectId !== undefined,
  });
}
