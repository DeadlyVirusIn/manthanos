// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the Fact Detail page. Sprint 2 M2 C2.6.
//
// Three queries back the page: useFact, useFactProvenance, useFactHistory.
// Cache seeding follows the established pattern (see home-picker.test.tsx
// for the rationale behind retryOnMount: false + manual setState for
// error states).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  type FactHistoryResult,
  type FactView,
  type ListProvenanceResult,
  type ProvenanceSourceView,
  asExtractor,
  asFactTier,
  asProvenanceKind,
  factsKeys,
} from '../src/api/index.js';
import { FactDetail } from '../src/pages/index.js';

const PROJECT_ID = 'proj-c26-test';
const FACT_ID = 'fact-c26-test';
const NOW_ISO = '2026-05-23T12:00:00Z';
const TEN_MIN_AGO = '2026-05-23T11:50:00Z';
const TWO_DAYS_AGO = '2026-05-21T12:00:00Z';
const ONE_WEEK_AGO = '2026-05-16T12:00:00Z';

function makeFact(overrides: Partial<FactView> = {}): FactView {
  return {
    id: FACT_ID,
    workspace_id: PROJECT_ID,
    area: 'discovery_pain',
    statement: 'Founders abandon discovery tools when they feel like research software.',
    statement_hash: 'hash-1',
    tier: asFactTier('T0'),
    confidence: 0.7,
    last_corroborated: TEN_MIN_AGO,
    last_administratively_touched: TEN_MIN_AGO,
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

function makeSource(overrides: Partial<ProvenanceSourceView> = {}): ProvenanceSourceView {
  return {
    id: 'src-1',
    fact_id: FACT_ID,
    kind: asProvenanceKind('quote'),
    source_id: 'quote-id-1',
    extracted_at: TEN_MIN_AGO,
    extractor: asExtractor('manual'),
    degraded_at: null,
    degraded_reason: null,
    ...overrides,
  };
}

function makeProvenance(sources: readonly ProvenanceSourceView[] = []): ListProvenanceResult {
  return { fact_id: FACT_ID, provenance: sources, total: sources.length };
}

function makeHistory(facts: readonly FactView[] = []): FactHistoryResult {
  const versions = facts.map((f, idx) => ({ fact: f, position: idx }));
  return {
    root_id: facts.length > 0 ? facts[0].id : FACT_ID,
    head_id: facts.length > 0 ? facts[facts.length - 1].id : FACT_ID,
    total_versions: facts.length,
    versions,
  };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function render(client: QueryClient): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/facts/${FACT_ID}`]}>
        <Routes>
          <Route path="/projects/:projectId/facts/:id" element={<FactDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedFact(client: QueryClient, fact: FactView): void {
  client.setQueryData(factsKeys.detail(PROJECT_ID, FACT_ID), fact);
}

function seedProvenance(client: QueryClient, result: ListProvenanceResult): void {
  client.setQueryData(factsKeys.provenance(PROJECT_ID, FACT_ID), result);
}

function seedHistory(client: QueryClient, result: FactHistoryResult): void {
  client.setQueryData(factsKeys.history(PROJECT_ID, FACT_ID), result);
}

function seedQueryError(client: QueryClient, queryKey: readonly unknown[], error: Error): void {
  const now = Date.now();
  const q = client.getQueryCache().build(client, {
    queryKey,
    queryFn: () => Promise.reject(error),
  });
  q.setState({
    data: undefined,
    dataUpdateCount: 0,
    dataUpdatedAt: now,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: now,
    fetchFailureCount: 1,
    fetchFailureReason: error,
    fetchMeta: null,
    isInvalidated: false,
    status: 'error',
    fetchStatus: 'idle',
  });
}

function visibleText(html: string): string {
  return Array.from(html.matchAll(/>([^<]+)</g))
    .map((m) => m[1])
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — loading state', () => {
  it('renders skeletons when the fact query is pending', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-loading"');
  });

  it('does not render populated/tombstoned content while loading', () => {
    const client = makeClient();
    const html = render(client);
    expect(html).not.toContain('data-testid="fact-detail-populated"');
    expect(html).not.toContain('data-testid="fact-detail-tombstoned"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — error state', () => {
  it('renders the PageErrorBanner when the fact query fails', () => {
    const client = makeClient();
    seedQueryError(client, factsKeys.detail(PROJECT_ID, FACT_ID), new Error('daemon-unreachable'));
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-error"');
    expect(html).toContain('data-testid="page-error-banner"');
    expect(html).toContain('Could not load this finding');
    expect(html).toContain('daemon-unreachable');
  });

  it('still surfaces the fact id during the error state', () => {
    const client = makeClient();
    seedQueryError(client, factsKeys.detail(PROJECT_ID, FACT_ID), new Error('boom'));
    const html = render(client);
    expect(html).toContain('data-testid="fact-id"');
    expect(html).toContain(FACT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────
// Populated state — statement, topic, trust, lifecycle, timestamps
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — populated state', () => {
  it('renders the statement text and topic', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({ statement: 'The founder said churn is mostly day-3.', area: 'churn' }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-populated"');
    expect(html).toContain('data-testid="fact-statement-text"');
    expect(html).toContain('The founder said churn is mostly day-3.');
    expect(html).toContain('data-testid="fact-topic"');
    expect(html).toContain('churn');
  });

  it('renders the trust level indicator and the lifecycle pill', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-trust-level"');
    expect(html).toContain('data-testid="trust-level-indicator"');
    expect(html).toContain('data-testid="fact-lifecycle"');
    expect(html).toContain('data-lifecycle="not_contested"');
    expect(html).toContain('Not flagged');
  });

  it('renders Last heard / Last touched relative timestamps when available', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({ last_corroborated: TEN_MIN_AGO, last_administratively_touched: NOW_ISO }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-corroborated"');
    expect(html).toContain('Last heard ');
    expect(html).toContain('data-testid="fact-touched"');
    expect(html).toContain('Last touched ');
  });

  it('omits the timestamps section entirely when both fields are empty', () => {
    const client = makeClient();
    seedFact(client, makeFact({ last_corroborated: '', last_administratively_touched: '' }));
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).not.toContain('data-testid="fact-timestamps"');
    expect(html).not.toContain('data-testid="fact-corroborated"');
    expect(html).not.toContain('data-testid="fact-touched"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Provenance rendering + empty + error
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — provenance', () => {
  it('renders one row per provenance source', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({ id: 's-1', kind: asProvenanceKind('quote') }),
        makeSource({ id: 's-2', kind: asProvenanceKind('conversation') }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-provenance-list"');
    expect(html.split('data-testid="fact-provenance-item"').length - 1).toBe(2);
  });

  it('translates provenance kind through the labels map', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({ id: 's-q', kind: asProvenanceKind('quote') }),
        makeSource({ id: 's-c', kind: asProvenanceKind('conversation') }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const visible = visibleText(render(client));
    expect(visible).toContain('from a quote');
    expect(visible).toContain('from this conversation');
  });

  it('renders provenance extraction times as relative phrases', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([makeSource({ id: 's-1', extracted_at: TWO_DAYS_AGO })]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-provenance-time"');
    expect(html).not.toContain('2026-05-21T12:00:00Z');
  });

  it('renders a degraded note when a source has been weakened', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({
          id: 's-degraded',
          degraded_at: TWO_DAYS_AGO,
          degraded_reason: 'conversation erased',
        }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-provenance-degraded"');
    expect(html).toContain('Source has been weakened');
    expect(html).toContain('conversation erased');
    expect(html).toMatch(/<article[^>]*data-degraded="true"/);
  });

  it('renders the empty-state when no provenance is available', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-provenance-empty"');
    expect(html).toContain('No recorded evidence');
  });

  it('renders an inline error when only provenance fails (page still renders)', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedQueryError(client, factsKeys.provenance(PROJECT_ID, FACT_ID), new Error('prov-down'));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-populated"');
    expect(html).toContain('data-testid="fact-provenance-error"');
    expect(html).toContain('Could not load the evidence for this finding');
    expect(html).toContain('prov-down');
  });
});

// ─────────────────────────────────────────────────────────────────
// History rendering + empty + error
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — history', () => {
  it('renders one row per history entry, in position order', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedHistory(
      client,
      makeHistory([
        makeFact({ id: 'v1', statement: 'First version.' }),
        makeFact({ id: 'v2', statement: 'Second version.' }),
        makeFact({ id: 'v3', statement: 'Third version (head).', is_head: true }),
      ]),
    );
    const html = render(client);
    expect(html).toContain('data-testid="fact-history-list"');
    expect(html.split('data-testid="fact-history-item"').length - 1).toBe(3);
    const firstIdx = html.indexOf('First version.');
    const secondIdx = html.indexOf('Second version.');
    const thirdIdx = html.indexOf('Third version (head).');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it('marks the head version with a Current badge', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedHistory(
      client,
      makeHistory([
        makeFact({ id: 'v1', statement: 'Older.', is_head: false }),
        makeFact({ id: 'v2', statement: 'Newest.', is_head: true }),
      ]),
    );
    const html = render(client);
    expect(html).toContain('data-testid="fact-history-item-head"');
    expect(html).toContain('Current');
  });

  it('renders the empty-state when no versions are available', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-history-empty"');
    expect(html).toContain('No earlier versions');
  });

  it('renders an inline error when only history fails (page still renders)', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(client, makeProvenance([]));
    seedQueryError(client, factsKeys.history(PROJECT_ID, FACT_ID), new Error('history-down'));
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-populated"');
    expect(html).toContain('data-testid="fact-history-error"');
    expect(html).toContain('Could not load the history of this finding');
    expect(html).toContain('history-down');
  });
});

// ─────────────────────────────────────────────────────────────────
// Contested / follow-up rendering
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — contested / follow-up state', () => {
  it('renders the contested banner with translated wording (not "contest")', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({
        is_contested: true,
        contested_at: TWO_DAYS_AGO,
        contested_reason: 'a competitor said otherwise',
      }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-contested-banner"');
    expect(html).toContain('data-testid="fact-contested-headline"');
    expect(html).toContain('Flagged to double-check');
    expect(html).toContain('data-testid="fact-contested-reason"');
    expect(html).toContain('a competitor said otherwise');
    expect(html).toContain('data-testid="fact-contested-time"');
    const visible = visibleText(html);
    expect(visible).not.toContain('Contest');
    expect(visible).not.toContain('contest');
  });

  it('sets the lifecycle pill to the contested label', () => {
    const client = makeClient();
    seedFact(client, makeFact({ is_contested: true, contested_at: TWO_DAYS_AGO }));
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-lifecycle="contested"');
    expect(html).toContain('Flagged to double-check');
  });

  it('omits the contested-time line when contested_at is missing', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({ is_contested: true, contested_at: null, contested_reason: 'no time recorded' }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-contested-banner"');
    expect(html).not.toContain('data-testid="fact-contested-time"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Tombstoned / erased rendering (sentinel-safe)
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — tombstoned / erased state', () => {
  it('renders the tombstone banner and hides the statement / topic', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'Was a duplicate.',
        statement: 'Should not be shown.',
        area: 'topic-hidden',
      }),
    );
    seedProvenance(client, makeProvenance([makeSource()]));
    seedHistory(client, makeHistory([makeFact()]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-detail-tombstoned"');
    expect(html).toContain('data-testid="fact-tombstone-banner"');
    expect(html).toContain('This fact was erased.');
    expect(html).toContain('data-testid="fact-tombstone-reason"');
    expect(html).toContain('Was a duplicate.');
    expect(html).toContain('data-testid="fact-tombstone-time"');
    const visible = visibleText(html);
    expect(visible).not.toContain('Should not be shown.');
    expect(visible).not.toContain('topic-hidden');
    expect(html).not.toContain('data-testid="fact-provenance"');
    expect(html).not.toContain('data-testid="fact-history"');
  });

  it('omits the erased-time line when tombstoned_at is missing', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({ is_tombstoned: true, tombstoned_at: null, tombstone_reason: 'No timestamp.' }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).toContain('data-testid="fact-tombstone-banner"');
    expect(html).not.toContain('data-testid="fact-tombstone-time"');
  });
});

// ─────────────────────────────────────────────────────────────────
// Trust level rendering
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — trust level rendering', () => {
  it('renders the 4-dot indicator on the main page and each history row', () => {
    const client = makeClient();
    seedFact(client, makeFact({ tier: asFactTier('T+1') }));
    seedProvenance(client, makeProvenance([]));
    seedHistory(
      client,
      makeHistory([
        makeFact({ id: 'v1', tier: asFactTier('T-2'), is_head: false }),
        makeFact({ id: 'v2', tier: asFactTier('T0'), is_head: false }),
        makeFact({ id: 'v3', tier: asFactTier('T+1'), is_head: true }),
      ]),
    );
    const html = render(client);
    // Main page indicator + 3 history rows = 4 indicators.
    expect(html.split('data-testid="trust-level-indicator"').length - 1).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────
// Translation correctness
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — translation correctness', () => {
  it('translates the derived lifecycle states', () => {
    const cases: Array<[Partial<FactView>, string, string]> = [
      [{}, 'not_contested', 'Not flagged'],
      [{ is_contested: true, contested_at: TWO_DAYS_AGO }, 'contested', 'Flagged to double-check'],
      [{ superseded_by_fact_id: 'newer-id' }, 'superseded', 'Older version'],
    ];
    for (const [overrides, lifecycle, label] of cases) {
      const client = makeClient();
      seedFact(client, makeFact(overrides));
      seedProvenance(client, makeProvenance([]));
      seedHistory(client, makeHistory([]));
      const html = render(client);
      expect(html).toContain(`data-lifecycle="${lifecycle}"`);
      expect(html).toContain(label);
    }
  });

  it('translates provenance kinds (quote, conversation)', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({ id: 's-q', kind: asProvenanceKind('quote') }),
        makeSource({ id: 's-c', kind: asProvenanceKind('conversation') }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const visible = visibleText(render(client));
    expect(visible).toContain('from a quote');
    expect(visible).toContain('from this conversation');
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw substrate vocabulary
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — no raw substrate vocabulary', () => {
  it('never renders raw lifecycle keys in visible text', () => {
    const client = makeClient();
    seedFact(client, makeFact({ is_contested: true, contested_at: TWO_DAYS_AGO }));
    seedProvenance(client, makeProvenance([makeSource()]));
    seedHistory(client, makeHistory([]));
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\btombstoned\b/);
    expect(visible).not.toMatch(/\bsuperseded\b/);
    expect(visible).not.toMatch(/\bcontested\b/);
    expect(visible).not.toMatch(/\bnot_contested\b/);
  });

  it('never renders raw provenance kind keys in visible text', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({ id: 'q', kind: asProvenanceKind('quote') }),
        makeSource({ id: 'c', kind: asProvenanceKind('conversation') }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/^quote$/m);
    expect(visible).not.toMatch(/^conversation$/m);
  });

  it('never renders raw tier letters anywhere on the page', () => {
    const client = makeClient();
    seedFact(client, makeFact({ tier: asFactTier('T+1') }));
    seedProvenance(client, makeProvenance([]));
    seedHistory(
      client,
      makeHistory([
        makeFact({ id: 'v1', tier: asFactTier('T-2') }),
        makeFact({ id: 'v2', tier: asFactTier('T-1') }),
        makeFact({ id: 'v3', tier: asFactTier('T0') }),
        makeFact({ id: 'v4', tier: asFactTier('T+1') }),
      ]),
    );
    const visible = visibleText(render(client));
    expect(visible).not.toMatch(/\bT-2\b/);
    expect(visible).not.toMatch(/\bT-1\b/);
    expect(visible).not.toMatch(/\bT0\b/);
    expect(visible).not.toMatch(/\bT\+1\b/);
  });

  it('never renders the substrate words "workspace" or "tombstone"', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({
        is_tombstoned: true,
        tombstoned_at: TEN_MIN_AGO,
        tombstone_reason: 'A reason.',
      }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const visible = visibleText(render(client));
    expect(visible).not.toContain('workspace');
    expect(visible).not.toContain('Workspace');
    expect(visible).not.toContain('tombstone');
    expect(visible).not.toContain('Tombstone');
  });
});

// ─────────────────────────────────────────────────────────────────
// No raw ISO timestamps
// ─────────────────────────────────────────────────────────────────

describe('FactDetail — no raw ISO timestamps', () => {
  it('never renders last_corroborated / last_administratively_touched as ISO', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({
        last_corroborated: TWO_DAYS_AGO,
        last_administratively_touched: TEN_MIN_AGO,
      }),
    );
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toContain('2026-05-23T11:50:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('never renders provenance extracted_at as ISO', () => {
    const client = makeClient();
    seedFact(client, makeFact());
    seedProvenance(
      client,
      makeProvenance([
        makeSource({ id: 's-1', extracted_at: ONE_WEEK_AGO }),
        makeSource({ id: 's-2', extracted_at: TWO_DAYS_AGO }),
      ]),
    );
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).not.toContain('2026-05-16T12:00:00Z');
    expect(html).not.toContain('2026-05-21T12:00:00Z');
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('never renders contested_at / tombstoned_at as ISO', () => {
    const client = makeClient();
    seedFact(client, makeFact({ is_contested: true, contested_at: TWO_DAYS_AGO }));
    seedProvenance(client, makeProvenance([]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    expect(html).not.toMatch(/2026-\d{2}-\d{2}T/);
  });

  it('renders relative-time phrases for all timestamp positions', () => {
    const client = makeClient();
    seedFact(
      client,
      makeFact({
        last_corroborated: TWO_DAYS_AGO,
        last_administratively_touched: TEN_MIN_AGO,
      }),
    );
    seedProvenance(client, makeProvenance([makeSource({ extracted_at: ONE_WEEK_AGO })]));
    seedHistory(client, makeHistory([]));
    const html = render(client);
    const phrase = /just now|\d+ (?:second|minute|hour|day|week|month|year)s? ago/;
    expect(html).toMatch(phrase);
  });
});

void NOW_ISO;
