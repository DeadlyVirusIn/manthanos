// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact API endpoints + TanStack Query key factory.
// Sprint 2 M1 C1.7.

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import type {
  FactHistoryResult,
  FactTier,
  FactView,
  ListAreasResult,
  ListFactsResult,
  ListProvenanceResult,
} from './types.js';

// ─────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────

export const factsKeys = {
  all: ['facts'] as const,
  lists: (workspaceId: string) => [...factsKeys.all, 'list', workspaceId] as const,
  list: (workspaceId: string, opts: ListFactsParams = {}) =>
    [...factsKeys.lists(workspaceId), opts] as const,
  details: (workspaceId: string) => [...factsKeys.all, 'detail', workspaceId] as const,
  detail: (workspaceId: string, factId: string) =>
    [...factsKeys.details(workspaceId), factId] as const,
  history: (workspaceId: string, factId: string) =>
    [...factsKeys.detail(workspaceId, factId), 'history'] as const,
  provenance: (workspaceId: string, factId: string) =>
    [...factsKeys.detail(workspaceId, factId), 'provenance'] as const,
  areas: (workspaceId: string, limit?: number) =>
    [...factsKeys.all, 'areas', workspaceId, limit ?? null] as const,
} as const;

// ─────────────────────────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────────────────────────

export interface ListFactsParams {
  readonly tier?: FactTier;
  readonly area?: string;
  readonly include_tombstoned?: boolean;
  readonly include_superseded?: boolean;
  readonly exclude_contested?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateFactInput {
  readonly area: string;
  readonly statement: string;
  readonly tier?: FactTier;
}

export interface UpdateFactInput {
  readonly area?: string;
  readonly statement?: string;
}

export interface TransitionInput {
  readonly target_tier?: FactTier;
  readonly note?: string;
  readonly reason?: string;
}

export interface ReviseFactInput {
  readonly area?: string;
  readonly statement?: string;
  readonly note?: string;
}

export interface ContestFactInput {
  readonly reason: string;
}

export interface UncontestFactInput {
  readonly resolution: string;
}

export interface TombstoneFactInput {
  readonly reason: string;
  readonly allow_superseded?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Response shapes specific to mutation endpoints
// ─────────────────────────────────────────────────────────────────

export interface TransitionResponse {
  readonly fact: FactView;
  readonly from_tier: FactTier;
  readonly to_tier: FactTier;
}

export interface ReviseFactResponse {
  readonly fact: FactView;
  readonly previous_fact_id: string;
  readonly version_chain_root_id: string;
}

// ─────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────────

function buildQuery(params: ListFactsParams): string {
  const entries: Array<[string, string]> = [];
  if (params.tier !== undefined) entries.push(['tier', params.tier]);
  if (params.area !== undefined) entries.push(['area', params.area]);
  if (params.include_tombstoned === true) entries.push(['include_tombstoned', 'true']);
  if (params.include_superseded === true) entries.push(['include_superseded', 'true']);
  if (params.exclude_contested === true) entries.push(['exclude_contested', 'true']);
  if (params.limit !== undefined) entries.push(['limit', String(params.limit)]);
  if (params.offset !== undefined) entries.push(['offset', String(params.offset)]);
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export async function listFacts(
  workspaceId: string,
  params: ListFactsParams = {},
  client: ApiClient = defaultApiClient,
): Promise<ListFactsResult> {
  return client.get<ListFactsResult>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts${buildQuery(params)}`,
  );
}

export async function getFact(
  workspaceId: string,
  factId: string,
  client: ApiClient = defaultApiClient,
): Promise<FactView> {
  return client.get<FactView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}`,
  );
}

export async function createFact(
  workspaceId: string,
  input: CreateFactInput,
  client: ApiClient = defaultApiClient,
): Promise<FactView> {
  return client.post<FactView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts`,
    input,
  );
}

export async function updateFact(
  workspaceId: string,
  factId: string,
  input: UpdateFactInput,
  client: ApiClient = defaultApiClient,
): Promise<FactView> {
  return client.patch<FactView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}`,
    input,
  );
}

export async function promoteFact(
  workspaceId: string,
  factId: string,
  input: TransitionInput = {},
  client: ApiClient = defaultApiClient,
): Promise<TransitionResponse> {
  return client.post<TransitionResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/promote`,
    input,
  );
}

export async function demoteFact(
  workspaceId: string,
  factId: string,
  input: TransitionInput = {},
  client: ApiClient = defaultApiClient,
): Promise<TransitionResponse> {
  return client.post<TransitionResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/demote`,
    input,
  );
}

export async function reviseFact(
  workspaceId: string,
  factId: string,
  input: ReviseFactInput,
  client: ApiClient = defaultApiClient,
): Promise<ReviseFactResponse> {
  return client.post<ReviseFactResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/revise`,
    input,
  );
}

export async function contestFact(
  workspaceId: string,
  factId: string,
  input: ContestFactInput,
  client: ApiClient = defaultApiClient,
): Promise<{ fact: FactView }> {
  return client.post<{ fact: FactView }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/contest`,
    input,
  );
}

export async function uncontestFact(
  workspaceId: string,
  factId: string,
  input: UncontestFactInput,
  client: ApiClient = defaultApiClient,
): Promise<{ fact: FactView }> {
  return client.post<{ fact: FactView }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/uncontest`,
    input,
  );
}

export async function tombstoneFact(
  workspaceId: string,
  factId: string,
  input: TombstoneFactInput,
  client: ApiClient = defaultApiClient,
): Promise<{ fact: FactView }> {
  return client.post<{ fact: FactView }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/tombstone`,
    input,
  );
}

export async function getFactHistory(
  workspaceId: string,
  factId: string,
  client: ApiClient = defaultApiClient,
): Promise<FactHistoryResult> {
  return client.get<FactHistoryResult>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/history`,
  );
}

export async function getFactProvenance(
  workspaceId: string,
  factId: string,
  client: ApiClient = defaultApiClient,
): Promise<ListProvenanceResult> {
  return client.get<ListProvenanceResult>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/${encodeURIComponent(factId)}/provenance`,
  );
}

export async function listFactAreas(
  workspaceId: string,
  limit?: number,
  client: ApiClient = defaultApiClient,
): Promise<ListAreasResult> {
  const query = limit === undefined ? '' : `?limit=${encodeURIComponent(String(limit))}`;
  return client.get<ListAreasResult>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/facts/areas${query}`,
  );
}
