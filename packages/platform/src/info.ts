// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import envPaths from 'env-paths';
import type { Arch, OsName, PlatformInfo } from './types.js';

function detectOs(): OsName {
  switch (os.platform()) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      // Unknown Unix: treat as Linux for path conventions; CI matrix won't
      // exercise this but it's a defensible default for BSD/etc.
      return 'linux';
  }
}

function detectArch(): Arch {
  const a = os.arch();
  if (a === 'x64' || a === 'arm64' || a === 'arm' || a === 'ia32') return a;
  return 'unknown';
}

function detectWsl(): boolean {
  if (os.platform() !== 'linux') return false;
  // WSL exposes itself via /proc/version containing "microsoft" or "WSL".
  try {
    if (existsSync('/proc/version')) {
      const v = readFileSync('/proc/version', 'utf8').toLowerCase();
      if (v.includes('microsoft') || v.includes('wsl')) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function detectCi(): boolean {
  // Common CI env vars.
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.BUILDKITE ||
      process.env.TRAVIS,
  );
}

function detectTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

function detectAnsi(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (!detectTty()) return false;
  // On Windows, modern Terminal supports ANSI; cmd.exe legacy may not.
  // We conservatively report true when TTY + not explicitly disabled.
  return true;
}

export function createPlatformInfo(): PlatformInfo {
  const paths = envPaths('manthan', { suffix: '' });
  return Object.freeze<PlatformInfo>({
    os: detectOs(),
    arch: detectArch(),
    release: os.release(),
    isWSL: detectWsl(),
    isCI: detectCi(),
    isTTY: detectTty(),
    supportsAnsi: detectAnsi(),
    userDataDir: paths.data,
    userCacheDir: paths.cache,
    userLogDir: paths.log,
    tempDir: os.tmpdir(),
  });
}
