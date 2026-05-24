// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useSkipExtraction — Sprint 2 M2.5 C25.4.
//
// Marks a pending conversation as "not useful" — the negative-exit
// from the extraction flow. Composes useMutationStatus with the
// existing skipConversationExtraction API call.
//
// Invalidation per kickoff §6.1:
//   - conversationsKeys.detail(workspaceId, conversationId)
//     — fact_extraction_status flips 'pending' → 'skipped'
//   - conversationsKeys.lists(workspaceId)
//     — pending-status-filtered lists drop this row
//   - auditKeys.lists(workspaceId)
//     — conversation.skip_extraction event is appended

import {
  type SkipExtractionInput,
  type SkipExtractionResponse,
  auditKeys,
  conversationsKeys,
  skipConversationExtraction,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useSkipExtraction(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): MutationStatus<SkipExtractionInput, SkipExtractionResponse> {
  return useMutationStatus<SkipExtractionInput, SkipExtractionResponse>({
    mutationFn: (input) => {
      if (workspaceId === undefined || conversationId === undefined) {
        throw new Error('Cannot skip extraction without project + conversation ids.');
      }
      return skipConversationExtraction(workspaceId, conversationId, input);
    },
    invalidates: () => {
      if (workspaceId === undefined || conversationId === undefined) return [];
      return [
        conversationsKeys.detail(workspaceId, conversationId),
        conversationsKeys.lists(workspaceId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'Marked as not useful.',
  });
}
