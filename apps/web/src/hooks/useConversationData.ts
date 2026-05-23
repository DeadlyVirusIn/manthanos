// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation-detail data hooks. Sprint 2 M2 C2.5.
//
// Two useQuery wrappers keyed on (workspaceId, conversationId):
//   - useConversation:      the ConversationView (full record + quotes)
//   - useConversationFacts: facts extracted from this conversation
//
// Both stay disabled when either id is undefined, so callers can branch
// on `enabled` semantics rather than checking ids themselves.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import {
  type ConversationFactsResponse,
  type ConversationView,
  conversationsKeys,
  getConversation,
  getConversationFacts,
} from '../api/index.js';

export function useConversation(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): UseQueryResult<ConversationView, Error> {
  const ready = workspaceId !== undefined && conversationId !== undefined;
  return useQuery<ConversationView, Error>({
    queryKey: ready
      ? conversationsKeys.detail(workspaceId, conversationId)
      : conversationsKeys.detail('__none__', '__none__'),
    queryFn: () => getConversation(workspaceId as string, conversationId as string),
    enabled: ready,
  });
}

export function useConversationFacts(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): UseQueryResult<ConversationFactsResponse, Error> {
  const ready = workspaceId !== undefined && conversationId !== undefined;
  return useQuery<ConversationFactsResponse, Error>({
    queryKey: ready
      ? conversationsKeys.facts(workspaceId, conversationId)
      : conversationsKeys.facts('__none__', '__none__'),
    queryFn: () => getConversationFacts(workspaceId as string, conversationId as string),
    enabled: ready,
  });
}
