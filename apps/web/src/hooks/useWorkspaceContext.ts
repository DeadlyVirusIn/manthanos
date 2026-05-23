// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useWorkspaceContext — Sprint 2 M2 C2.1.
//
// The nested route /projects/:projectId/... means every page under the
// project shell needs the projectId param AND the workspace record.
// Rather than every page re-implementing the useParams + useQuery
// dance, this hook centralises:
//   - projectId extraction from useParams<{ projectId: string }>()
//   - lookup of the workspace via getWorkspace + workspacesKeys.detail
//   - the "no projectId in URL" shape (the picker route `/` mounts
//     pages with no projectId — callers can branch on that explicitly)
//
// Callers decide how to render loading / error / empty states; this
// hook does not assume a particular UI.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { type WorkspaceView, getWorkspace, workspacesKeys } from '../api/index.js';

export interface UseWorkspaceContextResult {
  // The :projectId segment from the URL, or undefined if the current
  // route has no projectId (e.g. the picker `/`).
  readonly projectId: string | undefined;
  // TanStack Query result for the workspace lookup. `enabled` is false
  // when projectId is undefined, so callers should branch on projectId
  // first to distinguish "no project picked" from "loading from API".
  readonly query: UseQueryResult<WorkspaceView, Error>;
}

export function useWorkspaceContext(): UseWorkspaceContextResult {
  const { projectId } = useParams<{ projectId: string }>();
  const query = useQuery<WorkspaceView, Error>({
    queryKey: projectId ? workspacesKeys.detail(projectId) : workspacesKeys.detail('__none__'),
    queryFn: () => getWorkspace(projectId as string),
    enabled: projectId !== undefined,
  });
  return { projectId, query };
}
