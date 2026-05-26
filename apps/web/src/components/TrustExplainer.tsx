// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// TrustExplainer — C4.4 H1 follow-up.
//
// A tiny native-disclosure explainer for the fact-trust meter, placed ONCE
// per screen (at a section header) wherever kept-finding trust meters
// render — never per row. Reuses the approved C4.1.1 §9 copy verbatim.
// Native <details>/<summary> gives mouse/touch/keyboard/screen-reader
// discoverability with no custom focus/positioning code.

import { TRUST_LEVEL_EXPLAINER } from '../i18n/labels.js';

export function TrustExplainer(): JSX.Element {
  return (
    <details data-testid="trust-explainer" style={{ marginBottom: '0.5rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: '#555' }}>
        What do these levels mean?
      </summary>
      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#666' }}>
        {TRUST_LEVEL_EXPLAINER}
      </p>
    </details>
  );
}
