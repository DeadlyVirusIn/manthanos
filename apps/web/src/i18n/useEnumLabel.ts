// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// React hook for non-JSX string contexts. Sprint 2 M1 C1.8.
//
// When you need the translated label as a plain string — for an
// `<input placeholder=...>`, an `aria-label`, a `title`, or to compose
// into another string — call `useEnumLabel` instead of `<EnumLabel>`.
//
// The hook is intentionally NOT memoised. getEnumLabel is a pure map
// lookup; memoisation would cost more than it saves and complicate the
// dependency-array contract.

import { type LabelKind, getEnumLabel } from './labels.js';

export function useEnumLabel(
  kind: LabelKind,
  value: string,
  payload?: Record<string, unknown>,
): string {
  return getEnumLabel(kind, value, payload);
}
