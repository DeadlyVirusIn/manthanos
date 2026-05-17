// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { createHash } from 'node:crypto';
import { type Stats, createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createPlatformInfo } from './info.js';
import type { FsOps } from './types.js';

const RENAME_RETRY_DELAYS_MS = [100, 500, 2000] as const;
const RECOVERABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'EEXIST', 'ENOTEMPTY']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fsyncDir(dirPath: string): Promise<void> {
  // Directory fsync is POSIX-only. On Windows we accept a weaker guarantee
  // and rely on NTFS metadata journaling (see CRASH_CONSISTENCY.md §3.2).
  const info = createPlatformInfo();
  if (info.os === 'windows') return;
  try {
    const handle = await open(dirPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (err) {
    // EBADF on some filesystems; we don't fail the write for this.
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'EBADF') throw err;
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  let lastErr: unknown;
  // Initial attempt + len(delays) retries = 4 total tries.
  for (let attempt = 0; attempt <= RENAME_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RECOVERABLE_RENAME_CODES.has(code)) throw err;
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }
  throw lastErr;
}

export const fsOps: FsOps = {
  async atomicWrite(targetPath: string, content: Buffer | string): Promise<void> {
    // Per CRASH_CONSISTENCY.md §2 (P2):
    //   a) write to <target>.tmp
    //   b) fsync(file)
    //   c) rename(.tmp, final) — atomic on POSIX; on Windows handle AV race
    //   d) fsync(parent_dir) (POSIX) / best-effort (Windows)
    const dir = path.dirname(targetPath);
    await mkdir(dir, { recursive: true });
    const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}`;

    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

    const handle = await open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await renameWithRetry(tmp, targetPath);
    } catch (err) {
      // Best effort cleanup of orphan tmp.
      try {
        await unlink(tmp);
      } catch {
        // ignore
      }
      throw err;
    }

    await fsyncDir(dir);
  },

  async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  },

  async readSortedDir(dirPath: string): Promise<string[]> {
    const entries = await readdir(dirPath);
    // Deterministic ordering per ARCHITECTURE.md §10.1.
    // Locale-independent codepoint compare.
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
  },

  async sha256OfFile(filePath: string): Promise<string> {
    const stats: Stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`sha256OfFile: not a regular file: ${filePath}`);
    }
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  },
};
