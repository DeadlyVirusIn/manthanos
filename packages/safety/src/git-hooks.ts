// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Git hook detection per SAFETY_MODEL.md §11d.
// Identifies executable hooks in .git/hooks/ that ManthanOS should refuse
// to ride through (post-commit, post-merge, pre-push, etc.).

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';

export interface GitHookSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly executable: boolean;
}

const HOOKS_OF_INTEREST: readonly string[] = Object.freeze([
  'pre-commit',
  'post-commit',
  'pre-push',
  'pre-receive',
  'post-merge',
  'post-checkout',
  'pre-rebase',
  'post-rewrite',
  'pre-applypatch',
  'post-applypatch',
]);

export async function scanGitHooks(workspaceRoot: string): Promise<GitHookSnapshot[]> {
  const platform = getPlatform();
  const hooksDir = platform.path.join(workspaceRoot, '.git', 'hooks');
  const out: GitHookSnapshot[] = [];

  for (const name of HOOKS_OF_INTEREST) {
    const hookPath = platform.path.join(hooksDir, name);
    try {
      const st = await stat(hookPath);
      if (!st.isFile()) continue;
      // Skip the .sample files git ships by default.
      if (hookPath.endsWith('.sample')) continue;
      const sha = await platform.fs.sha256OfFile(hookPath);
      const executable = platform.info.os === 'windows' ? true : (st.mode & 0o111) !== 0;
      out.push({ path: hookPath, sha256: sha, executable });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code !== 'ENOENT') throw err;
    }
  }
  // Deterministic order per ARCH §10.1.
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

export function relativeHookPath(workspaceRoot: string, hookAbsolutePath: string): string {
  const rel = path.relative(workspaceRoot, hookAbsolutePath);
  return rel.split(path.sep).join('/');
}
