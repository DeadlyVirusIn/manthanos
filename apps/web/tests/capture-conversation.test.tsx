// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Capture Conversation flow. Sprint 2 M2.5 C25.1.
//
// Covers the page-level integration of MutationDialog +
// MutationErrorBanner + MutationSuccessMessage + useCaptureConversation
// via the Today page's quick-action card. Uses jsdom + Testing Library
// for the DOM interaction.
//
// The daemon's createConversation call is stubbed at the api/client
// boundary via vi.spyOn so React Query and the mutation framework
// exercise their real paths.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiConversations from '../src/api/conversations.js';
import {
  ApiError,
  type ConversationView,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asFactExtractionStatus,
  auditKeys,
  conversationsKeys,
  factsKeys,
} from '../src/api/index.js';
import { Today } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-test';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';

function makeConv(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'conv-new',
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

function makeClient(): QueryClient {
  const client = new QueryClient({
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
  // Seed Today's read-only data queries so the page renders a stable
  // populated/empty branch rather than transitioning to today-error
  // when jsdom's fetch() fails. Each mutation test exercises the
  // mutation framework, not Today's data hooks — seeding keeps the
  // test deterministic.
  client.setQueryData(auditKeys.list(PROJECT_ID, { limit: 10 }), {
    events: [],
    total: 0,
    has_more: false,
  });
  client.setQueryData(conversationsKeys.list(PROJECT_ID, { limit: 1 }), {
    conversations: [],
    total: 0,
    returned: 0,
    limit: 1,
    offset: 0,
    has_more: false,
  });
  client.setQueryData(factsKeys.list(PROJECT_ID, { limit: 1 }), {
    facts: [],
    total: 0,
    returned: 0,
    limit: 1,
    offset: 0,
    has_more: false,
  });
  return client;
}

function renderTodayWith(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/today`]}>
        <Routes>
          <Route path="/projects/:projectId/today" element={<Today />} />
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
// Today quick-action wiring
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — quick action posture', () => {
  it('renders Capture Conversation as an enabled button', () => {
    renderTodayWith(makeClient());
    const btn = screen.getByTestId('quick-action-capture-conversation');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('opens the capture dialog when the quick-action button is clicked', async () => {
    renderTodayWith(makeClient());
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe('Capture a conversation');
  });
});

// ─────────────────────────────────────────────────────────────────
// Form rendering
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — form rendering', () => {
  it('renders all required field rows with translated labels', async () => {
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    expect(screen.getByTestId('capture-field-person-name')).toBeTruthy();
    expect(screen.getByTestId('capture-field-occurred-at')).toBeTruthy();
    expect(screen.getByTestId('capture-field-audience-fit')).toBeTruthy();
    expect(screen.getByTestId('capture-field-conversation-type')).toBeTruthy();
    expect(screen.getByTestId('capture-field-outcome')).toBeTruthy();
    expect(screen.getByTestId('capture-field-summary')).toBeTruthy();
    expect(visibleText(screen.getByTestId('capture-field-person-name'))).toContain(
      'Who did you talk to?',
    );
    expect(visibleText(screen.getByTestId('capture-field-occurred-at'))).toContain('When was it?');
    expect(visibleText(screen.getByTestId('capture-field-audience-fit'))).toContain(
      'How well do they match your target?',
    );
  });

  it('renders enum options through getEnumLabel (translated labels appear)', async () => {
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    const audienceFit = visibleText(screen.getByTestId('capture-field-audience-fit'));
    expect(audienceFit).toContain('Exact match');
    expect(audienceFit).toContain('Adjacent');
    expect(audienceFit).toContain('Off-target');
    expect(audienceFit).toContain('Not sure');

    const convType = visibleText(screen.getByTestId('capture-field-conversation-type'));
    expect(convType).toContain('First conversation');
    // "discovery" is the substrate key; the visible label is
    // "First conversation". The raw key should not appear as visible
    // text (only as the option's `value` attribute, which textContent
    // does NOT include).
    expect(convType).not.toMatch(/\bdiscovery\b/);

    const outcome = visibleText(screen.getByTestId('capture-field-outcome'));
    expect(outcome).toContain('Confirmed what I expected');
    expect(outcome).not.toMatch(/\bvalidated\b/);
  });
});

// ─────────────────────────────────────────────────────────────────
// Required-field gating
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — required-field gating', () => {
  it('keeps submit disabled until all required fields are filled', async () => {
    const user = userEvent.setup();
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const nameInput = screen.getByTestId('capture-input-person-name');
    await user.type(nameInput, 'Alice');
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('capture-input-audience-fit'), {
      target: { value: 'target' },
    });
    fireEvent.change(screen.getByTestId('capture-input-conversation-type'), {
      target: { value: 'discovery' },
    });
    fireEvent.change(screen.getByTestId('capture-input-outcome'), {
      target: { value: 'validated' },
    });
    expect(submit.disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Happy-path submit + invalidation + success message
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — happy path', () => {
  it('submits the right input, invalidates keys, shows success message, and closes dialog', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const createSpy = vi
      .spyOn(apiConversations, 'createConversation')
      .mockResolvedValue(makeConv({ id: 'conv-created' }));

    renderTodayWith(client);
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });

    await user.type(screen.getByTestId('capture-input-person-name'), 'Alex');
    fireEvent.change(screen.getByTestId('capture-input-audience-fit'), {
      target: { value: 'target' },
    });
    fireEvent.change(screen.getByTestId('capture-input-conversation-type'), {
      target: { value: 'discovery' },
    });
    fireEvent.change(screen.getByTestId('capture-input-outcome'), {
      target: { value: 'validated' },
    });

    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const [calledWorkspaceId, calledInput] = createSpy.mock.calls[0] ?? [];
    expect(calledWorkspaceId).toBe(PROJECT_ID);
    expect(calledInput).toMatchObject({
      person_name: 'Alex',
      audience_fit: 'target',
      conversation_type: 'discovery',
      outcome: 'validated',
    });
    expect(String(calledInput?.occurred_at).endsWith('Z')).toBe(true);

    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());

    await waitFor(() =>
      expect(screen.getByTestId('today-capture-success-text').textContent).toBe(
        'Conversation captured.',
      ),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['conversations', 'list', PROJECT_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['audit', 'list', PROJECT_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workspaces', 'detail', PROJECT_ID],
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Server error envelopes
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — error envelopes', () => {
  async function fillRequiredAndSubmit(): Promise<void> {
    const user = userEvent.setup();
    await user.type(screen.getByTestId('capture-input-person-name'), 'Alex');
    fireEvent.change(screen.getByTestId('capture-input-audience-fit'), {
      target: { value: 'target' },
    });
    fireEvent.change(screen.getByTestId('capture-input-conversation-type'), {
      target: { value: 'discovery' },
    });
    fireEvent.change(screen.getByTestId('capture-input-outcome'), {
      target: { value: 'validated' },
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
  }

  it('renders validation error inline (dialog stays open)', async () => {
    vi.spyOn(apiConversations, 'createConversation').mockRejectedValue(
      new ApiError(400, '400', '/api', {
        error: 'validation',
        field: 'person_name',
        details: 'Required.',
      }),
    );
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    await fillRequiredAndSubmit();
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());
    expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
      'validation',
    );
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('renders not_found error inline', async () => {
    vi.spyOn(apiConversations, 'createConversation').mockRejectedValue(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    await fillRequiredAndSubmit();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'not_found',
      ),
    );
  });

  it('categorises a network error correctly', async () => {
    vi.spyOn(apiConversations, 'createConversation').mockRejectedValue(
      new Error('Failed to fetch'),
    );
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    await fillRequiredAndSubmit();
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'network',
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// Future-timestamp warning (J.4)
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — future timestamp warning', () => {
  it('renders a soft warning when occurred_at is in the future', async () => {
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    const occurredInput = screen.getByTestId('capture-input-occurred-at') as HTMLInputElement;
    const future = new Date(Date.now() + 86_400_000 * 3);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const futureLocal = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(occurredInput, { target: { value: futureLocal } });
    await waitFor(() => expect(screen.getByTestId('capture-warning-future-occurred')).toBeTruthy());
  });

  it('does not render the warning for an in-the-past timestamp', async () => {
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    expect(screen.queryByTestId('capture-warning-future-occurred')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// F.3 — open clears prior error / success
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — F.3 reset on open', () => {
  it('clears a stale error when the dialog reopens', async () => {
    vi.spyOn(apiConversations, 'createConversation').mockRejectedValueOnce(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );

    const user = userEvent.setup();
    renderTodayWith(makeClient());

    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    await user.type(screen.getByTestId('capture-input-person-name'), 'Alex');
    fireEvent.change(screen.getByTestId('capture-input-audience-fit'), {
      target: { value: 'target' },
    });
    fireEvent.change(screen.getByTestId('capture-input-conversation-type'), {
      target: { value: 'discovery' },
    });
    fireEvent.change(screen.getByTestId('capture-input-outcome'), {
      target: { value: 'validated' },
    });
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('mutation-dialog-cancel').click();
    });
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Vocabulary discipline
// ─────────────────────────────────────────────────────────────────

describe('Capture Conversation — vocabulary discipline', () => {
  // The audience-fit field label legitimately contains "target" as an
  // English word ("How well do they match your target?"), and the
  // outside-of-target option translates as "Off-target". This test
  // therefore asserts the substrate keys that have NO legitimate
  // English overlap are absent: 'discovery', 'validated', 'invalidated',
  // 'inconclusive', 'follow_up'. It also asserts "Workspace" never
  // appears in visible text.
  it('renders no raw substrate keys in dialog visible text', async () => {
    renderTodayWith(makeClient());
    await act(async () => {
      screen.getByTestId('quick-action-capture-conversation').click();
    });
    const dialogText = visibleText(screen.getByTestId('mutation-dialog'));
    expect(dialogText).not.toMatch(/\bdiscovery\b/);
    expect(dialogText).not.toMatch(/\bvalidated\b/);
    expect(dialogText).not.toMatch(/\binvalidated\b/);
    expect(dialogText).not.toMatch(/\binconclusive\b/);
    expect(dialogText).not.toMatch(/\bfollow_up\b/);
    expect(dialogText).not.toContain('Workspace');
  });
});
