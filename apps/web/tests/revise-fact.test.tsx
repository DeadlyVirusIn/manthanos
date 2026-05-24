// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Revise Fact flow. Sprint 2 M2.5 C25.6.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiFacts from '../src/api/facts.js';
import {
  ApiError,
  type FactHistoryResult,
  type FactView,
  type ListProvenanceResult,
  type ReviseFactResponse,
  asFactTier,
  factsKeys,
} from '../src/api/index.js';
import { FactDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c25-6';
const FACT_ID = 'fact-c25-6';
const NEW_FACT_ID = 'fact-c25-6-v2';
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

function makeReviseResponse(
  newId: string = NEW_FACT_ID,
  overrides: Partial<FactView> = {},
): ReviseFactResponse {
  return {
    fact: makeFact({ id: newId, statement: 'An updated claim.', ...overrides }),
    previous_fact_id: FACT_ID,
    version_chain_root_id: FACT_ID,
  };
}

function makeProvenance(): ListProvenanceResult {
  return { fact_id: FACT_ID, provenance: [], total: 0 };
}

function makeHistory(): FactHistoryResult {
  return { root_id: FACT_ID, head_id: FACT_ID, total_versions: 0, versions: [] };
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

// Reports current router pathname so tests can assert post-success
// navigation to the new fact id.
function LocationReporter(): JSX.Element {
  const location = useLocation();
  return <div data-testid="route-pathname">{location.pathname}</div>;
}

function renderWith(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/facts/${FACT_ID}`]}>
        <LocationReporter />
        <Routes>
          <Route path="/projects/:projectId/facts/:id" element={<FactDetail />} />
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

describe('Revise Fact — button visibility', () => {
  it('renders "Make a new version" on a head, non-tombstoned, non-superseded fact', () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    const btn = screen.getByTestId('fact-revise-button');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.textContent).toContain('Make a new version');
  });

  it('does NOT render on a tombstoned fact', () => {
    const client = makeClient();
    seed(
      client,
      makeFact({ is_tombstoned: true, tombstoned_at: TEN_MIN_AGO, tombstone_reason: 'Erased.' }),
    );
    renderWith(client);
    expect(screen.getByTestId('fact-detail-tombstoned')).toBeTruthy();
    expect(screen.queryByTestId('fact-revise-button')).toBeNull();
  });

  it('does NOT render when the fact has been superseded', () => {
    const client = makeClient();
    seed(client, makeFact({ superseded_by_fact_id: NEW_FACT_ID, is_head: false }));
    renderWith(client);
    expect(screen.queryByTestId('fact-revise-button')).toBeNull();
  });

  it('opens the dialog when the button is clicked', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe(
      'Make a new version of this insight?',
    );
  });
});

describe('Revise Fact — pre-fill + form rendering', () => {
  it('pre-fills area and statement from the current fact', async () => {
    const client = makeClient();
    seed(client, makeFact({ area: 'pricing', statement: 'They will pay $50.' }));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    const areaInput = screen.getByTestId('revise-fact-input-area') as HTMLInputElement;
    const statementInput = screen.getByTestId('revise-fact-input-statement') as HTMLTextAreaElement;
    expect(areaInput.value).toBe('pricing');
    expect(statementInput.value).toBe('They will pay $50.');
  });

  it('renders explainer + optional note field; submit starts disabled', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    expect(screen.getByTestId('revise-fact-explainer')).toBeTruthy();
    expect(screen.getByTestId('revise-fact-field-area')).toBeTruthy();
    expect(screen.getByTestId('revise-fact-field-statement')).toBeTruthy();
    expect(screen.getByTestId('revise-fact-field-note')).toBeTruthy();
    expect(screen.getByTestId('revise-fact-input-note')).toBeTruthy();
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe('Revise Fact — submit gating (at least one changed field)', () => {
  it('keeps submit disabled with no edits', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables submit when only the area changes', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-area'));
    await user.type(screen.getByTestId('revise-fact-input-area'), 'new_area');
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('enables submit when only the statement changes', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'A revised claim.');
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('keeps submit disabled when only whitespace was added (trimmed equality)', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.type(screen.getByTestId('revise-fact-input-area'), '   ');
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('keeps submit disabled when a field is cleared (no empty fields allowed)', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe('Revise Fact — cache pre-seed (P0 fix)', () => {
  it('pre-seeds the new fact detail cache before navigation completes', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => undefined);
    const responseFact = makeFact({ id: NEW_FACT_ID, statement: 'New version body.' });
    vi.spyOn(apiFacts, 'reviseFact').mockResolvedValue({
      fact: responseFact,
      previous_fact_id: FACT_ID,
      version_chain_root_id: FACT_ID,
    });
    renderWith(client);
    expect(client.getQueryData(factsKeys.detail(PROJECT_ID, NEW_FACT_ID))).toBeUndefined();
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'New version body.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(client.getQueryData(factsKeys.detail(PROJECT_ID, NEW_FACT_ID))).toEqual(responseFact),
    );
  });
});

describe('Revise Fact — happy path + navigation', () => {
  it('sends only changed fields, invalidates, navigates to new id', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact({ area: 'pricing', statement: 'They will pay $50.' }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const reviseSpy = vi
      .spyOn(apiFacts, 'reviseFact')
      .mockResolvedValue(makeReviseResponse(NEW_FACT_ID));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'They will pay $75.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(reviseSpy).toHaveBeenCalled());
    const [wsArg, factArg, inputArg] = reviseSpy.mock.calls[0] ?? [];
    expect(wsArg).toBe(PROJECT_ID);
    expect(factArg).toBe(FACT_ID);
    expect(inputArg).toEqual({ statement: 'They will pay $75.' });
    expect((inputArg as { area?: string }).area).toBeUndefined();

    await waitFor(() =>
      expect(screen.getByTestId('route-pathname').textContent).toBe(
        `/projects/${PROJECT_ID}/facts/${NEW_FACT_ID}`,
      ),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'detail', PROJECT_ID, FACT_ID, 'history'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['facts', 'list', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['facts', 'areas', PROJECT_ID, null],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', PROJECT_ID] });
  });

  it('includes optional note in the request when typed', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    const reviseSpy = vi.spyOn(apiFacts, 'reviseFact').mockResolvedValue(makeReviseResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Updated claim.');
    await user.type(screen.getByTestId('revise-fact-input-note'), 'New evidence.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(reviseSpy).toHaveBeenCalled());
    const [, , inputArg] = reviseSpy.mock.calls[0] ?? [];
    expect((inputArg as { note?: string }).note).toBe('New evidence.');
  });

  it('omits note when only whitespace was typed', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    const reviseSpy = vi.spyOn(apiFacts, 'reviseFact').mockResolvedValue(makeReviseResponse());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Updated claim.');
    await user.type(screen.getByTestId('revise-fact-input-note'), '   ');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(reviseSpy).toHaveBeenCalled());
    const [, , inputArg] = reviseSpy.mock.calls[0] ?? [];
    expect((inputArg as { note?: string }).note).toBeUndefined();
  });

  it('does NOT navigate if the response returns the same fact id', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    seed(client, makeFact());
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => undefined);
    vi.spyOn(apiFacts, 'reviseFact').mockResolvedValue(makeReviseResponse(FACT_ID));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Same id, new text.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.queryByTestId('mutation-dialog')).toBeNull());
    expect(screen.getByTestId('route-pathname').textContent).toBe(
      `/projects/${PROJECT_ID}/facts/${FACT_ID}`,
    );
  });
});

describe('Revise Fact — error envelopes', () => {
  it('renders duplicate_fact inline (dialog stays open)', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiFacts, 'reviseFact').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'duplicate_fact',
        existing_fact_id: 'fact-existing-123',
        details: 'A fact with this statement already exists.',
      }),
    );
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Conflicting claim.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('mutation-error-category').getAttribute('data-category')).toBe(
        'duplicate_fact',
      ),
    );
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
  });

  it('renders invalid_lifecycle (tombstoned) with translated copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiFacts, 'reviseFact').mockRejectedValue(
      new ApiError(409, '409', '/api', {
        error: 'invalid_lifecycle',
        state: 'tombstoned',
        fact_id: FACT_ID,
        details: 'Cannot revise an erased fact.',
      }),
    );
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'New claim.');
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
    const user = userEvent.setup();
    vi.spyOn(apiFacts, 'reviseFact').mockRejectedValue(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Updated.');
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
    vi.spyOn(apiFacts, 'reviseFact').mockRejectedValue(new Error('Failed to fetch'));
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Updated.');
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

describe('Revise Fact — F.3 reset on open', () => {
  it('resets fields to current values and clears prior error on reopen', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiFacts, 'reviseFact').mockRejectedValueOnce(
      new ApiError(404, '404', '/api', { error: 'not_found' }),
    );
    const client = makeClient();
    seed(client, makeFact({ statement: 'Original claim.' }));
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    await user.clear(screen.getByTestId('revise-fact-input-statement'));
    await user.type(screen.getByTestId('revise-fact-input-statement'), 'Edited claim.');
    await user.type(screen.getByTestId('revise-fact-input-note'), 'Note text.');
    await act(async () => {
      screen.getByTestId('mutation-dialog-submit').click();
    });
    await waitFor(() => expect(screen.getByTestId('mutation-error-banner')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('mutation-dialog-cancel').click();
    });
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
    const statement = screen.getByTestId('revise-fact-input-statement') as HTMLTextAreaElement;
    expect(statement.value).toBe('Original claim.');
    const note = screen.getByTestId('revise-fact-input-note') as HTMLTextAreaElement;
    expect(note.value).toBe('');
  });
});

describe('Revise Fact — vocabulary discipline', () => {
  it('never renders raw substrate keys or ISO timestamps in the dialog', async () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    await act(async () => {
      screen.getByTestId('fact-revise-button').click();
    });
    const visible = visibleText(screen.getByTestId('mutation-dialog'));
    expect(visible).not.toMatch(/\bsuperseded\b/);
    expect(visible).not.toMatch(/\btombstoned?\b/);
    expect(visible).not.toMatch(/\bcontested\b/);
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('button copy says "Make a new version", never "Revise"', () => {
    const client = makeClient();
    seed(client, makeFact());
    renderWith(client);
    const btn = screen.getByTestId('fact-revise-button');
    expect(btn.textContent).toContain('Make a new version');
    expect(btn.textContent).not.toMatch(/\bRevise\b/);
  });
});
