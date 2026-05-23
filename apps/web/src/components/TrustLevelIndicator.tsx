// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// TrustLevelIndicator — Sprint 2 M2 C2.1.
//
// Renders a fact's trust tier as four dots (one filled per active
// tier-step) plus a translated text label. The component NEVER renders
// the raw tier letter ("T-2", "T-1", "T0", "T+1") — that invariant is
// enforced by trust-level-indicator.test.tsx and by the global C1.9
// no-raw-enums scan.
//
// Mapping (matches the C1.8 'tier' label table):
//   T-2  →  1 dot filled
//   T-1  →  2 dots filled
//   T0   →  3 dots filled
//   T+1  →  4 dots filled
//
// Tombstoned facts render an unfilled grey row with an explicit
// "Removed" label so the indicator still has accessible meaning.

import type { FactTier, FactTierValue } from '../api/index.js';
import { getEnumLabel } from '../i18n/labels.js';

export interface TrustLevelIndicatorProps {
  readonly tier: FactTier;
  readonly tombstoned?: boolean;
  readonly ariaLabel?: string;
}

const FILL_COUNT: Record<FactTierValue, 1 | 2 | 3 | 4> = {
  'T-2': 1,
  'T-1': 2,
  T0: 3,
  'T+1': 4,
};

// Stable keys for the 4 dots — avoids React's no-array-index-key rule
// without needing a suppression. The indicator always renders 4 dots.
const DOT_KEYS = ['dot-a', 'dot-b', 'dot-c', 'dot-d'] as const;

export function TrustLevelIndicator({
  tier,
  tombstoned = false,
  ariaLabel,
}: TrustLevelIndicatorProps): JSX.Element {
  const label = tombstoned ? 'Removed' : getEnumLabel('tier', tier);
  const filled = tombstoned ? 0 : FILL_COUNT[tier as FactTierValue];
  return (
    <span
      aria-label={ariaLabel ?? `Trust level: ${label}`}
      data-testid="trust-level-indicator"
      data-tombstoned={tombstoned ? 'true' : 'false'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <span
        aria-hidden="true"
        data-testid="trust-level-dots"
        style={{ display: 'inline-flex', gap: '0.25rem' }}
      >
        {DOT_KEYS.map((dotKey, idx) => (
          <span
            key={dotKey}
            data-testid={idx < filled ? 'trust-level-dot-filled' : 'trust-level-dot-empty'}
            style={{
              display: 'inline-block',
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '50%',
              backgroundColor: idx < filled ? '#0066cc' : '#ddd',
            }}
          />
        ))}
      </span>
      <span data-testid="trust-level-label" style={{ fontSize: '0.875rem', color: '#444' }}>
        {label}
      </span>
    </span>
  );
}
