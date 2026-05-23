// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Today-page data hooks. Sprint 2 M2 C2.4.
//
// Three small useQuery wrappers that surface the only data the
// daemon actually provides for "what happened recently":
//   - useRecentAuditEvents: last N audit-chain events for the project
//   - useConversationTotal:  total conversation count (returned: 0)
//   - useFactTotal:          total fact count (returned: 0)
//
// We do NOT compute or fabricate derived metrics ("conversations this
// week", "facts at T+1", etc.) — only the raw totals + the audit
// timeline. Anything the API does not return is hidden, not faked.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import {
  type ListAuditEventsResult,
  type ListConversationsResult,
  type ListFactsResult,
  auditKeys,
  conversationsKeys,
  factsKeys,
  listAuditEvents,
  listConversations,
  listFacts,
} from '../api/index.js';

const RECENT_LIMIT = 10;

export function useRecentAuditEvents(
  projectId: string | undefined,
  limit: number = RECENT_LIMIT,
): UseQueryResult<ListAuditEventsResult, Error> {
  return useQuery<ListAuditEventsResult, Error>({
    queryKey: projectId
      ? auditKeys.list(projectId, { limit })
      : auditKeys.list('__none__', { limit }),
    queryFn: () => listAuditEvents(projectId as string, { limit }),
    enabled: projectId !== undefined,
  });
}

export function useConversationTotal(
  projectId: string | undefined,
): UseQueryResult<ListConversationsResult, Error> {
  return useQuery<ListConversationsResult, Error>({
    queryKey: projectId
      ? conversationsKeys.list(projectId, { limit: 1 })
      : conversationsKeys.list('__none__', { limit: 1 }),
    queryFn: () => listConversations(projectId as string, { limit: 1 }),
    enabled: projectId !== undefined,
  });
}

export function useFactTotal(
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
