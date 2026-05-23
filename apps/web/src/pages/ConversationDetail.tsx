// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Conversation detail placeholder. Sprint 2 M1 C1.10.
//
// Reached via `/conversations/:id`. The :id segment is extracted via
// useParams() and rendered so routing tests can verify parameter
// extraction. Real conversation rendering (transcript, fact extraction,
// activity audit chain) lands in M2.

import { useParams } from 'react-router-dom';

export function ConversationDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return (
    <section>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Conversation</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        ID: <span data-testid="conv-id">{id ?? '(missing)'}</span>
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        Conversation detail view lands in M2.
      </p>
    </section>
  );
}
