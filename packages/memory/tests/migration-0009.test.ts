// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Migration 0009 schema-verification test (Sprint 3B.1).
// Confirms the additive, nullable extraction-metadata columns on
// fact_provenance_sources and that inserts work with and without them.

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

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mws-mig9-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const NEW_COLUMNS: ReadonlyArray<[name: string, type: string]> = [
  ['extraction_confidence', 'REAL'],
  ['extractor_version', 'TEXT'],
  ['model_used', 'TEXT'],
  ['reason_flags', 'TEXT'],
];

describe('migration 0009 — extraction confidence/provenance metadata', () => {
  it('adds the four metadata columns as nullable with no default', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const cols = m.handle
        .prepare('PRAGMA table_info(fact_provenance_sources)')
        .all() as ColumnRow[];
      const byName = new Map(cols.map((c) => [c.name, c]));
      for (const [name, type] of NEW_COLUMNS) {
        const col = byName.get(name);
        expect(col, `column ${name} missing`).toBeDefined();
        if (!col) continue;
        expect(col.type, `${name} type`).toBe(type);
        expect(col.notnull, `${name} must be nullable`).toBe(0);
        expect(col.dflt_value, `${name} default`).toBeNull();
      }
    } finally {
      m.close();
    }
  });

  it('preserves the original columns (additive only)', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      const names = (
        m.handle.prepare('PRAGMA table_info(fact_provenance_sources)').all() as ColumnRow[]
      ).map((c) => c.name);
      for (const original of [
        'id',
        'workspace_id',
        'fact_id',
        'quote_id',
        'conversation_id',
        'extracted_at',
        'extractor',
        'degraded_at',
        'degraded_reason',
      ]) {
        expect(names, `original column ${original} preserved`).toContain(original);
      }
    } finally {
      m.close();
    }
  });

  it('allows inserting a row WITHOUT the new columns (back-compat)', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      // This test exercises the new columns' storage/nullability, not
      // referential integrity, so we don't materialize parent fact/conv rows.
      m.handle.pragma('foreign_keys = OFF');
      m.handle
        .prepare('INSERT INTO workspaces (id, root_path, created_at) VALUES (?, ?, ?)')
        .run('ws-mig9', '/tmp/ws', '2026-05-24T00:00:00.000Z');
      // Minimal provenance row; the new columns are omitted entirely.
      m.handle
        .prepare(
          `INSERT INTO fact_provenance_sources
             (id, workspace_id, fact_id, conversation_id, extracted_at, extractor)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('prov-1', 'ws-mig9', 'fact-1', 'conv-1', '2026-05-24T00:00:00.000Z', 'manual');
      const row = m.handle
        .prepare(
          'SELECT extraction_confidence, extractor_version, model_used, reason_flags FROM fact_provenance_sources WHERE id = ?',
        )
        .get('prov-1') as Record<string, unknown>;
      expect(row.extraction_confidence).toBeNull();
      expect(row.extractor_version).toBeNull();
      expect(row.model_used).toBeNull();
      expect(row.reason_flags).toBeNull();
    } finally {
      m.close();
    }
  });

  it('stores a numeric confidence and JSON reason_flags when provided', async () => {
    const m = await openDb({ dbPath: path.join(dir, 'manthan.db'), noWal: true });
    try {
      // This test exercises the new columns' storage/nullability, not
      // referential integrity, so we don't materialize parent fact/conv rows.
      m.handle.pragma('foreign_keys = OFF');
      m.handle
        .prepare('INSERT INTO workspaces (id, root_path, created_at) VALUES (?, ?, ?)')
        .run('ws-mig9b', '/tmp/ws', '2026-05-24T00:00:00.000Z');
      m.handle
        .prepare(
          `INSERT INTO fact_provenance_sources
             (id, workspace_id, fact_id, conversation_id, extracted_at, extractor,
              extraction_confidence, extractor_version, model_used, reason_flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'prov-2',
          'ws-mig9b',
          'fact-2',
          'conv-2',
          '2026-05-24T00:00:00.000Z',
          'ai_assisted',
          0.82,
          'det+llm-1',
          'test-model',
          JSON.stringify(['quote_backed', 'has_clear_claim']),
        );
      const row = m.handle
        .prepare(
          'SELECT extraction_confidence, extractor_version, model_used, reason_flags FROM fact_provenance_sources WHERE id = ?',
        )
        .get('prov-2') as Record<string, unknown>;
      expect(row.extraction_confidence).toBeCloseTo(0.82);
      expect(row.extractor_version).toBe('det+llm-1');
      expect(row.model_used).toBe('test-model');
      expect(JSON.parse(row.reason_flags as string)).toEqual(['quote_backed', 'has_clear_claim']);
    } finally {
      m.close();
    }
  });
});
