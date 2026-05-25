// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.7A — startup schema-consistency guard.
//
// The daemon must refuse to start when the running build and the database
// disagree on the migration set. This closes the stale-`dist` class that
// silently omitted migration 0009: a build older than the database (an
// applied migration the build doesn't know) is treated as fatal.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaleBuildError, assertSchemaConsistency, openDb } from '../src/db.js';

let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mws-schema-consistency-'));
  dbPath = path.join(dir, 'manthan.db');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('assertSchemaConsistency', () => {
  it('passes on a freshly-migrated database (all runtime migrations applied)', async () => {
    const db = await openDb({ dbPath });
    try {
      expect(() => assertSchemaConsistency(db.handle)).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('refuses when a runtime migration is not applied (presence failure)', async () => {
    const db = await openDb({ dbPath });
    try {
      // Runtime expects a migration the database never applied.
      expect(() => assertSchemaConsistency(db.handle, [{ id: '9999_never_applied' }])).toThrow(
        StaleBuildError,
      );
    } finally {
      db.close();
    }
  });

  it('refuses when the database has a migration the build does not know (stale build)', async () => {
    const db = await openDb({ dbPath });
    try {
      // Simulate a database upgraded by a NEWER build than this one.
      db.handle
        .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
        .run('9999_from_the_future', new Date().toISOString());
      expect(() => assertSchemaConsistency(db.handle)).toThrow(StaleBuildError);
      expect(() => assertSchemaConsistency(db.handle)).toThrow(/older than the database/i);
    } finally {
      db.close();
    }
  });
});

describe('openDb startup guard', () => {
  it('refuses to reopen a database that carries an unknown (future) migration', async () => {
    // First open migrates cleanly.
    const db1 = await openDb({ dbPath });
    db1.handle
      .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
      .run('9999_from_the_future', new Date().toISOString());
    db1.close();

    // Reopen with the same (current) build → the guard inside openDb fires.
    await expect(openDb({ dbPath })).rejects.toBeInstanceOf(StaleBuildError);
  });
});
