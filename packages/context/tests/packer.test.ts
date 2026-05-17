// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pack } from '../src/packer.js';

describe('context.pack', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-ctx-'));
    await mkdir(path.join(dir, 'src'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renders charter, brief, and explicit files with XML delimiters', async () => {
    await writeFile(path.join(dir, 'src', 'auth.ts'), 'export function login() { return "ok"; }\n');
    const bundle = await pack({
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [{ area: 'language', statement: 'primary=typescript', tier: 'T+1' }],
      trustedFacts: [],
      quarantineFacts: [],
      decisions: [],
      includeFiles: ['src/auth.ts'],
      tokenBudget: 100_000,
    });

    expect(bundle.systemPrompt).toContain('ManthanOS');
    expect(bundle.systemPrompt).toContain('UNTRUSTED INPUT');
    expect(bundle.systemPrompt).toContain('primary=typescript');

    expect(bundle.userPrompt).toContain('<task_brief>');
    expect(bundle.userPrompt).toContain('add OAuth login');
    expect(bundle.userPrompt).toContain('<repository_text');
    expect(bundle.userPrompt).toContain('path="src/auth.ts"');
    expect(bundle.userPrompt).toContain('login()');
    expect(bundle.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic bundle hash across two calls with the same input', async () => {
    await writeFile(path.join(dir, 'src', 'a.ts'), 'export const A = 1;\n');
    await writeFile(path.join(dir, 'src', 'b.ts'), 'export const B = 2;\n');
    const input = {
      workspaceRoot: dir,
      taskBrief: 'review the constants',
      charterFacts: [],
      trustedFacts: [],
      quarantineFacts: [],
      decisions: [],
      includeFiles: ['src/b.ts', 'src/a.ts'], // intentionally out-of-order
      tokenBudget: 100_000,
    };
    const b1 = await pack(input);
    const b2 = await pack(input);
    expect(b1.bundleHash).toBe(b2.bundleHash);
    // Source layers must appear in sorted order regardless of input order.
    const sourceAttrs = b1.layers.filter((l) => l.kind === 'source').map((l) => l.attributes?.path);
    expect(sourceAttrs).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('truncates source layers to fit the token budget', async () => {
    // Create a file larger than the budget can accommodate.
    const huge = 'A'.repeat(50_000);
    await writeFile(path.join(dir, 'src', 'big.ts'), huge);
    const small = await writeFile(path.join(dir, 'src', 'small.ts'), 'x');
    void small;
    const bundle = await pack({
      workspaceRoot: dir,
      taskBrief: 'unrelated brief',
      charterFacts: [],
      trustedFacts: [],
      quarantineFacts: [],
      decisions: [],
      includeFiles: ['src/big.ts', 'src/small.ts'],
      tokenBudget: 1000, // very small — forces drop of large layer
    });
    expect(bundle.totalEstimatedTokens).toBeLessThanOrEqual(1000);
  });
});
