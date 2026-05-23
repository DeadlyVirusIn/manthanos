// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Unit tests for the formatRelativeTime helper. Sprint 2 M2 C2.1.
//
// The function is pure — it takes the "now" reference as an argument,
// so we pin a fixed clock per case and assert exact phrasing.

import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '../src/lib/time.js';

const NOW = new Date('2026-05-23T12:00:00Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function ahead(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe('formatRelativeTime — past timestamps', () => {
  it('renders very recent past as "just now"', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('just now');
    expect(formatRelativeTime(ago(5 * SECOND), NOW)).toBe('just now');
    expect(formatRelativeTime(ago(29 * SECOND), NOW)).toBe('just now');
  });

  it('renders sub-minute past as seconds', () => {
    expect(formatRelativeTime(ago(45 * SECOND), NOW)).toBe('45 seconds ago');
  });

  it('renders sub-hour past as minutes', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(3 * MINUTE), NOW)).toBe('3 minutes ago');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59 minutes ago');
  });

  it('renders sub-day past as hours', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(2 * HOUR), NOW)).toBe('2 hours ago');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23 hours ago');
  });

  it('renders sub-week past as days', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('1 day ago');
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe('2 days ago');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6 days ago');
  });

  it('renders sub-month past as weeks', () => {
    expect(formatRelativeTime(ago(WEEK), NOW)).toBe('1 week ago');
    expect(formatRelativeTime(ago(3 * WEEK), NOW)).toBe('3 weeks ago');
  });

  it('renders sub-year past as months', () => {
    expect(formatRelativeTime(ago(MONTH), NOW)).toBe('1 month ago');
    expect(formatRelativeTime(ago(6 * MONTH), NOW)).toBe('6 months ago');
  });

  it('renders multi-year past as years', () => {
    expect(formatRelativeTime(ago(YEAR), NOW)).toBe('1 year ago');
    expect(formatRelativeTime(ago(3 * YEAR), NOW)).toBe('3 years ago');
  });
});

describe('formatRelativeTime — future timestamps', () => {
  it('renders sub-hour future as "in N minutes"', () => {
    expect(formatRelativeTime(ahead(5 * MINUTE), NOW)).toBe('in 5 minutes');
  });

  it('renders sub-day future as "in N hours"', () => {
    expect(formatRelativeTime(ahead(2 * HOUR), NOW)).toBe('in 2 hours');
  });

  it('renders very near future as "just now" (clock-skew tolerance)', () => {
    expect(formatRelativeTime(ahead(10 * SECOND), NOW)).toBe('just now');
  });
});

describe('formatRelativeTime — invalid input', () => {
  it('returns empty string for null', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatRelativeTime(undefined, NOW)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatRelativeTime('', NOW)).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
    expect(formatRelativeTime('2026-99-99', NOW)).toBe('');
  });
});
