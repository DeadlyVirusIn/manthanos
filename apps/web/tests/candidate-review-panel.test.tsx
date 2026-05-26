// @vitest-environment jsdom
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Unit tests for CandidateReviewPanel. Sprint 3B.6.
//
// The panel is presentational: it renders the suggestion query's states
// and per-candidate detail, owns local reject-dismissal, and folds an
// approved candidate out of the list when the host signals approvedKey.
// These tests drive it directly with props (no network, no page).

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_EXTRACTION_REASON,
  type CandidateFact,
  type ConversationQuoteView,
} from '../src/api/index.js';
import { CandidateReviewPanel, candidateKey } from '../src/components/index.js';

function makeQuote(overrides: Partial<ConversationQuoteView> = {}): ConversationQuoteView {
  return { id: 'q-1', position: 0, text: 'We gave up after the third tool.', ...overrides };
}

function makeCandidate(overrides: Partial<CandidateFact> = {}): CandidateFact {
  return {
    area: 'discovery_pain',
    statement: 'Founders abandon discovery tools that feel like research software.',
    confidence_score: 0.82,
    confidence_reasons: ['has_clear_claim', 'quote_backed'],
    provenance_preview: {
      source: 'conversation',
      conversation_id: 'conv-1',
      source_quote_id: null,
      created_at: '2026-05-24T00:00:00Z',
      extraction_confidence: 0.82,
      reason_flags: ['has_clear_claim', 'quote_backed'],
      extractor_version: 'det-1',
      model_used: null,
    },
    ...overrides,
  };
}

function renderPanel(props: Partial<ComponentProps<typeof CandidateReviewPanel>> = {}): {
  onApprove: ReturnType<typeof vi.fn>;
  onRetry: ReturnType<typeof vi.fn>;
} {
  const onApprove = vi.fn();
  const onRetry = vi.fn();
  render(
    <CandidateReviewPanel
      isActive
      isPending={false}
      isError={false}
      error={null}
      candidates={[makeCandidate()]}
      quotes={[makeQuote()]}
      onApprove={onApprove}
      onRetry={onRetry}
      {...props}
    />,
  );
  return { onApprove, onRetry };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => cleanup());

