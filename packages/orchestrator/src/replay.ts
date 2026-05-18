// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Replay verifier per P0.3.
//
// Scope (this is the entire claim):
//   manthan replay verifies the INTEGRITY of recorded continuity
//   artifacts for a past run. That means:
//     1. the audit chain is unbroken,
//     2. each audit event's stored payload blob still hashes to the
//        recorded payload_hash,
//     3. for `agent.invoke`, the canonical projection inside the
//        blob still hashes to the recorded canonical_hash (P0.1),
//     4. the bundle hash committed at run time can be recomputed
//        from the persisted layer metadata in context_snapshots
//        (P0.3 Commit A).
//
// What replay does NOT do:
//   - It does not re-invoke the model.
//   - It does not claim the model would produce the same response
//     today.
//   - It does not check whether the underlying source files / git
//     state are unchanged since the run.
//   - It does not verify semantic correctness of anything.
//
// Status mechanics:
//   - corrupted    : at least one explicit hash mismatch was found.
//                    Corruption always wins, even if other checks
//                    pass or are unverifiable.
//   - unverifiable : a required artifact is structurally absent
//                    (no agent.invoke event, no context_snapshots
//                    row, missing blob file).
//   - legacy       : the artifact exists but predates the field
//                    used for that check (e.g., agent.invoke blob
//                    lacks `canonical_hash`, or layers_json lacks
//                    per-layer `content_sha256`). The chain still
//                    hashed the recorded values correctly; the
//                    additional recompute-and-compare check just
//                    cannot run.
//   - verified     : every applicable check ran and passed; no
//                    legacy, unverifiable, or corrupted signals.
//
// Priority when multiple signals are present:
//   corrupted > unverifiable > legacy > verified.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JsonCanon, hashCanonicalPayload } from '@manthanos/adapters-sdk';
import { type StoredLayer, recomputeBundleHash } from '@manthanos/context';
import { createBlobStore, openDb } from '@manthanos/memory';
import { getPlatform } from '@manthanos/platform';
import { type ChainedAuditEvent, sha256Hex, verifyChain } from '@manthanos/safety';

export interface ReplayInput {
  readonly workspaceRoot: string;
  readonly runId: string;
}

export type VerificationStatus = 'verified' | 'legacy' | 'unverifiable' | 'corrupted';

export type CheckOutcome = 'ok' | 'mismatch' | 'legacy' | 'unverifiable';

export interface VerificationFailure {
  readonly check: 'chain' | 'blob' | 'canonical_hash' | 'bundle_hash';
  readonly detail: string;
  readonly failedAtSeq?: number;
  readonly expected?: string;
  readonly actual?: string;
}

export interface VerificationLegacyReason {
  readonly check: 'canonical_hash' | 'bundle_hash';
  readonly detail: string;
  readonly seq?: number;
}

export interface VerificationUnverifiableReason {
  readonly check: 'canonical_hash' | 'bundle_hash' | 'blob';
  readonly detail: string;
  readonly seq?: number;
}

export interface VerificationChecks {
  readonly chain: 'ok' | 'failed';
  readonly blobs: { readonly checked: number; readonly failed: number; readonly missing: number };
  readonly canonicalHash: CheckOutcome;
  readonly bundleHash: CheckOutcome;
}

export interface VerificationReport {
  readonly status: VerificationStatus;
  readonly checks: VerificationChecks;
  readonly failures: readonly VerificationFailure[];
  readonly legacy: readonly VerificationLegacyReason[];
  readonly unverifiable: readonly VerificationUnverifiableReason[];
}

export interface ReplayResult {
  readonly runId: string;
  readonly workspaceId: string;
  readonly auditEvents: number;
  readonly bundleHashRecorded: string | null;
  readonly canonicalHashRecorded: string | null;
  readonly recordedText: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly usdMicro: number;
  } | null;
  readonly finishReason: string | null;
  readonly originalStartedAt: string | null;
  readonly originalStatus: string | null;
  readonly verification: VerificationReport;
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

interface CanonicalPayloadShape {
  schema_version: 1;
  model: string;
  content: unknown[];
  text: string;
  tool_calls: unknown[];
  usage: { input_tokens: number; output_tokens: number; usd_micro: number };
  finish_reason: string;
  identifiers: Record<string, unknown>;
}

interface AgentInvokeBlob {
  adapter?: string;
  canonical?: CanonicalPayloadShape;
  canonical_hash?: string;
  redactions?: unknown[];
  latency_ms?: number;
}

