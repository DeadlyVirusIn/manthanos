// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// P0.2 regression test: decay corrections are algorithmically decided,
// not human-reviewed. The per-event `actor` and `decision` must reflect
// decision authority, not the human who invoked the sweep.
//
// Before this test existed, decay.ts audited corrections as
// `actor: user:<name>` and `decision: 'human-approved'`. A competitor
// reading the audit chain would have no way to distinguish an automatic
// age-based demotion from a deliberate human re-evaluation — a false
// audit trail. This test pins the corrected semantics:
//
//   - actor = 'system:decay'
//   - decision = 'auto-approve'
//   - payload note records the invoking human as `invoked_by`

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AsyncMutex, createBlobStore, openDb } from '@manthanos/memory';
import {
  AUDIT_DECISION_AUTO_APPROVE,
  AUDIT_DECISION_HUMAN_APPROVED,
} from '@manthanos/safety';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promoteFact } from '../src/brain-trust.js';
import { runDecay } from '../src/decay.js';

const WS = 'ws-decay-audit-test';

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manthan-decay-audit-'));
  const m = await openDb({ dbPath: path.join(dir, '.manthan/memory/manthan.db') });
  m.handle
    .prepare(
      'INSERT INTO workspaces (id, root_path, git_remote_hash, created_at) VALUES (?, ?, NULL, ?)',
    )
    .run(WS, dir, new Date().toISOString());

  // Seed a stale T+1 fact whose last_corroborated is 200 days ago.
  // Under the 'normal' profile that puts it past the warn band and
  // into demote/archive territory.
  const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  m.handle
    .prepare(
      `INSERT INTO semantic_facts
         (id, workspace_id, area, statement, statement_hash,
          provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
          last_administratively_touched)
       VALUES (?, ?, 'auth', 'Stale fact slated for decay', 'h_stale', NULL,
               'T+1', ?, 0.7, 1, ?)`,
    )
    .run('fact_stale', WS, longAgo, longAgo);

  const blobs = createBlobStore(path.join(dir, '.manthan/audit/blobs'));
  const ctx = {
    db: m.handle,
    blobs,
    jsonlPath: path.join(dir, '.manthan/audit.log'),
    mutex: new AsyncMutex(),
  };
  return { dir, m, blobs, ctx };
}

describe('decay audit semantics', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    env.m.close();
    await rm(env.dir, { recursive: true, force: true });
  });

  it('decay correction audits as actor=system:decay, decision=auto-approve', async () => {
    const result = await runDecay({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      approver: 'tester',
      profile: 'normal',
    });

    expect(result.auditEventsWritten).toBeGreaterThan(0);

    const event = env.m.handle
      .prepare(
        `SELECT seq, actor, action, decision, payload_hash FROM audit_events
         WHERE workspace_id = ? AND action = 'brain.correction'
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(WS) as {
      seq: number;
      actor: string;
      action: string;
      decision: string;
      payload_hash: string;
    };

    expect(event).toBeDefined();
    expect(event.actor).toBe('system:decay');
    expect(event.decision).toBe(AUDIT_DECISION_AUTO_APPROVE);
    // Guard against a future regression that silently flips the label.
    expect(event.decision).not.toBe(AUDIT_DECISION_HUMAN_APPROVED);

    // Invoking human is preserved in the payload note for traceability.
    const blobPath = env.blobs.pathFor(event.payload_hash);
    const raw = await readFile(blobPath, 'utf8');
    const payload = JSON.parse(raw) as { note: string };
    const note = JSON.parse(payload.note) as { invoked_by?: string };
    expect(note.invoked_by).toBe('tester');
  });

  it('human-initiated promote audits as decision=human-approved (control)', async () => {
    // Seed a separate fact for the human-promote control path.
    env.m.handle
      .prepare(
        `INSERT INTO semantic_facts
           (id, workspace_id, area, statement, statement_hash,
            provenance_workflow_id, tier, last_corroborated, confidence, audit_seq,
            last_administratively_touched)
         VALUES (?, ?, 'auth', 'Fresh fact for promote', 'h_promote', NULL,
                 'T0', ?, 0.3, 1, ?)`,
      )
      .run('fact_promote', WS, new Date().toISOString(), new Date().toISOString());

    const result = await promoteFact({
      ctx: env.ctx,
      db: env.m.handle,
      workspaceId: WS,
      factId: 'fact_promote',
      approver: 'tester',
    });

    const event = env.m.handle
      .prepare(
        `SELECT actor, decision FROM audit_events
         WHERE workspace_id = ? AND seq = ?`,
      )
      .get(WS, result.auditSeq) as { actor: string; decision: string };

    expect(event.actor).toBe('user:tester');
    expect(event.decision).toBe(AUDIT_DECISION_HUMAN_APPROVED);
    expect(event.decision).not.toBe(AUDIT_DECISION_AUTO_APPROVE);
  });
});
