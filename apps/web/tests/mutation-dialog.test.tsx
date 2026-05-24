// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for MutationDialog. Sprint 2 M2.5 C25.1.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MutationDialog } from '../src/components/index.js';

afterEach(() => {
  cleanup();
});

function renderDialog(overrides: Partial<Parameters<typeof MutationDialog>[0]> = {}) {
  const props = {
    title: 'Test',
    isOpen: true,
    onCancel: vi.fn(),
    onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
    children: (<input type="text" data-testid="probe-input" defaultValue="" />) as JSX.Element,
    ...overrides,
  };
  const result = render(<MutationDialog {...props} />);
  return { result, props };
}

describe('MutationDialog — visibility', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <MutationDialog
        title="Closed"
        isOpen={false}
        onCancel={() => undefined}
        onSubmit={(e) => e.preventDefault()}
      >
        <span data-testid="hidden">hidden</span>
      </MutationDialog>,
    );
    expect(screen.queryByTestId('mutation-dialog')).toBeNull();
    expect(screen.queryByTestId('hidden')).toBeNull();
  });

  it('renders the dialog and title when isOpen is true', () => {
    renderDialog({ title: 'Capture a conversation' });
    expect(screen.getByTestId('mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('mutation-dialog-title').textContent).toBe('Capture a conversation');
  });

  it('uses role="dialog" + aria-modal="true"', () => {
    renderDialog();
    const dialog = screen.getByTestId('mutation-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders into a portal (mounted on document.body, not inside the host container)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(
      <MutationDialog
        title="Portal"
        isOpen
        onCancel={() => undefined}
        onSubmit={(e) => e.preventDefault()}
      >
        <span>x</span>
      </MutationDialog>,
      { container: host },
    );
    expect(host.querySelector('[data-testid="mutation-dialog"]')).toBeNull();
    expect(document.querySelector('[data-testid="mutation-dialog"]')).toBeTruthy();
    document.body.removeChild(host);
  });
});

describe('MutationDialog — dismissal', () => {
  it('Cancel button fires onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    screen.getByTestId('mutation-dialog-cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop fires onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    const backdrop = screen.getByTestId('mutation-dialog-backdrop');
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the dialog content does NOT fire onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    const dialog = screen.getByTestId('mutation-dialog');
    fireEvent.click(dialog);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ESC fires onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('MutationDialog — submit gating', () => {
  it('disables submit when isSubmitting is true', () => {
    renderDialog({ isSubmitting: true });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('disables submit when submitDisabled is true', () => {
    renderDialog({ submitDisabled: true });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('keeps submit enabled by default', () => {
    renderDialog();
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('shows the Saving… label while submitting', () => {
    renderDialog({ isSubmitting: true });
    const submit = screen.getByTestId('mutation-dialog-submit') as HTMLButtonElement;
    expect(submit.textContent).toContain('Saving');
  });

  it('renders the custom submitLabel when not submitting', () => {
    renderDialog({ submitLabel: 'Capture', isSubmitting: false });
    expect(screen.getByTestId('mutation-dialog-submit').textContent).toBe('Capture');
  });

  it('form submit fires onSubmit', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    renderDialog({ onSubmit });
    const form = screen.getByTestId('mutation-dialog-fields').parentElement as HTMLFormElement;
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('MutationDialog — error slot', () => {
  it('renders the errorSlot above the field tree when provided', () => {
    renderDialog({
      errorSlot: <span data-testid="probe-error">an error</span>,
    });
    const slot = screen.getByTestId('mutation-dialog-error-slot');
    expect(slot.contains(screen.getByTestId('probe-error'))).toBe(true);
  });

  it('omits the error slot when errorSlot is null', () => {
    renderDialog({ errorSlot: null });
    expect(screen.queryByTestId('mutation-dialog-error-slot')).toBeNull();
  });
});

describe('MutationDialog — destructive variant', () => {
  it('exposes data-destructive="true" when destructive is set', () => {
    renderDialog({ destructive: true });
    expect(screen.getByTestId('mutation-dialog').getAttribute('data-destructive')).toBe('true');
  });

  it('defaults destructive to false', () => {
    renderDialog();
    expect(screen.getByTestId('mutation-dialog').getAttribute('data-destructive')).toBe('false');
  });
});

describe('MutationDialog — focus management', () => {
  it('moves focus to the first focusable element on open', async () => {
    renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByTestId('probe-input'));
  });
});
