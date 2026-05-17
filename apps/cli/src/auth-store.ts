// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Auth storage for Phase 1.
// Resolution order:
//   1. ANTHROPIC_API_KEY env var.
//   2. ~/.config/manthan/api-keys.env  (export ANTHROPIC_API_KEY=...)
//   3. .manthan/secrets.env in the workspace (workspace-local; chmod 600).
//
// In Phase 5+, OS keychain integration is the recommended path.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';

const KEY_NAME = 'ANTHROPIC_API_KEY';

export interface AuthResolution {
  readonly apiKey: string;
  readonly source: 'env' | 'global-file' | 'workspace-file';
}

function parseEnvLine(line: string): { name: string; value: string } | null {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(['"]?)(.*)\2\s*$/.exec(line);
  if (!m) return null;
  return { name: m[1] ?? '', value: m[3] ?? '' };
}

async function readKeyFromFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && parsed.name === KEY_NAME && parsed.value.length > 0) {
        return parsed.value;
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
  }
  return null;
}

export async function resolveAuth(workspaceRoot: string): Promise<AuthResolution | null> {
  if (process.env[KEY_NAME] && process.env[KEY_NAME].length > 0) {
    return { apiKey: process.env[KEY_NAME], source: 'env' };
  }
  const platform = getPlatform();
  const globalPath = path.join(platform.info.userDataDir, 'api-keys.env');
  const fromGlobal = await readKeyFromFile(globalPath);
  if (fromGlobal) return { apiKey: fromGlobal, source: 'global-file' };

  const wsPath = path.join(workspaceRoot, '.manthan', 'secrets.env');
  const fromWs = await readKeyFromFile(wsPath);
  if (fromWs) return { apiKey: fromWs, source: 'workspace-file' };
  return null;
}

export interface AuthStoreOptions {
  readonly target: 'global' | 'workspace';
  readonly workspaceRoot: string;
  readonly apiKey: string;
}

export async function storeAuth(opts: AuthStoreOptions): Promise<string> {
  const platform = getPlatform();
  const filePath =
    opts.target === 'global'
      ? path.join(platform.info.userDataDir, 'api-keys.env')
      : path.join(opts.workspaceRoot, '.manthan', 'secrets.env');
  await mkdir(path.dirname(filePath), { recursive: true });

  // Read existing content and replace any prior ANTHROPIC_API_KEY line.
  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code !== 'ENOENT') throw err;
  }

  const otherLines = existing
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=/.test(l))
    .filter((l, idx, arr) => !(l === '' && idx === arr.length - 1));

  const newLine = `export ${KEY_NAME}='${opts.apiKey.replace(/'/g, "'\\''")}'`;
  const next = `${[...otherLines, newLine].join('\n')}\n`;

  await writeFile(filePath, next, { mode: 0o600 });
  // Best-effort chmod for case where the file already existed.
  const { chmod } = await import('node:fs/promises');
  try {
    await chmod(filePath, 0o600);
  } catch {
    // Windows: ignore.
  }
  return filePath;
}