export async function replayRun(input: ReplayInput): Promise<ReplayResult> {
  const platform = getPlatform();
  const workspaceRoot = await platform.path.canonicalizeWorkspaceRoot(input.workspaceRoot);
  const manthanDir = path.join(workspaceRoot, '.manthan');
  const dbPath = path.join(manthanDir, 'memory', 'manthan.db');
  const blobs = createBlobStore(path.join(manthanDir, 'audit', 'blobs'));
  const m = await openDb({ dbPath });

  try {
    const wf = m.handle
      .prepare(
        `SELECT id, workspace_id, started_at, status, total_input_tokens,
                total_output_tokens, total_usd_micro
         FROM workflows WHERE id = ?`,
      )
      .get(input.runId) as
      | {
          id: string;
          workspace_id: string;
          started_at: string;
          status: string;
          total_input_tokens: number;
          total_output_tokens: number;
          total_usd_micro: number;
        }
      | undefined;
    if (!wf) {
      throw new ReplayError(`workflow run not found: ${input.runId}`);
    }

    const failures: VerificationFailure[] = [];
    const legacy: VerificationLegacyReason[] = [];
    const unverifiable: VerificationUnverifiableReason[] = [];

    // ---- 1. Chain verification ----
    const rows = m.handle
      .prepare(
        `SELECT workspace_id, seq, ts, actor, action, kind, payload_hash,
                decision, prev_hash, self_hash
         FROM audit_events
         WHERE workspace_id = ?
         ORDER BY seq ASC`,
      )
      .all(wf.workspace_id) as ChainedAuditEvent[];
    const chainResult = verifyChain(rows);
    if (!chainResult.ok) {
      failures.push({
        check: 'chain',
        detail: 'audit chain hash mismatch',
        failedAtSeq: chainResult.failedAtSeq,
        expected: chainResult.expected,
        actual: chainResult.actual,
      });
    }

    const runActor = `workflow:plan#${input.runId}`;
    const runRows = rows.filter((r) => r.actor === runActor);

    // ---- 2. Per-event blob integrity ----
    let blobsChecked = 0;
    let blobsFailed = 0;
    let blobsMissing = 0;
    for (const row of runRows) {
      if (!row.payload_hash) continue;
      blobsChecked += 1;
      const blobPath = blobs.pathFor(row.payload_hash);
      let raw: string;
      try {
        raw = await readFile(blobPath, 'utf8');
      } catch {
        blobsMissing += 1;
        unverifiable.push({
          check: 'blob',
          detail: `blob missing on disk for seq=${row.seq}; payload_hash=${row.payload_hash}`,
          seq: row.seq,
        });
        continue;
      }
      // Recompute sha256(JsonCanon(parsed_blob)) and compare to stored
      // payload_hash. Matches the write-time formula in BlobStore.put.
      let parsed: unknown;
      try {
        parsed = JsonCanon.parse(raw);
      } catch {
        blobsFailed += 1;
        failures.push({
          check: 'blob',
          detail: `blob is not valid canonical JSON at seq=${row.seq}`,
          failedAtSeq: row.seq,
        });
        continue;
      }
      const recomputed = sha256Hex(JsonCanon.stringify(parsed));
      if (recomputed !== row.payload_hash) {
        blobsFailed += 1;
        failures.push({
          check: 'blob',
          detail: `blob content does not hash to recorded payload_hash for seq=${row.seq}`,
          failedAtSeq: row.seq,
          expected: row.payload_hash,
          actual: recomputed,
        });
      }
    }

    // ---- 3. agent.invoke canonical_hash recompute ----
    const invokeRow = runRows.find((r) => r.action === 'agent.invoke');
    let canonicalHashOutcome: CheckOutcome = 'unverifiable';
    let canonicalHashRecorded: string | null = null;
    let recordedText = '';
    let usage: ReplayResult['usage'] = null;
    let finishReason: string | null = null;
    let invokeBlob: AgentInvokeBlob | null = null;

    if (!invokeRow) {
      unverifiable.push({
        check: 'canonical_hash',
        detail: 'no agent.invoke event found for this run',
      });
    } else if (!invokeRow.payload_hash) {
      unverifiable.push({
        check: 'canonical_hash',
        detail: 'agent.invoke event has no payload_hash',
        seq: invokeRow.seq,
      });
    } else {
      const blobPath = blobs.pathFor(invokeRow.payload_hash);
      try {
        const raw = await readFile(blobPath, 'utf8');
        invokeBlob = JsonCanon.parse<AgentInvokeBlob>(raw);
        if (invokeBlob.canonical) {
          recordedText = invokeBlob.canonical.text;
          usage = {
            inputTokens: invokeBlob.canonical.usage.input_tokens,
            outputTokens: invokeBlob.canonical.usage.output_tokens,
            usdMicro: invokeBlob.canonical.usage.usd_micro,
          };
          finishReason = invokeBlob.canonical.finish_reason;
        }
        if (typeof invokeBlob.canonical_hash !== 'string' || !invokeBlob.canonical) {
          canonicalHashOutcome = 'legacy';
          legacy.push({
            check: 'canonical_hash',
            detail: 'agent.invoke blob predates P0.1; no canonical_hash field',
            seq: invokeRow.seq,
          });
        } else {
          canonicalHashRecorded = invokeBlob.canonical_hash;
          const recomputed = hashCanonicalPayload(
            invokeBlob.canonical as unknown as Parameters<typeof hashCanonicalPayload>[0],
          ).payloadHash;
          if (recomputed === invokeBlob.canonical_hash) {
            canonicalHashOutcome = 'ok';
          } else {
            canonicalHashOutcome = 'mismatch';
            failures.push({
              check: 'canonical_hash',
              detail: 'recomputed canonical hash does not match recorded canonical_hash',
              failedAtSeq: invokeRow.seq,
              expected: invokeBlob.canonical_hash,
              actual: recomputed,
            });
          }
        }
      } catch {
        // Blob unreadable. Already counted in the blob check above as
        // missing or unparseable; don't double-fail.
      }
    }

    // ---- 4. Bundle hash recompute ----
    const snap = m.handle
      .prepare(
        `SELECT bundle_hash, layers_json FROM context_snapshots
         WHERE workflow_id = ? LIMIT 1`,
      )
      .get(input.runId) as { bundle_hash: string; layers_json: string } | undefined;

    let bundleHashOutcome: CheckOutcome = 'unverifiable';
    let bundleHashRecorded: string | null = null;
    if (!snap) {
      unverifiable.push({
        check: 'bundle_hash',
        detail: 'no context_snapshots row found for this run',
      });
    } else {
      bundleHashRecorded = snap.bundle_hash;
      let storedLayers: StoredLayer[];
      try {
        storedLayers = JSON.parse(snap.layers_json) as StoredLayer[];
      } catch {
        bundleHashOutcome = 'mismatch';
        failures.push({
          check: 'bundle_hash',
          detail: 'context_snapshots.layers_json is not valid JSON',
        });
        storedLayers = [];
      }
      if (bundleHashOutcome !== 'mismatch') {
        const recompute = recomputeBundleHash(storedLayers);
        if (!recompute.ok) {
          bundleHashOutcome = 'legacy';
          legacy.push({
            check: 'bundle_hash',
            detail:
              recompute.reason === 'missing_content_sha256'
                ? `layers_json predates P0.3; layer ${recompute.missingAtIndex} lacks content_sha256`
                : 'layers_json missing data required for bundle_hash recompute',
          });
        } else if (recompute.hash === snap.bundle_hash) {
          bundleHashOutcome = 'ok';
        } else {
          bundleHashOutcome = 'mismatch';
          failures.push({
            check: 'bundle_hash',
            detail: 'recomputed bundle_hash does not match stored bundle_hash',
            expected: snap.bundle_hash,
            actual: recompute.hash,
          });
        }
      }
    }

    // ---- 5. Resolve overall status ----
    // Priority: corrupted > unverifiable > legacy > verified.
    // Corruption always wins, even if other checks pass.
    let status: VerificationStatus;
    if (failures.length > 0) {
      status = 'corrupted';
    } else if (unverifiable.length > 0) {
      status = 'unverifiable';
    } else if (legacy.length > 0) {
      status = 'legacy';
    } else {
      status = 'verified';
    }

    const verification: VerificationReport = {
      status,
      checks: {
        chain: chainResult.ok ? 'ok' : 'failed',
        blobs: { checked: blobsChecked, failed: blobsFailed, missing: blobsMissing },
        canonicalHash: canonicalHashOutcome,
        bundleHash: bundleHashOutcome,
      },
      failures,
      legacy,
      unverifiable,
    };

    return {
      runId: input.runId,
      workspaceId: wf.workspace_id,
      auditEvents: runRows.length,
      bundleHashRecorded,
      canonicalHashRecorded,
      recordedText,
      usage,
      finishReason,
      originalStartedAt: wf.started_at,
      originalStatus: wf.status,
      verification,
    };
  } finally {
    m.close();
  }
}
