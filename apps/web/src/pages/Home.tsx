// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Home / project-picker placeholder. Sprint 2 M1 C1.10.
//
// The real project picker (workspace list + create) lands in M2. This
// placeholder exists so the `/` route resolves to something during the
// rest of M1.

export function Home(): JSX.Element {
  return (
    <section>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Projects</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        Pick a project to keep talking with, or start a new one.
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        The project picker lands in M2. M1 only scaffolds the routes.
      </p>
    </section>
  );
}
