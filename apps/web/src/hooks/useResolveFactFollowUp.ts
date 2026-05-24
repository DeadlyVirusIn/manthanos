// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useResolveFactFollowUp — Sprint 2 M2.5 C25.3.
//
// Marks a previously-flagged fact as resolved. Wraps uncontestFact;
// the UI-facing rename ("resolve follow-up") is the journey-review
// §5.7 vocabulary decision.
//
// Invalidation per kickoff §6.1: identical to mark-for-follow-up.

import {
  type FactView,
  type UncontestFactInput,
  auditKeys,
  factsKeys,
  uncontestFact,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export interface ResolveFactFollowUpInput {
  readonly resolution: string;
}

export function useResolveFactFollowUp(
  workspaceId: string | undefined,
  factId: string | undefined,
): MutationStatus<ResolveFactFollowUpInput, { fact: FactView }> {
  return useMutationStatus<ResolveFactFollowUpInput, { fact: FactView }>({
    mutationFn: (input) => {
      if (workspaceId === undefined || factId === undefined) {
        throw new Error('Cannot resolve follow-up without project + fact ids.');
      }
      const apiInput: UncontestFactInput = { resolution: input.resolution };
      return uncontestFact(workspaceId, factId, apiInput);
    },
    invalidates: () => {
      if (workspaceId === undefined || factId === undefined) return [];
      return [
        factsKeys.detail(workspaceId, factId),
        factsKeys.lists(workspaceId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'Follow-up resolved.',
  });
}
