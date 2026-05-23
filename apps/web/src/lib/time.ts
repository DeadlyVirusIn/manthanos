// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Time formatting helpers. Sprint 2 M2 C2.1.
//
// ManthanOS pages must never render raw ISO timestamps. Every backend
// timestamp (occurred_at, created_at, status_changed_at, last_corroborated,
// …) flows through formatRelativeTime() before reaching the DOM. The
// goal is a single short, calm phrase that founders can read without
// pausing — "3 minutes ago", "2 days ago", "last week".
//
// The function is pure: it accepts the now() reference as an argument
// so tests can pin a fixed clock without monkeypatching Date.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// Past:   "just now", "3 minutes ago", "2 hours ago", …
// Future: "in 5 minutes", … (rare — clock skew or scheduled)
// Invalid / null / empty: returns ''. Callers substitute their own
// fallback ("unknown", "—") in the DOM.
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (iso === null || iso === undefined || iso === '') return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = now.getTime() - ts;
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const phrase = magnitudePhrase(abs);
  if (phrase === 'just now') return 'just now';
  return past ? `${phrase} ago` : `in ${phrase}`;
}

function magnitudePhrase(ms: number): string {
  if (ms < 30 * SECOND) return 'just now';
  if (ms < MINUTE) return `${Math.round(ms / SECOND)} seconds`;
  if (ms < HOUR) return pluralise(Math.round(ms / MINUTE), 'minute');
  if (ms < DAY) return pluralise(Math.round(ms / HOUR), 'hour');
  if (ms < WEEK) return pluralise(Math.round(ms / DAY), 'day');
  if (ms < MONTH) return pluralise(Math.round(ms / WEEK), 'week');
  if (ms < YEAR) return pluralise(Math.round(ms / MONTH), 'month');
  return pluralise(Math.round(ms / YEAR), 'year');
}

function pluralise(count: number, unit: string): string {
  return count === 1 ? `${count} ${unit}` : `${count} ${unit}s`;
}
