// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Project home placeholder (substrate "workspace" → user-facing "project").
//
// Sprint 2 M2 C2.1 moved this route to `/projects/:projectId` (J.1) so
// the param name changed from `id` to `projectId`. The user-facing
// heading remains "Project" per the workspace→project rename.

import { useParams } from 'react-router-dom';

export function WorkspaceHome(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <section>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>
        ID: <span data-testid="workspace-id">{projectId ?? '(missing)'}</span>
      </p>
      <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
        Project home view lands later in M2.
      </p>
    </section>
  );
}
