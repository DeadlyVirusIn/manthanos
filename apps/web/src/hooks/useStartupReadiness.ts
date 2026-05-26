// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// useStartupReadiness — C4.4-E2 (design: C4_3 §1–§3).
//
// Latency-gated startup state machine. The probe is INJECTED and, for this
// first E2 slice, intentionally minimal: it only verifies the local engine
// is reachable and the app can proceed to render. It is NOT coupled to
// demo-Project existence (that integration lands in a later slice).
//
// Latency gating (perceived performance):
//   - 0–panelDelayMs:       splash only (showPanel=false)
//   - panelDelayMs–slowMs:  readiness panel (showPanel=true)
//   - >= slowMs:            + slow-start reassurance (slowStart=true)
//   - >= ceilingMs:         give up → F8 (never an infinite spinner)
//
// Timing uses setTimeout; tests drive it with fake timers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_STARTUP_ERROR_IDS, type StartupErrorId } from '../startup/errorCatalog.js';

/** R2: a not-ok probe must carry a valid friendly card id. A malformed
 *  result (missing/unknown id) normalizes to F8 immediately, rather than
 *  leaving the UI on the panel until the ceiling fires. */
function normalizeErrorId(id: unknown): StartupErrorId {
  return typeof id === 'string' && (ALL_STARTUP_ERROR_IDS as readonly string[]).includes(id)
    ? (id as StartupErrorId)
    : 'F8';
}

export type ReadinessResult = { ok: true } | { ok: false; errorId: StartupErrorId };

export type StartupStatus = 'probing' | 'ready' | 'error';

export interface ReadinessTiming {
  /** When the readiness panel replaces the bare splash. */
  readonly panelDelayMs: number;
  /** When the slow-start reassurance appears. */
  readonly slowStartMs: number;
  /** Hard ceiling — past this a still-pending probe becomes F8. */
  readonly ceilingMs: number;
}

export const DEFAULT_READINESS_TIMING: ReadinessTiming = {
  panelDelayMs: 400,
  slowStartMs: 8_000,
  ceilingMs: 30_000,
};

export interface UseStartupReadinessOptions {
  /** Async readiness check. Resolves ok, or not-ok with a friendly F-id. */
  readonly probe: () => Promise<ReadinessResult>;
  readonly timing?: ReadinessTiming;
}

export interface StartupReadiness {
  readonly status: StartupStatus;
  /** Past panelDelayMs and still probing → show the panel, not just splash. */
  readonly showPanel: boolean;
  /** Past slowStartMs and still probing → show the slow-start reassurance. */
  readonly slowStart: boolean;
  /** The friendly card to show when status === 'error'. */
  readonly errorId: StartupErrorId | null;
  /** Re-run the probe from the start (used by F-card "Try again"). */
  readonly retry: () => void;
}

export function useStartupReadiness(opts: UseStartupReadinessOptions): StartupReadiness {
  const timing = opts.timing ?? DEFAULT_READINESS_TIMING;
  const probeRef = useRef(opts.probe);
  probeRef.current = opts.probe;

  const [status, setStatus] = useState<StartupStatus>('probing');
  const [showPanel, setShowPanel] = useState(false);
  const [slowStart, setSlowStart] = useState(false);
  const [errorId, setErrorId] = useState<StartupErrorId | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('probing');
    setShowPanel(false);
    setSlowStart(false);
    setErrorId(null);
    setAttempt((n) => n + 1);
  }, []);

  // `attempt` is a retry nonce: it is not read in the body, it exists only to
  // re-run this effect when retry() is called.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally re-arms the effect
  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (active) setShowPanel(true);
      }, timing.panelDelayMs),
    );
    timers.push(
      setTimeout(() => {
        if (active) setSlowStart(true);
      }, timing.slowStartMs),
    );
    timers.push(
      setTimeout(() => {
        if (active) {
          setStatus('error');
          setErrorId('F8');
        }
      }, timing.ceilingMs),
    );

    probeRef
      .current()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setStatus('ready');
        } else {
          setStatus('error');
          setErrorId(normalizeErrorId(result.errorId));
        }
      })
      .catch(() => {
        // A thrown probe = the engine didn't start.
        if (active) {
          setStatus('error');
          setErrorId('F1');
        }
      });

    return () => {
      active = false;
      for (const t of timers) clearTimeout(t);
    };
    // Re-arm on each retry.
  }, [attempt, timing.panelDelayMs, timing.slowStartMs, timing.ceilingMs]);

  return { status, showPanel, slowStart, errorId, retry };
}
