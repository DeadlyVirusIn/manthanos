// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// usePromoteFact — Sprint 2 M2.5 C25.3.
//
// Raises a fact's trust tier. Composes useMutationStatus with the
// existing promoteFact API call. Invalidation per kickoff §6.1:
//   - factsKeys.detail(workspaceId, factId)
//   - factsKeys.lists(workspaceId)
//   - factsKeys.history(workspaceId, factId)
//   - auditKeys.lists(workspaceId)

import {
  type TransitionInput,
  type TransitionResponse,
  auditKeys,
  factsKeys,
  promoteFact,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function usePromoteFact(
  workspaceId: string | undefined,
  factId: string | undefined,
): MutationStatus<TransitionInput, TransitionResponse> {
  return useMutationStatus<TransitionInput, TransitionResponse>({
    mutationFn: (input) => {
      if (workspaceId === undefined || factId === undefined) {
        throw new Error('Cannot promote without project + fact ids.');
      }
      return promoteFact(workspaceId, factId, input);
    },
    invalidates: () => {
      if (workspaceId === undefined || factId === undefined) return [];
      return [
        factsKeys.detail(workspaceId, factId),
        factsKeys.lists(workspaceId),
        factsKeys.history(workspaceId, factId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'Trust raised.',
  });
}
