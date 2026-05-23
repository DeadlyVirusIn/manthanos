// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Fact detail placeholder. Sprint 2 M1 C1.10.
//
// Reached via `/facts/:id`. The :id segment is extracted via useParams()
// and rendered so routing tests can verify parameter extraction. Real
// fact rendering (statement, tier, versions, evidence, follow-up) lands
// in M2.

import { useParams } from 'react-router-dom';

export function FactDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return (
    <section>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Fact</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        ID: <span data-testid="fact-id">{id ?? '(missing)'}</span>
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        Fact detail view lands in M2.
      </p>
    </section>
  );
}
