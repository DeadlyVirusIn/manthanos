// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useProjects — Sprint 2 M2 C2.2.
//
// React Query hook wrapping listWorkspaces() for the Project Picker
// page. Naming notes:
//   - The hook is called `useProjects` because that is the user-facing
//     vocabulary. The wire format and the queryKey both keep substrate
//     terms ("workspaces") for stable cache keys and URL stability.
//   - The return value is typed as readonly WorkspaceView[] for the
//     same reason — callers do their own substrate→UI rename per the
//     translation map (C1.8).

import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { type WorkspaceView, listWorkspaces, workspacesKeys } from '../api/index.js';

export function useProjects(): UseQueryResult<readonly WorkspaceView[], Error> {
  return useQuery<readonly WorkspaceView[], Error>({
    queryKey: workspacesKeys.list(),
    queryFn: () => listWorkspaces(),
  });
}
