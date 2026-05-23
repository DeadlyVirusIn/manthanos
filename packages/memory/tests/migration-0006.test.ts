// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Migration 0006 schema-verification test.
// Confirms version-chain / contestation / tombstone columns + indexes.

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
  dir = await mkdtemp(path.join(tmpdir(), 'mws-mig6-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migration 0006 — fact versioning / contestation / tombstone', () => {
  it('adds all 6 columns with TEXT type, nullable, default NULL', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle.prepare('PRAGMA table_info(semantic_facts)').all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      for (const name of [
        'version_chain_root_id',
        'superseded_by_fact_id',
        'contested_at',
        'contested_reason',
        'tombstoned_at',
        'tombstone_reason',
      ]) {
        const col = byName.get(name);
        expect(col, `column ${name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `column ${name} type`).toBe('TEXT');
        expect(col.notnull, `column ${name} notnull`).toBe(0);
        expect(col.dflt_value, `column ${name} default`).toBeNull();
      }
    } finally {
      m.close();
    }
  });

  it('creates all 4 partial indexes', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const indexes = m.handle
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='semantic_facts'")
        .all() as IndexRow[];
      const names = new Set(indexes.map((i) => i.name));
      for (const expected of [
        'ix_facts_chain_root',
        'ix_facts_head',
        'ix_facts_contested',
        'ix_facts_tombstoned',
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
      expect(ids).toContain('0006_semantic_facts_versioning_tombstone_contested');
    } finally {
      m.close();
    }
  });

  it('allows pre-existing fact-insert call sites to keep working (NULL defaults)', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      // Bootstrap a workspace so the fact FK passes.
      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 6, 0)`,
        )
        .run('ws-mig6', '/tmp/mig6', new Date().toISOString());

      m.handle
        .prepare(
          `INSERT INTO semantic_facts (
            id, workspace_id, area, statement, statement_hash,
            provenance_workflow_id, tier, last_corroborated, confidence, audit_seq
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
          'fact-legacy',
          'ws-mig6',
          'audience',
          'they use Toggl',
          'somehash',
          'T0',
          new Date().toISOString(),
          0.3,
          0,
        );

      const row = m.handle
        .prepare('SELECT * FROM semantic_facts WHERE id = ?')
        .get('fact-legacy') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.version_chain_root_id).toBeNull();
      expect(row.superseded_by_fact_id).toBeNull();
      expect(row.contested_at).toBeNull();
      expect(row.contested_reason).toBeNull();
      expect(row.tombstoned_at).toBeNull();
      expect(row.tombstone_reason).toBeNull();
    } finally {
      m.close();
    }
  });
});
