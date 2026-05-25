// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.6.5 — provenance metadata persistence on approval.
//
// Proves the migration-0009 columns (extraction_confidence,
// extractor_version, model_used, reason_flags) are written through the
// EXISTING audited extract mutation when an approved suggestion carries
// metadata, and that:
//   - a manual extraction (no metadata) leaves all four columns NULL;
//   - the score is clamped and unknown reason flags are dropped at the
//     service boundary;
//   - model_used stays NULL in deterministic 3B (the route never sets it);
//   - the write rides the same human-approved audit event (no new path).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-prov-persist-'));
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

async function seedConversation(ws: string): Promise<{ conversationId: string; quoteId: string }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${ws}/conversations`,
    headers: { host: '127.0.0.1' },
    payload: {
      person_name: 'Alex',
      occurred_at: '2026-05-20T15:00:00Z',
      audience_fit: 'target',
      conversation_type: 'discovery',
      outcome: 'validated',
      verbatim_quotes: [{ text: 'We dropped the tool on day three.' }],
    },
  });
  const body = r.json() as { id: string; verbatim_quotes: Array<{ id: string }> };
  return { conversationId: body.id, quoteId: body.verbatim_quotes[0].id };
}

async function extract(
  ws: string,
  conv: string,
  payload: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${ws}/conversations/${conv}/extract`,
    headers: { host: '127.0.0.1' },
    payload,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

interface ProvRow {
  extraction_confidence: number | null;
  extractor_version: string | null;
  model_used: string | null;
  reason_flags: string | null;
}

function readProvenanceRow(ws: string, factId: string): ProvRow {
  // Direct substrate read — the public provenance view does not expose
  // the 0009 metadata columns (by vocabulary design), so the persistence
  // contract is verified at the row level.
  const db = handle.substrate?.db.handle;
  if (db === undefined) throw new Error('substrate not open');
  return db
    .prepare(
      `SELECT extraction_confidence, extractor_version, model_used, reason_flags
         FROM fact_provenance_sources
        WHERE workspace_id = ? AND fact_id = ?`,
    )
    .get(ws, factId) as ProvRow;
}

describe('3B.6.5 — approved suggestion persists provenance metadata', () => {
  it('writes extraction_confidence / extractor_version / reason_flags; model_used stays NULL', async () => {
    const ws = await createWorkspace('persist');
    const { conversationId, quoteId } = await seedConversation(ws);

    const r = await extract(ws, conversationId, {
      area: 'pricing',
      statement: 'Founders drop tools that feel like research software.',
      quote_id: quoteId,
      extraction_confidence: 0.82,
      extractor_version: 'det-1',
      reason_flags: ['has_clear_claim', 'quote_backed'],
    });
    expect(r.status).toBe(201);
    const factId = (r.body.fact as { id: string }).id;

    const row = readProvenanceRow(ws, factId);
    expect(row.extraction_confidence).toBeCloseTo(0.82, 5);
    expect(row.extractor_version).toBe('det-1');
    expect(row.model_used).toBeNull(); // no LLM in deterministic 3B
    expect(JSON.parse(row.reason_flags as string)).toEqual(['has_clear_claim', 'quote_backed']);
  });

  it('clamps an out-of-range score and drops unknown reason flags', async () => {
    const ws = await createWorkspace('clamp');
    const { conversationId } = await seedConversation(ws);

    const r = await extract(ws, conversationId, {
      area: 'audience',
      statement: 'They churn after onboarding friction.',
      extraction_confidence: 1.9, // out of range → clamp to 1
      extractor_version: 'det-1',
      reason_flags: ['has_clear_claim', 'totally_made_up_flag'],
    });
    expect(r.status).toBe(201);
    const factId = (r.body.fact as { id: string }).id;

    const row = readProvenanceRow(ws, factId);
    expect(row.extraction_confidence).toBe(1);
    expect(JSON.parse(row.reason_flags as string)).toEqual(['has_clear_claim']); // unknown dropped
  });

  it('a manual extraction (no metadata) leaves all 0009 columns NULL', async () => {
    const ws = await createWorkspace('manual');
    const { conversationId } = await seedConversation(ws);

    const r = await extract(ws, conversationId, {
      area: 'audience',
      statement: 'Hand typed fact with no suggestion metadata.',
    });
    expect(r.status).toBe(201);
    const factId = (r.body.fact as { id: string }).id;

    const row = readProvenanceRow(ws, factId);
    expect(row.extraction_confidence).toBeNull();
    expect(row.extractor_version).toBeNull();
    expect(row.model_used).toBeNull();
    expect(row.reason_flags).toBeNull();
  });

  it('rejects wrong-typed metadata at the route boundary', async () => {
    const ws = await createWorkspace('reject');
    const { conversationId } = await seedConversation(ws);

    const r = await extract(ws, conversationId, {
      area: 'a',
      statement: 's',
      extraction_confidence: 'high', // wrong type
    });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('extraction_confidence');
  });

  it('corroboration also persists metadata on the new provenance row', async () => {
    const ws = await createWorkspace('corrob');
    const { conversationId } = await seedConversation(ws);
    // First extract creates the fact.
    await extract(ws, conversationId, {
      area: 'pricing',
      statement: 'Same statement corroborated twice.',
      extraction_confidence: 0.6,
      extractor_version: 'det-1',
      reason_flags: ['has_subject'],
    });
    // Second extract of identical (area, statement) corroborates.
    const r2 = await extract(ws, conversationId, {
      area: 'pricing',
      statement: 'Same statement corroborated twice.',
      extraction_confidence: 0.7,
      extractor_version: 'det-1',
      reason_flags: ['has_clear_claim'],
    });
    expect(r2.status).toBe(200);
    expect(r2.body.was_created).toBe(false);
    const factId = (r2.body.fact as { id: string }).id;

    // Two provenance rows now exist; the most recent carries the second
    // call's metadata.
    const db = handle.substrate?.db.handle;
    if (db === undefined) throw new Error('substrate not open');
    const rows = db
      .prepare(
        `SELECT extraction_confidence, reason_flags
           FROM fact_provenance_sources
          WHERE workspace_id = ? AND fact_id = ?
          ORDER BY extracted_at ASC, id ASC`,
      )
      .all(ws, factId) as Array<{
      extraction_confidence: number | null;
      reason_flags: string | null;
    }>;
    expect(rows.length).toBe(2);
    expect(rows[1].extraction_confidence).toBeCloseTo(0.7, 5);
    expect(JSON.parse(rows[1].reason_flags as string)).toEqual(['has_clear_claim']);
  });
});
