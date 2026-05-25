// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// SQLite open + WAL mode + migration runner per ARCHITECTURE.md §9 and
// CRASH_CONSISTENCY.md §8.

import path from 'node:path';
import { getPlatform } from '@manthanos/platform';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './schema.js';

export interface OpenDbOptions {
  /** Absolute path to .manthan/memory/manthan.db (will be created if missing). */
  readonly dbPath: string;
  /** Disable WAL — used for in-memory tests. */
  readonly noWal?: boolean;
}

/**
 * The opaque SQLite handle type. Re-exported here so callers can type
 * their parameters without taking a direct dependency on
 * `@types/better-sqlite3`.
 */
export type ManthanSqliteHandle = Database.Database;

export interface ManthanDb {
  readonly handle: ManthanSqliteHandle;
  readonly path: string;
  close(): void;
}

export async function openDb(opts: OpenDbOptions): Promise<ManthanDb> {
  const platform = getPlatform();
  await platform.fs.ensureDir(path.dirname(opts.dbPath));

  const handle = new Database(opts.dbPath);

  // Per CRASH_CONSISTENCY.md §8.
  if (!opts.noWal) {
    handle.pragma('journal_mode = WAL');
    handle.pragma('synchronous = NORMAL');
    handle.pragma('journal_size_limit = 67108864');
    handle.pragma('wal_autocheckpoint = 1000');
    if (platform.info.os === 'windows') {
      // Some Windows AV products misinterpret mmap'd writes.
      handle.pragma('mmap_size = 0');
    }
  }
  // Always enforce foreign-key constraints.
  handle.pragma('foreign_keys = ON');

  // Apply pending migrations inside a transaction.
  // The schema_migrations table is created lazily on first migration that
  // creates it.
  applyMigrations(handle);

  // Sprint 3B.7A: refuse to operate if the running build and the database
  // disagree on the migration set (stale-workspace-build guard).
  assertSchemaConsistency(handle);

  return {
    handle,
    path: opts.dbPath,
    close: () => {
      try {
        if (!opts.noWal) handle.pragma('wal_checkpoint(PASSIVE)');
      } finally {
        handle.close();
      }
    },
  };
}

/**
 * Per-migration atomicity contract (audit BUG-6):
 *
 *   Every migration's SQL + its schema_migrations bookkeeping row is
 *   committed inside a single db.transaction(). If any statement in
 *   the migration throws, better-sqlite3 rolls back to the savepoint
 *   so no partial schema change persists and no schema_migrations
 *   row is recorded for the failed migration. The next openDb() will
 *   re-attempt the same migration cleanly.
 *
 * Migration authors MUST NOT include explicit `BEGIN` or `COMMIT` in
 * their SQL — better-sqlite3 manages the transaction via SAVEPOINT
 * and nested explicit transactions confuse it. This is enforced
 * defensively below.
 */
const FORBIDDEN_MIGRATION_KEYWORDS = /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

export function applyMigrations(
  db: Database.Database,
  migrations: ReadonlyArray<{ readonly id: string; readonly sql: string }> = MIGRATIONS,
): void {
  // Probe for schema_migrations table existence.
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get() as { name: string } | undefined;

  let applied = new Set<string>();
  if (existing) {
    const rows = db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{
      id: string;
    }>;
    applied = new Set(rows.map((r) => r.id));
  }

  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    // Strip line and block comments before scanning for forbidden keywords,
    // so explanatory comments mentioning these words don't trip the check.
    const stripped = m.sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (FORBIDDEN_MIGRATION_KEYWORDS.test(stripped)) {
      throw new Error(
        `Migration ${m.id} contains an explicit BEGIN/COMMIT/ROLLBACK/SAVEPOINT/RELEASE statement. The runner wraps every migration in a transaction; remove the explicit transaction control.`,
      );
    }
    const tx = db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        m.id,
        new Date().toISOString(),
      );
    });
    tx();
  }
}

/**
 * Raised when the running build and the database disagree on the migration
 * set. The daemon must REFUSE to start rather than operate against a schema
 * it was not written for (Sprint 3B.7A; closes the stale-`dist` class that
 * silently omitted migration 0009).
 */
export class StaleBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleBuildError';
  }
}

/**
 * Assert the database's applied migrations and the running build's migration
 * list agree. Call AFTER applyMigrations. Two divergence directions:
 *
 *   1. A runtime migration is not applied → migration application failed
 *      (should be impossible immediately after applyMigrations); refuse.
 *   2. An APPLIED migration is unknown to this build → the running build is
 *      OLDER than the database (a stale workspace build / a downgrade).
 *      Refuse: this code was not written for that schema, and silently
 *      operating risks corruption.
 *
 * Pure read; never mutates. Reads schema_migrations(id, applied_at).
 */
export function assertSchemaConsistency(
  db: Database.Database,
  migrations: ReadonlyArray<{ readonly id: string }> = MIGRATIONS,
): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get() as { name: string } | undefined;
  const appliedRows = tableExists
    ? (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>)
    : [];
  const applied = new Set(appliedRows.map((r) => r.id));
  const runtime = new Set(migrations.map((m) => m.id));

  const missing = [...runtime].filter((id) => !applied.has(id)).sort();
  if (missing.length > 0) {
    throw new StaleBuildError(
      `Migrations not fully applied after startup (${missing.join(', ')}). ` +
        'Rebuild workspace packages (pnpm build) and restart.',
    );
  }

  const unknown = [...applied].filter((id) => !runtime.has(id)).sort();
  if (unknown.length > 0) {
    throw new StaleBuildError(
      `Database has migrations this build does not know about (${unknown.join(', ')}). ` +
        'The running build is OLDER than the database — rebuild workspace packages ' +
        '(pnpm build) before starting the daemon.',
    );
  }
}
