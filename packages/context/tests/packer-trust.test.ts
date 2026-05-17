// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Phase 1.6 prompt-injection test — the most important offline proof:
// promoting facts MUST change the system prompt byte-for-byte.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pack } from '../src/packer.js';
import type { QuarantineFact, TrustedFact } from '../src/types.js';

function makeTrusted(): TrustedFact[] {
  return [
    {
      id: 'fact_a',
      area: 'auth',
      statement: 'Sessions use httpOnly cookies',
      tier: 'T+1',
      confidence: 0.7,
      provenanceWorkflowId: 'wf_first',
    },
    {
      id: 'fact_b',
      area: 'auth',
      statement: 'Refresh tokens are server-side only',
      tier: 'T+2',
      confidence: 0.9,
      provenanceWorkflowId: 'wf_first',
    },
  ];
}

function makeQuarantine(): QuarantineFact[] {
  return [
    {
      id: 'fact_c',
      area: 'auth',
      statement: 'OAuth scopes assumed to be email+profile only',
      tier: 'T0',
      confidence: 0.3,
      provenanceWorkflowId: 'wf_first',
    },
  ];
}

describe('packer trust-tier wiring', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-pack-trust-'));
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await writeFile(path.join(dir, 'src', 'placeholder.ts'), 'export const X = 1;\n');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('without trusted facts: no trusted_facts layer; bundle hash X', async () => {
    const b = await pack({
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [],
      trustedFacts: [],
      quarantineFacts: [],
      decisions: [],
      tokenBudget: 100_000,
    });
    expect(b.layers.some((l) => l.kind === 'trusted_facts')).toBe(false);
    expect(b.metrics.trustedFactsInBundle).toBe(0);
    expect(b.systemPrompt).not.toContain('Trusted project facts');
  });

  it('with trusted facts: trusted_facts layer is added, system prompt cites them', async () => {
    const trusted = makeTrusted();
    const b = await pack({
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [],
      trustedFacts: trusted,
      quarantineFacts: [],
      decisions: [],
      tokenBudget: 100_000,
    });
    expect(b.layers.some((l) => l.kind === 'trusted_facts')).toBe(true);
    expect(b.metrics.trustedFactsInBundle).toBe(2);
    expect(b.systemPrompt).toContain('Trusted project facts');
    expect(b.systemPrompt).toContain('Sessions use httpOnly cookies');
    expect(b.systemPrompt).toContain('Refresh tokens are server-side only');
    // Provenance is rendered.
    expect(b.systemPrompt).toContain('src=wf_first');
    // Tier ordering: T+2 before T+1.
    const t2 = b.systemPrompt.indexOf('Refresh tokens');
    const t1 = b.systemPrompt.indexOf('Sessions use httpOnly');
    expect(t2).toBeGreaterThan(-1);
    expect(t1).toBeGreaterThan(-1);
    expect(t2).toBeLessThan(t1);
  });

  it('the two bundle hashes are different (replay-evidence: the prompt is observably different)', async () => {
    const base = {
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [],
      decisions: [],
      tokenBudget: 100_000,
      quarantineFacts: [],
    };
    const empty = await pack({ ...base, trustedFacts: [] });
    const populated = await pack({ ...base, trustedFacts: makeTrusted() });
    expect(empty.bundleHash).not.toBe(populated.bundleHash);
  });

  it('quarantine facts are excluded by default; included with includeQuarantine=true', async () => {
    const q = makeQuarantine();
    const off = await pack({
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [],
      trustedFacts: [],
      quarantineFacts: q,
      decisions: [],
      tokenBudget: 100_000,
    });
    expect(off.systemPrompt).not.toContain('Quarantined');
    expect(off.userPrompt).not.toContain('OAuth scopes assumed');

    const on = await pack({
      workspaceRoot: dir,
      taskBrief: 'add OAuth login',
      charterFacts: [],
      trustedFacts: [],
      quarantineFacts: q,
      includeQuarantine: true,
      decisions: [],
      tokenBudget: 100_000,
    });
    expect(on.userPrompt).toContain('Quarantined');
    expect(on.userPrompt).toContain('OAuth scopes assumed');
    expect(on.metrics.quarantineFactsInBundle).toBe(1);
    expect(on.bundleHash).not.toBe(off.bundleHash);
  });

  it('charter facts always render regardless of trust split', async () => {
    const b = await pack({
      workspaceRoot: dir,
      taskBrief: 'review',
      charterFacts: [{ area: 'language', statement: 'primary=typescript', tier: 'T0' }],
      trustedFacts: [],
      quarantineFacts: [],
      decisions: [],
      tokenBudget: 100_000,
    });
    expect(b.systemPrompt).toContain('primary=typescript');
  });
});
