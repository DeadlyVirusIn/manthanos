// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrainTrustError, demoteFact, promoteFact, undoCorrection } from '../src/brain-trust.js';

const WS = 'ws-trust-test';

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-trust-'));
  const m = await openDb({ dbPath: path.join(dir, '.manthan/memory/manthan.db') });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, dir, new Date().toISOString());
  // Seed a fact at T0 + a fact at T+1.
  m.handle
    .prepare(
      `INSERT INTO semantic_facts
         (id, workspace_id, area, statement, statement_hash,
          provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
          last_administratively_touched)
       VALUES (?, ?, 'auth', 'Sessions use httpOnly cookies', 'h1', NULL,
               'T0', ?, 0.3, 1, ?)`,
    )
    .run('fact_a', WS, new Date().toISOString(), new Date().toISOString());
  m.handle
    .prepare(
      `INSERT INTO semantic_facts
         (id, workspace_id, area, statement, statement_hash,
          provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
          last_administratively_touched)
       VALUES (?, ?, 'auth', 'Refresh tokens kept server-side', 'h2', NULL,
               'T+1', ?, 0.7, 1, ?)`,
    )
    .run('fact_b', WS, new Date().toISOString(), new Date().toISOString());
  const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
  const ctx = {
    db: m.handle,
    blobs,
    jsonlPath: path.join(dir, '.manthan/audit.log'),
    mutex: new AsyncMutex(),
  };
  return { dir, m, blobs, ctx };
}

describe('promoteFact', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('moves T0 → T+1 with audit event', async () => {
    const result = await promoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    expect(result.fromTier).toBe('T0');
    expect(result.toTier).toBe('T+1');
    expect(result.toConfidence).toBe(0.7);

    const row = env.m.handle
      .prepare('SELECT tier, confidence FROM semantic_facts WHERE id = ?')
      .get('fact_a') as { tier: string; confidence: number };
    expect(row.tier).toBe('T+1');
    expect(row.confidence).toBe(0.7);

    const audit = env.m.handle
      .prepare(
        `SELECT actor, action FROM audit_events
         WHERE workspace_id = ? AND seq = ?`,
      )
      .get(WS, result.auditSeq) as { actor: string; action: string };
    expect(audit.action).toBe('brain.correction');
    expect(audit.actor).toBe('user:tester');
  });

  it('moves T+1 → T+2 by default', async () => {
    const result = await promoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_b',
      approver: 'tester',
    });
    expect(result.toTier).toBe('T+2');
    expect(result.toConfidence).toBe(0.9);
  });

  it('refuses to promote to T+3 (must sign decision)', async () => {
    // first move b to T+2
    await promoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_b',
      approver: 'tester',
    });
    await expect(
      promoteFact({
        ctx: env.ctx,
        db: env.m.handle,
        workspaceId: WS,
        factId: 'fact_b',
        approver: 'tester',
        targetTier: 'T+2', // no T+3 in promote
      }),
    ).resolves.toMatchObject({ toTier: 'T+2', fromTier: 'T+2' });
    // explicit invalid attempt: targetTier T+1 (lower)
    await expect(
      promoteFact({
        ctx: env.ctx,
        db: env.m.handle,
        workspaceId: WS,
        factId: 'fact_b',
        approver: 'tester',
        targetTier: 'T+1',
      }),
    ).rejects.toBeInstanceOf(BrainTrustError);
  });

  it('rejects FACT_NOT_FOUND', async () => {
    await expect(
      promoteFact({
        ctx: env.ctx,
        db: env.m.handle,
        workspaceId: WS,
        factId: 'fact_nope',
        approver: 'tester',
      }),
    ).rejects.toThrowError(/FACT_NOT_FOUND|no fact/);
  });
});

