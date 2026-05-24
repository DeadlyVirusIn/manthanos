// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact-detail data hooks. Sprint 2 M2 C2.6.
//
// Three useQuery wrappers keyed on (workspaceId, factId):
//   - useFact:           the FactView itself
//   - useFactHistory:    version chain (FactHistoryResult)
//   - useFactProvenance: per-source provenance (ListProvenanceResult)
//
// Each stays disabled when either id is undefined, so callers can
// branch on enabled semantics rather than checking ids themselves.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import {
  type FactHistoryResult,
  type FactView,
  type ListProvenanceResult,
  factsKeys,
  getFact,
  getFactHistory,
  getFactProvenance,
} from '../api/index.js';

export function useFact(
  workspaceId: string | undefined,
  factId: string | undefined,
): UseQueryResult<FactView, Error> {
  const ready = workspaceId !== undefined && factId !== undefined;
  return useQuery<FactView, Error>({
    queryKey: ready
      ? factsKeys.detail(workspaceId, factId)
      : factsKeys.detail('__none__', '__none__'),
    queryFn: () => getFact(workspaceId as string, factId as string),
    enabled: ready,
  });
}

export function useFactHistory(
  workspaceId: string | undefined,
  factId: string | undefined,
): UseQueryResult<FactHistoryResult, Error> {
  const ready = workspaceId !== undefined && factId !== undefined;
  return useQuery<FactHistoryResult, Error>({
    queryKey: ready
      ? factsKeys.history(workspaceId, factId)
      : factsKeys.history('__none__', '__none__'),
    queryFn: () => getFactHistory(workspaceId as string, factId as string),
    enabled: ready,
  });
}

export function useFactProvenance(
  workspaceId: string | undefined,
  factId: string | undefined,
): UseQueryResult<ListProvenanceResult, Error> {
  const ready = workspaceId !== undefined && factId !== undefined;
  return useQuery<ListProvenanceResult, Error>({
    queryKey: ready
      ? factsKeys.provenance(workspaceId, factId)
      : factsKeys.provenance('__none__', '__none__'),
    queryFn: () => getFactProvenance(workspaceId as string, factId as string),
    enabled: ready,
  });
}
