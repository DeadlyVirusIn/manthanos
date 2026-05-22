// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Substrate handle owned by the daemon for its lifetime.
// Holds the SQLite database, blob store, audit-log path, and the
// in-process mutex that serializes audited writes. Tasks 3-10 use this
// context to perform mutations; the daemon's workspace lock already
// ensures no other process can write to the same substrate.

import path from 'node:path';
import {
  AsyncMutex,
  type AuditedWriteContext,
  type BlobStore,
  type ManthanDb,
  createBlobStore,
  openDb,
} from '@manthanos/memory';

export interface SubstrateHandle {
  readonly db: ManthanDb;
  readonly blobs: BlobStore;
  readonly jsonlPath: string;
  readonly mutex: AsyncMutex;
  readonly ctx: AuditedWriteContext;
  close(): void;
}

export async function openSubstrate(workspaceRoot: string): Promise<SubstrateHandle> {
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  const blobsDir = path.join(manthanDir, 'audit', 'blobs');
  const jsonlPath = path.join(manthanDir, 'audit.log');

  const db = await openDb({ dbPath });
  const blobs = createBlobStore(blobsDir);
  const mutex = new AsyncMutex();

  const ctx: AuditedWriteContext = {
    db: db.handle,
    blobs,
    jsonlPath,
    mutex,
  };

  return {
    db,
    blobs,
    jsonlPath,
    mutex,
    ctx,
    close: () => {
      db.close();
    },
  };
}
