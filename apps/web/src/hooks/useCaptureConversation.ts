// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useCaptureConversation — Sprint 2 M2.5 C25.1.
//
// Mutation hook for the Today page's Capture Conversation flow.
// Composes useMutationStatus with the existing createConversation
// API call. Invalidation list per the M2.5 kickoff §6.1:
//
//   - conversationsKeys.lists(workspaceId) — refresh totals + the
//     pending list on Today and the Validation pending review.
//   - auditKeys.lists(workspaceId) — the new conversation.create
//     audit event needs to appear in Today's activity timeline.
//   - workspacesKeys.detail(workspaceId) — audit_chain_seq_high
//     bumps; workspace-home's "empty" → "populated" flip relies on it.

import {
  type ConversationView,
  type CreateConversationInput,
  auditKeys,
  conversationsKeys,
  createConversation,
  workspacesKeys,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useCaptureConversation(
  workspaceId: string | undefined,
): MutationStatus<CreateConversationInput, ConversationView> {
  return useMutationStatus<CreateConversationInput, ConversationView>({
    mutationFn: (input) => {
      if (workspaceId === undefined) {
        throw new Error('Cannot capture a conversation without a project id.');
      }
      return createConversation(workspaceId, input);
    },
    invalidates: () => {
      if (workspaceId === undefined) return [];
      return [
        conversationsKeys.lists(workspaceId),
        auditKeys.lists(workspaceId),
        workspacesKeys.detail(workspaceId),
      ];
    },
    successMessage: 'Conversation captured.',
  });
}