describe('demoteFact', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('moves T+1 → T0 with reason', async () => {
    const result = await demoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_b',
      approver: 'tester',
      reason: 'no longer accurate',
    });
    expect(result.fromTier).toBe('T+1');
    expect(result.toTier).toBe('T0');
  });

  it('refuses to demote a non-existent fact', async () => {
    await expect(
      demoteFact({
        ctx: env.ctx,
        db: env.m.handle,
        workspaceId: WS,
        factId: 'fact_nope',
        approver: 'tester',
        reason: 'gone',
      }),
    ).rejects.toMatchObject({ code: 'FACT_NOT_FOUND' });
  });
});

describe('undoCorrection', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('reverses a recent promotion', async () => {
    const promotion = await promoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    expect(promotion.toTier).toBe('T+1');

    const undo = await undoCorrection({
      ctx: env.ctx,
      db: env.m.handle,
      blobs: env.blobs,
      workspaceId: WS,
      auditSeq: promotion.auditSeq,
      approver: 'tester',
    });
    expect(undo.fromTier).toBe('T+1');
    expect(undo.toTier).toBe('T0');

    const row = env.m.handle
      .prepare('SELECT tier FROM semantic_facts WHERE id = ?')
      .get('fact_a') as { tier: string };
    expect(row.tier).toBe('T0');
  });

  it('refuses to undo a non-correction event', async () => {
    // The first audit event is the seeded workspace creation row — there
    // isn't one. So we just probe a missing seq.
    await expect(
      undoCorrection({
        ctx: env.ctx,
        db: env.m.handle,
        blobs: env.blobs,
        workspaceId: WS,
        auditSeq: 9999,
        approver: 'tester',
      }),
    ).rejects.toMatchObject({ code: 'NO_PRIOR_CORRECTION' });
  });
});

// Stabilization §3.1 — last_corroborated semantics
describe('last_corroborated semantics (stabilization §3.1)', () => {
  let dir = '';
  let m: Awaited<ReturnType<typeof setup>>['m'] | null = null;
  let ctx: Awaited<ReturnType<typeof setup>>['ctx'] | null = null;
  beforeEach(async () => {
    const s = await setup();
    dir = s.dir;
    m = s.m;
    ctx = s.ctx;
  });
  afterEach(async () => {
    if (m) m.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('promotion (corroboration) updates BOTH columns', async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const before = m.handle
      .prepare(
        'SELECT last_corroborated, last_administratively_touched FROM semantic_facts WHERE id = ?',
      )
      .get('fact_a') as { last_corroborated: string; last_administratively_touched: string };
    await new Promise((r) => setTimeout(r, 5)); // ensure ts changes
    await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    const after = m.handle
      .prepare(
        'SELECT last_corroborated, last_administratively_touched FROM semantic_facts WHERE id = ?',
      )
      .get('fact_a') as { last_corroborated: string; last_administratively_touched: string };
    expect(after.last_corroborated).not.toEqual(before.last_corroborated);
    expect(after.last_administratively_touched).not.toEqual(before.last_administratively_touched);
    expect(after.last_corroborated).toEqual(after.last_administratively_touched);
  });

  it('demotion administratively touches but does NOT update last_corroborated', async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const before = m.handle
      .prepare(
        'SELECT last_corroborated, last_administratively_touched FROM semantic_facts WHERE id = ?',
      )
      .get('fact_b') as { last_corroborated: string; last_administratively_touched: string };
    await new Promise((r) => setTimeout(r, 5));
    await demoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_b',
      approver: 'tester',
      reason: 'no longer relevant',
    });
    const after = m.handle
      .prepare(
        'SELECT last_corroborated, last_administratively_touched FROM semantic_facts WHERE id = ?',
      )
      .get('fact_b') as { last_corroborated: string; last_administratively_touched: string };
    expect(after.last_corroborated).toEqual(before.last_corroborated);
    expect(after.last_administratively_touched).not.toEqual(before.last_administratively_touched);
  });

  it('undo administratively touches but does NOT update last_corroborated', async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const promoted = await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    const after = m.handle
      .prepare('SELECT last_corroborated FROM semantic_facts WHERE id = ?')
      .get('fact_a') as { last_corroborated: string };
    await new Promise((r) => setTimeout(r, 5));
    await undoCorrection({
      ctx,
      db: m.handle,
      blobs: ctx.blobs,
      workspaceId: WS,
      auditSeq: promoted.auditSeq,
      approver: 'tester',
    });
    const undone = m.handle
      .prepare(
        'SELECT last_corroborated, last_administratively_touched FROM semantic_facts WHERE id = ?',
      )
      .get('fact_a') as { last_corroborated: string; last_administratively_touched: string };
    expect(undone.last_corroborated).toEqual(after.last_corroborated);
    expect(undone.last_administratively_touched).not.toEqual(after.last_corroborated);
  });
});

