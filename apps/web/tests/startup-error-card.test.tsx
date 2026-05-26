// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E2 — StartupErrorCard tests: every F1–F8 renders, a11y roles/focus,
// keyboard, and action wiring.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartupErrorCard } from '../src/components/StartupErrorCard.js';
import { ALL_STARTUP_ERROR_IDS, STARTUP_ERROR_CATALOG } from '../src/startup/errorCatalog.js';

afterEach(cleanup);

describe('StartupErrorCard — all F1–F8', () => {
  for (const id of ALL_STARTUP_ERROR_IDS) {
    const copy = STARTUP_ERROR_CATALOG[id];
    it(`${id} renders title, body, and actions`, () => {
      render(<StartupErrorCard copy={copy} onPrimary={vi.fn()} />);
      expect(screen.getByTestId('startup-error-title').textContent).toBe(copy.title);
      expect(screen.getByTestId('startup-error-body').textContent).toBe(copy.body);
      expect(screen.getByTestId('startup-error-primary').textContent).toBe(copy.primary);

      if (copy.secondary !== undefined) {
        expect(screen.getByTestId('startup-error-secondary').textContent).toBe(copy.secondary);
      } else {
        expect(screen.queryByTestId('startup-error-secondary')).toBeNull();
      }

      if (copy.feedback) {
        expect(screen.getByTestId('startup-error-feedback')).toBeTruthy();
      } else {
        expect(screen.queryByTestId('startup-error-feedback')).toBeNull();
      }
    });
  }
});

describe('StartupErrorCard — accessibility', () => {
  it('uses role="alertdialog" with labelled title + description', () => {
    render(<StartupErrorCard copy={STARTUP_ERROR_CATALOG.F1} onPrimary={vi.fn()} />);
    const card = screen.getByTestId('startup-error-card');
    expect(card.getAttribute('role')).toBe('alertdialog');
    const labelledBy = card.getAttribute('aria-labelledby');
    const describedBy = card.getAttribute('aria-describedby');
    expect(screen.getByTestId('startup-error-title').id).toBe(labelledBy);
    expect(screen.getByTestId('startup-error-body').id).toBe(describedBy);
  });

  it('moves focus to the title when shown', () => {
    render(<StartupErrorCard copy={STARTUP_ERROR_CATALOG.F1} onPrimary={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByTestId('startup-error-title'));
  });

  it('conveys meaning through text, not color alone (no red error styling)', () => {
    render(<StartupErrorCard copy={STARTUP_ERROR_CATALOG.F8} onPrimary={vi.fn()} />);
    const card = screen.getByTestId('startup-error-card');
    expect(screen.getByTestId('startup-error-title').textContent).toBe(
      STARTUP_ERROR_CATALOG.F8.title,
    );
    expect(card.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });
});

describe('StartupErrorCard — actions', () => {
  it('fires the primary action on click', () => {
    const onPrimary = vi.fn();
    render(<StartupErrorCard copy={STARTUP_ERROR_CATALOG.F1} onPrimary={onPrimary} />);
    fireEvent.click(screen.getByTestId('startup-error-primary'));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('fires the secondary action on click when present (F5)', () => {
    const onSecondary = vi.fn();
    render(
      <StartupErrorCard
        copy={STARTUP_ERROR_CATALOG.F5}
        onPrimary={vi.fn()}
        onSecondary={onSecondary}
      />,
    );
    fireEvent.click(screen.getByTestId('startup-error-secondary'));
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it('Escape triggers the safe secondary action when present', () => {
    const onSecondary = vi.fn();
    render(
      <StartupErrorCard
        copy={STARTUP_ERROR_CATALOG.F5}
        onPrimary={vi.fn()}
        onSecondary={onSecondary}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('startup-error-card'), { key: 'Escape' });
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it('fires Send feedback when present', () => {
    const onFeedback = vi.fn();
    render(
      <StartupErrorCard
        copy={STARTUP_ERROR_CATALOG.F1}
        onPrimary={vi.fn()}
        onFeedback={onFeedback}
      />,
    );
    fireEvent.click(screen.getByTestId('startup-error-feedback'));
    expect(onFeedback).toHaveBeenCalledOnce();
  });
});
