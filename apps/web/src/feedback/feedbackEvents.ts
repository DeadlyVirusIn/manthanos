// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Friendly feedback-event recorder — C4.4-E4.
//
// A tiny, bounded, in-memory log of FRIENDLY event labels (curated strings
// only — never raw errors, payloads, ids, or stack traces). The feedback
// bundle reads these so a report can say "F1 was shown at startup" without
// leaking anything. Producers must pass human-facing labels; the bundle
// builder also re-sanitizes as defense-in-depth.

const MAX_EVENTS = 20;
let events: string[] = [];

/** Record a friendly, non-identifying event label. Callers MUST pass a
 *  curated label (e.g. "Startup: F1 shown"), never a raw error message. */
export function recordFeedbackEvent(label: string): void {
  events.push(label);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }
}

export function getFeedbackEvents(): readonly string[] {
  return [...events];
}

export function clearFeedbackEvents(): void {
  events = [];
}
