// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// StartupGate — C4.4-E2 (design: C4_3 §1, §5).
//
// Wraps the app: shows the ReadinessScreen until the startup probe says the
// app can render, then reveals the app. On first run it shows a one-time
// payoff moment (C4.1.1 §6) that dismisses into the app — never a standalone
// "Ready" screen.
//
// SCOPE (first E2 slice): the probe is minimal — it only verifies the local
// engine is reachable and the app can proceed to render. It is NOT coupled
// to demo-Project existence; "first run" is tracked via a local flag, not
// demo state. Demo ensure/seed integration is a later slice.

import { useCallback, useMemo, useState } from 'react';

import {
  type ReadinessResult,
  type ReadinessTiming,
  useStartupReadiness,
} from '../hooks/useStartupReadiness.js';
import { PAYOFF_COPY } from '../startup/startupCopy.js';
import { ReadinessScreen } from './ReadinessScreen.js';

/** Local flag recording that the user has seen the first-run payoff. Not
 *  demo state — just "has this person been welcomed before". */
export const ONBOARDED_KEY = 'manthanos.onboarded';

/** Minimal default probe: the local engine is reachable ⇒ the app can
 *  render. No demo-Project coupling in this slice. */
async function defaultHealthProbe(): Promise<ReadinessResult> {
  try {
    // /api-prefixed so the Vite dev proxy forwards it to the daemon; a bare
    // /health would hit the Vite server and falsely read as reachable (C1).
    const res = await fetch('/api/v1/health');
    return res.ok ? { ok: true } : { ok: false, errorId: 'F1' };
  } catch {
    return { ok: false, errorId: 'F1' };
  }
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Read a key without ever throwing during render. Some privacy modes
 *  expose `localStorage` but throw on access (R1 hardening). */
function safeGetItem(store: Pick<Storage, 'getItem'> | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export interface StartupGateProps {
  readonly children: React.ReactNode;
  /** Injectable for tests; defaults to a minimal /health probe. */
  readonly probe?: () => Promise<ReadinessResult>;
  readonly timing?: ReadinessTiming;
  readonly prefersReducedMotion?: boolean;
  /** Injectable for tests; defaults to window.localStorage. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

export function StartupGate({
  children,
  probe,
  timing,
  prefersReducedMotion,
  storage,
}: StartupGateProps): JSX.Element {
  const store = useMemo<Pick<Storage, 'getItem' | 'setItem'> | null>(() => {
    if (storage !== undefined) return storage;
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }, [storage]);

  const reducedMotion = prefersReducedMotion ?? detectReducedMotion();
  const probeFn = useMemo(() => probe ?? defaultHealthProbe, [probe]);

  // Read once: has this person seen the welcome before?
  const [onboarded, setOnboarded] = useState(() => safeGetItem(store, ONBOARDED_KEY) === 'true');

  const readiness = useStartupReadiness({ probe: probeFn, timing });

  const dismissPayoff = useCallback(() => {
    try {
      store?.setItem(ONBOARDED_KEY, 'true');
    } catch {
      // A non-writable store still lets the session continue; the payoff
      // simply reappears next launch. Not worth blocking on.
    }
    setOnboarded(true);
  }, [store]);

  // Still getting ready (or failed) → the readiness UI owns the screen.
  if (readiness.status !== 'ready') {
    return (
      <ReadinessScreen
        readiness={readiness}
        firstRun={!onboarded}
        prefersReducedMotion={reducedMotion}
      />
    );
  }

  // Ready + first run → the payoff moment, then into the app.
  if (!onboarded) {
    return (
      <div
        data-testid="startup-payoff"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, maxWidth: '32rem' }}>
          {PAYOFF_COPY.headline}
        </h1>
        <p style={{ color: '#555', maxWidth: '32rem', margin: 0 }}>{PAYOFF_COPY.subline}</p>
        <p style={{ color: '#888', fontSize: '0.8125rem', margin: 0 }}>{PAYOFF_COPY.privacy}</p>
        <button
          type="button"
          data-testid="startup-payoff-cta"
          onClick={dismissPayoff}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            border: '1px solid #0066cc',
            backgroundColor: '#0066cc',
            color: '#fff',
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          {PAYOFF_COPY.cta}
        </button>
      </div>
    );
  }

  // Ready + returning → the app.
  return <>{children}</>;
}
