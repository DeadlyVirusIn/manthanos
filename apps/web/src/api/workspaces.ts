// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace API endpoints + TanStack Query key factory.
// Sprint 2 M1 C1.7.

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import type { WorkspaceStatus, WorkspaceView } from './types.js';

// ─────────────────────────────────────────────────────────────────
// Query keys (TanStack Query M2+ consumes these)
// ─────────────────────────────────────────────────────────────────

export const workspacesKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspacesKeys.all, 'list'] as const,
  list: () => workspacesKeys.lists(),
  details: () => [...workspacesKeys.all, 'detail'] as const,
  detail: (id: string) => [...workspacesKeys.details(), id] as const,
} as const;

// ─────────────────────────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────────────────────────

export interface CreateWorkspaceInput {
  readonly name?: string;
  readonly status_reason?: string;
}

export interface UpdateWorkspaceInput {
  readonly name?: string;
  readonly status?: WorkspaceStatus;
  readonly status_reason?: string;
}

// ─────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────────

export async function listWorkspaces(
  client: ApiClient = defaultApiClient,
): Promise<readonly WorkspaceView[]> {
  const result = await client.get<{ workspaces: readonly WorkspaceView[] }>('/api/v1/workspaces');
  return result.workspaces;
}

export async function getWorkspace(
  workspaceId: string,
  client: ApiClient = defaultApiClient,
): Promise<WorkspaceView> {
  return client.get<WorkspaceView>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`);
}

export async function createWorkspace(
  input: CreateWorkspaceInput,
  client: ApiClient = defaultApiClient,
): Promise<WorkspaceView> {
  return client.post<WorkspaceView>('/api/v1/workspaces', input);
}

export async function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
  client: ApiClient = defaultApiClient,
): Promise<WorkspaceView> {
  return client.patch<WorkspaceView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`,
    input,
  );
}
