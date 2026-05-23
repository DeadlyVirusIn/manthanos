// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Deliberate-violation fixture for the C1.9 enum-rendering lint scan.
//
// Every category of substrate-vocabulary violation appears below in a
// user-facing render context. apps/web/tests/no-raw-enums.test.ts scans
// this file and asserts that the scanner catches every category. Without
// these violations, the scanner's positive self-test would prove nothing.
//
// This file is NEVER imported by application code. It exists only as
// text input for the lint test.
//
// Vitest ignores this path (its glob is `tests/**/*.test.{ts,tsx}` only).
// The main tsconfig excludes the `tests/` directory entirely.
// Biome lints it like any other file; the violations are vocabulary, not
// lint-rule breaches, so Biome stays green.

interface ConvShape {
  readonly audience_fit: string;
  readonly conversation_type: string;
  readonly outcome: string;
}

interface FactShape {
  readonly tier: string;
}

interface Props {
  readonly conv: ConvShape;
  readonly fact: FactShape;
}

export function RawEnumViolations({ conv, fact }: Props): JSX.Element {
  return (
    <div>
      {/* raw-enum-jsx: direct enum-field rendering, bypassing <EnumLabel>. */}
      <span>{conv.audience_fit}</span>
      <span>{conv.conversation_type}</span>
      <span>{conv.outcome}</span>
      <span>{fact.tier}</span>

      {/* tier-literal: substrate tier strings quoted in TSX. */}
      <span>{'T+1'}</span>
      <span>{'T0'}</span>
      <span>{'T-1'}</span>
      <span>{'T-2'}</span>

      {/* word (JSX text): substrate vocabulary visible to the user. */}
      <p>This fact has been tombstoned.</p>
      <p>The tombstone date is unknown.</p>
      <p>This is the provenance record.</p>
      <p>The conversation corroborated this fact.</p>
      <p>The corroborate count is rising.</p>
      <p>This fact is contested by another.</p>
      <p>This row was superseded.</p>
      <p>The extractor was manual.</p>
      <p>The audit_seq is 42.</p>

      {/* word (JSX attribute): forbidden vocabulary in user-facing prop. */}
      <button type="button" title="tombstone this fact">
        Erase
      </button>
      <input aria-label="contested reason" />
      <input placeholder="provenance source" />
    </div>
  );
}
