// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Navigation shell rendered as the layout for all main routes.
//
// Sprint 2 M2 C2.1 rewires the shell for nested project routes (J.1):
//   - Projects link is always enabled and points at `/`.
//   - Today / Validation depend on a projectId being in the URL.
//     With one, they link to `/projects/:projectId/today` and
//     `/projects/:projectId/validation`. Without (e.g. on the picker
//     route `/`), they render as aria-disabled — the J.3 / J.5
//     "visible but disabled, never hide" principle applied to nav.
//
// Detail routes (/projects/:projectId/conversations/:id, /facts/:id)
// also render inside this shell — reached by clicking through, not
// from the top nav.

import { useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';

import { SendFeedbackDialog } from '../components/SendFeedbackDialog.js';

interface NavItem {
  readonly key: string;
  readonly label: string;
  // Returns null when the link should render as disabled.
  readonly target: (projectId: string | undefined) => string | null;
  readonly isActive: (pathname: string, projectId: string | undefined) => boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    key: 'projects',
    label: 'Projects',
    target: () => '/',
    isActive: (pathname) => pathname === '/',
  },
  {
    key: 'today',
    label: 'Today',
    target: (projectId) => (projectId ? `/projects/${projectId}/today` : null),
    isActive: (pathname, projectId) =>
      projectId !== undefined && pathname === `/projects/${projectId}/today`,
  },
  {
    key: 'validation',
    label: 'To double-check',
    target: (projectId) => (projectId ? `/projects/${projectId}/validation` : null),
    isActive: (pathname, projectId) =>
      projectId !== undefined && pathname === `/projects/${projectId}/validation`,
  },
];

export function AppShell(): JSX.Element {
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
          const target = item.target(projectId);
          const active = item.isActive(location.pathname, projectId);
          if (target === null) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                title="Pick a project first"
                data-testid={`nav-${item.key}-disabled`}
                style={{
                  color: '#bbb',
                  cursor: 'not-allowed',
                  fontWeight: 400,
                }}
              >
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.key}
              to={target}
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
        <button
          type="button"
          data-testid="nav-send-feedback"
          onClick={() => setFeedbackOpen(true)}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'none',
            color: '#555',
            fontSize: '0.875rem',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Send feedback
        </button>
      </nav>
      <main style={{ padding: '2rem', maxWidth: '48rem' }}>
        <Outlet />
      </main>
      <SendFeedbackDialog isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
