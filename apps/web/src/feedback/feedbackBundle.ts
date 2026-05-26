// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Feedback bundle — C4.4-E4 (design: C4_2 §14, C4_3 §7).
//
// Assembles ONE redacted diagnostics file a novice tester can send. Privacy
// is enforced two ways:
//   1. the builder accepts only CURATED fields — raw conversation/quote
//      text, model output, stack traces, and error payloads never enter;
//   2. every free-form string that does flow in (route, note, event labels)
//      is defensively scrubbed of keys, paths, ports, and ids.
//
// Excluded by contract: raw conversation/quote text, PII, API keys, model
// output, stack traces, file paths, ports, workspace/project ids, internal
// ids. Never expose internal diagnostics to the user — the file is opaque
// to them; they just send it.

export interface FeedbackBundleInput {
  /** Optional free-text note the tester wrote. Sanitized before inclusion. */
  readonly note?: string;
  /** Build-injected app version (e.g. import.meta.env.VITE_APP_VERSION). */
  readonly appVersion: string;
  /** Build-injected short commit, if available. */
  readonly commit?: string;
  /** navigator.userAgent (browser + OS). */
  readonly userAgent: string;
  /** Current route path — REDACTED to a pattern (ids stripped). */
  readonly routePath: string;
  /** Friendly startup/error event labels (curated; sanitized again here). */
  readonly events?: readonly string[];
  /** Whether the local engine was reachable when the report was made. */
  readonly healthReachable: boolean;
  /** Injected clock for a stable filename/timestamp. */
  readonly now?: Date;
}

export interface FeedbackBundle {
  readonly kind: 'manthanos-feedback';
  readonly version: 1;
  readonly generatedAt: string;
  readonly referenceCode: string;
  readonly app: { readonly version: string; readonly commit: string | null };
  readonly environment: { readonly userAgent: string };
  /** Route PATTERN — never the concrete path with ids. */
  readonly screen: string;
  readonly events: readonly string[];
  readonly health: { readonly reachable: boolean };
  readonly note: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────────────

/** Path segments that are real route literals (kept verbatim). Everything
 *  else between them is treated as an id and replaced. */
const ROUTE_LITERALS: ReadonlySet<string> = new Set([
  'projects',
  'today',
  'validation',
  'conversations',
  'facts',
]);

/** Map a concrete route path to a redacted PATTERN: the segment after
 *  `projects` becomes `:projectId`; any other non-literal segment becomes
 *  `:id`. No raw ids survive. */
export function redactRoute(pathname: string): string {
  const segments = pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '/';
  const out: string[] = [];
  for (const seg of segments) {
    if (ROUTE_LITERALS.has(seg)) {
      out.push(seg);
      continue;
    }
    const parent = out[out.length - 1];
    out.push(parent === 'projects' ? ':projectId' : ':id');
  }
  return `/${out.join('/')}`;
}

const REDACTED = '[redacted]';

/** Patterns that must never appear in the bundle. Applied to any free-form
 *  string (note, event labels) as defense-in-depth. */
const SCRUB_PATTERNS: readonly RegExp[] = [
  // API keys / bearer tokens.
  /\bsk-[A-Za-z0-9_-]{6,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{6,}/gi,
  // Unix + Windows file paths.
  /\/(?:home|Users|root|var|tmp|etc|opt|private)\/[^\s"']*/g,
  /\b[A-Za-z]:\\[^\s"']*/g,
  // Internal / substrate ids.
  /\b(?:ws|conv|fact|demo|quote|det)-[A-Za-z0-9-]{2,}/g,
  // UUIDs.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // host:port / :port.
  /:\d{2,5}\b/g,
];

/** Scrub keys, paths, ids, and ports from a free-form string. */
export function sanitizeText(input: string): string {
  let out = input;
  for (const re of SCRUB_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────

const MAX_NOTE_LEN = 2000;
const MAX_EVENTS = 20;

/** Short, non-identifying reference code for support correlation. Derived
 *  from the timestamp only — carries no user/workspace identity. */
function referenceCode(now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const tail = (now.getTime() % 100000).toString(36).toUpperCase().padStart(4, '0');
  return `FB-${day}-${tail}`;
}

export function feedbackFileName(now: Date): string {
  return `manthanos-feedback-${now.toISOString().slice(0, 10)}.json`;
}

export function buildFeedbackBundle(input: FeedbackBundleInput): FeedbackBundle {
  const now = input.now ?? new Date();
  const note =
    input.note !== undefined && input.note.trim().length > 0
      ? sanitizeText(input.note.trim().slice(0, MAX_NOTE_LEN))
      : null;
  const events = (input.events ?? []).slice(0, MAX_EVENTS).map((e) => sanitizeText(e));

  return {
    kind: 'manthanos-feedback',
    version: 1,
    generatedAt: now.toISOString(),
    referenceCode: referenceCode(now),
    app: { version: input.appVersion, commit: input.commit ?? null },
    environment: { userAgent: input.userAgent },
    screen: redactRoute(input.routePath),
    events,
    health: { reachable: input.healthReachable },
    note,
  };
}

export function serializeFeedbackBundle(bundle: FeedbackBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
