// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan auth` — configure provider credentials safely.
// Phase 1 supports only Anthropic.

import { resolveAuth, storeAuth } from '../auth-store.js';

export interface AuthOptions {
  readonly cwd: string;
  /** When set, read the key from stdin and store; otherwise show status. */
  readonly set?: 'global' | 'workspace';
  /** When provided programmatically by tests; in CLI use it comes from stdin. */
  readonly stdinKey?: string;
}

export async function runAuth(opts: AuthOptions): Promise<void> {
  if (!opts.set) {
    const resolved = await resolveAuth(opts.cwd);
    process.stdout.write('manthan auth — Anthropic Claude\n');
    if (!resolved) {
      process.stdout.write('  status: NOT CONFIGURED\n');
      process.stdout.write(
        '\nConfigure with one of:\n' +
          '  manthan auth --set global       # ~/.config/manthan/api-keys.env\n' +
          '  manthan auth --set workspace    # .manthan/secrets.env (this workspace only)\n' +
          '  ANTHROPIC_API_KEY=sk-... env var also works\n',
      );
      process.exitCode = 1;
      return;
    }
    const masked = `${resolved.apiKey.slice(0, 6)}…${resolved.apiKey.slice(-4)} (len=${resolved.apiKey.length})`;
    process.stdout.write(`  status: configured (source=${resolved.source})\n`);
    process.stdout.write(`  key:    ${masked}\n`);
    return;
  }

  // Set mode: read the key from stdin or `--stdin-key` for tests.
  const key = opts.stdinKey ?? (await readStdin());
  if (!key) {
    process.stderr.write('manthan auth: no key provided on stdin\n');
    process.exitCode = 2;
    return;
  }
  if (!/^sk-ant-/.test(key.trim()) && !/^sk-/.test(key.trim())) {
    process.stderr.write(
      "manthan auth: warning — key does not look like an Anthropic API key (expected prefix 'sk-ant-' or 'sk-')\n",
    );
  }
  const target = opts.set;
  const filePath = await storeAuth({
    target,
    workspaceRoot: opts.cwd,
    apiKey: key.trim(),
  });
  process.stdout.write(`✓ Stored ANTHROPIC_API_KEY at ${filePath}\n`);
  process.stdout.write('  perms: 600 (POSIX)\n');
  process.stdout.write('\nVerify with: manthan auth\n');
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write('manthan auth: paste your API key on stdin, then press Ctrl-D:\n');
  }
  let data = '';
  return new Promise<string>((resolve, reject) => {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
