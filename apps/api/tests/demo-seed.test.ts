// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E1 — demo workspace seed tests.
//
// Covers: golden snapshot, determinism (two seeds → identical normalized
// content), reset fidelity (mutate → reset → identical), and the isolation
// guard (reset refuses to purge a non-demo workspace). Determinism is
// asserted on NORMALIZED content/structure/trust — never literal ids or
// timestamps (Approach A).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type DaemonHandle, createDaemon } from '../src/server.js';
import { createConversation, listConversations } from '../src/services/conversations.js';
import { DEMO_GOLDEN, DEMO_WORKSPACE_NAME } from '../src/services/demo/manifest.js';
import { DemoIsolationError, resetDemo } from '../src/services/demo/resetDemo.js';
import { readDemoMarker, seedDemo, writeDemoMarker } from '../src/services/demo/seedDemo.js';
import { type FactTier, listFacts } from '../src/services/facts.js';
import type { SubstrateHandle } from '../src/services/substrate.js';
import { createWorkspace } from '../src/services/workspace.js';

const FIXED_NOW = new Date('2026-05-25T12:00:00.000Z');

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-demo-seed-'));
  handle = await createDaemon({
    config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot },
    noListen: true,
  });
});

afterEach(async () => {
  await handle.shutdown().catch(() => undefined);
  await rm(workspaceRoot, { recursive: true, force: true });
});

function substrate(): SubstrateHandle {
  if (handle.substrate === null) throw new Error('substrate not open');
  return handle.substrate;
}

// ─────────────────────────────────────────────────────────────────
// Normalized snapshot (ids/timestamps stripped; content/structure only)
// ─────────────────────────────────────────────────────────────────

interface NormalizedFact {
  readonly statement: string;
  readonly tier: FactTier;
  readonly contested: boolean;
}
interface NormalizedConversation {
  readonly person: string;
  readonly type: string;
  readonly outcome: string;
  readonly quotes: readonly string[];
}
interface NormalizedDemo {
  readonly facts: readonly NormalizedFact[];
  readonly conversations: readonly NormalizedConversation[];
}

function normalize(sub: SubstrateHandle, workspaceId: string): NormalizedDemo {
  const facts = listFacts(sub.ctx.db, workspaceId, { limit: 100 })
    .facts.map<NormalizedFact>((f) => ({
      statement: f.statement,
      tier: f.tier,
      contested: f.is_contested,
    }))
    .sort((a, b) => a.statement.localeCompare(b.statement));
  const conversations = listConversations(sub.ctx.db, workspaceId, { limit: 100 })
    .conversations.map<NormalizedConversation>((c) => ({
      person: c.person_name,
      type: c.conversation_type,
      outcome: c.outcome,
      quotes: [...c.verbatim_quotes].map((q) => q.text).sort(),
    }))
    .sort((a, b) => a.person.localeCompare(b.person));
  return { facts, conversations };
}

