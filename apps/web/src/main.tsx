// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS web app entry point.
//
// All app composition (QueryClientProvider, BrowserRouter, Routes)
// lives in App.tsx. This file is the minimum amount of code needed to
// attach the React tree to #root.

import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element not found');
}

createRoot(rootEl).render(<App />);
