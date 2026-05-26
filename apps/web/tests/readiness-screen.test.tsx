// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E2 — ReadinessScreen rendering tests across all latency-gated states.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StartupReadiness } from '../src/hooks/useStartupReadiness.js';
import { ReadinessScreen } from '../src/layout/ReadinessScreen.js';
import { STARTUP_COPY } from '../src/startup/startupCopy.js';

afterEach(cleanup);

function readiness(over: Partial<StartupReadiness> = {}): StartupReadiness {
  return {
    status: 'probing',
    showPanel: false,
    slowStart: false,
    errorId: null,
    retry: vi.fn(),
    ...over,
  };
}

describe('ReadinessScreen', () => {
  it('shows the bare splash before the panel is earned', () => {
    render(<ReadinessScreen readiness={readiness()} firstRun />);
    expect(screen.getByTestId('readiness-splash')).toBeTruthy();
    expect(screen.getByTestId('readiness-primary-message').textContent).toBe(
      STARTUP_COPY.launching,
    );
    expect(screen.queryByTestId('readiness-privacy')).toBeNull();
  });

  it('shows the first-run panel with privacy reassurance', () => {
    render(<ReadinessScreen readiness={readiness({ showPanel: true })} firstRun />);
    expect(screen.getByTestId('readiness-panel')).toBeTruthy();
    expect(screen.getByTestId('readiness-primary-message').textContent).toBe(
      STARTUP_COPY.preparingFirstRun,
    );
    expect(screen.getByTestId('readiness-privacy').textContent).toBe(STARTUP_COPY.privacy);
  });

  it('shows the returning-user wording when not first run', () => {
    render(<ReadinessScreen readiness={readiness({ showPanel: true })} firstRun={false} />);
    expect(screen.getByTestId('readiness-primary-message').textContent).toBe(
      STARTUP_COPY.preparingReturning,
    );
  });

  it('adds slow-start reassurance past the slow threshold', () => {
    render(
      <ReadinessScreen readiness={readiness({ showPanel: true, slowStart: true })} firstRun />,
    );
    expect(screen.getByTestId('readiness-slow-start').textContent).toBe(
      STARTUP_COPY.slowStartFirstRun,
    );
  });

  it('renders nothing when ready (no standalone Ready screen)', () => {
    const { container } = render(
      <ReadinessScreen readiness={readiness({ status: 'ready' })} firstRun />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a friendly F-card on error; primary defaults to retry', () => {
    const retry = vi.fn();
    render(
      <ReadinessScreen readiness={readiness({ status: 'error', errorId: 'F1', retry })} firstRun />,
    );
    expect(screen.getByTestId('readiness-error')).toBeTruthy();
    expect(screen.getByTestId('startup-error-card').getAttribute('data-error-id')).toBe('F1');
    fireEvent.click(screen.getByTestId('startup-error-primary'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('announces the primary status via an aria-live region', () => {
    render(<ReadinessScreen readiness={readiness()} firstRun />);
    const live = screen.getByTestId('readiness-primary-message');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('honors reduced motion via a data attribute', () => {
    render(
      <ReadinessScreen readiness={readiness({ showPanel: true })} firstRun prefersReducedMotion />,
    );
    expect(screen.getByTestId('readiness-panel').getAttribute('data-reduced-motion')).toBe('true');
  });
});
