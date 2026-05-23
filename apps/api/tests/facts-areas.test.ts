// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Topic-suggestion endpoint tests for Sprint 2 M1 C1.3.
// Covers: empty workspace, 404, ordering (count DESC then area ASC),
// tombstone exclusion, empty-value exclusion, whitespace trim,
// case-variant deduplication with most-frequent variant as display
// form, workspace isolation, default limit, configurable limit,
// invalid limit validation, deterministic output.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-areas-'));
  handle = await createDaemon({
    config: { port: 0, host: '127.0.0.1', logLevel: 'silent', workspaceRoot },
    noListen: true,
  });
});

afterEach(async () => {
  await handle.shutdown().catch(() => undefined);
  await rm(workspaceRoot, { recursive: true, force: true });
});

async function createWorkspace(name: string): Promise<string> {
  const r = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/workspaces',
    headers: { host: '127.0.0.1' },
    payload: { name },
  });
  return (r.json() as { id: string }).id;
}

async function postFact(
  workspaceId: string,
  body: { area: string; statement: string; tier?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts`,
    headers: { host: '127.0.0.1' },
    payload: body,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function tombstoneFact(
  workspaceId: string,
  factId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/facts/${factId}/tombstone`,
    headers: { host: '127.0.0.1' },
    payload: { reason: 'erase' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function getAreas(
  workspaceId: string,
  query = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}/facts/areas${query}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

// Helper: directly insert facts with controlled area values, bypassing
// the createFact validation that trims input. Used to verify the
// service's normalization handles substrate state that pre-existed
// validation (e.g. data imported pre-trim).
function insertFactDirect(
  ws: string,
  id: string,
  area: string,
  statement: string,
  statementHash: string,
): void {
  const substrate = handle.substrate;
  if (!substrate) throw new Error('substrate not initialised');
  const now = new Date().toISOString();
  substrate.db.handle
    .prepare(
      `INSERT INTO semantic_facts (
         id, workspace_id, area, statement, statement_hash,
         provenance_workflow_id, tier, last_corroborated, confidence,
         audit_seq, last_administratively_touched
       ) VALUES (?, ?, ?, ?, ?, NULL, 'T0', ?, 0.3, 0, ?)`,
    )
    .run(id, ws, area, statement, statementHash, now, now);
}

describe('GET /facts/areas (M1 C1.3)', () => {
  // ────────── 1. empty workspace returns [] ──────────
  it('1 — empty workspace returns areas: []', async () => {
    const ws = await createWorkspace('Empty');
    const r = await getAreas(ws);
    expect(r.status).toBe(200);
    expect(r.body.areas).toEqual([]);
  });

  // ────────── 2. unknown workspace returns 404 ──────────
  it('2 — unknown workspace returns 404', async () => {
    const r = await getAreas('ws-does-not-exist');
    expect(r.status).toBe(404);
  });

  // ────────── 3. ordering: count DESC, then area ASC ──────────
  it('3 — orders by count DESC, then area ASC alphabetically', async () => {
    const ws = await createWorkspace('Ordering');
    // 3 facts in "Audience", 2 in "Behavior", 2 in "Tools" (tie at 2).
    await postFact(ws, { area: 'Audience', statement: 'a1' });
    await postFact(ws, { area: 'Audience', statement: 'a2' });
    await postFact(ws, { area: 'Audience', statement: 'a3' });
    await postFact(ws, { area: 'Behavior', statement: 'b1' });
    await postFact(ws, { area: 'Behavior', statement: 'b2' });
    await postFact(ws, { area: 'Tools', statement: 't1' });
    await postFact(ws, { area: 'Tools', statement: 't2' });

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toEqual([
      { area: 'Audience', count: 3 },
      { area: 'Behavior', count: 2 }, // ties broken alphabetically — 'Behavior' < 'Tools'
      { area: 'Tools', count: 2 },
    ]);
  });

  // ────────── 4. tombstoned facts excluded ──────────
  it('4 — tombstoned facts are excluded from counts and entirely if all instances are tombstoned', async () => {
    const ws = await createWorkspace('Tomb exclude');
    // 2 active + 1 tombstoned in "Live"
    const f1 = await postFact(ws, { area: 'Live', statement: 'L1' });
    await postFact(ws, { area: 'Live', statement: 'L2' });
    await postFact(ws, { area: 'Live', statement: 'L3' });
    await tombstoneFact(ws, f1.body.id as string);

    // 1 fact in "OnlyDead", tombstoned. Area should disappear entirely.
    const dead = await postFact(ws, { area: 'OnlyDead', statement: 'D1' });
    await tombstoneFact(ws, dead.body.id as string);

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toEqual([{ area: 'Live', count: 2 }]);
  });

  // ────────── 5. empty / whitespace-only area values ignored ──────────
  it('5 — empty or whitespace-only area values are ignored', async () => {
    const ws = await createWorkspace('Empty values');
    await postFact(ws, { area: 'Real', statement: 'r1' });
    // Direct inserts — the createFact validation rejects empty/whitespace
    // input, so we go around it to simulate substrate state that might
    // arise from imports or future ingestion paths.
    insertFactDirect(ws, 'fact-empty', '', 'e1', 'hash-empty');
    insertFactDirect(ws, 'fact-ws', '   ', 'e2', 'hash-ws');

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toEqual([{ area: 'Real', count: 1 }]);
  });

  // ────────── 6. case-variant deduplication; display = most-frequent variant ──────────
  it('6 — case variants merge; display form is the most-frequent case variant', async () => {
    const ws = await createWorkspace('Case fold');

    // "Audience" appears 3x, "audience" 1x, "AUDIENCE" 1x → bucket count 5,
    // display form is "Audience" (highest variant count: 3).
    await postFact(ws, { area: 'Audience', statement: 'a1' });
    await postFact(ws, { area: 'Audience', statement: 'a2' });
    await postFact(ws, { area: 'Audience', statement: 'a3' });
    await postFact(ws, { area: 'audience', statement: 'a4' });
    await postFact(ws, { area: 'AUDIENCE', statement: 'a5' });

    // "Tools" 1x, "tools" 1x → tie within bucket; tiebreaker is alphabetic ASC.
    // "Tools" < "tools" lexicographically? "T" (84) vs "t" (116) → "T" < "t",
    // so "Tools" wins as display form.
    await postFact(ws, { area: 'Tools', statement: 't1' });
    await postFact(ws, { area: 'tools', statement: 't2' });

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toEqual([
      { area: 'Audience', count: 5 },
      { area: 'Tools', count: 2 },
    ]);
  });

  // ────────── 7. whitespace trim ──────────
  it('7 — whitespace-padded area values merge with their trimmed peers', async () => {
    const ws = await createWorkspace('Trim');
    // createFact's validateNonEmpty trims input on its own, so we use
    // direct inserts to exercise the SQL-level TRIM normalization.
    insertFactDirect(ws, 'f-clean', 'Audience', 's1', 'h1');
    insertFactDirect(ws, 'f-padded', '  Audience  ', 's2', 'h2');
    insertFactDirect(ws, 'f-tab', '\tAudience\t', 's3', 'h3');

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toEqual([{ area: 'Audience', count: 3 }]);
  });

  // ────────── 8. workspace isolation ──────────
  it('8 — workspace isolation: areas from wsA do not appear in wsB', async () => {
    const wsA = await createWorkspace('IsoA');
    const wsB = await createWorkspace('IsoB');
    await postFact(wsA, { area: 'OnlyInA', statement: 'a' });
    await postFact(wsB, { area: 'OnlyInB', statement: 'b' });

    const rA = await getAreas(wsA);
    const rB = await getAreas(wsB);
    expect((rA.body.areas as Array<{ area: string }>).map((x) => x.area)).toEqual(['OnlyInA']);
    expect((rB.body.areas as Array<{ area: string }>).map((x) => x.area)).toEqual(['OnlyInB']);
  });

  // ────────── 9. default limit = 20 ──────────
  it('9 — default limit returns top 20 areas when more exist', async () => {
    const ws = await createWorkspace('Default limit');
    // Seed 25 distinct areas with descending counts so order is unambiguous.
    for (let i = 0; i < 25; i++) {
      const count = 25 - i; // area 'Area-00' has 25 facts, 'Area-24' has 1.
      const area = `Area-${String(i).padStart(2, '0')}`;
      for (let j = 0; j < count; j++) {
        await postFact(ws, { area, statement: `${area}-stmt-${j}` });
      }
    }

    const r = await getAreas(ws);
    const areas = r.body.areas as Array<{ area: string; count: number }>;
    expect(areas).toHaveLength(20);
    expect(areas[0]).toEqual({ area: 'Area-00', count: 25 });
    expect(areas[19]).toEqual({ area: 'Area-19', count: 6 });
  });

  // ────────── 10. configurable limit ──────────
  it('10 — ?limit=N respects N; clamps to MAX (500) silently', async () => {
    const ws = await createWorkspace('Configurable limit');
    for (let i = 0; i < 10; i++) {
      await postFact(ws, { area: `T-${i}`, statement: `s-${i}` });
    }

    const small = await getAreas(ws, '?limit=3');
    expect((small.body.areas as unknown[]).length).toBe(3);

    const exact = await getAreas(ws, '?limit=10');
    expect((exact.body.areas as unknown[]).length).toBe(10);

    // Excessive limit clamps silently to MAX (500); since only 10 areas exist,
    // we get all 10.
    const huge = await getAreas(ws, '?limit=999999');
    expect((huge.body.areas as unknown[]).length).toBe(10);
  });

  // ────────── 11. invalid limit → 400; determinism ──────────
  it('11 — invalid limit returns 400 (non-integer, zero, negative)', async () => {
    const ws = await createWorkspace('Bad limit');
    await postFact(ws, { area: 'X', statement: 's' });

    expect((await getAreas(ws, '?limit=abc')).status).toBe(400);
    expect((await getAreas(ws, '?limit=0')).status).toBe(400);
    expect((await getAreas(ws, '?limit=-1')).status).toBe(400);
    expect((await getAreas(ws, '?limit=1.5')).status).toBe(400);
    // Sanity: a valid positive integer still works.
    expect((await getAreas(ws, '?limit=1')).status).toBe(200);
  });

  it('12 — deterministic output: repeated calls return byte-identical lists', async () => {
    const ws = await createWorkspace('Determinism');
    // Mix counts so ordering isn't trivial.
    await postFact(ws, { area: 'Behavior', statement: 'b1' });
    await postFact(ws, { area: 'Behavior', statement: 'b2' });
    await postFact(ws, { area: 'Audience', statement: 'a1' });
    await postFact(ws, { area: 'Audience', statement: 'a2' });
    await postFact(ws, { area: 'Audience', statement: 'a3' });
    await postFact(ws, { area: 'Tools', statement: 't1' });

    const r1 = await getAreas(ws);
    const r2 = await getAreas(ws);
    const r3 = await getAreas(ws);
    // JSON-serialize for byte-identical comparison.
    expect(JSON.stringify(r2.body)).toBe(JSON.stringify(r1.body));
    expect(JSON.stringify(r3.body)).toBe(JSON.stringify(r1.body));
  });
});
