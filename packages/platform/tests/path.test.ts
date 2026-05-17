// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { getPlatform } from '../src/index.js';

describe('PathOps', () => {
  const platform = getPlatform();

  it('toPosix converts backslashes to forward slashes', () => {
    expect(platform.path.toPosix('a\\b\\c')).toBe('a/b/c');
    expect(platform.path.toPosix('a/b/c')).toBe('a/b/c');
  });

  it('join produces native paths but is OS-aware', () => {
    const joined = platform.path.join('a', 'b', 'c');
    // On either OS, the path round-trips through toPosix.
    expect(platform.path.toPosix(joined)).toBe('a/b/c');
  });

  it('isInside returns true for nested paths', async () => {
    const parent = process.cwd();
    const child = `${process.cwd()}/packages/platform`;
    await expect(platform.path.isInside(parent, child)).resolves.toBe(true);
  });

  it('isInside returns false for unrelated paths', async () => {
    const parent = `${process.cwd()}/packages`;
    const child = '/tmp';
    await expect(platform.path.isInside(parent, child)).resolves.toBe(false);
  });
});
