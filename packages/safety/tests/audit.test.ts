// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { computeSelfHash, sha256Hex, verifyChain } from '../src/audit.js';
import type { AuditEventBody, ChainedAuditEvent } from '../src/audit.js';

function makeBody(seq: number): AuditEventBody {
  return {
    workspace_id: 'ws-test',
    seq,
    ts: `2026-05-15T14:00:0${seq}.000Z`,
    actor: 'system:test',
    action: 'test.event',
    kind: 'system',
    payload_hash: sha256Hex(`payload-${seq}`),
    decision: 'auto-approve',
  };
}

function chain(n: number): ChainedAuditEvent[] {
  const out: ChainedAuditEvent[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const body = makeBody(i);
    const self = computeSelfHash(prev, body);
    out.push({ ...body, prev_hash: prev, self_hash: self });
    prev = self;
  }
  return out;
}

describe('audit chain', () => {
  it('verifies a valid chain', () => {
    const events = chain(5);
    const result = verifyChain(events);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(5);
  });

  it('detects a tampered body', () => {
    const events = chain(5);
    // Mutate body of event 3 but keep self_hash and chain links.
    const tampered = events.map((e, idx) => (idx === 2 ? { ...e, actor: 'system:tampered' } : e));
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.failedAtSeq).toBe(3);
  });

  it('detects a broken prev_hash link', () => {
    const events = chain(5);
    const broken = events.map((e, idx) => (idx === 3 ? { ...e, prev_hash: 'aaaaaa...' } : e));
    const result = verifyChain(broken);
    expect(result.ok).toBe(false);
    expect(result.failedAtSeq).toBe(4);
  });

  it('verifies a single-event chain (genesis)', () => {
    const events = chain(1);
    expect(events[0]?.prev_hash).toBeNull();
    const result = verifyChain(events);
    expect(result.ok).toBe(true);
  });
});