function tierCounts(sub: SubstrateHandle, workspaceId: string): Record<FactTier, number> {
  const counts: Record<FactTier, number> = { 'T+1': 0, T0: 0, 'T-1': 0, 'T-2': 0 };
  for (const f of listFacts(sub.ctx.db, workspaceId, { limit: 100 }).facts) {
    counts[f.tier] += 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────
// Golden snapshot
// ─────────────────────────────────────────────────────────────────

describe('demo seed — golden snapshot', () => {
  it('seeds via the route with the expected envelope', async () => {
    const res = await handle.app.inject({
      method: 'POST',
      url: '/api/v1/demo/seed',
      headers: { host: '127.0.0.1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      demo: { workspace_id: string; conversation_count: number; fact_count: number };
    };
    expect(body.demo.conversation_count).toBe(DEMO_GOLDEN.conversationCount);
    expect(body.demo.fact_count).toBe(DEMO_GOLDEN.factCount);
    expect(body.demo.workspace_id).toMatch(/^ws-/);
  });

  it('produces the expected content, trust distribution, and follow-up state', async () => {
    const { demoWorkspaceId } = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const sub = substrate();

    const facts = listFacts(sub.ctx.db, demoWorkspaceId, { limit: 100 }).facts;
    const convs = listConversations(sub.ctx.db, demoWorkspaceId, { limit: 100 }).conversations;
    const quoteCount = convs.reduce((n, c) => n + c.verbatim_quotes.length, 0);
    const contested = facts.filter((f) => f.is_contested).length;

    expect(convs.length).toBe(DEMO_GOLDEN.conversationCount);
    expect(quoteCount).toBe(DEMO_GOLDEN.quoteCount);
    expect(facts.length).toBe(DEMO_GOLDEN.factCount);
    expect(tierCounts(sub, demoWorkspaceId)).toEqual(DEMO_GOLDEN.tierCounts);
    expect(contested).toBe(DEMO_GOLDEN.doubleCheckCount);
  });

  it('leaves exactly one conversation un-extracted (pending) for the Suggest walkthrough (C2)', async () => {
    const { demoWorkspaceId } = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const sub = substrate();
    const convs = listConversations(sub.ctx.db, demoWorkspaceId, { limit: 100 }).conversations;

    const pending = convs.filter((c) => c.fact_extraction_status === 'pending');
    // Exactly one truly un-extracted conversation — the "Suggest findings" target.
    expect(pending.length).toBe(1);
    // It is reachable (listed) and usable for Suggest (has quotes to suggest from).
    expect(pending[0]?.verbatim_quotes.length).toBeGreaterThan(0);
    // Every other conversation is a fact source and was extracted on seed.
    expect(convs.filter((c) => c.fact_extraction_status === 'extracted').length).toBe(
      DEMO_GOLDEN.conversationCount - 1,
    );
  });

  it('writes a durable demo marker pointing at the seeded workspace', async () => {
    const { demoWorkspaceId } = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const marker = readDemoMarker(workspaceRoot);
    expect(marker?.demoWorkspaceId).toBe(demoWorkspaceId);
    expect(marker?.workspaceName).toBe(DEMO_WORKSPACE_NAME);
  });

  it('makes conversation recency relative to the injected clock', async () => {
    const { demoWorkspaceId } = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const convs = listConversations(substrate().ctx.db, demoWorkspaceId, {
      limit: 100,
    }).conversations;
    for (const c of convs) {
      expect(new Date(c.occurred_at).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────

describe('demo seed — determinism', () => {
  it('two independent seeds yield identical normalized content', async () => {
    const a = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const snapA = normalize(substrate(), a.demoWorkspaceId);

    const root2 = await mkdtemp(path.join(tmpdir(), 'mws-demo-seed2-'));
    const handle2 = await createDaemon({
      config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot: root2 },
      noListen: true,
    });
    try {
      const sub2 = handle2.substrate;
      if (sub2 === null) throw new Error('substrate 2 not open');
      const b = await seedDemo(sub2, root2, { now: FIXED_NOW });
      const snapB = normalize(sub2, b.demoWorkspaceId);
      expect(snapB).toEqual(snapA);
    } finally {
      await handle2.shutdown().catch(() => undefined);
      await rm(root2, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Reset fidelity
// ─────────────────────────────────────────────────────────────────

describe('demo reset — fidelity', () => {
  it('restores identical normalized content after the demo is mutated', async () => {
    const first = await seedDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const before = normalize(substrate(), first.demoWorkspaceId);

    await createConversation(substrate().ctx, first.demoWorkspaceId, {
      person_name: 'Intruder Note',
      occurred_at: FIXED_NOW.toISOString(),
      audience_fit: 'unknown',
      conversation_type: 'other',
      outcome: 'inconclusive',
      verbatim_quotes: [{ text: 'This should be wiped by reset.' }],
    });
    expect(
      listConversations(substrate().ctx.db, first.demoWorkspaceId, { limit: 100 }).conversations
        .length,
    ).toBe(DEMO_GOLDEN.conversationCount + 1);

    const after = await resetDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    const restored = normalize(substrate(), after.demoWorkspaceId);

    expect(restored).toEqual(before);
    expect(tierCounts(substrate(), after.demoWorkspaceId)).toEqual(DEMO_GOLDEN.tierCounts);
  });

  it('seeds fresh when reset is called with no prior demo', async () => {
    const res = await resetDemo(substrate(), workspaceRoot, { now: FIXED_NOW });
    expect(res.factCount).toBe(DEMO_GOLDEN.factCount);
    expect(tierCounts(substrate(), res.demoWorkspaceId)).toEqual(DEMO_GOLDEN.tierCounts);
  });
});

// ─────────────────────────────────────────────────────────────────
// Isolation guard
// ─────────────────────────────────────────────────────────────────

describe('demo reset — isolation guard', () => {
  it('refuses to purge a workspace that is not the demo, leaving its data intact', async () => {
    const real = await createWorkspace(substrate().ctx, {
      name: 'My real project',
      daemonWorkspaceRoot: workspaceRoot,
    });
    await createConversation(substrate().ctx, real.workspace.id, {
      person_name: 'Important Customer',
      occurred_at: FIXED_NOW.toISOString(),
      audience_fit: 'target',
      conversation_type: 'discovery',
      outcome: 'validated',
      verbatim_quotes: [{ text: 'Do not delete me.' }],
    });

    // Tamper with the marker so it points at the REAL workspace.
    writeDemoMarker(workspaceRoot, {
      demoWorkspaceId: real.workspace.id,
      workspaceName: DEMO_WORKSPACE_NAME,
      manifestVersion: 1,
      seededAt: FIXED_NOW.toISOString(),
    });

    await expect(resetDemo(substrate(), workspaceRoot, { now: FIXED_NOW })).rejects.toBeInstanceOf(
      DemoIsolationError,
    );

    const stillThere = listConversations(substrate().ctx.db, real.workspace.id, { limit: 100 });
    expect(stillThere.conversations.length).toBe(1);
    expect(stillThere.conversations[0]?.person_name).toBe('Important Customer');
  });
});
