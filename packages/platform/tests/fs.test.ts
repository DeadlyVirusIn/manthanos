// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPlatform } from '../src/index.js';

const platform = getPlatform();

describe('FsOps', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'manthan-fs-test-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('atomicWrite writes content via temp + rename', async () => {
    const target = path.join(tmpDir, 'audit.log');
    await platform.fs.atomicWrite(target, 'hello world\n');
    const content = await readFile(target, 'utf8');
    expect(content).toBe('hello world\n');
  });

  it('atomicWrite overwrites existing file', async () => {
    const target = path.join(tmpDir, 'config.yaml');
    await platform.fs.atomicWrite(target, 'first\n');
    await platform.fs.atomicWrite(target, 'second\n');
    const content = await readFile(target, 'utf8');
    expect(content).toBe('second\n');
  });

  it('readSortedDir returns entries in deterministic order', async () => {
    await platform.fs.atomicWrite(path.join(tmpDir, 'b.txt'), 'b');
    await platform.fs.atomicWrite(path.join(tmpDir, 'a.txt'), 'a');
    await platform.fs.atomicWrite(path.join(tmpDir, 'c.txt'), 'c');
    const entries = await platform.fs.readSortedDir(tmpDir);
    expect(entries).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('sha256OfFile is deterministic and well-formed', async () => {
    const t1 = path.join(tmpDir, 'blob1.json');
    const t2 = path.join(tmpDir, 'blob2.json');
    await platform.fs.atomicWrite(t1, '{"k":"v"}');
    await platform.fs.atomicWrite(t2, '{"k":"v"}');
    const h1 = await platform.fs.sha256OfFile(t1);
    const h2 = await platform.fs.sha256OfFile(t2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });
});
