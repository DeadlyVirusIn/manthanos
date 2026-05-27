// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E4 — SendFeedbackDialog: collects an optional note, exports one
// redacted file, and never leaks the route's ids or a pasted secret.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SendFeedbackDialog } from '../src/components/SendFeedbackDialog.js';
import { clearFeedbackEvents, recordFeedbackEvent } from '../src/feedback/feedbackEvents.js';

afterEach(cleanup);

function renderDialog(exportBundle: (s: string, f: string) => void) {
  return render(
    <MemoryRouter initialEntries={['/projects/ws-secret/conversations/conv-secret']}>
      <SendFeedbackDialog
        isOpen
        onClose={vi.fn()}
        exportBundle={exportBundle}
        probeHealth={async () => true}
        now={() => new Date('2026-05-26T10:00:00.000Z')}
      />
    </MemoryRouter>,
  );
}

describe('SendFeedbackDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <SendFeedbackDialog isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('exports a redacted bundle that leaks neither route ids nor a pasted secret', async () => {
    clearFeedbackEvents();
    recordFeedbackEvent('Startup: F1 shown');
    let serialized = '';
    let fileName = '';
    renderDialog((s, f) => {
      serialized = s;
      fileName = f;
    });

    fireEvent.change(screen.getByTestId('send-feedback-note'), {
      target: { value: 'It broke. My key is sk-live-LEAK999.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('send-feedback-save'));
    });

    await waitFor(() => expect(screen.getByTestId('send-feedback-success')).toBeTruthy());

    expect(fileName).toBe('manthanos-feedback-2026-05-26.json');
    // Route ids and the secret must be gone; the route pattern + friendly
    // event + the prose remain.
    expect(serialized).not.toContain('ws-secret');
    expect(serialized).not.toContain('conv-secret');
    expect(serialized).not.toContain('sk-live-LEAK999');
    expect(serialized).toContain('/projects/:projectId/conversations/:id');
    expect(serialized).toContain('Startup: F1 shown');
    expect(serialized).toContain('It broke.');
  });

  it('default health probe targets the /api-routed endpoint and feeds health.reachable (C1)', async () => {
    // No injected probeHealth → exercises defaultProbeHealth. It must hit an
    // /api-prefixed path (forwarded to the daemon by the Vite proxy); a bare
    // /health would hit the Vite server, making health.reachable unreliable.
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchSpy);
    let serialized = '';
    try {
      render(
        <MemoryRouter initialEntries={['/projects/ws-x/conversations/conv-y']}>
          <SendFeedbackDialog
            isOpen
            onClose={vi.fn()}
            exportBundle={(s) => {
              serialized = s;
            }}
            now={() => new Date('2026-05-26T10:00:00.000Z')}
          />
        </MemoryRouter>,
      );
      fireEvent.change(screen.getByTestId('send-feedback-note'), {
        target: { value: 'probe check' },
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('send-feedback-save'));
      });
      await waitFor(() => expect(screen.getByTestId('send-feedback-success')).toBeTruthy());
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/health');
      expect(fetchSpy).not.toHaveBeenCalledWith('/health');
      expect(serialized).toMatch(/"reachable":\s*true/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
