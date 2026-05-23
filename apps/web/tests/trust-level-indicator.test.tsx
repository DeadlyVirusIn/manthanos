// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tests for the TrustLevelIndicator component. Sprint 2 M2 C2.1.
//
// The component renders four dots — N filled per tier — plus a
// translated text label. The invariant: the rendered DOM must NEVER
// contain the raw tier string ("T-2", "T-1", "T0", "T+1"). All four
// tiers + the tombstoned variant are exercised below.

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { asFactTier } from '../src/api/index.js';
import { TrustLevelIndicator } from '../src/components/index.js';

const RAW_TIER_STRINGS = ['T-2', 'T-1', 'T0', 'T+1'] as const;

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('TrustLevelIndicator — dot counts per tier', () => {
  it('T-2 fills exactly 1 dot', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T-2')} />);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-filled"')).toBe(1);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-empty"')).toBe(3);
  });

  it('T-1 fills exactly 2 dots', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T-1')} />);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-filled"')).toBe(2);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-empty"')).toBe(2);
  });

  it('T0 fills exactly 3 dots', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T0')} />);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-filled"')).toBe(3);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-empty"')).toBe(1);
  });

  it('T+1 fills all 4 dots', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T+1')} />);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-filled"')).toBe(4);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-empty"')).toBe(0);
  });
});

describe('TrustLevelIndicator — tombstoned variant', () => {
  it('renders zero filled dots when tombstoned, regardless of tier', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T+1')} tombstoned={true} />);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-filled"')).toBe(0);
    expect(countOccurrences(html, 'data-testid="trust-level-dot-empty"')).toBe(4);
  });

  it('renders the explicit "Removed" label when tombstoned', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T0')} tombstoned={true} />);
    expect(html).toContain('Removed');
    expect(html).toContain('data-tombstoned="true"');
  });

  it('marks data-tombstoned="false" by default', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T0')} />);
    expect(html).toContain('data-tombstoned="false"');
  });
});

describe('TrustLevelIndicator — raw enum invariant', () => {
  it('never renders the raw tier string in the DOM, for any tier', () => {
    for (const raw of RAW_TIER_STRINGS) {
      const html = renderToString(<TrustLevelIndicator tier={asFactTier(raw)} />);
      // Allow the substring inside element/attr names that happen to
      // contain those characters (none do) — we assert the literal
      // tier strings are absent in visible-text positions.
      expect(html).not.toContain(`>${raw}<`);
      expect(html).not.toContain(`> ${raw}`);
      expect(html).not.toContain(`${raw} `);
    }
  });

  it('renders a translated text label for each tier', () => {
    for (const raw of RAW_TIER_STRINGS) {
      const html = renderToString(<TrustLevelIndicator tier={asFactTier(raw)} />);
      const labelMatch = html.match(/data-testid="trust-level-label"[^>]*>([^<]+)</);
      expect(labelMatch?.[1]).toBeTruthy();
      expect((labelMatch?.[1] ?? '').length).toBeGreaterThan(0);
    }
  });
});

describe('TrustLevelIndicator — accessibility', () => {
  it('sets an aria-label describing the trust level', () => {
    const html = renderToString(<TrustLevelIndicator tier={asFactTier('T0')} />);
    expect(html).toContain('aria-label="Trust level:');
  });

  it('honours an explicit aria-label override', () => {
    const html = renderToString(
      <TrustLevelIndicator tier={asFactTier('T0')} ariaLabel="Custom label" />,
    );
    expect(html).toContain('aria-label="Custom label"');
  });
});
