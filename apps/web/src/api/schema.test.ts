// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C3.0 DEFECT-001/002/003 — malformed-response + enum-drift tests for the
// defensive parsers. Each parser must (a) accept the real daemon shape,
// (b) never throw on malformed input, and (c) return a renderable fallback.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseAiCapabilities,
  parseAuditEventsResult,
  parseAuditVerifyResult,
  parseConversationFacts,
  parseConversationView,
  parseFactView,
  parseListConversations,
  parseListFactsResult,
  parseSuggestExtractionsResponse,
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

describe('parseAiCapabilities (3B.6.5)', () => {
  it('parses a well-formed capability payload', () => {
    expect(
      parseAiCapabilities({
        ai_extraction_available: true,
        provider_configured: false,
        llm_validator_enabled: false,
        model: null,
      }),
    ).toEqual({
      ai_extraction_available: true,
      provider_configured: false,
      llm_validator_enabled: false,
      model: null,
    });
  });

  it('degrades to all-false on malformed / missing / non-object input', () => {
    const safe = {
      ai_extraction_available: false,
      provider_configured: false,
      llm_validator_enabled: false,
      model: null,
    };
    expect(parseAiCapabilities(null)).toEqual(safe);
    expect(parseAiCapabilities('nope')).toEqual(safe);
    expect(parseAiCapabilities({})).toEqual(safe);
    // Non-boolean fields coerce to false; non-string model → null.
    expect(parseAiCapabilities({ ai_extraction_available: 'yes', model: 123 })).toEqual(safe);
  });

  it('passes through a string model id', () => {
    expect(parseAiCapabilities({ model: 'claude-haiku-4-5' }).model).toBe('claude-haiku-4-5');
  });
});

describe('parseProvenancePreview source allow-list (3B.6.5)', () => {
  it('passes through a known source and defaults an unknown one to conversation', () => {
    const known = parseSuggestExtractionsResponse({
      candidates: [
        {
          area: 'a',
          statement: 's',
          provenance_preview: { source: 'manual', conversation_id: 'c' },
        },
      ],
    });
    expect(known.candidates[0]?.provenance_preview.source).toBe('manual');

    const drifted = parseSuggestExtractionsResponse({
      candidates: [
        {
          area: 'a',
          statement: 's',
          provenance_preview: { source: 'totally_bogus_source', conversation_id: 'c' },
        },
      ],
    });
    // Unknown source must never leak raw — defaults to a safe known value.
    expect(drifted.candidates[0]?.provenance_preview.source).toBe('conversation');
  });
});

