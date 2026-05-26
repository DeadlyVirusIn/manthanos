// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Home / Project Picker. Sprint 2 M2 C2.2 (read-only).
//
// Lists every project the user has and links each to its Today page.
// Read-only — no "Create project" CTA per J.2 (creation is deferred
// to M2.5 / M3; fresh installs ship a seed project for testing).
//
// Vocabulary: "Project" is the user-facing rename of substrate's
// "workspace". The wire format and translation source stay on
// "workspace_status" but every visible string is rendered through
// the C1.8 translation map.
//
// States:
//   - loading   → CardSkeleton ×3
//   - error     → PageErrorBanner with retry
//   - empty     → friendly empty-state copy
//   - populated → list of project cards linking to /projects/:projectId/today
//
// Timestamps go through formatRelativeTime so no ISO ever reaches DOM.

import { Link } from 'react-router-dom';

import type { WorkspaceView } from '../api/index.js';
import { CardSkeleton, PageErrorBanner } from '../components/index.js';
import { useProjects } from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

export function Home(): JSX.Element {
  const query = useProjects();

  if (query.isPending) {
    return (
      <section data-testid="home-loading">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Projects</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>Pick a project to keep talking with.</p>
        <div
          style={{
            marginTop: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <CardSkeleton ariaLabel="Loading project" />
          <CardSkeleton ariaLabel="Loading project" />
          <CardSkeleton ariaLabel="Loading project" />
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section data-testid="home-error">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Projects</h1>
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={query.error}
            onRetry={() => query.refetch()}
            headline="Could not load your projects"
          />
        </div>
      </section>
    );
  }

  const projects = query.data ?? [];

  if (projects.length === 0) {
    return (
      <section data-testid="home-empty">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Projects</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>You do not have any projects yet.</p>
        <p style={{ color: '#999', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Your demo Project will appear here. If it's missing, reopen ManthanOS to set it up.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="home-populated">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Projects</h1>
      <p style={{ color: '#666', marginTop: '0.75rem' }}>Pick a project to keep talking with.</p>
      <ul
        data-testid="project-list"
        style={{
          marginTop: '1rem',
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ProjectCardProps {
  readonly project: WorkspaceView;
}

function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  // The picker links to Today so the user lands on their most recent
  // activity, not a bare project home.
  const target = `/projects/${project.id}/today`;
  const name = project.name ?? 'Untitled project';
  const statusLabel = getEnumLabel('workspace_status', project.status);
  const lastTouched = formatRelativeTime(project.status_changed_at ?? project.created_at);

  return (
    <Link
      to={target}
      data-testid="project-card"
      data-project-id={project.id}
      style={{
        display: 'block',
        padding: '1rem',
        border: '1px solid #eee',
        borderRadius: '0.5rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong data-testid="project-card-name" style={{ fontSize: '1rem' }}>
          {name}
        </strong>
        <span data-testid="project-card-status" style={{ fontSize: '0.875rem', color: '#666' }}>
          {statusLabel}
        </span>
      </div>
      {lastTouched !== '' ? (
        <p
          data-testid="project-card-touched"
          style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#999' }}
        >
          Last activity {lastTouched}
        </p>
      ) : null}
    </Link>
  );
}
