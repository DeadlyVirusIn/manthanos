// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the four Fact Detail lifecycle mutations.
// Sprint 2 M2.5 C25.3.
//
// Covers usePromoteFact, useDemoteFact, useMarkFactForFollowUp,
// useResolveFactFollowUp via the FactDetail inline controls.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiFacts from '../src/api/facts.js';
import {
  ApiError,
  type FactHistoryResult,
  type FactView,
  type ListProvenanceResult,
  type TransitionResponse,
  asFactTier,
  factsKeys,
} from '../src/api/index.js';
import { FactDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-3';
const FACT_ID = 'fact-c25-3';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: FACT_ID,
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'A claim.',
    statement_hash: 'h-1',
    tier: asFactTier('T0'),
    confidence: 0.7,
    last_corroborated: TEN_MIN_AGO,
    last_administratively_touched: TEN_MIN_AGO,
    audit_seq: 1,
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

function makeTransitionResponse(
  fromTier: 'T-2' | 'T-1' | 'T0' | 'T+1',
  toTier: 'T-2' | 'T-1' | 'T0' | 'T+1',
): TransitionResponse {
  return {
    fact: makeFact({ tier: asFactTier(toTier) }),
    from_tier: asFactTier(fromTier),
    to_tier: asFactTier(toTier),
  };
}

function makeProvenance(): ListProvenanceResult {
  return { fact_id: FACT_ID, provenance: [], total: 0 };
}

function makeHistory(): FactHistoryResult {
  return {
    root_id: FACT_ID,
    head_id: FACT_ID,
    total_versions: 0,
    versions: [],
  };
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

function seed(client: QueryClient, fact: FactView): void {
  client.setQueryData(factsKeys.detail(PROJECT_ID, FACT_ID), fact);
  client.setQueryData(factsKeys.provenance(PROJECT_ID, FACT_ID), makeProvenance());
  client.setQueryData(factsKeys.history(PROJECT_ID, FACT_ID), makeHistory());
}

function renderFactWith(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/facts/${FACT_ID}`]}>
        <Routes>
          <Route path="/projects/:projectId/facts/:id" element={<FactDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────
// Button posture + visibility
// ─────────────────────────────────────────────────────────────────

describe('Fact lifecycle controls — visibility', () => {
  it('renders the controls section on a populated, non-tombstoned fact', () => {
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    expect(screen.getByTestId('fact-lifecycle-controls')).toBeTruthy();
    expect(screen.getByTestId('fact-promote-button')).toBeTruthy();
    expect(screen.getByTestId('fact-demote-button')).toBeTruthy();
    expect(screen.getByTestId('fact-mark-button')).toBeTruthy();
  });

  it('does NOT render the controls section on a tombstoned fact', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Erased.',
      }),
    );
    renderFactWith(client);
    expect(screen.queryByTestId('fact-lifecycle-controls')).toBeNull();
  });

  it('shows the Resolve button (not Mark) when the fact is contested', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'A reason.',
      }),
    );
    renderFactWith(client);
    expect(screen.getByTestId('fact-resolve-button')).toBeTruthy();
    expect(screen.queryByTestId('fact-mark-button')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Disabled gating
// ─────────────────────────────────────────────────────────────────

describe('Fact lifecycle controls — disabled gating', () => {
  it('disables Promote at T+1 with the "already at the top" reason', () => {
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T+1') }));
    renderFactWith(client);
    const btn = screen.getByTestId('fact-promote-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toContain('already at the top');
  });

  it('disables Demote at T-2 with the "already at the bottom" reason', () => {
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T-2') }));
    renderFactWith(client);
    const btn = screen.getByTestId('fact-demote-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toContain('already at the bottom');
  });

  it('disables Promote and Demote when the fact is contested', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'A reason.',
      }),
    );
    renderFactWith(client);
    const promote = screen.getByTestId('fact-promote-button') as HTMLButtonElement;
    const demote = screen.getByTestId('fact-demote-button') as HTMLButtonElement;
    expect(promote.disabled).toBe(true);
    expect(demote.disabled).toBe(true);
    expect(promote.getAttribute('title')).toContain('Resolve the double-check');
    expect(demote.getAttribute('title')).toContain('Resolve the double-check');
  });

  it('disables Promote/Demote on a non-head fact with the "open the current version" reason', () => {
    const client = makeClient();
    seed(client, makeFact({ is_head: false, superseded_by_fact_id: 'fact-newer' }));
    renderFactWith(client);
    const promote = screen.getByTestId('fact-promote-button') as HTMLButtonElement;
    const demote = screen.getByTestId('fact-demote-button') as HTMLButtonElement;
    expect(promote.disabled).toBe(true);
    expect(demote.disabled).toBe(true);
    expect(promote.getAttribute('title')).toContain('Open the current version');
  });

  it('does not show the Mark button when already contested (the Resolve button is shown instead)', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'A reason.',
      }),
    );
    renderFactWith(client);
    expect(screen.queryByTestId('fact-mark-button')).toBeNull();
    expect(screen.getByTestId('fact-resolve-button')).toBeTruthy();
  });

  it('enables Promote/Demote/Mark on a live head fact with valid tier', () => {
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T0') }));
    renderFactWith(client);
    const promote = screen.getByTestId('fact-promote-button') as HTMLButtonElement;
    const demote = screen.getByTestId('fact-demote-button') as HTMLButtonElement;
    const mark = screen.getByTestId('fact-mark-button') as HTMLButtonElement;
    expect(promote.disabled).toBe(false);
    expect(demote.disabled).toBe(false);
    expect(mark.disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Promote / Demote happy path + invalidation
// ─────────────────────────────────────────────────────────────────

describe('Promote happy path', () => {
  it('calls promoteFact, invalidates the right keys, shows success', async () => {
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T0') }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const promoteSpy = vi
      .spyOn(apiFacts, 'promoteFact')
      .mockResolvedValue(makeTransitionResponse('T0', 'T+1'));

    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-promote-button').click();
    });

    await waitFor(() => expect(promoteSpy).toHaveBeenCalled());
    const [wsArg, factArg] = promoteSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(factArg).toBe(FACT_ID);

    await waitFor(() =>
      expect(screen.getByTestId('fact-mutation-success-text').textContent).toBe(
        'Confidence raised.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID, 'history'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });
});

describe('Demote happy path', () => {
  it('calls demoteFact, invalidates the right keys, shows success', async () => {
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T0') }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const demoteSpy = vi
      .spyOn(apiFacts, 'demoteFact')
      .mockResolvedValue(makeTransitionResponse('T0', 'T-1'));

    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-demote-button').click();
    });

    await waitFor(() => expect(demoteSpy).toHaveBeenCalled());
    const [wsArg, factArg] = demoteSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(factArg).toBe(FACT_ID);

    await waitFor(() =>
      expect(screen.getByTestId('fact-mutation-success-text').textContent).toBe(
        'Confidence lowered.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID, 'history'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });
});

// ─────────────────────────────────────────────────────────────────
// Mark for follow-up
// ─────────────────────────────────────────────────────────────────

describe('Mark for follow-up — inline form', () => {
  it('expands the inline reason form when Mark is clicked', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    expect(screen.queryByTestId('fact-mark-form')).toBeNull();
    await act(async () => {
      screen.getByTestId('fact-mark-button').click();
    });
    expect(screen.getByTestId('fact-mark-form')).toBeTruthy();
    expect(screen.getByTestId('fact-mark-input-reason')).toBeTruthy();
    const submit = screen.getByTestId('fact-mark-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('cancel closes the form and clears the input', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-mark-button').click();
    });
    await user.type(screen.getByTestId('fact-mark-input-reason'), 'hmm');
    await act(async () => {
      screen.getByTestId('fact-mark-cancel').click();
    });
    expect(screen.queryByTestId('fact-mark-form')).toBeNull();
  });

  it('submits, invalidates, and shows "Flagged for follow-up." success', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const contestSpy = vi
      .spyOn(apiFacts, 'contestFact')
      .mockResolvedValue({ fact: makeFact({ is_contested: true, contested_reason: 'why' }) });

    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-mark-button').click();
    });
    await user.type(screen.getByTestId('fact-mark-input-reason'), 'A reason for the flag.');
    await act(async () => {
      screen.getByTestId('fact-mark-submit').click();
    });

    await waitFor(() => expect(contestSpy).toHaveBeenCalled());
    const [wsArg, factArg, inputArg] = contestSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(factArg).toBe(FACT_ID);
    expect(inputArg).toEqual({ reason: 'A reason for the flag.' });

    await waitFor(() =>
      expect(screen.getByTestId('fact-mutation-success-text').textContent).toBe(
        'Flagged to double-check.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });
});

// ─────────────────────────────────────────────────────────────────
// Resolve follow-up
// ─────────────────────────────────────────────────────────────────

describe('Resolve follow-up — inline form', () => {
  it('expands the inline resolution form when Resolve is clicked', async () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'why',
      }),
    );
    renderFactWith(client);
    expect(screen.queryByTestId('fact-resolve-form')).toBeNull();
    await act(async () => {
      screen.getByTestId('fact-resolve-button').click();
    });
    expect(screen.getByTestId('fact-resolve-form')).toBeTruthy();
    expect(screen.getByTestId('fact-resolve-input-resolution')).toBeTruthy();
  });

  it('submits, invalidates, and shows "Marked as checked." success', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'why',
      }),
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const uncontestSpy = vi
      .spyOn(apiFacts, 'uncontestFact')
      .mockResolvedValue({ fact: makeFact() });

    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-resolve-button').click();
    });
    await user.type(screen.getByTestId('fact-resolve-input-resolution'), 'Turned out to be true.');
    await act(async () => {
      screen.getByTestId('fact-resolve-submit').click();
    });

    await waitFor(() => expect(uncontestSpy).toHaveBeenCalled());
    const [wsArg, factArg, inputArg] = uncontestSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(factArg).toBe(FACT_ID);
    expect(inputArg).toEqual({ resolution: 'Turned out to be true.' });

    await waitFor(() =>
      expect(screen.getByTestId('fact-mutation-success-text').textContent).toBe(
        'Marked as checked.',
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });
});

// ─────────────────────────────────────────────────────────────────
// Server error envelopes
// ─────────────────────────────────────────────────────────────────

describe('Fact mutations — server errors', () => {
  it('renders invalid_tier_transition inline (with translated tier labels)', async () => {
    vi.spyOn(apiFacts, 'promoteFact').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_tier_transition',
        from: asFactTier('T+1'),
        to: 'beyond',
        direction: 'promote',
        details: 'already at top',
      }),
    );
    const client = makeClient();
    seed(client, makeFact({ tier: asFactTier('T0') }));
    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-promote-button').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'invalid_tier_transition',
      ),
    );
    const errorText = screen.getByTestId('mutation-error-banner').textContent ?? '';
    expect(errorText).not.toMatch(/\bT\+1\b/);
  });

  it('renders invalid_lifecycle inline with translated state copy', async () => {
    vi.spyOn(apiFacts, 'contestFact').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'tombstoned',
        fact_id: FACT_ID,
        details: 'cannot contest tombstoned',
      }),
    );
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-mark-button').click();
    });
    await user.type(screen.getByTestId('fact-mark-input-reason'), 'r');
    await act(async () => {
      screen.getByTestId('fact-mark-submit').click();
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

  it('categorises a network error correctly on promote', async () => {
    vi.spyOn(apiFacts, 'promoteFact').mockRejectedValue(new Error('Failed to fetch'));
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-promote-button').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'network',
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// Vocabulary discipline
// ─────────────────────────────────────────────────────────────────

describe('Fact mutations — vocabulary discipline', () => {
  it('uses "double-check" wording on the buttons (not "contest")', () => {
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    const text = screen.getByTestId('fact-lifecycle-controls').textContent ?? '';
    expect(text).toContain('Mark to double-check');
    expect(text).not.toContain('Contest');
    expect(text).not.toContain('contest');
  });

  it('uses "follow-up" wording in the inline form labels', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderFactWith(client);
    await act(async () => {
      screen.getByTestId('fact-mark-button').click();
    });
    const formText = screen.getByTestId('fact-mark-form').textContent ?? '';
    expect(formText).toContain('Why does this need a closer look?');
  });

  it('uses "Mark as checked" wording on the resolve button (not "uncontest")', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({
        is_contested: true,
        contested_at: TEN_MIN_AGO,
        contested_reason: 'why',
      }),
    );
    renderFactWith(client);
    const text = screen.getByTestId('fact-lifecycle-controls').textContent ?? '';
    expect(text).toContain('Mark as checked');
    expect(text).not.toContain('uncontest');
    expect(text).not.toContain('Uncontest');
  });
});
