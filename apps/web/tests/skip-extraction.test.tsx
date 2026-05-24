// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Skip Extraction flow. Sprint 2 M2.5 C25.4.
//
// Page-level integration of MutationDialog + MutationErrorBanner +
// MutationSuccessMessage + useSkipExtraction via the Conversation
// Detail page's "Mark as not useful" button.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiConversations from '../src/api/conversations.js';
import {
  ApiError,
  type ConversationFactsResponse,
  type ConversationView,
  type SkipExtractionResponse,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  conversationsKeys,
} from '../src/api/index.js';
import { ConversationDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-4';
const CONVERSATION_ID = 'conv-c25-4';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';

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

function makeSkipResponse(overrides: Partial<SkipExtractionResponse> = {}): SkipExtractionResponse {
  return {
    conversation: makeConv({
      fact_extraction_status: asFactExtractionStatus('skipped'),
    }),
    previous_status: asFactExtractionStatus('pending'),
    ...overrides,
  };
}

function makeFactsResponse(): ConversationFactsResponse {
  return { conversation_id: CONVERSATION_ID, facts: [], total: 0 };
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

function seed(client: QueryClient, conv: ConversationView): void {
  client.setQueryData(conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID), conv);
  client.setQueryData(conversationsKeys.facts(PROJECT_ID, CONVERSATION_ID), makeFactsResponse());
}

function renderWith(client: QueryClient): void {
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

describe('Skip Extraction — button visibility', () => {
  it('renders the "Mark as not useful" button when status is pending', () => {
    const client = makeClient();
    seed(client, makeConv({ fact_extraction_status: asFactExtractionStatus('pending') }));
    renderWith(client);
    const btn = screen.getByTestId('conversation-skip-button');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.textContent).toContain('Mark as not useful');
  });

  it('does NOT render the button when status is extracted', () => {
    const client = makeClient();
    seed(client, makeConv({ fact_extraction_status: asFactExtractionStatus('extracted') }));
    renderWith(client);
    expect(screen.queryByTestId('conversation-skip-button')).toBeNull();
    expect(screen.queryByTestId('conversation-skip-row')).toBeNull();
  });

  it('does NOT render the button when status is skipped', () => {
    const client = makeClient();
    seed(client, makeConv({ fact_extraction_status: asFactExtractionStatus('skipped') }));
    renderWith(client);
    expect(screen.queryByTestId('conversation-skip-button')).toBeNull();
  });

  it('does NOT render the button on a tombstoned conversation', () => {
    const client = makeClient();
    seed(
      client,
      makeConv({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Erased.',
      }),
    );
    renderWith(client);
    expect(screen.getByTestId('conversation-detail-tombstoned')).toBeTruthy();
    expect(screen.queryByTestId('conversation-skip-button')).toBeNull();
  });

  it('opens the dialog when the button is clicked', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe(
      'Mark this conversation as not useful?',
    );
  });
});

describe('Skip Extraction — form rendering', () => {
  it('renders the explainer and the optional reason field', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    expect(screen.getByTestId('skip-extraction-explainer')).toBeTruthy();
    expect(screen.getByTestId('skip-extraction-field-reason')).toBeTruthy();
    expect(screen.getByTestId('skip-extraction-input-reason')).toBeTruthy();
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe('Skip Extraction — happy path', () => {
  it('submits with an empty body when no reason is typed, invalidates, shows success', async () => {
    const client = makeClient();
    seed(client, makeConv());
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const skipSpy = vi
      .spyOn(apiConversations, 'skipConversationExtraction')
      .mockResolvedValue(makeSkipResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(skipSpy).toHaveBeenCalled());
    const [wsArg, convArg, inputArg] = skipSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(convArg).toBe(CONVERSATION_ID);
    expect(inputArg).toEqual({});

    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('conversation-mutation-success-text').textContent).toBe(
        'Marked as not useful.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'detail', PROJECT_ID, CONVERSATION_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'list', PROJECT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });

  it('includes reason in the request when the user types one', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    const skipSpy = vi
      .spyOn(apiConversations, 'skipConversationExtraction')
      .mockResolvedValue(makeSkipResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await user.type(screen.getByTestId('skip-extraction-input-reason'), 'Not relevant.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(skipSpy).toHaveBeenCalled());
    const [, , inputArg] = skipSpy.mock.calls[0] ?? [];
    expect(inputArg).toEqual({ reason: 'Not relevant.' });
  });

  it('omits reason from the request when the user types whitespace only', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    const skipSpy = vi
      .spyOn(apiConversations, 'skipConversationExtraction')
      .mockResolvedValue(makeSkipResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await user.type(screen.getByTestId('skip-extraction-input-reason'), '   ');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(skipSpy).toHaveBeenCalled());
    const [, , inputArg] = skipSpy.mock.calls[0] ?? [];
    expect(inputArg).toEqual({});
  });
});

describe('Skip Extraction — error envelopes', () => {
  it('renders already_skipped (invalid_lifecycle) with translated state copy', async () => {
    vi.spyOn(apiConversations, 'skipConversationExtraction').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'already_skipped',
        conversation_id: CONVERSATION_ID,
        details: 'Already marked as not useful.',
      }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'invalid_lifecycle',
      ),
    );
    const errorText = (screen.getByTestId('mutation-error-banner').textContent ?? '').toLowerCase();
    expect(errorText).toContain('already marked as not useful');
    expect(errorText).not.toMatch(/\balready_skipped\b/);
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('renders tombstoned (invalid_lifecycle) with translated state copy ("erased")', async () => {
    vi.spyOn(apiConversations, 'skipConversationExtraction').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'tombstoned',
        conversation_id: CONVERSATION_ID,
        details: 'Cannot skip a tombstoned conversation.',
      }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'invalid_lifecycle',
      ),
    );
    const errorText = (screen.getByTestId('mutation-error-banner').textContent ?? '').toLowerCase();
    expect(errorText).toContain('erased');
    expect(errorText).not.toMatch(/\btombstoned\b/);
  });

  it('renders not_found inline (dialog stays open)', async () => {
    vi.spyOn(apiConversations, 'skipConversationExtraction').mockRejectedValue(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'not_found',
      ),
    );
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('categorises a network error correctly', async () => {
    vi.spyOn(apiConversations, 'skipConversationExtraction').mockRejectedValue(
      new Error('Failed to fetch'),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'network',
      ),
    );
  });
});

describe('Skip Extraction — F.3 reset on open', () => {
  it('clears a stale error when the dialog reopens', async () => {
    vi.spyOn(apiConversations, 'skipConversationExtraction').mockRejectedValueOnce(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);

    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('mutation-dialog-cancel').click();
    });
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
  });
});

describe('Skip Extraction — vocabulary discipline', () => {
  it('never renders raw substrate keys or ISO timestamps in the dialog', async () => {
    const client = makeClient();
    seed(client, makeConv({ occurred_at: TEN_MIN_AGO }));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-skip-button').click();
    });
    const visible = visibleText(screen.getByTestId('mutation-dialog'));
    expect(visible).not.toMatch(/\btombstoned\b/);
    expect(visible).not.toMatch(/\bskipped\b/);
    expect(visible).not.toMatch(/\bextracted\b/);
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('uses user-friendly button copy ("Mark as not useful", not "Skip")', () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    const btn = screen.getByTestId('conversation-skip-button');
    expect(btn.textContent).toContain('Mark as not useful');
    expect(btn.textContent).not.toMatch(/\bSkip\b/);
  });
});
