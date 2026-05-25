// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useMarkFactForFollowUp — Sprint 2 M2.5 C25.3.
//
// Flags a fact for later follow-up. Wraps the substrate's contestFact
// API call — the UI-facing rename to "follow-up" is the journey-review
// §5.7 vocabulary decision, applied here at the hook layer so the
// substrate API stays unchanged.
//
// Invalidation per kickoff §6.1:
//   - factsKeys.detail(workspaceId, factId)
//   - factsKeys.lists(workspaceId)
//   - auditKeys.lists(workspaceId)

import {
  type ContestFactInput,
  type FactView,
  auditKeys,
  contestFact,
  factsKeys,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export interface MarkFactForFollowUpInput {
  readonly reason: string;
}

export function useMarkFactForFollowUp(
  workspaceId: string | undefined,
  factId: string | undefined,
): MutationStatus<MarkFactForFollowUpInput, { fact: FactView }> {
  return useMutationStatus<MarkFactForFollowUpInput, { fact: FactView }>({
    mutationFn: (input) => {
      if (workspaceId === undefined || factId === undefined) {
        throw new Error('Cannot mark for follow-up without project + fact ids.');
      }
      const apiInput: ContestFactInput = { reason: input.reason };
      return contestFact(workspaceId, factId, apiInput);
    },
    invalidates: () => {
      if (workspaceId === undefined || factId === undefined) return [];
      return [
        factsKeys.detail(workspaceId, factId),
        factsKeys.lists(workspaceId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'Flagged to double-check.',
  });
}
