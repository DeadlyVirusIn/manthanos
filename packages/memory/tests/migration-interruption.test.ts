// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Audit BUG-6 regression test. Confirms that a migration which throws
// mid-execution leaves no partial schema change AND no schema_migrations
// row for the failed migration, so the next openDb() can re-attempt it
// cleanly.

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../src/db.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  // Bootstrap the schema_migrations table the same way the runner does
  // via the initial migration 0001.
  db.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
});

afterEach(() => {
  db.close();
});

describe('migration runner atomicity (BUG-6)', () => {
  it('rolls back partial schema changes when a migration throws', () => {
    const throwingMigration = {
      id: 'test_throwing',
      sql: `
        CREATE TABLE m1_partial (id INTEGER PRIMARY KEY);
        INSERT INTO m1_partial (id) VALUES (1);
        -- Force a constraint violation to interrupt the migration.
        INSERT INTO m1_partial (id) VALUES (1);
      `,
    };

    expect(() => applyMigrations(db, [throwingMigration])).toThrow(/UNIQUE/i);

    // The partial table must not exist.
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='m1_partial'")
      .all();
    expect(tables).toEqual([]);

    // schema_migrations must not contain the failed migration.
    const recorded = db
      .prepare("SELECT id FROM schema_migrations WHERE id = 'test_throwing'")
      .all();
    expect(recorded).toEqual([]);
  });

  it('re-runs a previously failed migration on the next invocation', () => {
    // First attempt: throws.
    const firstAttempt = {
      id: 'test_retry',
      sql: `
        CREATE TABLE m2 (id INTEGER PRIMARY KEY);
        INSERT INTO m2 (id) VALUES (1);
        INSERT INTO m2 (id) VALUES (1);
      `,
    };
    expect(() => applyMigrations(db, [firstAttempt])).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='m2'").all()).toEqual([]);

    // Second attempt: fixed migration succeeds.
    const secondAttempt = {
      id: 'test_retry',
      sql: `
        CREATE TABLE m2 (id INTEGER PRIMARY KEY);
        INSERT INTO m2 (id) VALUES (1);
        INSERT INTO m2 (id) VALUES (2);
      `,
    };
    applyMigrations(db, [secondAttempt]);
    const rows = db.prepare('SELECT id FROM m2 ORDER BY id').all();
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    const recorded = db.prepare("SELECT id FROM schema_migrations WHERE id='test_retry'").all();
    expect(recorded).toEqual([{ id: 'test_retry' }]);
  });

  it('rejects migrations containing explicit BEGIN/COMMIT/ROLLBACK', () => {
    const beginMigration = {
      id: 'test_begin',
      sql: 'BEGIN; CREATE TABLE x (a INTEGER); COMMIT;',
    };
    expect(() => applyMigrations(db, [beginMigration])).toThrow(/BEGIN.*COMMIT.*ROLLBACK/i);
  });

  it('allows BEGIN/COMMIT as words inside SQL comments', () => {
    // Comments must not trip the defensive check. better-sqlite3 supports
    // both line comments (--) and block comments (/* */).
    const commentedMigration = {
      id: 'test_comments',
      sql: `
        -- This migration BEGINs the user table; we COMMIT the audit chain.
        /* Note: the runner already wraps in BEGIN/COMMIT, so do not add it here. */
        CREATE TABLE user_with_comment (id INTEGER PRIMARY KEY);
      `,
    };
    expect(() => applyMigrations(db, [commentedMigration])).not.toThrow();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_with_comment'")
      .all();
    expect(tables).toEqual([{ name: 'user_with_comment' }]);
  });

  it('skips migrations that have already been applied', () => {
    const m = {
      id: 'test_skip',
      sql: 'CREATE TABLE once (id INTEGER PRIMARY KEY);',
    };
    applyMigrations(db, [m]);
    // Second call with the same migration must not throw "table already
    // exists" — the runner sees it in schema_migrations and skips.
    expect(() => applyMigrations(db, [m])).not.toThrow();
  });
});
