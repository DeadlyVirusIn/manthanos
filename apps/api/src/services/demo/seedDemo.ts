// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Demo seed replay engine — C4.4-E1 (Approach A: no write-path changes).
//
// Turns the static manifest into REAL substrate state by issuing the same
// audited service calls a user would: createWorkspace → createConversation
// (with quotes) → extractFactFromConversation (mint + corroborate) →
// contestFact (flag to double-check). Never a raw insert.
//
// Determinism (Approach A): the manifest's logical ids are used only to
// wire quotes ↔ facts during replay; persisted ids stay service-generated
// and are tracked in a logical→real map. Conversation `occurred_at` uses
// relative day-offsets resolved against an injected `now`. created_at /
// audit timestamps remain wall-clock. Golden tests normalize ids/timestamps.
//
// A durable marker file records the real demo workspace id so resetDemo's
// isolation guard can target ONLY the demo workspace (never a real one).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  type CreateConversationInput,
  type ExtractFactInput,
  createConversation,
  extractFactFromConversation,
} from '../conversations.js';
import { contestFact } from '../facts.js';
import type { SubstrateHandle } from '../substrate.js';
import { createWorkspace } from '../workspace.js';
import { DEMO_MANIFEST, DEMO_WORKSPACE_NAME } from './manifest.js';

// ─────────────────────────────────────────────────────────────────
// Durable demo marker (isolation anchor)
// ─────────────────────────────────────────────────────────────────

export interface DemoMarker {
  /** Service-generated id of THE demo workspace. The only workspace
   *  resetDemo is ever allowed to purge. */
  readonly demoWorkspaceId: string;
  readonly workspaceName: string;
  readonly manifestVersion: number;
  /** ISO-8601 timestamp of the most recent seed. */
  readonly seededAt: string;
}

/** Absolute path to the durable demo marker, under the daemon's
 *  `.manthan` directory (alongside the substrate it describes). */
export function demoMarkerPath(daemonWorkspaceRoot: string): string {
  return path.join(daemonWorkspaceRoot, '.manthan', 'demo-marker.json');
}

export function writeDemoMarker(daemonWorkspaceRoot: string, marker: DemoMarker): void {
  const file = demoMarkerPath(daemonWorkspaceRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

/** Read the marker, or null if absent/unparseable. Never throws. */
export function readDemoMarker(daemonWorkspaceRoot: string): DemoMarker | null {
  try {
    const raw = readFileSync(demoMarkerPath(daemonWorkspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as Partial<DemoMarker>;
    if (
      typeof parsed.demoWorkspaceId === 'string' &&
      typeof parsed.workspaceName === 'string' &&
      typeof parsed.manifestVersion === 'number' &&
      typeof parsed.seededAt === 'string'
    ) {
      return parsed as DemoMarker;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────

export interface SeedDemoOptions {
  /** Injected clock — relative conversation dates resolve against this.
   *  Defaults to the wall clock. */
  readonly now?: Date;
}

export interface SeedDemoResult {
  readonly demoWorkspaceId: string;
  readonly conversationCount: number;
  readonly factCount: number;
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * Seed the demo workspace deterministically via audited writes. Always
 * creates a FRESH demo workspace and (re)writes the durable marker to point
 * at it. Callers that want a clean replace should purge first (resetDemo).
 */
export async function seedDemo(
  substrate: SubstrateHandle,
  daemonWorkspaceRoot: string,
  opts: SeedDemoOptions = {},
): Promise<SeedDemoResult> {
  const now = opts.now ?? new Date();
  const ctx = substrate.ctx;

  // 1. Workspace.
  const ws = await createWorkspace(ctx, {
    name: DEMO_WORKSPACE_NAME,
    daemonWorkspaceRoot,
  });
  const workspaceId = ws.workspace.id;

  // 2. Conversations (+ quotes). Build logical→real id maps.
  const convIdByKey = new Map<string, string>();
  const quoteIdByKey = new Map<string, string>();

  for (const conv of DEMO_MANIFEST.conversations) {
    const input: CreateConversationInput = {
      person_name: conv.person_name,
      occurred_at: isoDaysAgo(now, conv.occurred_days_ago),
      audience_fit: conv.audience_fit,
      conversation_type: conv.conversation_type,
      outcome: conv.outcome,
      summary: conv.summary,
      verbatim_quotes: conv.quotes.map((q) => ({ text: q.text })),
    };
    const created = await createConversation(ctx, workspaceId, input);
    convIdByKey.set(conv.key, created.conversation.id);

    // Quotes are returned in insertion (position) order, matching the
    // manifest order — map logical key → real quote id by position.
    const realQuotes = created.conversation.verbatim_quotes ?? [];
    conv.quotes.forEach((q, i) => {
      const real = realQuotes[i];
      if (real !== undefined) quoteIdByKey.set(q.key, real.id);
    });
  }

  // 3. Facts: sources[0] mints (at target tier), the rest corroborate;
  //    flagged facts are then contested ("to double-check").
  for (const fact of DEMO_MANIFEST.facts) {
    let factId: string | undefined;

    for (const [i, src] of fact.sources.entries()) {
      const convId = convIdByKey.get(src.conv);
      if (convId === undefined) {
        throw new Error(`demo manifest: unknown conversation key '${src.conv}' for ${fact.key}`);
      }
      const quoteId = src.quote === undefined ? undefined : quoteIdByKey.get(src.quote);
      if (src.quote !== undefined && quoteId === undefined) {
        throw new Error(`demo manifest: unknown quote key '${src.quote}' for ${fact.key}`);
      }

      const input: ExtractFactInput = {
        area: fact.area,
        statement: fact.statement,
        // Honored only on create; ignored when corroborating an existing
        // fact (tier preserved). So source[0] sets the at-rest tier.
        tier: fact.target_tier,
        quote_id: quoteId,
        extractor_version: DEMO_MANIFEST.extractor_version,
      };
      const result = await extractFactFromConversation(ctx, workspaceId, convId, input);
      if (i === 0) factId = result.fact.id;
    }

    if (fact.double_check_reason !== undefined && factId !== undefined) {
      await contestFact(ctx, workspaceId, factId, { reason: fact.double_check_reason });
    }
  }

  // 4. Durable marker — records THE demo workspace for reset isolation.
  writeDemoMarker(daemonWorkspaceRoot, {
    demoWorkspaceId: workspaceId,
    workspaceName: DEMO_WORKSPACE_NAME,
    manifestVersion: DEMO_MANIFEST.manifest_version,
    seededAt: new Date().toISOString(),
  });

  return {
    demoWorkspaceId: workspaceId,
    conversationCount: DEMO_MANIFEST.conversations.length,
    factCount: DEMO_MANIFEST.facts.length,
  };
}
