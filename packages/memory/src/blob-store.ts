// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Blob store per CRASH_CONSISTENCY.md §2 (P2) and §9.
// Content-addressed, sharded by first 2 hex chars.

import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { JsonCanon } from '@manthanos/adapters-sdk';
import { getPlatform } from '@manthanos/platform';

export interface BlobStore {
  readonly root: string;
  /** Persist a payload; returns its content-hash. Idempotent. */
  put(payload: unknown): Promise<{ hash: string; sizeBytes: number; reused: boolean }>;
  /** Resolve a hash to the on-disk path. */
  pathFor(hash: string): string;
  /** Check whether a blob exists on disk. */
  exists(hash: string): Promise<boolean>;
}

function shardPath(root: string, hash: string): string {
  // First 2 hex chars become the shard directory; rest is the filename.
  // Hash is 64 hex chars; we have plenty of entropy in 2.
  const shard = hash.slice(0, 2);
  const rest = hash.slice(2);
  return path.join(root, shard, `${rest}.json`);
}

export function createBlobStore(root: string): BlobStore {
  const platform = getPlatform();
  return {
    root,
    pathFor: (hash) => shardPath(root, hash),

    async put(payload: unknown): Promise<{ hash: string; sizeBytes: number; reused: boolean }> {
      const canonical = JsonCanon.stringify(payload);
      const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
      const target = shardPath(root, hash);

      // Idempotent check: if the file exists and content matches, skip.
      try {
        const st = await stat(target);
        if (st.isFile()) {
          // Trust the content-addressing — we wrote it, content matches by definition.
          return { hash, sizeBytes: st.size, reused: true };
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (code !== 'ENOENT') throw err;
      }

      // P2.a–d: atomic temp+rename + fsync; PAL handles per-OS specifics.
      await platform.fs.atomicWrite(target, canonical);
      const st = await stat(target);
      return { hash, sizeBytes: st.size, reused: false };
    },

    async exists(hash: string): Promise<boolean> {
      try {
        const st = await stat(shardPath(root, hash));
        return st.isFile();
      } catch {
        return false;
      }
    },
  };
}
