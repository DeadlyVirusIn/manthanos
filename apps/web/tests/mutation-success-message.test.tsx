// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for MutationSuccessMessage. Sprint 2 M2.5 C25.1.
//
// Uses jsdom + @testing-library/react + vi fake timers because the
// component's contract centres on a setTimeout-driven auto-dismiss.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MutationSuccessMessage } from '../src/components/index.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('MutationSuccessMessage — visibility', () => {
  it('renders nothing when message is null', () => {
    render(<MutationSuccessMessage message={null} onDismiss={() => undefined} />);
    expect(screen.queryByTestId('mutation-success-message')).toBeNull();
  });

  it('renders the message text when non-null', () => {
    render(<MutationSuccessMessage message="Conversation captured." onDismiss={() => undefined} />);
    const text = screen.getByTestId('mutation-success-message-text');
    expect(text.textContent).toBe('Conversation captured.');
  });

  it('uses <output> with aria-live="polite" for a11y', () => {
    render(<MutationSuccessMessage message="Captured." onDismiss={() => undefined} />);
    const wrapper = screen.getByTestId('mutation-success-message');
    expect(wrapper.tagName.toLowerCase()).toBe('output');
    expect(wrapper.getAttribute('aria-live')).toBe('polite');
  });
});

describe('MutationSuccessMessage — auto-dismiss', () => {
  it('fires onDismiss after the default 3000ms', () => {
    const onDismiss = vi.fn();
    render(<MutationSuccessMessage message="Captured." onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('honours a custom durationMs', () => {
    const onDismiss = vi.fn();
    render(<MutationSuccessMessage message="Captured." durationMs={500} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(499);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not start a timer when message is null', () => {
    const onDismiss = vi.fn();
    render(<MutationSuccessMessage message={null} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('resets the timer when the message changes', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <MutationSuccessMessage message="First." onDismiss={onDismiss} durationMs={1000} />,
    );
    vi.advanceTimersByTime(700);
    rerender(<MutationSuccessMessage message="Second." onDismiss={onDismiss} durationMs={1000} />);
    vi.advanceTimersByTime(700);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('MutationSuccessMessage — manual dismiss', () => {
  it('renders a dismiss button that calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(<MutationSuccessMessage message="Captured." onDismiss={onDismiss} />);
    const btn = screen.getByTestId('mutation-success-message-dismiss');
    btn.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('supports a custom testId prefix', () => {
    render(
      <MutationSuccessMessage
        message="Custom."
        onDismiss={() => undefined}
        testId="today-capture-success"
      />,
    );
    expect(screen.getByTestId('today-capture-success')).toBeTruthy();
    expect(screen.getByTestId('today-capture-success-text').textContent).toBe('Custom.');
    expect(screen.getByTestId('today-capture-success-dismiss')).toBeTruthy();
  });
});
