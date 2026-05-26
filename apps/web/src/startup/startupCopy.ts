// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Startup / readiness copy — C4.4-E2 (design: C4_3_READINESS_SCREEN).
//
// The ONLY source of user-facing startup wording. Deliberately free of
// internals: no daemon/port/URL/workspace-id/schema/migration vocabulary,
// no AI/validator/provider language. The C1.9 no-raw-vocab scan covers the
// startup .tsx files that render these strings.

/** Primary status lines shown while ManthanOS gets ready. */
export const STARTUP_COPY = {
  /** Launching (engine starting). */
  launching: 'Starting ManthanOS…',
  /** Preparing, first run (storage check + demo ensure). */
  preparingFirstRun: 'Getting your demo Project ready…',
  /** Preparing, returning user. */
  preparingReturning: 'Loading your Project…',
  /** Reassurance shown on first run and on a slow start. */
  privacy: 'Runs on your computer. Nothing leaves it.',
  /** Slow-start reassurance (first run / returning). */
  slowStartFirstRun: 'Still getting things ready — this can take a moment the first time.',
  slowStartReturning: 'Almost there…',
} as const;

/** First-run payoff moment (C4.1.1 §6 / C4.3 §5). Shown once, then dismissed
 *  into the app — never a standalone "Ready" screen. */
export const PAYOFF_COPY = {
  headline: 'Turn customer conversations into findings you can trust.',
  subline:
    'ManthanOS keeps what people said, suggests the key findings, and shows how sure you can be about each one.',
  /** Reassurance restated at the payoff moment. */
  privacy: 'Everything here stays on your computer, and you can reset the demo anytime.',
  cta: 'Show me',
} as const;

/** Friendly substep labels (first run). Reassurance, not telemetry — never
 *  names migrations/ports/workspaces. */
export const STARTUP_SUBSTEPS = {
  engine: 'Starting the engine',
  data: 'Checking your data',
  demo: 'Getting your demo Project ready',
} as const;
