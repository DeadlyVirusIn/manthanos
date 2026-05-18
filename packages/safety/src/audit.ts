// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Audit chain helpers per CRASH_CONSISTENCY.md §2 (P3) and §11.
// The actual SQLite-bound transactional writer lives in @manthanos/memory;
// this file provides the cryptographic primitives used by both the writer
// and the recovery/verifier.

import { createHash } from 'node:crypto';
import { JsonCanon } from '@manthanos/adapters-sdk';

/**
 * Decision label committed into every audit event. The chain commits
 * to this string via computeSelfHash, so changing the set of legal
 * values is a chain-affecting decision.
 *
 * The label answers exactly one question: **who decided THIS event?**
 * Not "who invoked the command that scheduled the sweep" — the
 * invoking human is recorded in `actor` and in workflow-level audit
 * events. This field distinguishes:
 *
 *   - `human-approved`: a human reviewed the specific transition and
 *     authorized it (e.g., `manthan brain promote`, interactive
 *     `brain review`, interactive `brain merge`).
 *
 *   - `auto-approve`: the system or an algorithmic policy decided
 *     the specific transition with no per-event human gating (e.g.,
 *     decay sweeps, T0 quarantine from plan extraction, charter-fact
 *     bootstrap, workflow scaffolding events).
 *
 * Future labels (e.g., `human-rejected`, `signed-decision`) require
 * a chain-aware migration plan and an updated reader.
 */
export type AuditDecision = 'human-approved' | 'auto-approve';
export const AUDIT_DECISION_HUMAN_APPROVED: AuditDecision = 'human-approved';
export const AUDIT_DECISION_AUTO_APPROVE: AuditDecision = 'auto-approve';

export interface AuditEventBody {
  readonly workspace_id: string;
  readonly seq: number;
  readonly ts: string; // RFC 3339 UTC ms-precision
  readonly actor: string;
  readonly action: string;
  readonly kind: string;
  readonly payload_hash: string | null;
  readonly decision: AuditDecision;
}

export interface ChainedAuditEvent extends AuditEventBody {
  /** sha256 hex of previous event; NULL for genesis (seq=1). */
  readonly prev_hash: string | null;
  /** sha256(prev_hash || JsonCanon(body)). */
  readonly self_hash: string;
}

const GENESIS_BODY = '{"manthanos":"genesis","schema":1}';
export const GENESIS_PAYLOAD_HASH = sha256Hex(GENESIS_BODY);

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Compute self_hash = sha256(prev_hash || JsonCanon(body)). */
export function computeSelfHash(prevHash: string | null, body: AuditEventBody): string {
  // prev_hash is concatenated as the raw string "null" if NULL, else the hex.
  // We use a clear delimiter to avoid prefix-collisions:
  // sha256( <prev_or_"null"> || ":" || JsonCanon(body) )
  const prefix = prevHash ?? 'null';
  const canonical = JsonCanon.stringify(body);
  return sha256Hex(`${prefix}:${canonical}`);
}

export interface ChainCheckResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failedAtSeq?: number;
  readonly expected?: string;
  readonly actual?: string;
}

/** Walk a sorted iterable of stored events and verify chain integrity. */
export function verifyChain(events: Iterable<ChainedAuditEvent>): ChainCheckResult {
  let prevHash: string | null = null;
  let count = 0;
  for (const ev of events) {
    if (ev.prev_hash !== prevHash) {
      return {
        ok: false,
        checked: count,
        failedAtSeq: ev.seq,
        expected: prevHash ?? 'null',
        actual: ev.prev_hash ?? 'null',
      };
    }
    const computed = computeSelfHash(prevHash, {
      workspace_id: ev.workspace_id,
      seq: ev.seq,
      ts: ev.ts,
      actor: ev.actor,
      action: ev.action,
      kind: ev.kind,
      payload_hash: ev.payload_hash,
      decision: ev.decision,
    });
    if (computed !== ev.self_hash) {
      return {
        ok: false,
        checked: count,
        failedAtSeq: ev.seq,
        expected: computed,
        actual: ev.self_hash,
      };
    }
    prevHash = ev.self_hash;
    count += 1;
  }
  return { ok: true, checked: count };
}
