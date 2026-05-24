// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C3.0 DEFECT-001/002/003 — malformed-response + enum-drift tests for the
// defensive parsers. Each parser must (a) accept the real daemon shape,
// (b) never throw on malformed input, and (c) return a renderable fallback.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseAuditEventsResult,
  parseAuditVerifyResult,
  parseWorkspaceList,
} from './schema.js';

beforeEach(() => {
  // Silence the intentional console.warn from the fallback path.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('parseWorkspaceList (DEFECT-001)', () => {
  const goodRow = {
    id: 'ws-1',
    name: 'Demo',
    root_path: '/x',
    status: 'active',
    status_changed_at: null,
    status_reason: null,
    stage_at_open: null,
    portfolio_mode_enabled: false,
    discovery_archive_ref: null,
    schema_version: 3,
    audit_chain_seq_high: 1,
    created_at: '2026-05-24T00:00:00.000Z',
  };

  it('accepts the daemon envelope { workspaces: [...] }', () => {
    const out = parseWorkspaceList({ workspaces: [goodRow] });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('ws-1');
  });

  it('falls back to [] for the pre-fix bare-array shape (the DEFECT-001 regression)', () => {
    expect(parseWorkspaceList([goodRow])).toEqual([]);
  });

  it('falls back to [] for null / missing key / non-array', () => {
    expect(parseWorkspaceList(null)).toEqual([]);
    expect(parseWorkspaceList({})).toEqual([]);
    expect(parseWorkspaceList({ workspaces: 'nope' })).toEqual([]);
  });

  it('drops rows missing an id but keeps valid siblings', () => {
    const out = parseWorkspaceList({ workspaces: [{ name: 'no id' }, goodRow] });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('ws-1');
  });

  it('enum-drift: keeps a row with an unknown status (downgrade, not crash)', () => {
    const out = parseWorkspaceList({ workspaces: [{ ...goodRow, status: 'archived' }] });
    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe('archived');
  });

  it('tolerates boolean portfolio_mode_enabled from the API', () => {
    const out = parseWorkspaceList({ workspaces: [{ ...goodRow, portfolio_mode_enabled: true }] });
    expect(out[0]?.portfolio_mode_enabled).toBe(1);
  });
});

describe('parseAuditEventsResult (DEFECT-002)', () => {
  const ev = {
    seq: 1,
    workspace_id: 'ws-1',
    ts: '2026-05-24T00:00:00.000Z',
    actor: 'user',
    action: 'workspace.create',
    kind: 'workspace',
    decision: 'human_approved',
    payload_hash: null,
    self_hash: 'abc',
  };

  it('accepts the daemon shape and exposes head_seq/next_before_seq', () => {
    const out = parseAuditEventsResult({
      events: [ev],
      head_seq: 1,
      returned: 1,
      has_more: false,
      next_before_seq: null,
    });
    expect(out.events).toHaveLength(1);
    expect(out.head_seq).toBe(1);
    expect(out.has_more).toBe(false);
  });

  it('falls back to an empty page on malformed input', () => {
    const out = parseAuditEventsResult({ events: 'nope' });
    expect(out.events).toEqual([]);
    expect(out.head_seq).toBeNull();
    expect(out.has_more).toBe(false);
  });

  it('filters malformed event rows', () => {
    const out = parseAuditEventsResult({ events: [ev, { seq: 'bad' }], head_seq: 1 });
    expect(out.events).toHaveLength(1);
    expect(out.returned).toBe(1);
  });
});

describe('parseAuditVerifyResult (DEFECT-003)', () => {
  it('accepts the daemon shape', () => {
    const out = parseAuditVerifyResult({
      valid: true,
      head_seq: 3,
      total_events: 3,
      broken_at_seq: null,
    });
    expect(out.valid).toBe(true);
    expect(out.total_events).toBe(3);
  });

  it('fails closed (valid:false) on the pre-fix misnamed shape', () => {
    // Old (wrong) shape used `verified` — must not read as valid:true.
    const out = parseAuditVerifyResult({ verified: true, checked_events: 3, latest_seq: 3 });
    expect(out.valid).toBe(false);
  });

  it('fails closed on null / non-object', () => {
    expect(parseAuditVerifyResult(null).valid).toBe(false);
    expect(parseAuditVerifyResult('x').valid).toBe(false);
  });
});
