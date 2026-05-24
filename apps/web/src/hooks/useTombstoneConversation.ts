// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useTombstoneConversation — Sprint 2 M2.5 C25.5.
//
// Erases a conversation. The act is permanent at the substrate level —
// the row's content is sentinelled and any facts that drew their only
// provenance from this conversation become orphaned. The UI calls this
// "erase" because "tombstone" is substrate vocabulary.
//
// Invalidation per kickoff §6.1:
//   - conversationsKeys.detail(ws, cid)
//     — is_tombstoned flips false → true; tombstoned_at + tombstone_reason populate
//   - conversationsKeys.lists(ws)
//     — default list (include_tombstoned=false) drops this row
//   - conversationsKeys.facts(ws, cid)
//     — facts whose only provenance was this conversation may flip orphan state
//   - factsKeys.lists(ws)
//     — derived fact counts across the workspace can change
//   - auditKeys.lists(ws)
//     — conversation.tombstone event is appended

import {
  type TombstoneConversationInput,
  type TombstoneConversationResponse,
  auditKeys,
  conversationsKeys,
  factsKeys,
  tombstoneConversation,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useTombstoneConversation(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): MutationStatus<TombstoneConversationInput, TombstoneConversationResponse> {
  return useMutationStatus<TombstoneConversationInput, TombstoneConversationResponse>({
    mutationFn: (input) => {
      if (workspaceId === undefined || conversationId === undefined) {
        throw new Error('Cannot tombstone without project + conversation ids.');
      }
      return tombstoneConversation(workspaceId, conversationId, input);
    },
    invalidates: () => {
      if (workspaceId === undefined || conversationId === undefined) return [];
      return [
        conversationsKeys.detail(workspaceId, conversationId),
        conversationsKeys.lists(workspaceId),
        conversationsKeys.facts(workspaceId, conversationId),
        factsKeys.lists(workspaceId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'Conversation erased.',
  });
}
