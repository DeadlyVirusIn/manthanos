// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Initial SQLite schema for ManthanOS Phase 1.
// Index strategy per ARCHITECTURE.md §9. Brain-correction tables per
// ARCHITECTURE.md §7.4 and §7.5.
//
// Migrations are applied in order; each migration is a single .sql string
// run inside a transaction. New migrations get a fresh file/string.

export const MIGRATIONS: ReadonlyArray<{ readonly id: string; readonly sql: string }> = [
  {
    id: '0001_initial',
    sql: `
      -- ============================================================
      -- Schema metadata
      -- ============================================================
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      -- ============================================================
      -- Workspaces (one per repo for MVP)
      -- ============================================================
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        root_path TEXT NOT NULL,
        git_remote_hash TEXT,
        created_at TEXT NOT NULL
      );

      -- ============================================================
      -- Agents / adapters (metadata captured at workflow runtime)
      -- ============================================================
      CREATE TABLE agents (
        id TEXT PRIMARY KEY NOT NULL,
        provider TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        first_seen TEXT NOT NULL
      );

      -- ============================================================
      -- Workflows + steps
      -- ============================================================
      CREATE TABLE workflows (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        type TEXT NOT NULL,
        version TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_usd_micro INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX ix_workflows_ws_started ON workflows(workspace_id, started_at DESC);
      CREATE INDEX ix_workflows_type ON workflows(workspace_id, type, started_at DESC);

      CREATE TABLE workflow_steps (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        step_order INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        adapter_id TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        usd_micro INTEGER,
        latency_ms INTEGER,
        status TEXT NOT NULL,
        audit_seq INTEGER
      );
      CREATE INDEX ix_workflow_steps_wf ON workflow_steps(workflow_id, step_order);
      CREATE INDEX ix_workflow_steps_adapter ON workflow_steps(adapter_id);

      -- ============================================================
      -- Audit events (SQLite as source of truth; JSONL is derived)
      -- ============================================================
      CREATE TABLE audit_events (
        seq INTEGER NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        ts TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_hash TEXT,
        decision TEXT NOT NULL,
        prev_hash TEXT,
        self_hash TEXT NOT NULL,
        PRIMARY KEY (workspace_id, seq)
      );
      CREATE INDEX ix_audit_events_ws_ts ON audit_events(workspace_id, ts DESC);
      CREATE INDEX ix_audit_events_kind ON audit_events(workspace_id, kind, ts DESC);

      -- ============================================================
      -- Blob index — maps content-hash to blob path + meta.
      -- The blob FILES live in .manthan/audit/blobs/<2>/<rest>.json.
      -- This table is the queryable index; recovery (R4) verifies
      -- the file matches.
      -- ============================================================
      CREATE TABLE blobs (
        payload_hash TEXT PRIMARY KEY NOT NULL,
        size_bytes INTEGER NOT NULL,
        first_referenced_at TEXT NOT NULL
      );

      CREATE TABLE orphan_blobs (
        payload_hash TEXT PRIMARY KEY NOT NULL,
        size_bytes INTEGER NOT NULL,
        discovered_at TEXT NOT NULL
      );

      -- ============================================================
      -- Decisions (signed commitments)
      -- ============================================================
      CREATE TABLE decisions (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        workflow_id TEXT REFERENCES workflows(id),
        area TEXT NOT NULL,
        summary TEXT NOT NULL,
        rationale TEXT NOT NULL,
        approver TEXT,
        signed_at TEXT,
        supersedes_id TEXT REFERENCES decisions(id),
        audit_seq INTEGER NOT NULL
      );
      CREATE INDEX ix_decisions_area ON decisions(workspace_id, area, signed_at DESC);
      CREATE INDEX ix_decisions_supersedes ON decisions(supersedes_id);

      -- ============================================================
      -- Semantic facts and the trust-tier model (ARCH §7.5)
      -- ============================================================
      CREATE TABLE semantic_facts (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        area TEXT NOT NULL,
        statement TEXT NOT NULL,
        statement_hash TEXT NOT NULL,
        provenance_workflow_id TEXT REFERENCES workflows(id),
        tier TEXT NOT NULL,
        last_corroborated TEXT NOT NULL,
        confidence REAL NOT NULL,
        audit_seq INTEGER NOT NULL
      );
      CREATE INDEX ix_facts_area ON semantic_facts(workspace_id, area, last_corroborated DESC);
      CREATE INDEX ix_facts_tier ON semantic_facts(workspace_id, tier, area);

      CREATE TABLE corroborations (
        fact_id TEXT NOT NULL REFERENCES semantic_facts(id),
        workflow_run_id TEXT NOT NULL REFERENCES workflows(id),
        observed_at TEXT NOT NULL,
        PRIMARY KEY (fact_id, workflow_run_id)
      );

      CREATE TABLE contradictions (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        area TEXT NOT NULL,
        fact_a_id TEXT NOT NULL REFERENCES semantic_facts(id),
        fact_b_id TEXT NOT NULL REFERENCES semantic_facts(id),
        detected_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE corrective_signals (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        area TEXT NOT NULL,
        rejected_workflow_id TEXT REFERENCES workflows(id),
        signal_text TEXT NOT NULL,
        ts TEXT NOT NULL,
        audit_seq INTEGER NOT NULL
      );
      CREATE INDEX ix_corrective_signals_area ON corrective_signals(workspace_id, area, ts DESC);

      CREATE TABLE open_issues (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        area TEXT NOT NULL,
        summary TEXT NOT NULL,
        severity INTEGER NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        contradiction_id TEXT REFERENCES contradictions(id)
      );
      CREATE INDEX ix_open_issues_open ON open_issues(workspace_id, area)
        WHERE closed_at IS NULL;

      -- ============================================================
      -- Cost anomalies (ARCH §11)
      -- ============================================================
      CREATE TABLE cost_anomalies (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        workflow_id TEXT REFERENCES workflows(id),
        expected_usd_micro INTEGER NOT NULL,
        actual_usd_micro INTEGER NOT NULL,
        z_score REAL NOT NULL,
        detected_at TEXT NOT NULL
      );
      CREATE INDEX ix_cost_anomalies_ws_ts ON cost_anomalies(workspace_id, detected_at DESC);

      -- ============================================================
      -- Git hooks snapshot (SAFETY §11d)
      -- ============================================================
      CREATE TABLE git_hooks (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        hook_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        accepted INTEGER NOT NULL DEFAULT 0,
        accepted_at TEXT,
        PRIMARY KEY (workspace_id, hook_path)
      );

      -- ============================================================
      -- Context snapshots (cached bundles)
      -- ============================================================
      CREATE TABLE context_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        workflow_id TEXT REFERENCES workflows(id),
        bundle_hash TEXT NOT NULL,
        layers_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX ix_context_snapshots_bundle ON context_snapshots(bundle_hash);
    `,
  },
  {
    id: '0002_decay_semantic_fix',
    sql: `
      -- ============================================================
      -- Stabilization §3.1 — separate "last corroborated" from
      -- "last administratively touched". Prior to this migration,
      -- last_corroborated was overwritten by every administrative
      -- mutation (decay, dedup, demote), so decay's staleness signal
      -- measured the wrong thing. We add a new column for
      -- administrative touches and stop updating last_corroborated
      -- on non-corroboration events going forward.
      --
      -- Existing rows get last_administratively_touched seeded from
      -- last_corroborated (conservative: keeps the old value flowing
      -- forward) so post-migration behavior is no worse than before.
      -- New events diverge the two columns correctly.
      -- ============================================================
      ALTER TABLE semantic_facts ADD COLUMN last_administratively_touched TEXT NOT NULL DEFAULT '';
      UPDATE semantic_facts SET last_administratively_touched = last_corroborated
        WHERE last_administratively_touched = '';
    `,
  },
];
