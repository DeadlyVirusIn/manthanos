// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Project home placeholder (substrate "workspace" → user-facing "project").
// Sprint 2 M1 C1.10.
//
// Reached via `/workspaces/:id`. The path uses the substrate name
// because URLs are not user-facing labels and stable URLs are valuable;
// the heading and copy use the renamed "Project" vocabulary.

import { useParams } from 'react-router-dom';

export function WorkspaceHome(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return (
    <section>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        ID: <span data-testid="workspace-id">{id ?? '(missing)'}</span>
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        Project home view lands in M2.
      </p>
    </section>
  );
}
