// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Migration 0008 schema-verification test.
// Confirms conversation tombstone columns, extraction lifecycle columns,
// fact_provenance_sources table, and all new indexes.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';

interface ColumnRow {
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
}

interface IndexRow {
  name: string;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mws-mig8-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migration 0008 — conversation tombstone + extraction status + provenance', () => {
  it('adds tombstone + extraction columns to conversations with the right shape', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle.prepare('PRAGMA table_info(conversations)').all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      // Tombstone columns — nullable, default NULL.
      for (const name of ['tombstoned_at', 'tombstone_reason']) {
        const col = byName.get(name);
        expect(col, `column ${name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `${name} type`).toBe('TEXT');
        expect(col.notnull, `${name} notnull`).toBe(0);
        expect(col.dflt_value, `${name} default`).toBeNull();
      }

      // last_extracted_at — nullable TEXT, default NULL.
      const lastExtracted = byName.get('last_extracted_at');
      expect(lastExtracted).toBeDefined();
      expect(lastExtracted?.type).toBe('TEXT');
      expect(lastExtracted?.notnull).toBe(0);
      expect(lastExtracted?.dflt_value).toBeNull();

      // fact_extraction_status — NOT NULL, default 'pending'.
      const status = byName.get('fact_extraction_status');
      expect(status).toBeDefined();
      expect(status?.type).toBe('TEXT');
      expect(status?.notnull).toBe(1);
      // SQLite stores the default expression as written; quoted string.
      expect(status?.dflt_value).toBe("'pending'");
    } finally {
      m.close();
    }
  });

  it('defaults fact_extraction_status to pending on insert without specifying it', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 8, 0)`,
        )
        .run('ws-mig8a', '/tmp/mig8a', new Date().toISOString());

      m.handle
        .prepare(
          `INSERT INTO conversations (
             id, workspace_id, person_name, occurred_at, audience_fit,
             conversation_type, outcome, summary, created_at, audit_seq
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'conv-default',
          'ws-mig8a',
          'Alex',
          '2026-05-20T15:00:00.000Z',
          'target',
          'discovery',
          'validated',
          null,
          new Date().toISOString(),
          0,
        );

      const row = m.handle
        .prepare(
          'SELECT fact_extraction_status, last_extracted_at, tombstoned_at, tombstone_reason FROM conversations WHERE id = ?',
        )
        .get('conv-default') as Record<string, unknown>;
      expect(row.fact_extraction_status).toBe('pending');
      expect(row.last_extracted_at).toBeNull();
      expect(row.tombstoned_at).toBeNull();
      expect(row.tombstone_reason).toBeNull();
    } finally {
      m.close();
    }
  });

  it('creates the fact_provenance_sources table with the right columns', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle
        .prepare('PRAGMA table_info(fact_provenance_sources)')
        .all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      const required: Array<{ name: string; type: string; notnull: 0 | 1 }> = [
        { name: 'id', type: 'TEXT', notnull: 1 },
        { name: 'workspace_id', type: 'TEXT', notnull: 1 },
        { name: 'fact_id', type: 'TEXT', notnull: 1 },
        { name: 'quote_id', type: 'TEXT', notnull: 0 },
        { name: 'conversation_id', type: 'TEXT', notnull: 0 },
        { name: 'extracted_at', type: 'TEXT', notnull: 1 },
        { name: 'extractor', type: 'TEXT', notnull: 1 },
        { name: 'degraded_at', type: 'TEXT', notnull: 0 },
        { name: 'degraded_reason', type: 'TEXT', notnull: 0 },
      ];
      for (const r of required) {
        const col = byName.get(r.name);
        expect(col, `column ${r.name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `${r.name} type`).toBe(r.type);
        expect(col.notnull, `${r.name} notnull`).toBe(r.notnull);
      }
    } finally {
      m.close();
    }
  });

  it('creates all new indexes', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const indexes = m.handle
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('conversations', 'fact_provenance_sources')",
        )
        .all() as IndexRow[];
      const names = new Set(indexes.map((i) => i.name));
      for (const expected of [
        'ix_conversations_outcome',
        'ix_conversations_tombstoned',
        'ix_conversations_extraction_status',
        'ix_fact_provenance_fact',
        'ix_fact_provenance_quote',
        'ix_fact_provenance_conversation',
        'ix_fact_provenance_degraded',
      ]) {
        expect(names.has(expected), `index ${expected} missing`).toBe(true);
      }
    } finally {
      m.close();
    }
  });

  it('records itself in schema_migrations', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const ids = (
        m.handle.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{
          id: string;
        }>
      ).map((r) => r.id);
      expect(ids).toContain('0008_conversation_tombstone_extraction_provenance');
    } finally {
      m.close();
    }
  });

  it('round-trips a fact + quote + provenance triple through INSERT/SELECT', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const now = new Date().toISOString();

      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 8, 0)`,
        )
        .run('ws-mig8b', '/tmp/mig8b', now);

      m.handle
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run('fact-A', 'ws-mig8b', 'audience', 'they use Toggl', 'hashA', 'T0', now, 0.3, 0, now);

      m.handle
        .prepare(
          `INSERT INTO conversations (
             id, workspace_id, person_name, occurred_at, audience_fit,
             conversation_type, outcome, summary, created_at, audit_seq
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('conv-A', 'ws-mig8b', 'Alex', now, 'target', 'discovery', 'validated', null, now, 1);

      m.handle
        .prepare(
          `INSERT INTO conversation_verbatim_quotes (
             id, conversation_id, workspace_id, position, text
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run('quote-A', 'conv-A', 'ws-mig8b', 0, 'we use Toggl daily');

      // Provenance row pointing at the quote (and indirectly the conversation).
      m.handle
        .prepare(
          `INSERT INTO fact_provenance_sources (
             id, workspace_id, fact_id, quote_id, conversation_id,
             extracted_at, extractor
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('prov-A', 'ws-mig8b', 'fact-A', 'quote-A', null, now, 'manual');

      // Read it back with joins to confirm every FK resolves.
      const joined = m.handle
        .prepare(
          `SELECT p.id AS provenance_id, p.extractor,
                  f.id AS fact_id, f.statement,
                  q.id AS quote_id, q.text,
                  c.id AS conversation_id, c.person_name
             FROM fact_provenance_sources p
             JOIN semantic_facts f ON f.id = p.fact_id
             LEFT JOIN conversation_verbatim_quotes q ON q.id = p.quote_id
             LEFT JOIN conversations c ON c.id = q.conversation_id
            WHERE p.workspace_id = ?`,
        )
        .get('ws-mig8b') as Record<string, unknown>;
      expect(joined.provenance_id).toBe('prov-A');
      expect(joined.extractor).toBe('manual');
      expect(joined.fact_id).toBe('fact-A');
      expect(joined.statement).toBe('they use Toggl');
      expect(joined.quote_id).toBe('quote-A');
      expect(joined.text).toBe('we use Toggl daily');
      expect(joined.conversation_id).toBe('conv-A');
      expect(joined.person_name).toBe('Alex');
    } finally {
      m.close();
    }
  });

  it('supports multiple provenance rows per fact (corroboration model)', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const now = new Date().toISOString();

      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 8, 0)`,
        )
        .run('ws-mig8c', '/tmp/mig8c', now);

      m.handle
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          'fact-B',
          'ws-mig8c',
          'audience',
          'spreadsheet for invoicing',
          'hashB',
          'T0',
          now,
          0.3,
          0,
          now,
        );

      // Three different conversations, each contributing one quote that
      // corroborates the same fact — the canonical multi-source scenario.
      const insertConv = m.handle.prepare(
        `INSERT INTO conversations (
           id, workspace_id, person_name, occurred_at, audience_fit,
           conversation_type, outcome, summary, created_at, audit_seq
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      );
      insertConv.run('conv-x', 'ws-mig8c', 'X', now, 'target', 'discovery', 'validated', now, 2);
      insertConv.run('conv-y', 'ws-mig8c', 'Y', now, 'target', 'discovery', 'validated', now, 3);
      insertConv.run('conv-z', 'ws-mig8c', 'Z', now, 'target', 'discovery', 'validated', now, 4);

      const insertProv = m.handle.prepare(
        `INSERT INTO fact_provenance_sources (
           id, workspace_id, fact_id, quote_id, conversation_id,
           extracted_at, extractor
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      insertProv.run('p1', 'ws-mig8c', 'fact-B', null, 'conv-x', now, 'manual');
      insertProv.run('p2', 'ws-mig8c', 'fact-B', null, 'conv-y', now, 'manual');
      insertProv.run('p3', 'ws-mig8c', 'fact-B', null, 'conv-z', now, 'manual');

      const count = m.handle
        .prepare('SELECT COUNT(*) AS n FROM fact_provenance_sources WHERE fact_id = ?')
        .get('fact-B') as { n: number };
      expect(count.n).toBe(3);
    } finally {
      m.close();
    }
  });

  it('enforces FOREIGN KEY constraints on provenance source ids', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const now = new Date().toISOString();
      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 8, 0)`,
        )
        .run('ws-mig8e', '/tmp/mig8e', now);
      m.handle
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run('fact-fk', 'ws-mig8e', 'a', 's', 'h', 'T0', now, 0.3, 0, now);

      // Inserting a provenance row that points at a non-existent
      // conversation_id must fail at the DB level. FK enforcement is
      // ON globally (db.ts:50).
      expect(() =>
        m.handle
          .prepare(
            `INSERT INTO fact_provenance_sources (
               id, workspace_id, fact_id, quote_id, conversation_id,
               extracted_at, extractor
             ) VALUES (?, ?, ?, NULL, ?, ?, 'manual')`,
          )
          .run('p-bad', 'ws-mig8e', 'fact-fk', 'conv-does-not-exist', now),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      m.close();
    }
  });

  it('partial degraded index keeps a degraded EXISTS check cheap', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const now = new Date().toISOString();
      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 8, 0)`,
        )
        .run('ws-mig8d', '/tmp/mig8d', now);
      m.handle
        .prepare(
          `INSERT INTO semantic_facts (
             id, workspace_id, area, statement, statement_hash,
             provenance_workflow_id, tier, last_corroborated, confidence,
             audit_seq, last_administratively_touched
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run('fact-C', 'ws-mig8d', 'a', 's', 'h', 'T0', now, 0.3, 0, now);
      m.handle
        .prepare(
          `INSERT INTO fact_provenance_sources (
             id, workspace_id, fact_id, quote_id, conversation_id,
             extracted_at, extractor, degraded_at, degraded_reason
           ) VALUES (?, ?, ?, NULL, NULL, ?, 'manual', ?, ?)`,
        )
        .run('p-deg', 'ws-mig8d', 'fact-C', now, now, 'source_conversation_tombstoned');

      // EXPLAIN QUERY PLAN should reference the partial index for a degraded lookup.
      const plan = m.handle
        .prepare(
          `EXPLAIN QUERY PLAN
             SELECT 1 FROM fact_provenance_sources
              WHERE workspace_id = ? AND degraded_at IS NOT NULL
              LIMIT 1`,
        )
        .all('ws-mig8d') as Array<{ detail: string }>;
      const planText = plan.map((p) => p.detail).join(' | ');
      expect(planText).toContain('ix_fact_provenance_degraded');
    } finally {
      m.close();
    }
  });
});
