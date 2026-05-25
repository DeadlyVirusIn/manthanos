// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Page-level integration of the Sprint 3B.6 "Suggest facts" flow on the
// Conversation Detail page:
//   - the Suggest button is gated to live conversations and toggles the
//     on-demand suggestion query;
//   - loading / error / empty states render;
//   - approving a candidate reuses the EXISTING extract mutation/dialog
//     (no new write path) and removes the candidate on success;
//   - a malformed daemon response degrades to the empty state (the
//     parse-don't-cast contract holds end to end).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiConversations from '../src/api/conversations.js';
import * as apiExtraction from '../src/api/extraction.js';
import {
  type CandidateFact,
  type ConversationFactsResponse,
  type ConversationQuoteView,
  type ConversationView,
  type ExtractFactResponse,
  type FactView,
  type SuggestExtractionsResult,
  aiKeys,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  asFactTier,
  conversationsKeys,
  defaultApiClient,
} from '../src/api/index.js';
import { ConversationDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-3b6';
const CONVERSATION_ID = 'conv-3b6';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';

function makeQuote(overrides: Partial<ConversationQuoteView> = {}): ConversationQuoteView {
  return { id: 'q-1', position: 0, text: 'We dropped the tool on day three.', ...overrides };
}

function makeConv(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: CONVERSATION_ID,
    workspace_id: PROJECT_ID,
    person_name: 'Alex Founder',
    occurred_at: TEN_MIN_AGO,
    audience_fit: asAudienceFit('target'),
    conversation_type: asConversationType('discovery'),
    outcome: asConversationOutcome('inconclusive'),
    summary: null,
    created_at: TEN_MIN_AGO,
    audit_seq: 1,
    tombstoned_at: null,
    tombstone_reason: null,
    fact_extraction_status: asFactExtractionStatus('pending'),
    last_extracted_at: null,
    is_tombstoned: false,
    verbatim_quotes: [makeQuote()],
    ...overrides,
  };
}

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: 'fact-new',
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'Founders drop tools that feel like research software.',
    statement_hash: 'h-1',
    tier: asFactTier('T0'),
    confidence: 0.5,
    last_corroborated: TEN_MIN_AGO,
    last_administratively_touched: TEN_MIN_AGO,
    audit_seq: 2,
    version_chain_root_id: null,
    superseded_by_fact_id: null,
    contested_at: null,
    contested_reason: null,
    tombstoned_at: null,
    tombstone_reason: null,
    is_head: true,
    is_contested: false,
    is_tombstoned: false,
    active_source_count: 1,
    degraded_source_count: 0,
    provenance_degraded: false,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateFact> = {}): CandidateFact {
  return {
    area: 'discovery_pain',
    statement: 'Founders drop tools that feel like research software.',
    confidence_score: 0.82,
    confidence_reasons: ['has_clear_claim', 'quote_backed'],
    provenance_preview: {
      source: 'conversation',
      conversation_id: CONVERSATION_ID,
      source_quote_id: null,
      created_at: TEN_MIN_AGO,
      extraction_confidence: 0.82,
      reason_flags: ['has_clear_claim', 'quote_backed'],
      extractor_version: 'det-1',
      model_used: null,
    },
    ...overrides,
  };
}

function suggestResult(candidates: readonly CandidateFact[]): SuggestExtractionsResult {
  return { candidates };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  });
}

function seed(client: QueryClient, conv: ConversationView, facts: readonly FactView[]): void {
  client.setQueryData(conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID), conv);
  client.setQueryData(conversationsKeys.facts(PROJECT_ID, CONVERSATION_ID), {
    conversation_id: CONVERSATION_ID,
    facts,
    total: facts.length,
  } satisfies ConversationFactsResponse);
  // 3B.6.5: the "Suggest facts" affordance is gated on the capability
  // query. Seed it ON so the suggestion flow is exercisable. The gate-off
  // path is covered by its own test below.
  seedCapabilities(client, true);
}

function seedCapabilities(client: QueryClient, available: boolean): void {
  client.setQueryData(aiKeys.capabilities(), {
    ai_extraction_available: available,
    provider_configured: false,
    llm_validator_enabled: false,
    model: null,
  });
}

