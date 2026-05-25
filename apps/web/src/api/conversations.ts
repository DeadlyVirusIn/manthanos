// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation API endpoints + TanStack Query key factory.
// Sprint 2 M1 C1.7.

import type { ApiClient } from './client.js';
import { defaultApiClient } from './client.js';
import type {
  AudienceFit,
  ConversationOutcome,
  ConversationType,
  ConversationView,
  FactExtractionStatus,
  FactTier,
  FactView,
  ListConversationsResult,
} from './types.js';

// ─────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────

export const conversationsKeys = {
  all: ['conversations'] as const,
  lists: (workspaceId: string) => [...conversationsKeys.all, 'list', workspaceId] as const,
  list: (workspaceId: string, opts: ListConversationsParams = {}) =>
    [...conversationsKeys.lists(workspaceId), opts] as const,
  details: (workspaceId: string) => [...conversationsKeys.all, 'detail', workspaceId] as const,
  detail: (workspaceId: string, conversationId: string) =>
    [...conversationsKeys.details(workspaceId), conversationId] as const,
  facts: (workspaceId: string, conversationId: string) =>
    [...conversationsKeys.detail(workspaceId, conversationId), 'facts'] as const,
} as const;

// ─────────────────────────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────────────────────────

export interface ListConversationsParams {
  readonly audience_fit?: AudienceFit;
  readonly conversation_type?: ConversationType;
  readonly outcome?: ConversationOutcome;
  readonly fact_extraction_status?: FactExtractionStatus;
  readonly include_tombstoned?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateConversationQuoteInput {
  readonly text: string;
}

export interface CreateConversationInput {
  readonly person_name: string;
  readonly occurred_at: string;
  readonly audience_fit: AudienceFit;
  readonly conversation_type: ConversationType;
  readonly outcome: ConversationOutcome;
  readonly summary?: string;
  readonly verbatim_quotes?: readonly CreateConversationQuoteInput[];
}

export interface UpdateConversationInput {
  readonly person_name?: string;
  readonly occurred_at?: string;
  readonly audience_fit?: AudienceFit;
  readonly conversation_type?: ConversationType;
  readonly outcome?: ConversationOutcome;
  /** `null` clears the summary; omit to leave unchanged. */
  readonly summary?: string | null;
}

export interface TombstoneConversationInput {
  readonly reason: string;
}

export interface SkipExtractionInput {
  readonly reason?: string;
}

export interface ExtractFactInput {
  readonly area: string;
  readonly statement: string;
  readonly tier?: FactTier;
  readonly quote_id?: string;
  // 3B.6.5: optional extraction metadata carried from an approved
  // suggestion so the audited extract persists it into provenance
  // (migration 0009). Omitted for a manual hand-typed extraction.
  // `model_used` is intentionally NOT sent from the web — it stays NULL
  // in deterministic 3B and is reserved for the 3B.7 LLM validator.
  readonly extraction_confidence?: number;
  readonly extractor_version?: string;
  readonly reason_flags?: readonly string[];
}

// ─────────────────────────────────────────────────────────────────
// Response shapes specific to mutation endpoints
// ─────────────────────────────────────────────────────────────────

export interface ExtractFactResponse {
  readonly fact: FactView;
  readonly was_created: boolean;
}

export interface TombstoneConversationResponse {
  readonly conversation: ConversationView;
  readonly affected_quote_count: number;
  readonly affected_provenance_count: number;
  readonly affected_fact_ids_sample: readonly string[];
}

export interface SkipExtractionResponse {
  readonly conversation: ConversationView;
  readonly previous_status: FactExtractionStatus;
}

export interface ConversationFactsResponse {
  readonly conversation_id: string;
  readonly facts: readonly FactView[];
  readonly total: number;
}

// ─────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────────

function buildQuery(params: ListConversationsParams): string {
  const entries: Array<[string, string]> = [];
  if (params.audience_fit !== undefined) entries.push(['audience_fit', params.audience_fit]);
  if (params.conversation_type !== undefined)
    entries.push(['conversation_type', params.conversation_type]);
  if (params.outcome !== undefined) entries.push(['outcome', params.outcome]);
  if (params.fact_extraction_status !== undefined)
    entries.push(['fact_extraction_status', params.fact_extraction_status]);
  if (params.include_tombstoned === true) entries.push(['include_tombstoned', 'true']);
  if (params.limit !== undefined) entries.push(['limit', String(params.limit)]);
  if (params.offset !== undefined) entries.push(['offset', String(params.offset)]);
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export async function listConversations(
  workspaceId: string,
  params: ListConversationsParams = {},
  client: ApiClient = defaultApiClient,
): Promise<ListConversationsResult> {
  return client.get<ListConversationsResult>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations${buildQuery(params)}`,
  );
}

export async function getConversation(
  workspaceId: string,
  conversationId: string,
  client: ApiClient = defaultApiClient,
): Promise<ConversationView> {
  return client.get<ConversationView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export async function createConversation(
  workspaceId: string,
  input: CreateConversationInput,
  client: ApiClient = defaultApiClient,
): Promise<ConversationView> {
  return client.post<ConversationView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations`,
    input,
  );
}

export async function updateConversation(
  workspaceId: string,
  conversationId: string,
  input: UpdateConversationInput,
  client: ApiClient = defaultApiClient,
): Promise<ConversationView> {
  return client.patch<ConversationView>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}`,
    input,
  );
}

export async function tombstoneConversation(
  workspaceId: string,
  conversationId: string,
  input: TombstoneConversationInput,
  client: ApiClient = defaultApiClient,
): Promise<TombstoneConversationResponse> {
  return client.post<TombstoneConversationResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/tombstone`,
    input,
  );
}

export async function skipConversationExtraction(
  workspaceId: string,
  conversationId: string,
  input: SkipExtractionInput = {},
  client: ApiClient = defaultApiClient,
): Promise<SkipExtractionResponse> {
  return client.post<SkipExtractionResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/skip-extraction`,
    input,
  );
}

export async function extractFactFromConversation(
  workspaceId: string,
  conversationId: string,
  input: ExtractFactInput,
  client: ApiClient = defaultApiClient,
): Promise<ExtractFactResponse> {
  return client.post<ExtractFactResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/extract`,
    input,
  );
}

export async function getConversationFacts(
  workspaceId: string,
  conversationId: string,
  client: ApiClient = defaultApiClient,
): Promise<ConversationFactsResponse> {
  return client.get<ConversationFactsResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/facts`,
  );
}

export async function exportConversationMarkdown(
  workspaceId: string,
  conversationId: string,
  client: ApiClient = defaultApiClient,
): Promise<string> {
  return client.getText(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/export?format=markdown`,
  );
}
