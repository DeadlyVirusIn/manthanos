// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS web app entry point.
//
// All app composition (QueryClientProvider, BrowserRouter, Routes)
// lives in App.tsx. This file is the minimum amount of code needed to
// attach the React tree to #root.

import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { StartupGate } from './layout/index.js';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element not found');
}

// The readiness gate owns the screen until the local engine is reachable,
// then reveals the app (with a one-time first-run payoff). It wraps <App/>
// here — outside the app's providers — so it can show before the app
// initializes, and so every test that renders <App/>/<AppRoutes/> stays
// ungated. C4.4-E2.
createRoot(rootEl).render(
  <StartupGate>
    <App />
  </StartupGate>,
);
