// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Extract Fact flow. Sprint 2 M2.5 C25.2.
//
// Page-level integration of MutationDialog + MutationErrorBanner +
// MutationSuccessMessage + useExtractFact via the Conversation Detail
// page's "Add a finding from this conversation" button.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiConversations from '../src/api/conversations.js';
import {
  ApiError,
  type ConversationFactsResponse,
  type ConversationQuoteView,
  type ConversationView,
  type ExtractFactResponse,
  type FactView,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  asFactTier,
  conversationsKeys,
} from '../src/api/index.js';
import { ConversationDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-2';
const CONVERSATION_ID = 'conv-c25-2';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';

function makeQuote(overrides: Partial<ConversationQuoteView> = {}): ConversationQuoteView {
  return {
    id: 'q-1',
    position: 0,
    text: 'They said the onboarding felt heavy.',
    ...overrides,
  };
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
    verbatim_quotes: [],
    ...overrides,
  };
}

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: 'fact-new',
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'Founders abandon discovery tools.',
    statement_hash: 'h-1',
    tier: asFactTier('T-2'),
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

function makeExtractResponse(overrides: Partial<ExtractFactResponse> = {}): ExtractFactResponse {
  return { fact: makeFact(), was_created: true, ...overrides };
}

function makeFactsResponse(facts: readonly FactView[] = []): ConversationFactsResponse {
  return { conversation_id: CONVERSATION_ID, facts, total: facts.length };
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

function seedConversation(client: QueryClient, conv: ConversationView): void {
  client.setQueryData(conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID), conv);
}

function seedFacts(client: QueryClient, response: ConversationFactsResponse): void {
  client.setQueryData(conversationsKeys.facts(PROJECT_ID, CONVERSATION_ID), response);
}

function renderConversationWith(client: QueryClient): void {
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

function visibleText(root: Element | null): string {
  if (root === null) return '';
  return root.textContent ?? '';
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────
// Button posture
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — button posture', () => {
  it('renders the extract button on a live conversation', () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    const btn = screen.getByTestId('conversation-extract-button');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.textContent).toContain('Add a finding from this conversation');
  });

  it('does NOT render the extract button on a tombstoned conversation', () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConv({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Erased.',
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    expect(screen.getByTestId('conversation-detail-tombstoned')).toBeTruthy();
    expect(screen.queryByTestId('conversation-extract-button')).toBeNull();
  });

  it('opens the extract dialog when the button is clicked', async () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe(
      'Add a finding from this conversation',
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// Form rendering
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — form rendering', () => {
  it('renders area + statement + optional tier fields with translated labels', async () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    expect(screen.getByTestId('extract-field-area')).toBeTruthy();
    expect(screen.getByTestId('extract-field-statement')).toBeTruthy();
    expect(screen.getByTestId('extract-field-tier')).toBeTruthy();
    expect(visibleText(screen.getByTestId('extract-field-area'))).toContain("What's this about?");
    expect(visibleText(screen.getByTestId('extract-field-statement'))).toContain('The finding');
  });

  it('renders the tier picker with translated options (no raw tier letters as visible text)', async () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    const tierField = visibleText(screen.getByTestId('extract-field-tier'));
    // Raw tier letters never appear as visible text. (The `value=`
    // attributes still contain the raw keys but textContent does not.)
    expect(tierField).not.toMatch(/\bT-2\b/);
    expect(tierField).not.toMatch(/\bT-1\b/);
    expect(tierField).not.toMatch(/\bT0\b/);
    expect(tierField).not.toMatch(/\bT\+1\b/);
  });

  it('shows the tier preview indicator only when a tier is picked', async () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    expect(screen.queryByTestId('extract-tier-preview')).toBeNull();
    fireEvent.change(screen.getByTestId('extract-input-tier'), { target: { value: 'T0' } });
    expect(screen.getByTestId('extract-tier-preview')).toBeTruthy();
  });

  it('omits the quote picker when the conversation has no quotes', async () => {
    const client = makeClient();
    seedConversation(client, makeConv({ verbatim_quotes: [] }));
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    expect(screen.queryByTestId('extract-field-quote')).toBeNull();
  });

  it('renders the quote picker with one option per quote, sorted by position', async () => {
    const client = makeClient();
    seedConversation(
      client,
      makeConv({
        verbatim_quotes: [
          makeQuote({ id: 'q-second', position: 1, text: 'second' }),
          makeQuote({ id: 'q-first', position: 0, text: 'first' }),
          makeQuote({ id: 'q-third', position: 2, text: 'third' }),
        ],
      }),
    );
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    const select = screen.getByTestId('extract-input-quote') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['', 'q-first', 'q-second', 'q-third']);
  });
});

