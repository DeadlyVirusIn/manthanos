// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// React component that renders a translated label. Sprint 2 M1 C1.8.
//
// Usage:
//   <EnumLabel kind="audience_fit" value={c.audience_fit} />
//   <EnumLabel kind="audit_action" value={ev.action} payload={ev.payload ?? {}} />
//
// This is the sanctioned surface for rendering any enum value in JSX.
// The C1.9 lint scan catches code that bypasses it (e.g. `{c.audience_fit}`
// rendered directly).

import { type LabelKind, getEnumLabel } from './labels.js';

export interface EnumLabelProps {
  readonly kind: LabelKind;
  readonly value: string;
  readonly payload?: Record<string, unknown>;
}

export function EnumLabel({ kind, value, payload }: EnumLabelProps): JSX.Element {
  return <>{getEnumLabel(kind, value, payload)}</>;
}