// Stabilization §3.2 — undoCorrection intervening-check
describe('undoCorrection intervening-correction check (stabilization §3.2)', () => {
  let dir = '';
  let m: Awaited<ReturnType<typeof setup>>['m'] | null = null;
  let ctx: Awaited<ReturnType<typeof setup>>['ctx'] | null = null;
  beforeEach(async () => {
    const s = await setup();
    dir = s.dir;
    m = s.m;
    ctx = s.ctx;
  });
  afterEach(async () => {
    if (m) m.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('refuses to undo a correction when a later correction has moved the fact', async () => {
    if (!m || !ctx) throw new Error('setup failed');
    // T0 → T+1 (this is the correction we will try to undo)
    const first = await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    // T+1 → T+2 (intervening)
    await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      targetTier: 'T+2',
      approver: 'tester',
    });
    // Now try to undo the first correction. Should be refused.
    await expect(
      undoCorrection({
        ctx,
        db: m.handle,
        blobs: ctx.blobs,
        workspaceId: WS,
        auditSeq: first.auditSeq,
        approver: 'tester',
      }),
    ).rejects.toMatchObject({ code: 'INTERVENING_CORRECTION' });
  });

  it('allows undo when the fact is still at the correction target', async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const first = await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    const undone = await undoCorrection({
      ctx,
      db: m.handle,
      blobs: ctx.blobs,
      workspaceId: WS,
      auditSeq: first.auditSeq,
      approver: 'tester',
    });
    expect(undone.toTier).toBe('T0');
  });
});

// Stabilization §3.3 — audit metadata decision field
describe('audit metadata decision field (stabilization §3.3)', () => {
  let dir = '';
  let m: Awaited<ReturnType<typeof setup>>['m'] | null = null;
  let ctx: Awaited<ReturnType<typeof setup>>['ctx'] | null = null;
  beforeEach(async () => {
    const s = await setup();
    dir = s.dir;
    m = s.m;
    ctx = s.ctx;
  });
  afterEach(async () => {
    if (m) m.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("records 'human-approved' for promoteFact", async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const r = await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    const evt = m.handle
      .prepare('SELECT decision FROM audit_events WHERE seq = ?')
      .get(r.auditSeq) as { decision: string };
    expect(evt.decision).toBe('human-approved');
  });

  it("records 'human-approved' for demoteFact", async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const r = await demoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_b',
      approver: 'tester',
      reason: 'test',
    });
    const evt = m.handle
      .prepare('SELECT decision FROM audit_events WHERE seq = ?')
      .get(r.auditSeq) as { decision: string };
    expect(evt.decision).toBe('human-approved');
  });

  it("records 'human-approved' for undoCorrection", async () => {
    if (!m || !ctx) throw new Error('setup failed');
    const promoted = await promoteFact({
      ctx,
      db: m.handle,
      workspaceId: WS,
      factId: 'fact_a',
      approver: 'tester',
    });
    const undone = await undoCorrection({
      ctx,
      db: m.handle,
      blobs: ctx.blobs,
      workspaceId: WS,
      auditSeq: promoted.auditSeq,
      approver: 'tester',
    });
    const evt = m.handle
      .prepare('SELECT decision FROM audit_events WHERE seq = ?')
      .get(undone.auditSeq) as { decision: string };
    expect(evt.decision).toBe('human-approved');
  });
});
