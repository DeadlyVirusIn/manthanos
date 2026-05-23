// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Navigation shell rendered as the layout for all main routes. Sprint 2
// M1 C1.10.
//
// Renders the top-level navigation (Projects, Today, Validation) plus
// the <Outlet /> where the active route's page renders. The detail
// routes (/conversations/:id, /facts/:id, /workspaces/:id) ALSO render
// inside this shell — they're reached by clicking through, not from the
// top nav.
//
// Visual styling is intentionally barebones at M1; M2 introduces the
// real design system. The labels here ("Projects", "Today", "Validation")
// are user-facing and already use the journey-review's vocabulary —
// "Projects" is the rename of substrate's "workspaces".

import { Link, Outlet, useLocation } from 'react-router-dom';

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/', label: 'Projects' },
  { to: '/today', label: 'Today' },
  { to: '/validation', label: 'Validation' },
];

export function AppShell(): JSX.Element {
  const location = useLocation();
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <nav
        aria-label="Primary navigation"
        style={{
          display: 'flex',
          gap: '1rem',
          padding: '1rem 2rem',
          borderBottom: '1px solid #eee',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(location.pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              style={{
                color: active ? '#0066cc' : '#444',
                textDecoration: 'none',
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main style={{ padding: '2rem', maxWidth: '48rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

function isActiveNav(currentPath: string, navPath: string): boolean {
  if (navPath === '/') return currentPath === '/';
  return currentPath === navPath || currentPath.startsWith(`${navPath}/`);
}