function renderPage(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}`]}>
        <Routes>
          <Route path="/projects/:projectId/conversations/:id" element={<ConversationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => cleanup());

describe('Suggest facts — button posture', () => {
  it('renders the Suggest button on a live conversation, panel hidden until clicked', () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    renderPage(client);
    expect(screen.getByTestId('conversation-suggest-button')).toBeTruthy();
    expect(screen.queryByTestId('candidate-review-panel')).toBeNull();
  });

  it('does NOT render the Suggest button on a tombstoned conversation', () => {
    const client = makeClient();
    seed(client, makeConv({ is_tombstoned: true, tombstoned_at: TEN_MIN_AGO }), []);
    renderPage(client);
    expect(screen.queryByTestId('conversation-suggest-button')).toBeNull();
  });

  it('hides the Suggest button when the capability gate is OFF (safe degrade)', () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    // Capability unavailable (flag off, or daemon old / unreachable).
    seedCapabilities(client, false);
    renderPage(client);
    expect(screen.queryByTestId('conversation-suggest-button')).toBeNull();
  });
});

describe('Suggest facts — query states', () => {
  it('shows the loading state immediately after activating', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    // A promise that never settles within the test → stays pending.
    vi.spyOn(apiExtraction, 'suggestExtractions').mockReturnValue(
      new Promise<SuggestExtractionsResult>(() => undefined),
    );
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    expect(screen.getByTestId('candidate-review-panel')).toBeTruthy();
    expect(screen.getByTestId('candidate-review-loading')).toBeTruthy();
  });

  it('renders candidates once the query resolves', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockResolvedValue(
      suggestResult([makeCandidate()]),
    );
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-card')).toBeTruthy());
    expect(screen.getByTestId('candidate-statement').textContent).toContain('Founders drop tools');
    expect(screen.getByTestId('candidate-confidence').textContent).toBe('Solid');
  });

  it('shows the empty state when the daemon suggests nothing', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockResolvedValue(suggestResult([]));
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-review-empty')).toBeTruthy());
  });

  it('shows the error state when the request fails, with a retry', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockRejectedValue(new Error('network down'));
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-review-error')).toBeTruthy());
  });

  it("degrades a malformed daemon response to the empty state (parse-don't-cast)", async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    // Do NOT stub suggestExtractions — exercise the real client+parser.
    // A malformed body (candidates not an array) must yield no candidates.
    vi.spyOn(defaultApiClient, 'post').mockResolvedValue({ candidates: 'nope' } as unknown);
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-review-empty')).toBeTruthy());
  });
});

describe('Suggest facts — approval reuses the extract mutation/dialog', () => {
  it('opens the extract dialog pre-filled from the candidate', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockResolvedValue(
      suggestResult([makeCandidate({ source_quote_id: 'q-1' })]),
    );
    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-approve-button')).toBeTruthy());
    await act(async () => {
      screen.getByTestId('candidate-approve-button').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect((screen.getByTestId('extract-input-area') as HTMLInputElement).value).toBe(
      'discovery_pain',
    );
    expect((screen.getByTestId('extract-input-statement') as HTMLTextAreaElement).value).toContain(
      'Founders drop tools',
    );
    // The quote prefill points at the candidate's source quote.
    expect((screen.getByTestId('extract-input-quote') as HTMLSelectElement).value).toBe('q-1');
  });

  it('submits via the extract mutation and removes the approved candidate on success', async () => {
    const client = makeClient();
    const conv = makeConv();
    seed(client, conv, []);
    // The extract mutation invalidates the conversation queries; stub the
    // GETs so the post-success refetch resolves (as a live daemon would)
    // instead of erroring against a non-existent server.
    vi.spyOn(apiConversations, 'getConversation').mockResolvedValue(conv);
    vi.spyOn(apiConversations, 'getConversationFacts').mockResolvedValue({
      conversation_id: CONVERSATION_ID,
      facts: [],
      total: 0,
    } satisfies ConversationFactsResponse);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockResolvedValue(
      suggestResult([
        makeCandidate({ area: 'discovery_pain', statement: 'approved one' }),
        makeCandidate({ area: 'pricing', statement: 'still here' }),
      ]),
    );
    const extractSpy = vi
      .spyOn(apiConversations, 'extractFactFromConversation')
      .mockResolvedValue({ fact: makeFact(), was_created: true } satisfies ExtractFactResponse);

    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getAllByTestId('candidate-card')).toHaveLength(2));

    // Approve the first candidate.
    const firstApprove = screen.getAllByTestId('candidate-approve-button')[0];
    await act(async () => {
      firstApprove.click();
    });
    // Pre-filled, so submit is enabled immediately.
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });

    await waitFor(() => expect(extractSpy).toHaveBeenCalledTimes(1));
    const [, , input] = extractSpy.mock.calls[0];
    expect(input).toMatchObject({ area: 'discovery_pain', statement: 'approved one' });

    // Dialog closes and the approved candidate leaves the list.
    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());
    await waitFor(() => {
      const cards = screen.getAllByTestId('candidate-card');
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('still here');
    });
  });

  it('still surfaces the extract success message after approval', async () => {
    const client = makeClient();
    seed(client, makeConv(), []);
    vi.spyOn(apiExtraction, 'suggestExtractions').mockResolvedValue(
      suggestResult([makeCandidate({ statement: 'approve me' })]),
    );
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockResolvedValue({
      fact: makeFact(),
      was_created: true,
    } satisfies ExtractFactResponse);

    renderPage(client);
    await act(async () => {
      screen.getByTestId('conversation-suggest-button').click();
    });
    await waitFor(() => expect(screen.getByTestId('candidate-approve-button')).toBeTruthy());
    await act(async () => {
      screen.getByTestId('candidate-approve-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('conversation-mutation-success').textContent).toContain(
        'Fact pulled.',
      ),
    );
  });
});
