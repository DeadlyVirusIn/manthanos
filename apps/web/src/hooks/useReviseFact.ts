// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useReviseFact — Sprint 2 M2.5 C25.6.
//
// Creates a successor version of a fact. The successor has a new id;
// the predecessor remains in the version chain as the "older version"
// state. The UI calls this "Make a new version" because "revise" is
// substrate vocabulary.
//
// Invalidation per kickoff §6.1:
//   - factsKeys.detail(ws, factId)
//     — predecessor's head pointer flips; successor lands as a new entry
//   - factsKeys.history(ws, factId)
//     — version chain gains an entry
//   - factsKeys.lists(ws)
//     — workspace lists may reorder; new head fact appears
//   - factsKeys.areas(ws)
//     — area set may change if the area string was edited
//   - auditKeys.lists(ws)
//     — fact.revise event is appended

import { useQueryClient } from '@tanstack/react-query';

import {
  type ReviseFactInput,
  type ReviseFactResponse,
  auditKeys,
  factsKeys,
  reviseFact,
} from '../api/index.js';
import { type MutationStatus, useMutationStatus } from './useMutationStatus.js';

export function useReviseFact(
  workspaceId: string | undefined,
  factId: string | undefined,
): MutationStatus<ReviseFactInput, ReviseFactResponse> {
  const client = useQueryClient();
  return useMutationStatus<ReviseFactInput, ReviseFactResponse>({
    mutationFn: async (input) => {
      if (workspaceId === undefined || factId === undefined) {
        throw new Error('Cannot revise without project + fact ids.');
      }
      const result = await reviseFact(workspaceId, factId, input);
      // P0 fix (post-M2.5 review): pre-seed the new fact's detail cache
      // so the post-success navigation lands on a populated page instead
      // of a loading skeleton. We seed here — inside the resolved
      // mutationFn — so the cache is populated before useMutation's
      // onSuccess fires invalidation on the predecessor's keys.
      if (result.fact.id !== factId) {
        client.setQueryData(factsKeys.detail(workspaceId, result.fact.id), result.fact);
      }
      return result;
    },
    invalidates: () => {
      if (workspaceId === undefined || factId === undefined) return [];
      return [
        factsKeys.detail(workspaceId, factId),
        factsKeys.history(workspaceId, factId),
        factsKeys.lists(workspaceId),
        factsKeys.areas(workspaceId),
        auditKeys.lists(workspaceId),
      ];
    },
    successMessage: 'New version saved.',
  });
}
