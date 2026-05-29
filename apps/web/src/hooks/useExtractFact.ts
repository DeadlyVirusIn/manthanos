// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useExtractFact — Sprint 2 M2.5 C25.2.
//
// Mutation hook for Conversation Detail's "Pull a fact from this
// conversation" flow. Composes useMutationStatus with
// extractFactFromConversation.
//
// Invalidation list per the M2.5 kickoff §6.1:
//   - factsKeys.lists(workspaceId) — new fact appears in totals and
//     in any tier / area-filtered list; covers all derived counts
//     on Today + Validation by prefix invalidation.
//   - ['facts', 'areas', workspaceId] — a new area may appear; the
//     prefix covers both the limit-bounded and limitless variants.
//   - conversationsKeys.detail(workspaceId, conversationId) —
//     extraction_status may flip 'pending' → 'extracted', and
//     last_extracted_at gets a value.
//   - conversationsKeys.facts(workspaceId, conversationId) — the
//     new fact lands on this list.
//   - auditKeys.lists(workspaceId) — fact.create event is appended.

import {
  type ExtractFactInput,
  type ExtractFactResponse,
  auditKeys,
  conversationsKeys,
  extractFactFromConversation,
  factsKeys,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useExtractFact(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): MutationStatus<ExtractFactInput, ExtractFactResponse> {
  return useMutationStatus<ExtractFactInput, ExtractFactResponse>({
    mutationFn: (input) => {
      if (workspaceId === undefined || conversationId === undefined) {
        throw new Error('Cannot extract a fact without project + conversation ids.');
      }
      return extractFactFromConversation(workspaceId, conversationId, input);
    },
    invalidates: () => {
      if (workspaceId === undefined || conversationId === undefined) return [];
      return [
        factsKeys.lists(workspaceId),
        // 'facts.areas' prefix — covers every (workspaceId, limit) variant.
        ['facts', 'areas', workspaceId] as const,
        conversationsKeys.detail(workspaceId, conversationId),
        conversationsKeys.facts(workspaceId, conversationId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: (result) =>
      result.was_created ? 'Finding added.' : 'Linked to an existing finding.',
  });
}
