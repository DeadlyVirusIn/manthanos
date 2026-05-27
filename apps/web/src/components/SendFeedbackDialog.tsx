// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// SendFeedbackDialog — C4.4-E4 (design: C4_2 §14, C4_3 §7).
//
// Lets a tester attach an optional note and save ONE redacted report file.
// The tester never sees the diagnostics themselves — the file is built from
// curated, scrubbed fields only (see feedbackBundle.ts). No internal
// diagnostics are shown in the UI.

import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  buildFeedbackBundle,
  feedbackFileName,
  serializeFeedbackBundle,
} from '../feedback/feedbackBundle.js';
import { getFeedbackEvents } from '../feedback/feedbackEvents.js';

/** Build-injected app info, with safe defaults when not provided. */
function appBuildInfo(): { version: string; commit: string | undefined } {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return { version: env.VITE_APP_VERSION ?? 'unknown', commit: env.VITE_APP_COMMIT };
}

async function defaultProbeHealth(): Promise<boolean> {
  try {
    // /api-prefixed so the Vite dev proxy forwards it to the daemon; a bare
    // /health would hit the Vite server, making health.reachable unreliable (C1).
    const res = await fetch('/api/v1/health');
    return res.ok;
  } catch {
    return false;
  }
}

/** Real export: download the serialized bundle as a single JSON file. */
function defaultExport(serialized: string, fileName: string): void {
  const blob = new Blob([serialized], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface SendFeedbackDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Test seams (real defaults). */
  readonly probeHealth?: () => Promise<boolean>;
  readonly exportBundle?: (serialized: string, fileName: string) => void;
  readonly now?: () => Date;
}

export function SendFeedbackDialog({
  isOpen,
  onClose,
  probeHealth = defaultProbeHealth,
  exportBundle = defaultExport,
  now = () => new Date(),
}: SendFeedbackDialogProps): JSX.Element | null {
  const location = useLocation();
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    const healthReachable = await probeHealth();
    const { version, commit } = appBuildInfo();
    const at = now();
    const bundle = buildFeedbackBundle({
      note,
      appVersion: version,
      commit,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      routePath: location.pathname,
      events: getFeedbackEvents(),
      healthReachable,
      now: at,
    });
    exportBundle(serializeFeedbackBundle(bundle), feedbackFileName(at));
    setBusy(false);
    setDone(true);
  };

  const titleId = 'send-feedback-title';
  return (
    // biome-ignore lint/a11y/useSemanticElements: controlled React overlay; native <dialog> showModal semantics aren't used here
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="send-feedback-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '100%',
        }}
      >
        <h2 id={titleId} style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Send feedback
        </h2>
        {done ? (
          <div>
            <p data-testid="send-feedback-success" style={{ color: '#555' }}>
              Thanks — your report is ready to send.
            </p>
            <p style={{ color: '#888', fontSize: '0.8125rem' }}>
              It contains no conversation text or personal details — just enough to help us fix
              things.
            </p>
            <button type="button" data-testid="send-feedback-close" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor="send-feedback-note" style={{ display: 'block', color: '#555' }}>
              Add a sentence about what felt off (optional).
            </label>
            <textarea
              id="send-feedback-note"
              data-testid="send-feedback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                data-testid="send-feedback-save"
                disabled={busy}
                onClick={() => {
                  void handleSave();
                }}
              >
                Save report
              </button>
              <button type="button" data-testid="send-feedback-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
