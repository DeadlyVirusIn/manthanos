// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Markdown export services. Sprint 2 M1 C1.5.
//
// Currently exports a single conversation. Workspace-level export (per
// the kickoff doc's broader plan) lands in a follow-up commit.
//
// User-facing labels in this file deliberately duplicate the translation
// map (apps/web/src/i18n/labels.ts, M1 C1.8). The Markdown export is a
// backend-rendered, user-facing document; we cannot wait for the UI
// translation layer to render readable values. The two label tables
// MUST be kept in sync — if you rename a translation map entry, find
// and update the corresponding constant here.

import type { ManthanSqliteHandle } from '@manthanos/memory';
import {
  type ConversationView,
  TOMBSTONE_CONVERSATION_SENTINEL,
  getConversation,
} from './conversations.js';
import { type FactTier, type FactView, listFactsByConversation } from './facts.js';

// ─────────────────────────────────────────────────────────────────
// Friendly labels (kept in sync with apps/web translation map, C1.8)
// ─────────────────────────────────────────────────────────────────

const AUDIENCE_FIT_LABELS: Record<string, string> = {
  target: 'Exact match',
  adjacent: 'Adjacent',
  outside: 'Off-target',
  unknown: 'Not sure',
};

const CONVERSATION_TYPE_LABELS: Record<string, string> = {
  discovery: 'First conversation',
  validation: 'Testing an idea',
  sales: 'Selling / pricing',
  support: 'Help / follow-up',
  other: 'Other',
};

const OUTCOME_LABELS: Record<string, string> = {
  validated: 'Confirmed what I expected',
  invalidated: 'Changed my mind',
  inconclusive: 'Mixed signal',
  follow_up: 'Need another talk',
};

const EXTRACTION_STATUS_LABELS: Record<string, string> = {
  pending: 'No facts pulled yet',
  extracted: 'Facts pulled',
  skipped: 'Marked as not useful',
};

const TIER_LABELS: Record<FactTier, string> = {
  'T+1': 'Well-evidenced',
  T0: 'Noted',
  'T-1': 'Shaky',
  'T-2': 'Doubted',
};

function labelOrRaw(table: Record<string, string>, value: string): string {
  return table[value] ?? value;
}

// ─────────────────────────────────────────────────────────────────
// Conversation Markdown export
// ─────────────────────────────────────────────────────────────────

/** Format a fact's source-count summary, e.g. "Well-evidenced, supported
 *  by 3 conversations (1 erased)" or "Noted, supported by 1 conversation". */
function formatFactSourceSummary(fact: FactView): string {
  const tierLabel = TIER_LABELS[fact.tier];
  const activeCount = fact.active_source_count;
  const degradedCount = fact.degraded_source_count;
  const sourceWord = activeCount === 1 ? 'conversation' : 'conversations';
  let summary = `${tierLabel}, supported by ${activeCount} ${sourceWord}`;
  if (degradedCount > 0) {
    summary += ` (${degradedCount} erased)`;
  }
  return summary;
}

/** Render a single fact bullet for the "Facts pulled" section.
 *  Linkage to the source conversation is implicit (the section heading
 *  says "Facts pulled from this conversation"). We deliberately do NOT
 *  enumerate every provenance edge per bullet — keeps the export
 *  concise. */
function renderFactBullet(fact: FactView): string {
  const noteLines: string[] = [];
  if (fact.is_tombstoned) {
    noteLines.push('  - This fact has been erased.');
  } else if (fact.provenance_degraded && fact.active_source_count === 0) {
    noteLines.push('  - All sources for this fact have been erased.');
  }
  const head = `- **${fact.statement}** (${formatFactSourceSummary(fact)})`;
  const topic = `  - Topic: ${fact.area}`;
  return [head, topic, ...noteLines].join('\n');
}

