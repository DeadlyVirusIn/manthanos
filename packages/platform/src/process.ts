// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { spawn as nodeSpawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { createPlatformInfo } from './info.js';
import type { ProcessOps, SpawnOptions, SpawnResult } from './types.js';

const WINDOWS_EXEC_EXTS = ['.exe', '.cmd', '.bat', '.ps1', ''] as const;
const POSIX_EXEC_EXTS = [''] as const;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export const processOps: ProcessOps = {
  async spawn(opts: SpawnOptions): Promise<SpawnResult> {
    const start = Date.now();
    return new Promise<SpawnResult>((resolve, reject) => {
      const useInherit = opts.inherit === true;
      const child = nodeSpawn(opts.command, [...opts.args], {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: useInherit
          ? ['inherit', 'inherit', 'inherit']
          : [
              typeof opts.stdin === 'string' &&
              opts.stdin !== 'inherit' &&
              opts.stdin !== 'ignore' &&
              opts.stdin !== 'pipe'
                ? 'pipe'
                : (opts.stdin ?? 'ignore'),
              'pipe',
              'pipe',
            ],
        // Never invoke through a shell — argv array only.
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout =
        opts.timeoutMs && opts.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              child.kill('SIGKILL');
            }, opts.timeoutMs)
          : null;

      const onAbort = () => {
        child.kill('SIGTERM');
      };
      opts.abortSignal?.addEventListener('abort', onAbort, { once: true });

      if (!useInherit) {
        child.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });

        // If a literal stdin string was provided, write and close.
        if (
          typeof opts.stdin === 'string' &&
          opts.stdin !== 'inherit' &&
          opts.stdin !== 'ignore' &&
          opts.stdin !== 'pipe' &&
          child.stdin
        ) {
          child.stdin.write(opts.stdin);
          child.stdin.end();
        }
      }

      child.on('error', (err) => {
        if (timeout) clearTimeout(timeout);
        opts.abortSignal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', (code, signal) => {
        if (timeout) clearTimeout(timeout);
        opts.abortSignal?.removeEventListener('abort', onAbort);
        resolve({
          code: timedOut ? null : code,
          signal: timedOut ? 'SIGKILL' : signal,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        });
      });
    });
  },

  async which(bin: string): Promise<string | null> {
    const info = createPlatformInfo();
    const isWin = info.os === 'windows';
    const exts = isWin ? WINDOWS_EXEC_EXTS : POSIX_EXEC_EXTS;
    const pathVar = isWin
      ? // Windows env names are case-insensitive at the OS level.
        (process.env.Path ?? process.env.PATH ?? '')
      : (process.env.PATH ?? '');
    const dirs = pathVar.split(isWin ? ';' : ':').filter(Boolean);

    // If `bin` already has an extension or path separator, only check it.
    if (path.isAbsolute(bin) || bin.includes(path.sep) || bin.includes('/')) {
      for (const ext of exts) {
        const candidate = `${bin}${ext}`;
        if (await exists(candidate)) return candidate;
      }
      return null;
    }

    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, `${bin}${ext}`);
        if (await exists(candidate)) return candidate;
      }
    }
    return null;
  },
};
