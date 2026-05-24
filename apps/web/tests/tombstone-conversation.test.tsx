// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Tombstone Conversation flow. Sprint 2 M2.5 C25.5.

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
  type TombstoneConversationResponse,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  conversationsKeys,
} from '../src/api/index.js';
import { ConversationDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-5';
const CONVERSATION_ID = 'conv-c25-5';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const ACK_COPY = 'I understand this cannot be undone';

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

function makeTombstoneResponse(
  overrides: Partial<TombstoneConversationResponse> = {},
): TombstoneConversationResponse {
  return {
    conversation: makeConv({
      is_tombstoned: true,
      tombstoned_at: TEN_MIN_AGO,
      tombstone_reason: '[tombstoned]',
    }),
    affected_quote_count: 0,
    affected_provenance_count: 0,
    affected_fact_ids_sample: [],
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

describe('Tombstone Conversation — button visibility', () => {
  it('renders the "Erase this conversation" button on a live conversation', () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    const btn = screen.getByTestId('conversation-erase-button');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.textContent).toContain('Erase this conversation');
  });

  it('renders the button regardless of fact_extraction_status (extracted)', () => {
    const client = makeClient();
    seed(client, makeConv({ fact_extraction_status: asFactExtractionStatus('extracted') }));
    renderWith(client);
    expect(screen.getByTestId('conversation-erase-button')).toBeTruthy();
  });

  it('does NOT render the button on an already-tombstoned conversation', () => {
    const client = makeClient();
    seed(
      client,
      makeConv({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: '[tombstoned]',
      }),
    );
    renderWith(client);
    expect(screen.getByTestId('conversation-detail-tombstoned')).toBeTruthy();
    expect(screen.queryByTestId('conversation-erase-button')).toBeNull();
  });

  it('opens the dialog when the button is clicked', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe(
      'Erase this conversation?',
    );
  });
});

describe('Tombstone Conversation — dialog rendering', () => {
  it('renders explainer, required reason field, ack checkbox, and disabled submit', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    expect(screen.getByTestId('tombstone-conversation-explainer')).toBeTruthy();
    expect(screen.getByTestId('tombstone-conversation-field-reason')).toBeTruthy();
    expect(screen.getByTestId('tombstone-conversation-input-reason')).toBeTruthy();
    expect(screen.getByTestId('tombstone-conversation-field-ack')).toBeTruthy();
    const ack = screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement;
    expect(ack.type).toBe('checkbox');
    expect(ack.checked).toBe(false);
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows the exact acknowledgement copy', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    const ackField = screen.getByTestId('tombstone-conversation-field-ack');
    expect(ackField.textContent).toContain(ACK_COPY);
  });
});

describe('Tombstone Conversation — submit gating', () => {
  it('keeps submit disabled with reason only (no ack)', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(
      screen.getByTestId('tombstone-conversation-input-reason'),
      'No longer relevant.',
    );
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('keeps submit disabled with ack only (no reason)', async () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('keeps submit disabled with whitespace-only reason + ack', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), '   ');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables submit when reason is non-empty AND ack is ticked', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(
      screen.getByTestId('tombstone-conversation-input-reason'),
      'No longer relevant.',
    );
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe('Tombstone Conversation — happy path', () => {
  it('submits trimmed reason, invalidates expected keys, shows success', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const tombstoneSpy = vi
      .spyOn(apiConversations, 'tombstoneConversation')
      .mockResolvedValue(makeTombstoneResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(
      screen.getByTestId('tombstone-conversation-input-reason'),
      '  No longer relevant.  ',
    );
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(tombstoneSpy).toHaveBeenCalled());
    const [wsArg, convArg, inputArg] = tombstoneSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(convArg).toBe(CONVERSATION_ID);
    expect(inputArg).toEqual({ reason: 'No longer relevant.' });

    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('conversation-mutation-success-text').textContent).toBe(
        'Conversation erased.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'detail', PROJECT_ID, CONVERSATION_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'list', PROJECT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['conversations', 'detail', PROJECT_ID, CONVERSATION_ID, 'facts'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });

  it('transitions to the tombstoned read-only UI once the cache reflects success', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeConv());
    // Stub invalidateQueries so the post-mutation refetch doesn't try
    // to hit the daemon (jsdom can't reach it). The mutation
    // implementation pre-seats the tombstoned conversation directly
    // in cache; with invalidation suppressed, the next render sees
    // the new data and transitions to the read-only shell.
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => undefined);
    vi.spyOn(apiConversations, 'tombstoneConversation').mockImplementation(async () => {
      client.setQueryData(
        conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID),
        makeConv({
          is_tombstoned: true,
          tombstoned_at: TEN_MIN_AGO,
          tombstone_reason: '[tombstoned]',
        }),
      );
      return makeTombstoneResponse();
    });
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), 'Done.');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('conversation-detail-tombstoned')).toBeTruthy());
    expect(screen.queryByTestId('conversation-erase-button')).toBeNull();
  });
});

describe('Tombstone Conversation — error envelopes', () => {
  it('renders invalid_lifecycle (already tombstoned) with translated copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiConversations, 'tombstoneConversation').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'tombstoned',
        conversation_id: CONVERSATION_ID,
        details: 'Already erased.',
      }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), 'Done.');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
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
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('renders not_found inline (dialog stays open)', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiConversations, 'tombstoneConversation').mockRejectedValue(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), 'Done.');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
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
    const user = userEvent.setup();
    vi.spyOn(apiConversations, 'tombstoneConversation').mockRejectedValue(
      new Error('Failed to fetch'),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), 'Done.');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
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

describe('Tombstone Conversation — F.3 reset on open', () => {
  it('clears prior error AND resets reason+ack when the dialog reopens', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiConversations, 'tombstoneConversation').mockRejectedValueOnce(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    await user.type(screen.getByTestId('tombstone-conversation-input-reason'), 'Old reason.');
    await act(async () => {
      (screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement).click();
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('mutation-dialog-cancel').click();
    });
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
    const reason = screen.getByTestId('tombstone-conversation-input-reason') as HTMLTextAreaElement;
    expect(reason.value).toBe('');
    const ack = screen.getByTestId('tombstone-conversation-input-ack') as HTMLInputElement;
    expect(ack.checked).toBe(false);
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe('Tombstone Conversation — vocabulary discipline', () => {
  it('never renders raw substrate keys or ISO timestamps in the dialog', async () => {
    const client = makeClient();
    seed(client, makeConv({ occurred_at: TEN_MIN_AGO }));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('conversation-erase-button').click();
    });
    const visible = visibleText(screen.getByTestId('mutation-dialog'));
    expect(visible).not.toMatch(/\btombstoned?\b/);
    expect(visible).not.toMatch(/\bskipped\b/);
    expect(visible).not.toMatch(/\bextracted\b/);
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('button copy says "Erase", never "Tombstone"', () => {
    const client = makeClient();
    seed(client, makeConv());
    renderWith(client);
    const btn = screen.getByTestId('conversation-erase-button');
    expect(btn.textContent).toContain('Erase');
    expect(btn.textContent).not.toMatch(/\bTombstone\b/i);
  });
});