describe('parseSuggestExtractionsResponse (3B.5)', () => {
  const goodCandidate = {
    area: 'pricing',
    statement: 'pricing is the blocker',
    source_quote_id: 'q1',
    confidence_score: 0.82,
    confidence_reasons: ['has_clear_claim', 'quote_backed'],
    duplicate: { kind: 'exact', fact_id: 'f1', similarity: 1 },
    provenance_preview: {
      source: 'conversation',
      conversation_id: 'conv-1',
      source_quote_id: 'q1',
      created_at: '2026-05-24T00:00:00.000Z',
      extraction_confidence: 0.82,
      reason_flags: ['quote_backed'],
      extractor_version: 'det-1',
      model_used: null,
    },
  };

  it('accepts the daemon shape', () => {
    const out = parseSuggestExtractionsResponse({ candidates: [goodCandidate] });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.statement).toBe('pricing is the blocker');
    expect(out.candidates[0]?.duplicate?.kind).toBe('exact');
  });

  it('falls back to { candidates: [] } on null / missing key / non-array', () => {
    expect(parseSuggestExtractionsResponse(null)).toEqual({ candidates: [] });
    expect(parseSuggestExtractionsResponse({})).toEqual({ candidates: [] });
    expect(parseSuggestExtractionsResponse({ candidates: 'nope' })).toEqual({ candidates: [] });
    expect(parseSuggestExtractionsResponse([goodCandidate])).toEqual({ candidates: [] });
  });

  it('drops candidates missing area or statement', () => {
    const out = parseSuggestExtractionsResponse({
      candidates: [{ statement: 'no area' }, { area: 'x' }, goodCandidate],
    });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.area).toBe('pricing');
  });

  it('clamps confidence_score and defaults non-numbers to 0', () => {
    const out = parseSuggestExtractionsResponse({
      candidates: [
        { area: 'a', statement: 's one two', confidence_score: 1.9 },
        { area: 'b', statement: 's three four', confidence_score: 'bad' },
      ],
    });
    expect(out.candidates[0]?.confidence_score).toBe(1);
    expect(out.candidates[1]?.confidence_score).toBe(0);
  });

  it('enum-drift: filters unknown reason flags and drops an unknown duplicate kind', () => {
    const out = parseSuggestExtractionsResponse({
      candidates: [
        {
          area: 'a',
          statement: 'a clear claim here',
          confidence_reasons: ['quote_backed', 'mystery_flag'],
          duplicate: { kind: 'fuzzy', fact_id: 'f9' },
        },
      ],
    });
    expect(out.candidates[0]?.confidence_reasons).toEqual(['quote_backed']);
    expect(out.candidates[0]?.duplicate).toBeUndefined(); // unknown kind dropped
  });

  it('synthesizes a safe provenance_preview when it is missing/malformed', () => {
    const out = parseSuggestExtractionsResponse({
      candidates: [{ area: 'a', statement: 'a clear claim here' }],
    });
    const prov = out.candidates[0]?.provenance_preview;
    expect(prov?.source).toBe('conversation');
    expect(prov?.model_used).toBeNull();
    expect(prov?.reason_flags).toEqual([]);
    expect(typeof prov?.extraction_confidence).toBe('number');
  });

  it('never throws on arbitrary garbage', () => {
    expect(() => parseSuggestExtractionsResponse({ candidates: [1, 'x', null, {}] })).not.toThrow();
    expect(parseSuggestExtractionsResponse({ candidates: [1, 'x', null, {}] })).toEqual({
      candidates: [],
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// R1 — findings read-path parsers
// ─────────────────────────────────────────────────────────────────

// Minimal valid wire shapes (the load-bearing fields only).
function rawFact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'f-1',
    workspace_id: 'w-1',
    area: 'discovery_pain',
    statement: 'Founders abandon tools that feel like research software.',
    statement_hash: 'h-1',
    tier: 'T0',
    confidence: 0.7,
    last_corroborated: '2026-05-23T12:00:00Z',
    last_administratively_touched: '2026-05-23T12:00:00Z',
    audit_seq: 13,
    version_chain_root_id: null,
    superseded_by_fact_id: null,
    contested_at: null,
    contested_reason: null,
    tombstoned_at: null,
    tombstone_reason: null,
    is_head: true,
    is_contested: false,
    is_tombstoned: false,
    active_source_count: 1,
    degraded_source_count: 0,
    provenance_degraded: false,
    ...overrides,
  };
}

function rawConversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c-1',
    workspace_id: 'w-1',
    person_name: 'Alex Founder',
    occurred_at: '2026-05-21T12:00:00Z',
    audience_fit: 'target',
    conversation_type: 'discovery',
    outcome: 'validated',
    summary: 'Confirmed the discovery loop pain.',
    created_at: '2026-05-23T11:50:00Z',
    audit_seq: 12,
    tombstoned_at: null,
    tombstone_reason: null,
    fact_extraction_status: 'extracted',
    last_extracted_at: '2026-05-23T11:50:00Z',
    is_tombstoned: false,
    verbatim_quotes: [{ id: 'q-1', position: 0, text: 'I gave up on three other tools.' }],
    ...overrides,
  };
}

describe('parseFactView (R1)', () => {
  it('passes a valid fact through unchanged', () => {
    const out = parseFactView(rawFact());
    expect(out.id).toBe('f-1');
    expect(out.tier).toBe('T0');
    expect(out.statement).toContain('Founders abandon');
  });

  it('falls back to a safe lowest-trust placeholder on malformed input', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { id: 'x' }]) {
      expect(() => parseFactView(bad)).not.toThrow();
      const out = parseFactView(bad);
      expect(out.id).toBe('');
      expect(out.tier).toBe('T-2');
      expect(out.is_tombstoned).toBe(false);
    }
  });

  it('normalizes an unknown tier to the lowest trust (never overstates)', () => {
    expect(parseFactView(rawFact({ tier: 'GOLD' })).tier).toBe('T-2');
    expect(parseFactView(rawFact({ tier: 123 })).tier).toBe('T-2');
    // a known tier is preserved exactly
    expect(parseFactView(rawFact({ tier: 'T+1' })).tier).toBe('T+1');
  });

  it('defaults missing non-enum fields without throwing', () => {
    const out = parseFactView({ id: 'f', area: 'a', statement: 's' });
    expect(out.confidence).toBe(0);
    expect(out.audit_seq).toBe(0);
    expect(out.provenance_degraded).toBe(false);
  });
});

