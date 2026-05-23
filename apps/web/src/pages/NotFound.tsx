// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// 404 / unmatched-route placeholder. Sprint 2 M1 C1.10.

import { Link } from 'react-router-dom';

export function NotFound(): JSX.Element {
  return (
    <section
      role="alert"
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '36rem',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Page not found</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        The page you're looking for doesn't exist.
      </p>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/" style={{ color: '#0066cc' }}>
          Back to projects
        </Link>
      </p>
    </section>
  );
}