describe('CandidateReviewPanel — gating + states', () => {
  it('renders nothing until activated', () => {
    render(
      <CandidateReviewPanel
        isActive={false}
        isPending={false}
        isError={false}
        error={null}
        candidates={[makeCandidate()]}
        quotes={[]}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('candidate-review-panel')).toBeNull();
  });

  it('shows the loading state while pending', () => {
    renderPanel({ isPending: true, candidates: [] });
    expect(screen.getByTestId('candidate-review-loading')).toBeTruthy();
    expect(screen.queryByTestId('candidate-review-list')).toBeNull();
  });

  it('shows the error state with a working retry', () => {
    const { onRetry } = renderPanel({ isError: true, error: new Error('boom'), candidates: [] });
    const banner = screen.getByTestId('candidate-review-error');
    expect(banner).toBeTruthy();
    const retry = banner.querySelector('button');
    expect(retry).not.toBeNull();
    act(() => {
      (retry as HTMLButtonElement).click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no candidates', () => {
    renderPanel({ candidates: [] });
    expect(screen.getByTestId('candidate-review-empty')).toBeTruthy();
  });
});

describe('CandidateReviewPanel — candidate rendering', () => {
  it('renders statement, area, confidence bucket label, reason chips and source quote', () => {
    renderPanel({
      candidates: [makeCandidate({ source_quote_id: 'q-1' })],
      quotes: [makeQuote({ id: 'q-1', text: 'We gave up after the third tool.' })],
    });
    expect(screen.getByTestId('candidate-statement').textContent).toContain('Founders abandon');
    expect(screen.getByTestId('candidate-area').textContent).toContain('discovery_pain');
    // 0.82 → solid bucket → "Strong signal" (C4.1.1 3-level review copy).
    expect(screen.getByTestId('candidate-confidence').textContent).toBe('Strong signal');
    const chips = screen.getAllByTestId('candidate-reason-chip').map((c) => c.textContent);
    expect(chips).toContain('Clear claim');
    expect(chips).toContain('Tied to a quote');
    expect(screen.getByTestId('candidate-source-quote').textContent).toContain('third tool');
  });

  it('renders the friendly provenance source line', () => {
    renderPanel();
    expect(screen.getByTestId('candidate-provenance').textContent).toContain(
      'From this conversation',
    );
  });

  it('shows distinct confidence copy for each band', () => {
    cleanup();
    render(
      <CandidateReviewPanel
        isActive
        isPending={false}
        isError={false}
        error={null}
        candidates={[
          makeCandidate({ area: 'a', statement: 's1', confidence_score: 0.1 }),
          makeCandidate({ area: 'b', statement: 's2', confidence_score: 0.5 }),
          makeCandidate({ area: 'c', statement: 's3', confidence_score: 0.95 }),
        ]}
        quotes={[]}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    // C4.1.1 D1/D2: four engine buckets → three user-facing review levels.
    // 0.1 → needs_review, 0.5 → tentative, 0.95 → strong.
    const labels = screen.getAllByTestId('candidate-confidence').map((n) => n.textContent);
    expect(labels).toEqual(['Needs your eyes', 'Looks reasonable', 'Strong signal']);
  });

  it('carries the C4.1.1 §9 confidence explainer as a tooltip on the pill (M3)', () => {
    renderPanel();
    const title = screen.getByTestId('candidate-confidence').getAttribute('title') ?? '';
    expect(title).toContain('a nudge to review, not a verdict');
  });

  it('renders one discoverable confidence explainer disclosure (H1, not per card)', () => {
    renderPanel({
      candidates: [makeCandidate({ statement: 's1' }), makeCandidate({ statement: 's2' })],
    });
    const explainers = screen.getAllByTestId('confidence-explainer');
    expect(explainers).toHaveLength(1); // once per panel, not per candidate
    const el = explainers[0];
    expect(el.tagName).toBe('DETAILS');
    expect(el.querySelector('summary')?.textContent).toBe('What do these labels mean?');
    expect(el.textContent).toContain('a nudge to review, not a verdict');
  });

  it('omits the source quote block when the candidate is not tied to a quote', () => {
    renderPanel({ candidates: [makeCandidate({ source_quote_id: undefined })] });
    expect(screen.queryByTestId('candidate-source-quote')).toBeNull();
  });
});

describe('CandidateReviewPanel — accessibility (3B.6.5)', () => {
  it('gives each candidate action button a distinct accessible name', () => {
    renderPanel({
      candidates: [makeCandidate({ statement: 'Founders abandon discovery tools that nag them.' })],
    });
    const approve = screen.getByTestId('candidate-approve-button');
    const dismiss = screen.getByTestId('candidate-dismiss-button');
    expect(approve.getAttribute('aria-label')).toContain('Add this fact');
    expect(approve.getAttribute('aria-label')).toContain('Founders abandon discovery tools');
    expect(dismiss.getAttribute('aria-label')).toContain('Dismiss suggestion');
    expect(dismiss.getAttribute('aria-label')).toContain('Founders abandon discovery tools');
  });
});

describe('CandidateReviewPanel — duplicate warnings (advisory)', () => {
  it('renders exact-duplicate copy', () => {
    renderPanel({ candidates: [makeCandidate({ duplicate: { kind: 'exact', fact_id: 'f1' } })] });
    expect(screen.getByTestId('candidate-duplicate').textContent).toBe('Already appears to exist');
  });

  it('renders likely-duplicate copy with a similarity percentage', () => {
    renderPanel({
      candidates: [
        makeCandidate({ duplicate: { kind: 'likely', fact_id: 'f1', similarity: 0.72 } }),
      ],
    });
    expect(screen.getByTestId('candidate-duplicate').textContent).toBe(
      'Possible duplicate (72% similar)',
    );
  });

  it('renders corroborates copy', () => {
    renderPanel({
      candidates: [makeCandidate({ duplicate: { kind: 'corroborates', fact_id: 'f1' } })],
    });
    expect(screen.getByTestId('candidate-duplicate').textContent).toBe(
      'May support an existing finding',
    );
  });

  it('renders no duplicate note when there is no duplicate relationship', () => {
    renderPanel();
    expect(screen.queryByTestId('candidate-duplicate')).toBeNull();
  });
});

describe('CandidateReviewPanel — approve + reject', () => {
  it('calls onApprove with the candidate when "Add this fact" is clicked', () => {
    const candidate = makeCandidate();
    const onApprove = vi.fn();
    render(
      <CandidateReviewPanel
        isActive
        isPending={false}
        isError={false}
        error={null}
        candidates={[candidate]}
        quotes={[]}
        onApprove={onApprove}
        onRetry={vi.fn()}
      />,
    );
    act(() => {
      screen.getByTestId('candidate-approve-button').click();
    });
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(candidate);
  });

  it('removes a candidate from the list when dismissed (local, no callback needed)', () => {
    renderPanel({
      candidates: [
        makeCandidate({ area: 'a', statement: 'keep me' }),
        makeCandidate({ area: 'b', statement: 'drop me' }),
      ],
    });
    expect(screen.getAllByTestId('candidate-card')).toHaveLength(2);
    const cards = screen.getAllByTestId('candidate-card');
    const dropBtn = cards[1].querySelector('[data-testid="candidate-dismiss-button"]');
    act(() => {
      (dropBtn as HTMLButtonElement).click();
    });
    const remaining = screen.getAllByTestId('candidate-card');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('keep me');
  });

  it('drops the approved candidate once the host signals approvedKey', () => {
    const a = makeCandidate({ area: 'a', statement: 'approved one' });
    const b = makeCandidate({ area: 'b', statement: 'still here' });
    const { rerender } = render(
      <CandidateReviewPanel
        isActive
        isPending={false}
        isError={false}
        error={null}
        candidates={[a, b]}
        quotes={[]}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
        approvedKey={null}
      />,
    );
    expect(screen.getAllByTestId('candidate-card')).toHaveLength(2);
    rerender(
      <CandidateReviewPanel
        isActive
        isPending={false}
        isError={false}
        error={null}
        candidates={[a, b]}
        quotes={[]}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
        approvedKey={candidateKey(a)}
      />,
    );
    const remaining = screen.getAllByTestId('candidate-card');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('still here');
  });
});

describe('CandidateReviewPanel — no raw substrate vocabulary leaks', () => {
  it('renders none of the raw signals (flags, score, ids) as visible text', () => {
    const candidate = makeCandidate({
      source_quote_id: 'q-1',
      confidence_score: 0.42,
      // Every reason flag at once — the worst case for leakage.
      confidence_reasons: [...ALLOWED_EXTRACTION_REASON],
      duplicate: { kind: 'likely', fact_id: 'f-secret', similarity: 0.5 },
      provenance_preview: {
        source: 'conversation',
        conversation_id: 'conv-secret',
        source_quote_id: 'q-secret',
        created_at: '2026-05-24T00:00:00Z',
        extraction_confidence: 0.42,
        reason_flags: [...ALLOWED_EXTRACTION_REASON],
        extractor_version: 'det-1',
        model_used: null,
      },
    });
    render(
      <CandidateReviewPanel
        isActive
        isPending={false}
        isError={false}
        error={null}
        candidates={[candidate]}
        quotes={[makeQuote({ id: 'q-1' })]}
        onApprove={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const text = screen.getByTestId('candidate-review-panel').textContent ?? '';
    const forbidden = [
      ...ALLOWED_EXTRACTION_REASON, // raw flag tokens
      'confidence_score',
      'extraction_confidence',
      'reason_flags',
      'source_quote_id',
      'statement_hash',
      'extractor_version',
      'det-1',
      'q-secret',
      'conv-secret',
      'f-secret',
      '0.42', // the raw numeric score must never render
    ];
    for (const bad of forbidden) {
      expect(text.includes(bad)).toBe(false);
    }
    // …but the friendly bucket + chips DID render (0.42 → tentative →
    // "Looks reasonable" under the C4.1.1 3-level review copy).
    expect(text).toContain('Looks reasonable');
    expect(text).toContain('Clear claim');
  });
});
