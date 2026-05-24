// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Audit-chain API endpoints + TanStack Query key factory.
// Sprint 2 M1 C1.7.

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import { parseAuditEventsResult, parseAuditVerifyResult } from './schema.js';
import type { AuditChainVerifyResult, AuditEventDetail, ListAuditEventsResult } from './types.js';

// ─────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────

export const auditKeys = {
  all: ['audit'] as const,
  lists: (workspaceId: string) => [...auditKeys.all, 'list', workspaceId] as const,
  list: (workspaceId: string, opts: ListAuditEventsParams = {}) =>
    [...auditKeys.lists(workspaceId), opts] as const,
  details: (workspaceId: string) => [...auditKeys.all, 'detail', workspaceId] as const,
  detail: (workspaceId: string, seq: number) => [...auditKeys.details(workspaceId), seq] as const,
  verify: (workspaceId: string) => [...auditKeys.all, 'verify', workspaceId] as const,
} as const;

// ─────────────────────────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────────────────────────

export interface ListAuditEventsParams {
  readonly before_seq?: number;
  readonly limit?: number;
  readonly event_type?: string;
  readonly actor?: string;
  readonly since?: string;
  readonly until?: string;
}

// ─────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────────

function buildQuery(params: ListAuditEventsParams): string {
  const entries: Array<[string, string]> = [];
  if (params.before_seq !== undefined) entries.push(['before_seq', String(params.before_seq)]);
  if (params.limit !== undefined) entries.push(['limit', String(params.limit)]);
  if (params.event_type !== undefined) entries.push(['event_type', params.event_type]);
  if (params.actor !== undefined) entries.push(['actor', params.actor]);
  if (params.since !== undefined) entries.push(['since', params.since]);
  if (params.until !== undefined) entries.push(['until', params.until]);
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export async function listAuditEvents(
  workspaceId: string,
  params: ListAuditEventsParams = {},
  client: ApiClient = defaultApiClient,
): Promise<ListAuditEventsResult> {
  // DEFECT-002: parse, don't cast — validate the daemon's response shape
  // and fall back to an empty page on drift.
  const raw = await client.get<unknown>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/audit${buildQuery(params)}`,
  );
  return parseAuditEventsResult(raw);
}

export async function getAuditEvent(
  workspaceId: string,
  seq: number,
  client: ApiClient = defaultApiClient,
): Promise<AuditEventDetail> {
  return client.get<AuditEventDetail>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/audit/${seq}`,
  );
}

export async function verifyAuditChain(
  workspaceId: string,
  client: ApiClient = defaultApiClient,
): Promise<AuditChainVerifyResult> {
  // DEFECT-003: parse, don't cast. `valid` is load-bearing — a malformed
  // verify response must never read as valid:true (fallback is valid:false).
  const raw = await client.get<unknown>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/audit/verify`,
  );
  return parseAuditVerifyResult(raw);
}
