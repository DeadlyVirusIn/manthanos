// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useDemoteFact — Sprint 2 M2.5 C25.3.
//
// Lowers a fact's trust tier. Mirrors usePromoteFact in shape;
// invalidation list per kickoff §6.1 is identical to promote.

import {
  type TransitionInput,
  type TransitionResponse,
  auditKeys,
  demoteFact,
  factsKeys,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useDemoteFact(
  workspaceId: string | undefined,
  factId: string | undefined,
): MutationStatus<TransitionInput, TransitionResponse> {
  return useMutationStatus<TransitionInput, TransitionResponse>({
    mutationFn: (input) => {
      if (workspaceId === undefined || factId === undefined) {
        throw new Error('Cannot demote without project + fact ids.');
      }
      return demoteFact(workspaceId, factId, input);
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
    successMessage: 'Trust lowered.',
  });
}
