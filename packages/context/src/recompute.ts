// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Recompute the bundle hash from stored layer metadata alone.
//
// The substrate persists a per-run snapshot in
// `context_snapshots.layers_json` containing each layer's kind,
// wrap_as, attributes, trust, estimated_tokens, provenance, and
// (post-P0.3) the layer's content_sha256. The bundle hash committed
// by `pack()` is `sha256(JsonCanon({schema:1, layers:[...]}))` over
// the same shape. `recomputeBundleHash` rebuilds that struct from
// stored data and returns the resulting hash, so `manthan replay`
// can compare it against `context_snapshots.bundle_hash` without
// re-rendering layer content.
//
// If any layer entry lacks `content_sha256` (pre-P0.3 snapshots),
// the function returns a `missing_content_sha256` result so the
// caller can surface a `legacy` status instead of fabricating a
// hash. No silent fallback.

import { createHash } from 'node:crypto';
import { JsonCanon } from '@manthanos/adapters-sdk';

export interface StoredLayer {
  readonly kind: string;
  readonly wrap_as: string;
  readonly trust: string;
  readonly attributes?: Record<string, string> | null;
  readonly provenance: string;
  readonly estimated_tokens: number;
  /**
   * SHA-256 of the layer's content text, captured at pack time.
   * Absent in snapshots written before P0.3 — callers must treat
   * absence as `legacy`, not as `verified`.
   */
  readonly content_sha256?: string;
}

export type RecomputeBundleHashResult =
  | { readonly ok: true; readonly hash: string }
  | {
      readonly ok: false;
      readonly reason: 'missing_content_sha256';
      readonly missingAtIndex: number;
    };

/**
 * Rebuild the canonical bundle struct from stored layer metadata
 * and return its SHA-256. Returns a `missing_content_sha256`
 * failure (not a hash) if any layer entry lacks the field — the
 * caller must surface that as `legacy`, never as `verified`.
 *
 * The canonical struct shape MUST match `pack()`'s exactly,
 * otherwise the recomputed hash will not equal the stored
 * `bundle_hash`. See `packages/context/src/packer.ts` for the
 * authoritative shape.
 */
export function recomputeBundleHash(layers: readonly StoredLayer[]): RecomputeBundleHashResult {
  for (let i = 0; i < layers.length; i += 1) {
    const l = layers[i] as StoredLayer;
    if (typeof l.content_sha256 !== 'string' || l.content_sha256.length === 0) {
      return { ok: false, reason: 'missing_content_sha256', missingAtIndex: i };
    }
  }

  const canonical = JsonCanon.stringify({
    schema: 1,
    layers: layers.map((l) => ({
      kind: l.kind,
      wrap_as: l.wrap_as,
      trust: l.trust,
      attributes: l.attributes ?? null,
      provenance: l.provenance,
      content_sha256: l.content_sha256,
      estimated_tokens: l.estimated_tokens,
    })),
  });
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { ok: true, hash };
}