// ─────────────────────────────────────────────────────────────────
// Required-field gating
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — required-field gating', () => {
  it('keeps submit disabled until both area and statement are filled', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByTestId('extract-input-statement'), 'Day-3 dropoff is heavy.');
    expect(submit.disabled).toBe(false);
  });

  it('surfaces a validation message for whitespace-only input (3B.6.5 F-05)', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    // No error before the user touches the fields.
    expect(screen.queryByTestId('extract-area-error')).toBeNull();
    // Typing only spaces is invalid — the message explains why, and the
    // input is marked aria-invalid + linked via aria-describedby.
    await user.type(screen.getByTestId('extract-input-area'), '   ');
    const areaInput = screen.getByTestId('extract-input-area');
    const err = screen.getByTestId('extract-area-error');
    expect(err).toBeTruthy();
    expect(err.getAttribute('role')).toBe('alert');
    expect(areaInput.getAttribute('aria-invalid')).toBe('true');
    expect(areaInput.getAttribute('aria-describedby')).toBe('extract-area-error');
    expect((screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Happy-path submit + invalidation + success
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — happy path', () => {
  it('submits the right input, invalidates the right keys, surfaces success, closes dialog', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv({ verbatim_quotes: [makeQuote({ id: 'q-tied' })] }));
    seedFacts(client, makeFactsResponse([]));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const extractSpy = vi
      .spyOn(apiConversations, 'extractFactFromConversation')
      .mockResolvedValue(makeExtractResponse({ was_created: true }));

    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });

    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    await user.type(screen.getByTestId('extract-input-statement'), 'Day-3 dropoff is heavy.');
    fireEvent.change(screen.getByTestId('extract-input-tier'), { target: { value: 'T0' } });
    fireEvent.change(screen.getByTestId('extract-input-quote'), { target: { value: 'q-tied' } });

    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });

    await waitFor(() => expect(extractSpy).toHaveBeenCalled());
    const [workspaceArg, conversationArg, inputArg] = extractSpy.mock.calls[0] ?? [];
    expect(workspaceArg).toBe(PROJECT_ID);
    expect(conversationArg).toBe(CONVERSATION_ID);
    expect(inputArg).toMatchObject({
      area: 'churn',
      statement: 'Day-3 dropoff is heavy.',
      tier: 'T0',
      quote_id: 'q-tied',
    });

    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('conversation-mutation-success-text').textContent).toBe(
        'Fact pulled.',
      ),
    );

    // Invalidation list per kickoff §6.1.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'areas', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'detail', PROJECT_ID, CONVERSATION_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'detail', PROJECT_ID, CONVERSATION_ID, 'facts'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });

  it('shows the "Linked to an existing fact." message when was_created is false', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockResolvedValue(
      makeExtractResponse({ was_created: false }),
    );

    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    await user.type(screen.getByTestId('extract-input-statement'), 'Day-3 dropoff.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('conversation-mutation-success-text').textContent).toBe(
        'Linked to an existing fact.',
      ),
    );
  });

  it('omits tier and quote_id from the request when the user does not pick them', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv({ verbatim_quotes: [makeQuote()] }));
    seedFacts(client, makeFactsResponse([]));
    const spy = vi
      .spyOn(apiConversations, 'extractFactFromConversation')
      .mockResolvedValue(makeExtractResponse());
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    await user.type(screen.getByTestId('extract-input-statement'), 'Statement.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [, , inputArg] = spy.mock.calls[0] ?? [];
    expect(inputArg).toEqual({ area: 'churn', statement: 'Statement.' });
    expect((inputArg as Record<string, unknown>).tier).toBeUndefined();
    expect((inputArg as Record<string, unknown>).quote_id).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
// Server error envelopes
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — error envelopes', () => {
  async function openAndFill(): Promise<void> {
    const user = userEvent.setup();
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    await user.type(screen.getByTestId('extract-input-statement'), 'A claim.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
  }

  it('renders validation error inline (dialog stays open)', async () => {
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockRejectedValue(
      new ApiError(400, '400', '/api', {
        error: 'validation',
        field: 'statement',
        details: 'Statement too short.',
      }),
    );
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await openAndFill();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'validation',
      ),
    );
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('F.2: duplicate_fact renders an inline link to the existing fact (dialog stays open)', async () => {
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'duplicate_fact',
        existing_fact_id: 'fact-existing-123',
        details: 'We already have this.',
      }),
    );
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await openAndFill();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'duplicate_fact',
      ),
    );
    const link = screen.getByTestId('mutation-error-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/facts/fact-existing-123`);
    expect(link.textContent).toContain('Open the existing finding');
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('renders invalid_lifecycle with translated state copy (no raw substrate)', async () => {
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'tombstoned',
        conversation_id: CONVERSATION_ID,
        details: 'Cannot extract from a tombstoned conversation.',
      }),
    );
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await openAndFill();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'invalid_lifecycle',
      ),
    );
    const dialogText = visibleText(screen.getByTestId('mutation-dialog'));
    expect(dialogText).not.toMatch(/\btombstoned\b/);
    expect(dialogText.toLowerCase()).toContain('erased');
  });

  it('categorises a network error correctly', async () => {
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockRejectedValue(
      new Error('Failed to fetch'),
    );
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await openAndFill();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'network',
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// F.3 — reset on open
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — F.3 reset on open', () => {
  it('clears a stale error when the dialog reopens', async () => {
    vi.spyOn(apiConversations, 'extractFactFromConversation').mockRejectedValueOnce(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );

    const user = userEvent.setup();
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);

    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    await user.type(screen.getByTestId('extract-input-area'), 'churn');
    await user.type(screen.getByTestId('extract-input-statement'), 'A claim.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('mutation-dialog-cancel').click();
    });
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Vocabulary discipline
// ─────────────────────────────────────────────────────────────────

describe('Extract Fact — vocabulary discipline', () => {
  it('never renders raw substrate keys in dialog visible text', async () => {
    const client = makeClient();
    seedConversation(client, makeConv());
    seedFacts(client, makeFactsResponse([]));
    renderConversationWith(client);
    await act(async () => {
      screen.getByTestId('conversation-extract-button').click();
    });
    const dialogText = visibleText(screen.getByTestId('mutation-dialog'));
    expect(dialogText).not.toMatch(/\bT-2\b/);
    expect(dialogText).not.toMatch(/\bT-1\b/);
    expect(dialogText).not.toMatch(/\bT0\b/);
    expect(dialogText).not.toMatch(/\bT\+1\b/);
    expect(dialogText).not.toMatch(/\btombstoned\b/);
    expect(dialogText).not.toContain('Workspace');
  });
});
