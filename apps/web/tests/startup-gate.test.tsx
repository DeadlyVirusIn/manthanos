// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E2 — StartupGate: gates the app until ready, shows a one-time
// first-run payoff, reveals the app for returning users, and shows a
// friendly F-card on probe failure. Probe + storage are injected.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReadinessResult } from '../src/hooks/useStartupReadiness.js';
import { ONBOARDED_KEY, StartupGate } from '../src/layout/StartupGate.js';

afterEach(cleanup);

function memoryStore(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

const okProbe = (): Promise<ReadinessResult> => Promise.resolve({ ok: true });

function Child(): JSX.Element {
  return <div data-testid="app-child">the app</div>;
}

describe('StartupGate', () => {
  it('shows the readiness screen while probing, not the app', () => {
    const pending = new Promise<ReadinessResult>(() => {});
    render(
      <StartupGate probe={() => pending} storage={memoryStore()}>
        <Child />
      </StartupGate>,
    );
    expect(screen.getByTestId('readiness-splash')).toBeTruthy();
    expect(screen.queryByTestId('app-child')).toBeNull();
  });

  it('first run: reveals the payoff, then the app after "Show me" (and records it)', async () => {
    const store = memoryStore();
    render(
      <StartupGate probe={okProbe} storage={store}>
        <Child />
      </StartupGate>,
    );
    await waitFor(() => expect(screen.getByTestId('startup-payoff')).toBeTruthy());
    expect(screen.queryByTestId('app-child')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('startup-payoff-cta'));
    });
    expect(screen.getByTestId('app-child')).toBeTruthy();
    expect(store.getItem(ONBOARDED_KEY)).toBe('true');
  });

  it('returning user: skips the payoff and reveals the app directly', async () => {
    render(
      <StartupGate probe={okProbe} storage={memoryStore({ [ONBOARDED_KEY]: 'true' })}>
        <Child />
      </StartupGate>,
    );
    await waitFor(() => expect(screen.getByTestId('app-child')).toBeTruthy());
    expect(screen.queryByTestId('startup-payoff')).toBeNull();
  });

  it('localStorage unavailable: payoff still dismisses into the app (setItem failure is non-fatal)', async () => {
    const throwingStore: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled');
      },
    };
    render(
      <StartupGate probe={okProbe} storage={throwingStore}>
        <Child />
      </StartupGate>,
    );
    await waitFor(() => expect(screen.getByTestId('startup-payoff')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('startup-payoff-cta'));
    });
    // The session continues even though the flag couldn't be persisted.
    expect(screen.getByTestId('app-child')).toBeTruthy();
  });

  it('R1: a throwing getItem degrades to first run instead of crashing render', async () => {
    const throwingGetStore: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('storage access denied');
      },
      setItem: () => undefined,
    };
    // Must not throw during render; treats the user as first-run.
    render(
      <StartupGate probe={okProbe} storage={throwingGetStore}>
        <Child />
      </StartupGate>,
    );
    await waitFor(() => expect(screen.getByTestId('startup-payoff')).toBeTruthy());
  });

  it('probe failure: shows a friendly F-card, not the app', async () => {
    render(
      <StartupGate
        probe={() => Promise.resolve({ ok: false, errorId: 'F1' })}
        storage={memoryStore()}
      >
        <Child />
      </StartupGate>,
    );
    await waitFor(() => expect(screen.getByTestId('startup-error-card')).toBeTruthy());
    expect(screen.getByTestId('startup-error-card').getAttribute('data-error-id')).toBe('F1');
    expect(screen.queryByTestId('app-child')).toBeNull();
  });

  it('default probe targets the /api-routed health endpoint, not bare /health (C1)', async () => {
    // No injected probe → exercises defaultHealthProbe. The probe must hit an
    // /api-prefixed path (forwarded to the daemon by the Vite proxy); a bare
    // /health would hit the Vite server and falsely read as reachable.
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchSpy);
    try {
      render(
        <StartupGate storage={memoryStore({ [ONBOARDED_KEY]: 'true' })}>
          <Child />
        </StartupGate>,
      );
      await waitFor(() => expect(screen.getByTestId('app-child')).toBeTruthy());
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/health');
      expect(fetchSpy).not.toHaveBeenCalledWith('/health');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
