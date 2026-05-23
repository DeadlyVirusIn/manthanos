// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Project home — Sprint 2 M2 C2.3 (read-only).
//
// Reached via /projects/:projectId. Shows a project header (name +
// translated status + relative timestamps) and four read-only summary
// cards for the founder to navigate from.
//
// Card behaviour follows the J.3 / J.5 "visible but disabled, never
// hide" principle:
//   Today          → link to /projects/:projectId/today
//   Validation     → link to /projects/:projectId/validation
//   Conversations  → aria-disabled (list view lands in M3)
//   Facts          → aria-disabled (list view lands in M3)
//
// All vocabulary flows through getEnumLabel; all timestamps through
// formatRelativeTime; no raw ISO or enum letter ever reaches the DOM.
//
// Backend gap: WorkspaceView has no `description` field. The C2.3
// requirements asked for one — we omit rather than fabricate. If a
// description column lands on the backend later, slot it in below the
// status row. The status_reason field is the closest we have, but
// it's only populated when status was changed with a reason; it is
// not a general description.

import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';

import type { WorkspaceView } from '../api/index.js';
import { PageErrorBanner, TextSkeleton } from '../components/index.js';
import { useWorkspaceContext } from '../hooks/index.js';
import { getEnumLabel } from '../i18n/labels.js';
import { formatRelativeTime } from '../lib/time.js';

export function WorkspaceHome(): JSX.Element {
  // Read projectId for the "missing param" guard. Everything else
  // comes from useWorkspaceContext which encapsulates the lookup.
  const { projectId } = useParams<{ projectId: string }>();
  const { query } = useWorkspaceContext();

  if (projectId === undefined) {
    return (
      <section data-testid="workspace-home-missing-id">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
        <p style={{ color: '#666', marginTop: '0.75rem' }}>
          No project id in the URL. Pick one from the project picker.
        </p>
      </section>
    );
  }

  if (query.isPending) {
    return (
      <section data-testid="workspace-home-loading">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
        <div style={{ marginTop: '1rem' }}>
          <TextSkeleton lines={2} ariaLabel="Loading project" />
        </div>
        <div
          style={{
            marginTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
            gap: '0.75rem',
          }}
        >
          <SummaryCardSkeleton testId="summary-card-today-loading" />
          <SummaryCardSkeleton testId="summary-card-validation-loading" />
          <SummaryCardSkeleton testId="summary-card-conversations-loading" />
          <SummaryCardSkeleton testId="summary-card-facts-loading" />
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section data-testid="workspace-home-error">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
        <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          ID: <span data-testid="workspace-id">{projectId}</span>
        </p>
        <div style={{ marginTop: '1rem' }}>
          <PageErrorBanner
            error={query.error}
            onRetry={() => query.refetch()}
            headline="Could not load this project"
          />
        </div>
      </section>
    );
  }

  const workspace = query.data;
  if (workspace === undefined) {
    // Defensive — should not happen once status is 'success'.
    return (
      <section data-testid="workspace-home-empty">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Project</h1>
        <p>This project has no data yet.</p>
      </section>
    );
  }

  const hasActivity = workspace.audit_chain_seq_high > 0;
  return (
    <section data-testid={hasActivity ? 'workspace-home-populated' : 'workspace-home-empty'}>
      <ProjectHeader workspace={workspace} />
      {!hasActivity ? (
        <p data-testid="workspace-home-empty-copy" style={{ color: '#666', marginTop: '1rem' }}>
          This project has no activity yet. Start by capturing your first conversation in Today.
        </p>
      ) : null}
      <div
        data-testid="summary-cards"
        style={{
          marginTop: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: '0.75rem',
        }}
      >
        <SummaryCardLink
          testId="summary-card-today"
          to={`/projects/${projectId}/today`}
          label="Today"
          description="What happened recently and what is worth looking at next."
        />
        <SummaryCardLink
          testId="summary-card-validation"
          to={`/projects/${projectId}/validation`}
          label="Validation"
          description="Facts that need a closer look."
        />
        <SummaryCardDisabled
          testId="summary-card-conversations"
          label="Conversations"
          description="A full conversation list view arrives in a later milestone."
        />
        <SummaryCardDisabled
          testId="summary-card-facts"
          label="Facts"
          description="A full fact list view arrives in a later milestone."
        />
      </div>
    </section>
  );
}

interface ProjectHeaderProps {
  readonly workspace: WorkspaceView;
}

function ProjectHeader({ workspace }: ProjectHeaderProps): JSX.Element {
  const name = workspace.name ?? 'Untitled project';
  const statusLabel = getEnumLabel('workspace_status', workspace.status);
  const createdAgo = formatRelativeTime(workspace.created_at);
  const updatedAgo = formatRelativeTime(workspace.status_changed_at);

  return (
    <header>
      <h1 data-testid="workspace-home-name" style={{ fontSize: '1.5rem', fontWeight: 500 }}>
        {name}
      </h1>
      <p style={{ color: '#666', marginTop: '0.25rem' }}>
        ID: <span data-testid="workspace-id">{workspace.id}</span>
      </p>
      <p
        data-testid="workspace-home-status"
        style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#444' }}
      >
        Status: <strong>{statusLabel}</strong>
      </p>
      <p
        style={{
          marginTop: '0.25rem',
          fontSize: '0.875rem',
          color: '#777',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.125rem',
        }}
      >
        {createdAgo !== '' ? (
          <span data-testid="workspace-home-created">Created {createdAgo}</span>
        ) : null}
        {updatedAgo !== '' ? (
          <span data-testid="workspace-home-updated">Status changed {updatedAgo}</span>
        ) : null}
      </p>
    </header>
  );
}

interface SummaryCardLinkProps {
  readonly testId: string;
  readonly to: string;
  readonly label: string;
  readonly description: string;
}

function SummaryCardLink({ testId, to, label, description }: SummaryCardLinkProps): JSX.Element {
  return (
    <Link
      to={to}
      data-testid={testId}
      style={{
        display: 'block',
        padding: '1rem',
        border: '1px solid #eee',
        borderRadius: '0.5rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <strong style={{ fontSize: '1rem' }}>{label}</strong>
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#666' }}>{description}</p>
    </Link>
  );
}

interface SummaryCardDisabledProps {
  readonly testId: string;
  readonly label: string;
  readonly description: string;
}

function SummaryCardDisabled({
  testId,
  label,
  description,
}: SummaryCardDisabledProps): JSX.Element {
  return (
    <div
      aria-disabled="true"
      data-testid={testId}
      title="This view arrives in a later milestone"
      style={{
        padding: '1rem',
        border: '1px dashed #ddd',
        borderRadius: '0.5rem',
        color: '#888',
        cursor: 'not-allowed',
        backgroundColor: '#fafafa',
      }}
    >
      <strong style={{ fontSize: '1rem' }}>{label}</strong>
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>{description}</p>
    </div>
  );
}

interface SummaryCardSkeletonProps {
  readonly testId: string;
}

function SummaryCardSkeleton({ testId }: SummaryCardSkeletonProps): JSX.Element {
  return (
    <output
      aria-label="Loading summary"
      aria-busy="true"
      data-testid={testId}
      style={{
        padding: '1rem',
        border: '1px solid #eee',
        borderRadius: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <TextSkeleton lines={2} ariaLabel="Loading summary" />
    </output>
  );
}
