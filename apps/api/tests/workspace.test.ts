// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Workspace API route tests.
// Covers POST / GET (list + single) / PATCH and the status-transition
// matrix. Each test gets its own tmpdir workspace so substrate state is
// isolated. Lock acquisition is exercised by the underlying daemon
// startup; routes under test issue inject() requests against the daemon.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DaemonHandle, createDaemon } from '../src/server.js';

let workspaceRoot: string;
let handle: DaemonHandle;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-wsapi-'));
  handle = await createDaemon({
    config: {
      port: 0,
      host: '127.0.0.1',
      logLevel: 'silent',
      workspaceRoot,
    },
    noListen: true,
  });
});

afterEach(async () => {
  await handle.shutdown().catch(() => undefined);
  await rm(workspaceRoot, { recursive: true, force: true });
});

async function post(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'POST',
    url: '/api/v1/workspaces',
    headers: { host: '127.0.0.1' },
    payload: body as object,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function getList(query = ''): Promise<{
  status: number;
  body: Array<Record<string, unknown>>;
}> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces${query}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Array<Record<string, unknown>> };
}

async function getOne(id: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${id}`,
    headers: { host: '127.0.0.1' },
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

async function patch(
  id: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await handle.app.inject({
    method: 'PATCH',
    url: `/api/v1/workspaces/${id}`,
    headers: { host: '127.0.0.1' },
    payload: body as object,
  });
  return { status: r.statusCode, body: r.json() as Record<string, unknown> };
}

describe('POST /api/v1/workspaces', () => {
  it('creates a workspace with the provided name and returns it', async () => {
    const r = await post({ name: 'Freelance Profitability Tracker' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Freelance Profitability Tracker');
    expect(r.body.status).toBe('active');
    expect(r.body.id).toMatch(/^ws-/);
    expect(r.body.root_path).toContain('/workspaces/');
    expect(r.body.schema_version).toBe(3);
    expect(r.body.audit_chain_seq_high).toBeGreaterThanOrEqual(1);
    expect(r.body.portfolio_mode_enabled).toBe(false);
    expect(typeof r.body.created_at).toBe('string');
  });

  it('accepts optional idea_text and creates an audit event', async () => {
    const r = await post({
      name: 'Idea-bearing workspace',
      idea_text: 'An app that helps freelance designers track profitability.',
    });
    expect(r.status).toBe(201);
    // Re-fetch via GET to confirm the row is persisted.
    const got = await getOne(r.body.id as string);
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(r.body.id);
  });

  it('rejects empty name with 400', async () => {
    const r = await post({ name: '' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
    expect(r.body.field).toBe('name');
  });

  it('rejects whitespace-only name with 400', async () => {
    const r = await post({ name: '   ' });
    expect(r.status).toBe(400);
  });

  it('rejects missing name with 400', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('name');
  });

  it('rejects non-string idea_text with 400', async () => {
    const r = await post({ name: 'x', idea_text: 42 });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('idea_text');
  });

  it('rejects name longer than 200 characters with 400', async () => {
    const r = await post({ name: 'x'.repeat(201) });
    expect(r.status).toBe(400);
  });

  it('creates one audit entry per workspace creation', async () => {
    const r1 = await post({ name: 'A' });
    const r2 = await post({ name: 'B' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    // Audit chains are per-workspace; each workspace starts its own
    // chain at seq=1. The workspace.create event is the first entry.
    expect(r1.body.audit_chain_seq_high).toBe(1);
    expect(r2.body.audit_chain_seq_high).toBe(1);
    // Their ids must be distinct.
    expect(r2.body.id).not.toBe(r1.body.id);
  });
});

describe('GET /api/v1/workspaces', () => {
  it('returns an empty list initially', async () => {
    const r = await getList();
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('returns all created workspaces (newest first)', async () => {
    await post({ name: 'First' });
    await new Promise((res) => setTimeout(res, 5));
    await post({ name: 'Second' });
    const r = await getList();
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(2);
    // Newest first.
    expect(r.body[0]?.name).toBe('Second');
    expect(r.body[1]?.name).toBe('First');
  });

  it('filters by status', async () => {
    const c1 = await post({ name: 'Active one' });
    const c2 = await post({ name: 'Will pause' });
    await patch(c2.body.id as string, { status: 'paused' });

    const active = await getList('?status=active');
    expect(active.body.map((w) => w.id)).toContain(c1.body.id);
    expect(active.body.map((w) => w.id)).not.toContain(c2.body.id);

    const paused = await getList('?status=paused');
    expect(paused.body.map((w) => w.id)).toContain(c2.body.id);
    expect(paused.body.map((w) => w.id)).not.toContain(c1.body.id);
  });

  it('rejects invalid status query with 400', async () => {
    const r = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/workspaces?status=banana',
      headers: { host: '127.0.0.1' },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /api/v1/workspaces/:id', () => {
  it('returns the workspace by id', async () => {
    const created = await post({ name: 'Lookup me' });
    const r = await getOne(created.body.id as string);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(created.body.id);
    expect(r.body.name).toBe('Lookup me');
  });

  it('returns 404 for an unknown id', async () => {
    const r = await getOne('ws-does-not-exist');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });
});

describe('PATCH /api/v1/workspaces/:id', () => {
  it('renames a workspace', async () => {
    const c = await post({ name: 'Old name' });
    const r = await patch(c.body.id as string, { name: 'New name' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('New name');
    expect(r.body.audit_chain_seq_high).toBeGreaterThan(c.body.audit_chain_seq_high as number);
  });

  it('rejects empty name on rename with 400', async () => {
    const c = await post({ name: 'Original' });
    const r = await patch(c.body.id as string, { name: '' });
    expect(r.status).toBe(400);
  });

  it('returns 404 when patching unknown id', async () => {
    const r = await patch('ws-nope', { name: 'x' });
    expect(r.status).toBe(404);
  });

  it('returns the same workspace unchanged on a no-op patch (no audit entry)', async () => {
    const c = await post({ name: 'Same' });
    const r = await patch(c.body.id as string, { name: 'Same' });
    expect(r.status).toBe(200);
    expect(r.body.audit_chain_seq_high).toBe(c.body.audit_chain_seq_high);
  });

  describe('status transitions', () => {
    it('active → paused is allowed', async () => {
      const c = await post({ name: 'Pause me' });
      const r = await patch(c.body.id as string, {
        status: 'paused',
        status_reason: 'finals next week',
      });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('paused');
      expect(r.body.status_reason).toBe('finals next week');
      expect(typeof r.body.status_changed_at).toBe('string');
    });

    it('paused → active is allowed', async () => {
      const c = await post({ name: 'Resume me' });
      await patch(c.body.id as string, { status: 'paused' });
      const r = await patch(c.body.id as string, { status: 'active' });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('active');
    });

    it('active → killed is allowed', async () => {
      const c = await post({ name: 'Kill me' });
      const r = await patch(c.body.id as string, {
        status: 'killed',
        status_reason: 'wrong idea',
      });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('killed');
    });

    it('paused → killed is allowed', async () => {
      const c = await post({ name: 'Pause then kill' });
      await patch(c.body.id as string, { status: 'paused' });
      const r = await patch(c.body.id as string, { status: 'killed' });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('killed');
    });

    it('killed → active is forbidden with 409', async () => {
      const c = await post({ name: 'Dead' });
      await patch(c.body.id as string, { status: 'killed' });
      const r = await patch(c.body.id as string, { status: 'active' });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('invalid_status_transition');
      expect(r.body.from).toBe('killed');
      expect(r.body.to).toBe('active');
    });

    it('killed → paused is forbidden with 409', async () => {
      const c = await post({ name: 'Also dead' });
      await patch(c.body.id as string, { status: 'killed' });
      const r = await patch(c.body.id as string, { status: 'paused' });
      expect(r.status).toBe(409);
    });

    it('re-asserting the same status is a no-op', async () => {
      const c = await post({ name: 'Stable' });
      const r = await patch(c.body.id as string, { status: 'active' });
      expect(r.status).toBe(200);
      expect(r.body.audit_chain_seq_high).toBe(c.body.audit_chain_seq_high);
    });

    it('rejects unknown status string with 400', async () => {
      const c = await post({ name: 'Unknown status' });
      const r = await patch(c.body.id as string, { status: 'banana' });
      expect(r.status).toBe(400);
    });
  });
});

describe('audit chain participation', () => {
  it('every workspace mutation goes through auditedWrite', async () => {
    const c = await post({ name: 'Audit me' });
    expect(c.body.audit_chain_seq_high).toBeGreaterThanOrEqual(1);

    const renamed = await patch(c.body.id as string, { name: 'Renamed' });
    expect(renamed.body.audit_chain_seq_high).toBeGreaterThan(
      c.body.audit_chain_seq_high as number,
    );

    const paused = await patch(c.body.id as string, { status: 'paused' });
    expect(paused.body.audit_chain_seq_high).toBeGreaterThan(
      renamed.body.audit_chain_seq_high as number,
    );

    // The substrate's audit_events table should reflect every mutation.
    expect(handle.substrate).not.toBeNull();
    const events = handle.substrate?.db.handle
      .prepare('SELECT seq, action FROM audit_events WHERE workspace_id = ? ORDER BY seq')
      .all(c.body.id) as Array<{ seq: number; action: string }>;
    expect(events.length).toBe(3);
    expect(events[0]?.action).toBe('workspace.create');
    expect(events[1]?.action).toBe('workspace.update');
    expect(events[2]?.action).toBe('workspace.update');
  });
});
