// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for useMutationStatus. Sprint 2 M2.5 C25.1.
//
// Verifies the framework hook: invalidation list, success-message
// lifecycle, error categorisation, reset semantics.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/api/index.js';
import { useMutationStatus } from '../src/hooks/index.js';

function makeWrapper(client: QueryClient): (props: { children: ReactNode }) => JSX.Element {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

interface ProbeProps<TInput, TResult> {
  readonly mutationFn: (input: TInput) => Promise<TResult>;
  readonly invalidates: (input: TInput, result: TResult) => readonly unknown[][];
  readonly input: TInput;
  readonly successMessage: string;
}

function Probe<TInput, TResult>(props: ProbeProps<TInput, TResult>): JSX.Element {
  const status = useMutationStatus<TInput, TResult>({
    mutationFn: props.mutationFn,
    invalidates: (i, r) => props.invalidates(i, r),
    successMessage: props.successMessage,
  });
  return (
    <div>
      <button type="button" data-testid="probe-mutate" onClick={() => status.mutate(props.input)}>
        go
      </button>
      <button type="button" data-testid="probe-reset" onClick={status.reset}>
        reset
      </button>
      <button type="button" data-testid="probe-dismiss-success" onClick={status.dismissSuccess}>
        dismiss
      </button>
      <span data-testid="probe-status">{status.status}</span>
      <span data-testid="probe-success">{status.successMessage ?? ''}</span>
      <span data-testid="probe-category">{status.errorCategory ?? ''}</span>
      <span data-testid="probe-error">{status.error?.message ?? ''}</span>
    </div>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('useMutationStatus — happy path', () => {
  it('calls the mutationFn, invalidates keys, and sets the success message', async () => {
    const client = newClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const mutationFn = vi.fn().mockResolvedValue({ id: 'created' });
    render(
      <Probe
        mutationFn={mutationFn}
        invalidates={() => [
          ['conversations', 'list', 'proj-1'],
          ['audit', 'list', 'proj-1'],
        ]}
        input={{ person_name: 'Alice' }}
        successMessage="Captured."
      />,
      { wrapper: makeWrapper(client) },
    );

    expect(screen.getByTestId('probe-status').textContent).toBe('idle');

    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-status').textContent).toBe('success'));

    // React Query v5's mutationFn receives (variables) plus an opaque
    // context — assert by first-arg only.
    expect(mutationFn).toHaveBeenCalled();
    expect(mutationFn.mock.calls[0]?.[0]).toEqual({ person_name: 'Alice' });
    expect(screen.getByTestId('probe-success').textContent).toBe('Captured.');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations', 'list', 'proj-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'list', 'proj-1'] });
  });

  it('exposes status="submitting" while the mutation is pending', async () => {
    const client = newClient();
    let resolve: ((v: { id: string }) => void) | null = null;
    const pending = new Promise<{ id: string }>((r) => {
      resolve = r;
    });
    const mutationFn = vi.fn().mockReturnValue(pending);
    render(
      <Probe mutationFn={mutationFn} invalidates={() => []} input={{}} successMessage="Done." />,
      { wrapper: makeWrapper(client) },
    );
    act(() => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-status').textContent).toBe('submitting'));
    await act(async () => {
      resolve?.({ id: 'r' });
      await pending;
    });
    await waitFor(() => expect(screen.getByTestId('probe-status').textContent).toBe('success'));
  });
});

describe('useMutationStatus — error categorisation', () => {
  it.each([
    ['validation', { error: 'validation', field: 'x', details: 'd' }],
    ['not_found', { error: 'not_found' }],
    ['invalid_lifecycle', { error: 'invalid_lifecycle', state: 'tombstoned' }],
    ['duplicate_fact', { error: 'duplicate_fact', existing_fact_id: 'f', details: 'd' }],
    ['invalid_tier_transition', { error: 'invalid_tier_transition', from: 'T0', to: 'T+2' }],
  ])('categorises ApiError envelope %s', async (expected, body) => {
    const client = newClient();
    const mutationFn = vi.fn().mockRejectedValue(new ApiError(409, 'x', '/api', body));
    render(<Probe mutationFn={mutationFn} invalidates={() => []} input={{}} successMessage="-" />, {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-status').textContent).toBe('error'));
    expect(screen.getByTestId('probe-category').textContent).toBe(expected);
  });

  it('categorises a fetch-style Error as network', async () => {
    const client = newClient();
    const mutationFn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    render(<Probe mutationFn={mutationFn} invalidates={() => []} input={{}} successMessage="-" />, {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-category').textContent).toBe('network'));
  });

  it('falls back to unknown for a plain Error', async () => {
    const client = newClient();
    const mutationFn = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Probe mutationFn={mutationFn} invalidates={() => []} input={{}} successMessage="-" />, {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-category').textContent).toBe('unknown'));
    expect(screen.getByTestId('probe-error').textContent).toBe('boom');
  });
});

describe('useMutationStatus — reset and dismiss', () => {
  it('reset() clears error state', async () => {
    const client = newClient();
    const mutationFn = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Probe mutationFn={mutationFn} invalidates={() => []} input={{}} successMessage="-" />, {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-status').textContent).toBe('error'));
    act(() => {
      screen.getByTestId('probe-reset').click();
    });
    expect(screen.getByTestId('probe-status').textContent).toBe('idle');
    expect(screen.getByTestId('probe-category').textContent).toBe('');
    expect(screen.getByTestId('probe-success').textContent).toBe('');
  });

  it('dismissSuccess() clears only the success message, not status', async () => {
    const client = newClient();
    const mutationFn = vi.fn().mockResolvedValue({});
    render(
      <Probe
        mutationFn={mutationFn}
        invalidates={() => []}
        input={{}}
        successMessage="Captured."
      />,
      { wrapper: makeWrapper(client) },
    );
    await act(async () => {
      screen.getByTestId('probe-mutate').click();
    });
    await waitFor(() => expect(screen.getByTestId('probe-success').textContent).toBe('Captured.'));
    act(() => {
      screen.getByTestId('probe-dismiss-success').click();
    });
    expect(screen.getByTestId('probe-success').textContent).toBe('');
    // status is still success — only the message was dismissed
    expect(screen.getByTestId('probe-status').textContent).toBe('success');
  });
});

describe('useMutationStatus — successMessage builder function', () => {
  it('accepts a function that builds the message from the result', async () => {
    const client = newClient();
    const mutationFn = vi.fn().mockResolvedValue({ id: 'new-conv' });

    function FnProbe(): JSX.Element {
      const status = useMutationStatus<unknown, { id: string }>({
        mutationFn,
        invalidates: () => [],
        successMessage: (r) => `Captured ${r.id}.`,
      });
      return (
        <div>
          <button type="button" data-testid="fn-go" onClick={() => status.mutate({})}>
            go
          </button>
          <span data-testid="fn-success">{status.successMessage ?? ''}</span>
        </div>
      );
    }

    render(<FnProbe />, { wrapper: makeWrapper(client) });
    await act(async () => {
      screen.getByTestId('fn-go').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('fn-success').textContent).toBe('Captured new-conv.'),
    );
  });
});