/** Build the Markdown export for one conversation.
 *
 *  Determinism contract: given a fixed workspace state, repeated calls
 *  return byte-identical strings. All iteration orders are stable:
 *
 *  - Quotes: by position (set at capture time).
 *  - Facts: by audit_seq DESC then id ASC (the order returned by
 *    listFactsByConversation, which is itself deterministic).
 *
 *  Tombstoned conversation: every PII-bearing field renders its sentinel
 *  (`[tombstoned]`) verbatim. The audit-chain replay can still resolve
 *  original content via the audit blobs; the export view shows what the
 *  live row carries today.
 */
export function exportConversationMarkdown(
  db: ManthanSqliteHandle,
  workspaceId: string,
  conversationId: string,
): string | null {
  const conversation = getConversation(db, workspaceId, conversationId);
  if (!conversation) return null;

  const facts = listFactsByConversation(db, workspaceId, conversationId);
  return renderConversationMarkdown(conversation, facts.facts);
}

function renderConversationMarkdown(conv: ConversationView, facts: readonly FactView[]): string {
  const lines: string[] = [];

  lines.push(`# Conversation with ${conv.person_name}`);
  lines.push('');

  // Metadata block.
  lines.push(`**When:** ${conv.occurred_at}`);
  lines.push(`**Captured:** ${conv.created_at}`);
  lines.push(`**Audience fit:** ${labelOrRaw(AUDIENCE_FIT_LABELS, conv.audience_fit)}`);
  lines.push(
    `**Conversation type:** ${labelOrRaw(CONVERSATION_TYPE_LABELS, conv.conversation_type)}`,
  );
  lines.push(`**Outcome:** ${labelOrRaw(OUTCOME_LABELS, conv.outcome)}`);
  lines.push(
    `**Extraction status:** ${labelOrRaw(EXTRACTION_STATUS_LABELS, conv.fact_extraction_status)}`,
  );
  if (conv.last_extracted_at !== null) {
    lines.push(`**Last extraction:** ${conv.last_extracted_at}`);
  }
  if (conv.is_tombstoned) {
    lines.push(`**Erased on:** ${conv.tombstoned_at}`);
    if (conv.tombstone_reason !== null) {
      lines.push(`**Reason:** ${conv.tombstone_reason}`);
    }
  }
  lines.push('');

  // Summary.
  lines.push('## Summary');
  lines.push('');
  if (conv.summary === null) {
    lines.push('_No summary captured._');
  } else {
    lines.push(conv.summary);
  }
  lines.push('');

  // Quotes (preserving position order).
  lines.push('## Quotes');
  lines.push('');
  if (conv.verbatim_quotes.length === 0) {
    lines.push('_No quotes captured._');
  } else {
    for (const quote of conv.verbatim_quotes) {
      // position is 0-based in the substrate; render as 1-based for humans.
      const displayPos = quote.position + 1;
      lines.push(`${displayPos}. "${quote.text}"`);
    }
  }
  lines.push('');

  // Facts pulled from this conversation.
  lines.push('## Facts pulled from this conversation');
  lines.push('');
  if (facts.length === 0) {
    lines.push('_No facts have been pulled from this conversation yet._');
  } else {
    for (const fact of facts) {
      lines.push(renderFactBullet(fact));
    }
  }
  lines.push('');

  // Footer with non-PII identifiers for audit traceability. The
  // conversation_id is opaque (UUID-shaped); workspace_id similarly.
  // These are technical breadcrumbs, not user-readable copy.
  lines.push('---');
  lines.push(
    `*Exported by ManthanOS. conversation_id: ${conv.id}, workspace_id: ${conv.workspace_id}*`,
  );

  // Tombstone-sentinel reassurance: if the conversation was erased, the
  // person_name we rendered above was `[tombstoned]`, and the quote
  // texts were too. The audit trail (visible separately) preserves the
  // original content. This is intentional and consistent with the
  // substrate's tombstone semantics — see SAFETY_MODEL.md §13.
  // (No-op assertion to silence the unused-import linter if the
  // sentinel were ever pulled into a comparison branch.)
  void TOMBSTONE_CONVERSATION_SENTINEL;

  return `${lines.join('\n')}\n`;
}
