// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P0.3 Commit A: prove `recomputeBundleHash` rebuilds the exact same
// bundle hash from stored per-layer content hashes, and reports
// `missing_content_sha256` (never silently fabricates a hash) when
// the stored shape predates P0.3.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pack } from '../src/packer.js';
import { type StoredLayer, recomputeBundleHash } from '../src/recompute.js';

describe('recomputeBundleHash', () => {
  it('reproduces a freshly-packed bundle hash from stored layer metadata', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-recompute-'));
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'a.ts'), 'export const A = 1;\n');

      const bundle = await pack({
        workspaceRoot: dir,
        taskBrief: 'verify recompute',
        charterFacts: [{ area: 'language', statement: 'primary=typescript', tier: 'T+1' }],
        trustedFacts: [],
        quarantineFacts: [],
        decisions: [],
        includeFiles: ['src/a.ts'],
        tokenBudget: 100_000,
      });

      // Build the storage-shape layers exactly as plan-runner does.
      const stored: StoredLayer[] = bundle.layers.map((l, i) => ({
        kind: l.kind,
        wrap_as: l.wrapAs,
        attributes: l.attributes ?? null,
        trust: l.trust,
        estimated_tokens: l.estimatedTokens,
        provenance: l.provenance,
        content_sha256: bundle.layerContentHashes[i],
      }));

      const result = recomputeBundleHash(stored);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hash).toBe(bundle.bundleHash);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns missing_content_sha256 (no silent fabrication) for pre-P0.3 layer shapes', () => {
    const stored: StoredLayer[] = [
      {
        kind: 'charter',
        wrap_as: 'system',
        trust: 'system',
        attributes: null,
        provenance: 'brain:semantic_facts:charter',
        estimated_tokens: 10,
        // content_sha256 deliberately absent — legacy snapshot shape.
      },
    ];

    const result = recomputeBundleHash(stored);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('missing_content_sha256');
      expect(result.missingAtIndex).toBe(0);
    }
  });

  it('detects layer-content tampering: changing content_sha256 changes the recomputed hash', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-recompute-tamper-'));
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'a.ts'), 'export const A = 1;\n');

      const bundle = await pack({
        workspaceRoot: dir,
        taskBrief: 'verify tamper detection',
        charterFacts: [{ area: 'language', statement: 'primary=typescript', tier: 'T+1' }],
        trustedFacts: [],
        quarantineFacts: [],
        decisions: [],
        includeFiles: ['src/a.ts'],
        tokenBudget: 100_000,
      });

      const stored: StoredLayer[] = bundle.layers.map((l, i) => ({
        kind: l.kind,
        wrap_as: l.wrapAs,
        attributes: l.attributes ?? null,
        trust: l.trust,
        estimated_tokens: l.estimatedTokens,
        provenance: l.provenance,
        content_sha256: bundle.layerContentHashes[i],
      }));

      // Flip one hex digit in the first layer's content_sha256.
      const first = stored[0];
      if (!first || !first.content_sha256) throw new Error('test precondition: no layers');
      const original = first.content_sha256;
      const tamperedFirstChar = original[0] === '0' ? '1' : '0';
      const tampered: StoredLayer[] = [
        { ...first, content_sha256: `${tamperedFirstChar}${original.slice(1)}` },
        ...stored.slice(1),
      ];

      const result = recomputeBundleHash(tampered);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hash).not.toBe(bundle.bundleHash);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