describe('parseListFactsResult (R1)', () => {
  it('parses a valid list', () => {
    const out = parseListFactsResult({ facts: [rawFact(), rawFact({ id: 'f-2' })], total: 2 });
    expect(out.facts).toHaveLength(2);
    expect(out.total).toBe(2);
  });

  it('falls back to an empty list on null / missing key / non-array', () => {
    for (const bad of [null, {}, { facts: 'nope' }, 7]) {
      expect(() => parseListFactsResult(bad)).not.toThrow();
      expect(parseListFactsResult(bad).facts).toEqual([]);
    }
  });

  it('drops malformed fact rows but keeps valid siblings', () => {
    const out = parseListFactsResult({ facts: [rawFact(), { id: 'x' }, null, 5], total: 4 });
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0]?.id).toBe('f-1');
  });
});

describe('parseConversationView (R1)', () => {
  it('passes a valid conversation through unchanged', () => {
    const out = parseConversationView(rawConversation());
    expect(out.id).toBe('c-1');
    expect(out.outcome).toBe('validated');
    expect(out.verbatim_quotes).toHaveLength(1);
  });

  it('falls back to a safe placeholder on malformed input', () => {
    for (const bad of [null, 'x', 9, [], {}]) {
      expect(() => parseConversationView(bad)).not.toThrow();
      const out = parseConversationView(bad);
      expect(out.id).toBe('');
      expect(out.audience_fit).toBe('unknown');
      expect(out.outcome).toBe('inconclusive');
      expect(out.conversation_type).toBe('other');
    }
  });

  it('normalizes unknown enums to safe defaults and preserves known ones', () => {
    const drift = parseConversationView(
      rawConversation({ audience_fit: 'ZZZ', conversation_type: 99, outcome: null }),
    );
    expect(drift.audience_fit).toBe('unknown');
    expect(drift.conversation_type).toBe('other');
    expect(drift.outcome).toBe('inconclusive');
    const known = parseConversationView(rawConversation({ audience_fit: 'adjacent' }));
    expect(known.audience_fit).toBe('adjacent');
  });

  it('filters malformed quote rows', () => {
    const out = parseConversationView(
      rawConversation({ verbatim_quotes: [{ id: 'q', position: 0, text: 't' }, null, 3, {}] }),
    );
    expect(out.verbatim_quotes).toHaveLength(1);
  });
});

describe('parseListConversations (R1)', () => {
  it('parses a valid list', () => {
    const out = parseListConversations({
      conversations: [rawConversation(), rawConversation({ id: 'c-2' })],
      total: 2,
    });
    expect(out.conversations).toHaveLength(2);
  });

  it('falls back to an empty list on malformed input', () => {
    for (const bad of [null, {}, { conversations: 1 }, 'x']) {
      expect(() => parseListConversations(bad)).not.toThrow();
      expect(parseListConversations(bad).conversations).toEqual([]);
    }
  });
});

describe('parseConversationFacts (R1)', () => {
  it('parses a valid per-conversation findings response', () => {
    const out = parseConversationFacts({ conversation_id: 'c-1', facts: [rawFact()], total: 1 });
    expect(out.conversation_id).toBe('c-1');
    expect(out.facts).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('falls back to an empty response on null / missing key / non-array', () => {
    for (const bad of [null, {}, { facts: 'nope' }, 0]) {
      expect(() => parseConversationFacts(bad)).not.toThrow();
      expect(parseConversationFacts(bad)).toEqual({ conversation_id: '', facts: [], total: 0 });
    }
  });

  it('normalizes an unknown tier inside the findings list', () => {
    const out = parseConversationFacts({
      conversation_id: 'c-1',
      facts: [rawFact({ tier: 'MYSTERY' })],
      total: 1,
    });
    expect(out.facts[0]?.tier).toBe('T-2');
  });
});
