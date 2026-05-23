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
  {
    id: '0003_workspace_status_columns',
    sql: `
      -- ============================================================
      -- Sprint 1 Task 3 — workspace API.
      --
      -- Adds the per-Data-Model §1.1 columns needed by the workspace
      -- routes:
      --   name                    human-editable label
      --   status                  active / paused / killed
      --   status_changed_at       ISO 8601 timestamp (NULL until first change)
      --   status_reason           user-provided when killing or pausing
      --   stage_at_open           cached journey stage (computed at session)
      --   portfolio_mode_enabled  cross-workspace knowledge opt-in
      --   discovery_archive_ref   pointer if Discovery was used
      --   schema_version          per-workspace bookkeeping
      --   audit_chain_seq_high    cached high-water mark for fast tail recovery
      --
      -- Existing rows (from migration 0001) get sensible defaults:
      --   - name defaults to NULL (route handlers fill in on first read)
      --   - status defaults to 'active'
      --   - schema_version defaults to 3
      --   - portfolio_mode_enabled defaults to 0 (false)
      --   - timestamp and reference columns default to NULL
      --
      -- The runner wraps this whole migration in a single transaction;
      -- if any ALTER fails, all roll back and the next openDb retries.
      -- ============================================================

      ALTER TABLE workspaces ADD COLUMN name TEXT;
      ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE workspaces ADD COLUMN status_changed_at TEXT;
      ALTER TABLE workspaces ADD COLUMN status_reason TEXT;
      ALTER TABLE workspaces ADD COLUMN stage_at_open TEXT;
      ALTER TABLE workspaces ADD COLUMN portfolio_mode_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE workspaces ADD COLUMN discovery_archive_ref TEXT;
      ALTER TABLE workspaces ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 3;
      ALTER TABLE workspaces ADD COLUMN audit_chain_seq_high INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX ix_workspaces_status ON workspaces(status);
    `,
  },
  {
    id: '0006_semantic_facts_versioning_tombstone_contested',
    sql: `
      -- ============================================================
      -- Sprint 1 Task 5B — fact versioning, contestation, tombstones.
      --
      -- Adds the six columns required by the fact lifecycle routes:
      --
      --   version_chain_root_id  TEXT  — id of the oldest ancestor in
      --                                   this fact's version chain.
      --                                   NULL means the fact has never
      --                                   been revised (it's its own
      --                                   trivial root). Set during the
      --                                   first revise() so both the
      --                                   original and the successor
      --                                   inherit the same root id.
      --
      --   superseded_by_fact_id  TEXT  — id of the fact that replaces
      --                                   this one in the chain. NULL
      --                                   for the head (live) version.
      --                                   Acts as the chain's forward
      --                                   pointer; walk from root via
      --                                   this field to enumerate
      --                                   history in temporal order.
      --
      --   contested_at           TEXT  — ISO 8601 when the user flagged
      --                                   this fact as contested. NULL
      --                                   when not currently contested.
      --                                   Contestation is recoverable
      --                                   (uncontest clears both
      --                                   columns).
      --
      --   contested_reason       TEXT  — user-provided reason text.
      --
      --   tombstoned_at          TEXT  — ISO 8601 when the user removed
      --                                   the fact's content for
      --                                   privacy. Irreversible: once
      --                                   set, the fact is read-only
      --                                   forever and its statement
      --                                   field carries a sentinel
      --                                   value '[tombstoned]'.
      --
      --   tombstone_reason       TEXT  — user-provided reason text.
      --
      -- All columns default to NULL. Pre-existing facts are unchanged.
      -- The runner wraps these ALTERs in a single transaction; partial
      -- application is impossible.
      -- ============================================================

      ALTER TABLE semantic_facts ADD COLUMN version_chain_root_id TEXT;
      ALTER TABLE semantic_facts ADD COLUMN superseded_by_fact_id TEXT;
      ALTER TABLE semantic_facts ADD COLUMN contested_at TEXT;
      ALTER TABLE semantic_facts ADD COLUMN contested_reason TEXT;
      ALTER TABLE semantic_facts ADD COLUMN tombstoned_at TEXT;
      ALTER TABLE semantic_facts ADD COLUMN tombstone_reason TEXT;

      -- Walk a version chain from any descendant. Partial index — only
      -- facts that have been revised carry this pointer.
      CREATE INDEX ix_facts_chain_root
        ON semantic_facts(workspace_id, version_chain_root_id)
        WHERE version_chain_root_id IS NOT NULL;

      -- Find the head of a chain: where superseded_by_fact_id IS NULL.
      -- (List + read endpoints filter on this to show only live facts
      --  by default.)
      CREATE INDEX ix_facts_head
        ON semantic_facts(workspace_id, id)
        WHERE superseded_by_fact_id IS NULL;

      -- Locate contested facts quickly (small partial index).
      CREATE INDEX ix_facts_contested
        ON semantic_facts(workspace_id, contested_at)
        WHERE contested_at IS NOT NULL;

      -- Locate tombstoned facts (small partial index; tombstones are
      -- typically rare per Memory Engine §14).
      CREATE INDEX ix_facts_tombstoned
        ON semantic_facts(workspace_id, tombstoned_at)
        WHERE tombstoned_at IS NOT NULL;
    `,
  },
  {
    id: '0007_conversations_table',
    sql: `
      -- ============================================================
      -- Sprint 1 Task 6A — Conversation API foundation.
      --
      -- Adds the two tables required by the conversation endpoints:
      --
      --   conversations                   one row per discovery interview
      --                                   / customer conversation. Captures
      --                                   the bookkeeping fields (who,
      --                                   when, type, outcome) plus an
      --                                   optional free-text summary.
      --
      --   conversation_verbatim_quotes    zero-or-more child rows per
      --                                   conversation. Each row stores
      --                                   one exact quote captured during
      --                                   the interview; position keeps
      --                                   call order stable across reads.
      --
      -- Enum vocabulary (enforced at the @manthanos/api service layer —
      -- mirrors the semantic_facts.tier pattern, which is also TEXT-only
      -- with app-layer validation):
      --
      --   audience_fit       target | adjacent | outside | unknown
      --   conversation_type  discovery | validation | sales | support | other
      --   outcome            validated | invalidated | inconclusive | follow_up
      --
      -- summary is nullable (optional input). verbatim quotes live in a
      -- child table so each quote has a stable id (Task 6B's extraction
      -- pipeline will link facts to specific quotes by id).
      --
      -- Foreign keys preserve workspace isolation. ON DELETE CASCADE on
      -- the child table is a safety net; in this commit the API does
      -- not yet delete conversations (tombstone deferred to Task 6B+).
      -- ============================================================

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        person_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        audience_fit TEXT NOT NULL,
        conversation_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        summary TEXT,
        created_at TEXT NOT NULL,
        audit_seq INTEGER NOT NULL
      );

      -- List by recency within a workspace (the default sort order).
      CREATE INDEX ix_conversations_workspace_occurred
        ON conversations(workspace_id, occurred_at DESC);

      -- Filter by audience fit. Not a partial index — all rows carry a
      -- value (the 'unknown' sentinel covers "not classified yet").
      CREATE INDEX ix_conversations_audience_fit
        ON conversations(workspace_id, audience_fit);

      -- Filter by conversation type (discovery vs validation vs ...).
      CREATE INDEX ix_conversations_type
        ON conversations(workspace_id, conversation_type);

      CREATE TABLE conversation_verbatim_quotes (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        position INTEGER NOT NULL,
        text TEXT NOT NULL
      );

      -- Bulk-read quotes for a conversation in stable position order.
      CREATE INDEX ix_quotes_conversation
        ON conversation_verbatim_quotes(conversation_id, position);
    `,
  },
  {
    id: '0008_conversation_tombstone_extraction_provenance',
    sql: `
      -- ============================================================
      -- Sprint 1 Task 6B commit 1 — schema for:
      --   conversation tombstone (mirrors fact tombstone)
      --   per-conversation extraction lifecycle
      --   content-provenance linkage (facts ↔ quotes / conversations)
      --
      -- API + service code lands in commits 2 and 3. This migration is
      -- structural only; pre-existing conversations inherit the column
      -- defaults (NULL for tombstone fields and last_extracted_at, the
      -- string 'pending' for fact_extraction_status).
      --
      -- Re-extraction policy (decided in the Task 6B plan): if extracted
      -- content matches an existing fact, a NEW provenance row is
      -- created pointing at the existing fact_id. Truth accumulates
      -- evidence; duplicate content corroborates rather than rejects.
      -- The schema permits many provenance rows per fact_id; no UNIQUE
      -- constraint forbids it.
      --
      -- Enum vocabularies (enforced at the @manthanos/api service
      -- layer — same TEXT-only pattern as semantic_facts.tier and the
      -- conversation enums in migration 0007):
      --
      --   fact_extraction_status   pending | extracted | skipped
      --   extractor                manual                 (more in 6C)
      --
      -- Indexes:
      --   ix_conversations_outcome              — closes a gap from
      --                                            the 6A audit (filter
      --                                            by outcome).
      --   ix_conversations_tombstoned           — partial; locate
      --                                            tombstoned rows.
      --   ix_conversations_extraction_status    — locate by status.
      --   ix_fact_provenance_fact               — list a fact's
      --                                            provenance.
      --   ix_fact_provenance_quote / _conversation
      --                                          — partial; reverse
      --                                            lookups when a
      --                                            quote/conversation
      --                                            is tombstoned.
      --   ix_fact_provenance_degraded           — partial; cheap
      --                                            EXISTS check for
      --                                            the FactView's
      --                                            derived
      --                                            provenance_degraded
      --                                            flag.
      -- ============================================================

      ALTER TABLE conversations ADD COLUMN tombstoned_at TEXT;
      ALTER TABLE conversations ADD COLUMN tombstone_reason TEXT;

      ALTER TABLE conversations
        ADD COLUMN fact_extraction_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE conversations ADD COLUMN last_extracted_at TEXT;

      CREATE INDEX ix_conversations_outcome
        ON conversations(workspace_id, outcome);

      CREATE INDEX ix_conversations_tombstoned
        ON conversations(workspace_id, tombstoned_at)
        WHERE tombstoned_at IS NOT NULL;

      CREATE INDEX ix_conversations_extraction_status
        ON conversations(workspace_id, fact_extraction_status);

      CREATE TABLE fact_provenance_sources (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        fact_id TEXT NOT NULL REFERENCES semantic_facts(id),
        quote_id TEXT REFERENCES conversation_verbatim_quotes(id),
        conversation_id TEXT REFERENCES conversations(id),
        extracted_at TEXT NOT NULL,
        extractor TEXT NOT NULL,
        degraded_at TEXT,
        degraded_reason TEXT
      );

      CREATE INDEX ix_fact_provenance_fact
        ON fact_provenance_sources(fact_id);

      CREATE INDEX ix_fact_provenance_quote
        ON fact_provenance_sources(quote_id)
        WHERE quote_id IS NOT NULL;

      CREATE INDEX ix_fact_provenance_conversation
        ON fact_provenance_sources(conversation_id)
        WHERE conversation_id IS NOT NULL;

      CREATE INDEX ix_fact_provenance_degraded
        ON fact_provenance_sources(workspace_id, degraded_at)
        WHERE degraded_at IS NOT NULL;
    `,
  },
];
