// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ReadinessScreen — C4.4-E2 (design: C4_3 §1–§3, §8).
//
// Renders the latency-gated startup states from useStartupReadiness:
//   - probing + !showPanel  → bare branded splash (fast paths feel instant)
//   - probing + showPanel   → readiness panel (+ slow-start reassurance)
//   - ready                 → renders NOTHING (no standalone "Ready" screen;
//                             the gate cross-fades into the app)
//   - error                 → a friendly F-card
//
// Accessibility: a single aria-live="polite" region announces the primary
// status; meaning is never color-only; reduced-motion is honored (static
// indicator, exposed as data-reduced-motion for the host's CSS).

import { StartupErrorCard } from '../components/StartupErrorCard.js';
import type { StartupReadiness } from '../hooks/useStartupReadiness.js';
import { STARTUP_ERROR_CATALOG } from '../startup/errorCatalog.js';
import { STARTUP_COPY } from '../startup/startupCopy.js';

export interface ReadinessScreenProps {
  readonly readiness: StartupReadiness;
  /** First run shows the demo-prep wording; returning shows the load wording. */
  readonly firstRun: boolean;
  readonly prefersReducedMotion?: boolean;
  /** Optional handlers for the F-card; primary defaults to retry. */
  readonly onErrorPrimary?: () => void;
  readonly onErrorSecondary?: () => void;
  readonly onErrorFeedback?: () => void;
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
};

const brandStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: '#222',
};

function Brand(): JSX.Element {
  return (
    <div data-testid="readiness-brand" style={brandStyle}>
      ManthanOS
    </div>
  );
}

export function ReadinessScreen({
  readiness,
  firstRun,
  prefersReducedMotion = false,
  onErrorPrimary,
  onErrorSecondary,
  onErrorFeedback,
}: ReadinessScreenProps): JSX.Element | null {
  const { status, showPanel, slowStart, errorId } = readiness;

  // Ready → arrival, not an announcement. Render nothing.
  if (status === 'ready') return null;

  if (status === 'error' && errorId !== null) {
    return (
      <div style={containerStyle} data-testid="readiness-error">
        <Brand />
        <StartupErrorCard
          copy={STARTUP_ERROR_CATALOG[errorId]}
          onPrimary={onErrorPrimary ?? readiness.retry}
          onSecondary={onErrorSecondary}
          onFeedback={onErrorFeedback}
        />
      </div>
    );
  }

  // Probing. Bare splash until the panel is earned (>panelDelayMs).
  const primaryMessage = !showPanel
    ? STARTUP_COPY.launching
    : firstRun
      ? STARTUP_COPY.preparingFirstRun
      : STARTUP_COPY.preparingReturning;

  return (
    <div
      style={containerStyle}
      data-testid={showPanel ? 'readiness-panel' : 'readiness-splash'}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      <Brand />
      {/* Single live region: announces the primary status politely. */}
      <output
        aria-live="polite"
        data-testid="readiness-primary-message"
        style={{ display: 'block', color: '#444', fontSize: '1rem' }}
      >
        {primaryMessage}
      </output>
      {/* Calm indeterminate indicator — never a fake percentage. The host
          may animate it via [data-reduced-motion="false"]; reduced motion
          leaves it static. */}
      <div
        aria-hidden="true"
        data-testid="readiness-indicator"
        style={{
          width: '2rem',
          height: '0.25rem',
          borderRadius: '999px',
          backgroundColor: '#e5e5e5',
        }}
      />
      {showPanel ? (
        <p
          data-testid="readiness-privacy"
          style={{ color: '#888', fontSize: '0.8125rem', margin: 0 }}
        >
          {STARTUP_COPY.privacy}
        </p>
      ) : null}
      {slowStart ? (
        <p
          data-testid="readiness-slow-start"
          style={{ color: '#888', fontSize: '0.8125rem', margin: 0 }}
        >
          {firstRun ? STARTUP_COPY.slowStartFirstRun : STARTUP_COPY.slowStartReturning}
        </p>
      ) : null}
    </div>
  );
}
