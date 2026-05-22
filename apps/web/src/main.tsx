// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS web app — Task 1 scaffold.
//
// This file is a placeholder. The onboarding flow + workspace
// surfaces land starting in Sprint 2 (Task 11). At Task 1 it
// exists only to make the package buildable.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function ScaffoldNotice() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '36rem' }}>
      <p>ManthanOS scaffold.</p>
      <p style={{ color: '#666' }}>
        The product UI lands in Sprint 2. This page is a placeholder so the web app builds.
      </p>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <ScaffoldNotice />
  </StrictMode>,
);
