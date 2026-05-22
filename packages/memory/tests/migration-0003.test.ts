// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Migration 0003 schema-verification test.
// Confirms the new workspace columns exist with the expected defaults
// and that the supporting status index is created.

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
  dir = await mkdtemp(path.join(tmpdir(), 'mws-mig3-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migration 0003 — workspace status columns', () => {
  it('adds all 9 columns with expected types and defaults', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle.prepare('PRAGMA table_info(workspaces)').all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      // Pre-existing columns still present.
      expect(byName.has('id')).toBe(true);
      expect(byName.has('root_path')).toBe(true);
      expect(byName.has('created_at')).toBe(true);

      // New columns.
      const expected = [
        { name: 'name', type: 'TEXT', notnull: 0 as const, default: null },
        { name: 'status', type: 'TEXT', notnull: 1 as const, default: "'active'" },
        { name: 'status_changed_at', type: 'TEXT', notnull: 0 as const, default: null },
        { name: 'status_reason', type: 'TEXT', notnull: 0 as const, default: null },
        { name: 'stage_at_open', type: 'TEXT', notnull: 0 as const, default: null },
        {
          name: 'portfolio_mode_enabled',
          type: 'INTEGER',
          notnull: 1 as const,
          default: '0',
        },
        { name: 'discovery_archive_ref', type: 'TEXT', notnull: 0 as const, default: null },
        { name: 'schema_version', type: 'INTEGER', notnull: 1 as const, default: '3' },
        {
          name: 'audit_chain_seq_high',
          type: 'INTEGER',
          notnull: 1 as const,
          default: '0',
        },
      ];

      for (const e of expected) {
        const col = byName.get(e.name);
        expect(col, `column ${e.name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `column ${e.name} type`).toBe(e.type);
        expect(col.notnull, `column ${e.name} notnull`).toBe(e.notnull);
        expect(col.dflt_value, `column ${e.name} default`).toBe(e.default);
      }
    } finally {
      m.close();
    }
  });

  it('creates the workspaces.status index', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const indexes = m.handle
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='workspaces'")
        .all() as IndexRow[];
      const names = new Set(indexes.map((i) => i.name));
      expect(names.has('ix_workspaces_status')).toBe(true);
    } finally {
      m.close();
    }
  });

  it('records itself in schema_migrations', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const recorded = m.handle
        .prepare('SELECT id FROM schema_migrations ORDER BY id')
        .all() as Array<{ id: string }>;
      const ids = recorded.map((r) => r.id);
      expect(ids).toContain('0003_workspace_status_columns');
    } finally {
      m.close();
    }
  });

  it('can insert a workspace row using only the originally-required fields', async () => {
    // Existing call-sites that don't know about the new columns must keep
    // working — the new columns either are nullable or have valid defaults.
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      m.handle
        .prepare('INSERT INTO workspaces (id, root_path, created_at) VALUES (?, ?, ?)')
        .run('ws-legacy', '/some/path', new Date().toISOString());
      const row = m.handle.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws-legacy') as
        | Record<string, unknown>
        | undefined;
      expect(row).toBeDefined();
      expect(row?.status).toBe('active');
      expect(row?.portfolio_mode_enabled).toBe(0);
      expect(row?.schema_version).toBe(3);
      expect(row?.audit_chain_seq_high).toBe(0);
      expect(row?.name).toBeNull();
    } finally {
      m.close();
    }
  });
});
