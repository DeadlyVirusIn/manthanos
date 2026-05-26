// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E2 — useStartupReadiness state-machine tests. Latency gating is
// driven with fake timers; the probe is injected.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ReadinessResult,
  type ReadinessTiming,
  useStartupReadiness,
} from '../src/hooks/useStartupReadiness.js';

const TIMING: ReadinessTiming = { panelDelayMs: 400, slowStartMs: 8_000, ceilingMs: 30_000 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A probe whose resolution the test controls. */
function deferred(): {
  probe: () => Promise<ReadinessResult>;
  resolve: (r: ReadinessResult) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (r: ReadinessResult) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<ReadinessResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { probe: () => p, resolve, reject };
}

describe('useStartupReadiness', () => {
  it('reaches ready quickly without showing the panel (fast path)', async () => {
    const { result } = renderHook(() =>
      useStartupReadiness({ probe: () => Promise.resolve({ ok: true }), timing: TIMING }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.showPanel).toBe(false);
    expect(result.current.slowStart).toBe(false);
  });

  it('reveals the panel after panelDelayMs while still probing', async () => {
    const d = deferred();
    const { result } = renderHook(() => useStartupReadiness({ probe: d.probe, timing: TIMING }));
    expect(result.current.showPanel).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('probing');
    expect(result.current.showPanel).toBe(true);
    expect(result.current.slowStart).toBe(false);
  });

  it('shows slow-start reassurance after slowStartMs', async () => {
    const d = deferred();
    const { result } = renderHook(() => useStartupReadiness({ probe: d.probe, timing: TIMING }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(result.current.slowStart).toBe(true);
    expect(result.current.status).toBe('probing');
  });

  it('falls back to F8 at the hard ceiling', async () => {
    const d = deferred();
    const { result } = renderHook(() => useStartupReadiness({ probe: d.probe, timing: TIMING }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.errorId).toBe('F8');
  });

  it('maps a not-ok probe to its friendly card', async () => {
    const { result } = renderHook(() =>
      useStartupReadiness({
        probe: () => Promise.resolve({ ok: false, errorId: 'F4' }),
        timing: TIMING,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.errorId).toBe('F4');
  });

  it('R2: normalizes a malformed not-ok result to F8 immediately (not at the ceiling)', async () => {
    const { result } = renderHook(() =>
      useStartupReadiness({
        // Type-violating result: not ok, but no valid errorId.
        probe: () => Promise.resolve({ ok: false } as never),
        timing: TIMING,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.errorId).toBe('F8');
  });

  it('maps a thrown probe to F1 (engine did not start)', async () => {
    const { result } = renderHook(() =>
      useStartupReadiness({ probe: () => Promise.reject(new Error('down')), timing: TIMING }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.errorId).toBe('F1');
  });

  it('does not set state (or warn) when unmounted mid-probe', async () => {
    const d = deferred();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useStartupReadiness({ probe: d.probe, timing: TIMING }));
    unmount();
    await act(async () => {
      d.resolve({ ok: true });
      await Promise.resolve();
    });
    // The active-flag guard + clearTimeout cleanup mean no post-unmount
    // setState, so React emits no act/update-on-unmounted warning.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('retry re-runs the probe from the start', async () => {
    let outcome: ReadinessResult = { ok: false, errorId: 'F1' };
    const { result } = renderHook(() =>
      useStartupReadiness({ probe: () => Promise.resolve(outcome), timing: TIMING }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');

    outcome = { ok: true };
    await act(async () => {
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.errorId).toBeNull();
  });
});
