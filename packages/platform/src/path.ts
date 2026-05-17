// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { PathOps } from './types.js';

function toPosix(p: string): string {
  return p.split(path.win32.sep).join(path.posix.sep);
}

function toNative(p: string): string {
  if (path.sep === path.win32.sep) {
    return p.split(path.posix.sep).join(path.win32.sep);
  }
  return p;
}

export const pathOps: PathOps = {
  toPosix,
  toNative,
  join(...parts: string[]): string {
    return path.join(...parts);
  },
  resolve(...parts: string[]): string {
    return path.resolve(...parts);
  },
  async canonicalizeWorkspaceRoot(p: string): Promise<string> {
    const absolute = path.resolve(p);
    try {
      const real = await realpath(absolute);
      return toPosix(real);
    } catch {
      // Path may not exist yet (e.g., manthan init on a fresh dir).
      // Return the resolved-absolute form; the caller may create it.
      return toPosix(absolute);
    }
  },
  async isInside(parent: string, child: string): Promise<boolean> {
    const p = await this.canonicalizeWorkspaceRoot(parent);
    const c = await this.canonicalizeWorkspaceRoot(child);
    if (p === c) return true;
    const sep = '/';
    const pNorm = p.endsWith(sep) ? p : `${p}${sep}`;
    return c.startsWith(pNorm);
  },
};
