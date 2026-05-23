// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Migration 0007 schema-verification test.
// Confirms conversations + conversation_verbatim_quotes tables and indexes.

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
  dir = await mkdtemp(path.join(tmpdir(), 'mws-mig7-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migration 0007 — conversations table', () => {
  it('creates the conversations table with the expected columns', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle.prepare('PRAGMA table_info(conversations)').all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      const required: Array<{ name: string; type: string; notnull: 0 | 1 }> = [
        { name: 'id', type: 'TEXT', notnull: 1 },
        { name: 'workspace_id', type: 'TEXT', notnull: 1 },
        { name: 'person_name', type: 'TEXT', notnull: 1 },
        { name: 'occurred_at', type: 'TEXT', notnull: 1 },
        { name: 'audience_fit', type: 'TEXT', notnull: 1 },
        { name: 'conversation_type', type: 'TEXT', notnull: 1 },
        { name: 'outcome', type: 'TEXT', notnull: 1 },
        { name: 'summary', type: 'TEXT', notnull: 0 },
        { name: 'created_at', type: 'TEXT', notnull: 1 },
        { name: 'audit_seq', type: 'INTEGER', notnull: 1 },
      ];
      for (const r of required) {
        const col = byName.get(r.name);
        expect(col, `column ${r.name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `column ${r.name} type`).toBe(r.type);
        expect(col.notnull, `column ${r.name} notnull`).toBe(r.notnull);
      }
    } finally {
      m.close();
    }
  });

  it('creates the conversation_verbatim_quotes child table', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle
        .prepare('PRAGMA table_info(conversation_verbatim_quotes)')
        .all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));

      for (const name of ['id', 'conversation_id', 'workspace_id', 'position', 'text']) {
        expect(byName.get(name), `column ${name} missing`).toBeDefined();
      }
      // position is INTEGER, others are TEXT.
      expect(byName.get('position')?.type).toBe('INTEGER');
      expect(byName.get('text')?.type).toBe('TEXT');
    } finally {
      m.close();
    }
  });

  it('creates all expected indexes', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const indexes = m.handle
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('conversations', 'conversation_verbatim_quotes')",
        )
        .all() as IndexRow[];
      const names = new Set(indexes.map((i) => i.name));
      for (const expected of [
        'ix_conversations_workspace_occurred',
        'ix_conversations_audience_fit',
        'ix_conversations_type',
        'ix_quotes_conversation',
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
      expect(ids).toContain('0007_conversations_table');
    } finally {
      m.close();
    }
  });

  it('round-trips a conversation + quote pair through INSERT/SELECT', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      m.handle
        .prepare(
          `INSERT INTO workspaces (id, root_path, created_at, status, schema_version, audit_chain_seq_high)
           VALUES (?, ?, ?, 'active', 7, 0)`,
        )
        .run('ws-mig7', '/tmp/mig7', new Date().toISOString());

      m.handle
        .prepare(
          `INSERT INTO conversations (
            id, workspace_id, person_name, occurred_at, audience_fit,
            conversation_type, outcome, summary, created_at, audit_seq
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'conv-1',
          'ws-mig7',
          'Alex Smith',
          '2026-05-20T15:00:00.000Z',
          'target',
          'discovery',
          'validated',
          'Strong fit; uses Toggl daily.',
          new Date().toISOString(),
          0,
        );

      m.handle
        .prepare(
          `INSERT INTO conversation_verbatim_quotes (
            id, conversation_id, workspace_id, position, text
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          'quote-1',
          'conv-1',
          'ws-mig7',
          0,
          'I switched from Harvest because Toggl was simpler.',
        );

      const conv = m.handle
        .prepare('SELECT * FROM conversations WHERE id = ?')
        .get('conv-1') as Record<string, unknown>;
      expect(conv.person_name).toBe('Alex Smith');
      expect(conv.audience_fit).toBe('target');
      expect(conv.summary).toBe('Strong fit; uses Toggl daily.');

      const quotes = m.handle
        .prepare('SELECT * FROM conversation_verbatim_quotes WHERE conversation_id = ?')
        .all('conv-1') as Array<Record<string, unknown>>;
      expect(quotes).toHaveLength(1);
      expect(quotes[0]?.position).toBe(0);
      expect(quotes[0]?.text).toBe('I switched from Harvest because Toggl was simpler.');
    } finally {
      m.close();
    }
  });
});
