// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// StartupErrorCard — C4.4-E2 (design: C4_3 §4, §8).
//
// One reusable friendly failure card for the startup/readiness flow. The
// brand mark stays calm (the app is not "broken-feeling"); meaning is
// carried by TEXT + a neutral glyph, never by color alone. Accessibility:
//   - role="alertdialog" with labelled title + description;
//   - focus moves to the title on mount;
//   - tab order: primary → secondary → Send feedback;
//   - Enter triggers the primary (native button), Esc triggers the safe
//     secondary action when present.
// No codes/paths/ports/internal vocabulary ever reach the DOM.

import { useEffect, useRef } from 'react';
import type { StartupErrorCardCopy } from '../startup/errorCatalog.js';

export interface StartupErrorCardProps {
  readonly copy: StartupErrorCardCopy;
  readonly onPrimary: () => void;
  readonly onSecondary?: () => void;
  readonly onFeedback?: () => void;
}

const cardStyle: React.CSSProperties = {
  maxWidth: '24rem',
  margin: '0 auto',
  padding: '1.5rem',
  border: '1px solid #ddd',
  borderRadius: '0.75rem',
  backgroundColor: '#fff',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid #0066cc',
  backgroundColor: '#0066cc',
  color: '#fff',
  fontSize: '0.9375rem',
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid #bbb',
  backgroundColor: 'transparent',
  color: '#333',
  fontSize: '0.9375rem',
  cursor: 'pointer',
};

const linkButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  border: 'none',
  background: 'none',
  color: '#555',
  fontSize: '0.875rem',
  textDecoration: 'underline',
  cursor: 'pointer',
};

export function StartupErrorCard({
  copy,
  onPrimary,
  onSecondary,
  onFeedback,
}: StartupErrorCardProps): JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the title when the card appears so screen-reader users
  // land on the explanation, not mid-page.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && onSecondary !== undefined) {
      e.preventDefault();
      onSecondary();
    }
  };

  const titleId = `startup-error-${copy.id}-title`;
  const bodyId = `startup-error-${copy.id}-body`;

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="startup-error-card"
      data-error-id={copy.id}
      style={cardStyle}
      onKeyDown={handleKeyDown}
    >
      {/* Neutral status glyph — decorative; meaning is in the text below. */}
      <div aria-hidden="true" style={{ fontSize: '1.5rem', lineHeight: 1, marginBottom: '0.5rem' }}>
        •
      </div>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        data-testid="startup-error-title"
        style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem', outline: 'none' }}
      >
        {copy.title}
      </h2>
      <p
        id={bodyId}
        data-testid="startup-error-body"
        style={{ color: '#555', fontSize: '0.9375rem', margin: '0 0 1.25rem' }}
      >
        {copy.body}
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          data-testid="startup-error-primary"
          style={primaryButtonStyle}
          onClick={onPrimary}
        >
          {copy.primary}
        </button>
        {copy.secondary !== undefined ? (
          <button
            type="button"
            data-testid="startup-error-secondary"
            style={secondaryButtonStyle}
            onClick={onSecondary}
          >
            {copy.secondary}
          </button>
        ) : null}
        {copy.feedback ? (
          <button
            type="button"
            data-testid="startup-error-feedback"
            style={linkButtonStyle}
            onClick={onFeedback}
          >
            Send feedback
          </button>
        ) : null}
      </div>
    </div>
  );
}
