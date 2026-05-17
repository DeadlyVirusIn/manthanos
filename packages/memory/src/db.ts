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

function applyMigrations(db: Database.Database): void {
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

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
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
