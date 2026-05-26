// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// C4.4-E4 — feedback bundle redaction + privacy-exclusion tests. The
// central guarantee: nothing forbidden can reach the serialized file.

import { describe, expect, it } from 'vitest';

import {
  type FeedbackBundleInput,
  buildFeedbackBundle,
  feedbackFileName,
  redactRoute,
  sanitizeText,
  serializeFeedbackBundle,
} from '../src/feedback/feedbackBundle.js';

const NOW = new Date('2026-05-26T10:00:00.000Z');

describe('redactRoute', () => {
  it('strips project / conversation / fact ids to a pattern', () => {
    expect(redactRoute('/projects/ws-abc123/conversations/conv-xyz')).toBe(
      '/projects/:projectId/conversations/:id',
    );
    expect(redactRoute('/projects/ws-abc123/facts/fact-9')).toBe('/projects/:projectId/facts/:id');
    expect(redactRoute('/projects/ws-abc123/today')).toBe('/projects/:projectId/today');
    expect(redactRoute('/projects/ws-abc123')).toBe('/projects/:projectId');
    expect(redactRoute('/')).toBe('/');
  });
});

describe('sanitizeText', () => {
  it('scrubs keys, bearer tokens, paths, ids, uuids, and ports', () => {
    const dirty =
      'key sk-live-ABCDEF123456 Bearer abcdef123456 at /home/kim/notes.txt and C:\\Users\\kim\\x ws-9f3 conv-22 ' +
      '550e8400-e29b-41d4-a716-446655440000 on 127.0.0.1:7373';
    const clean = sanitizeText(dirty);
    expect(clean).not.toMatch(/sk-live/);
    expect(clean).not.toMatch(/Bearer abcdef/);
    expect(clean).not.toMatch(/\/home\/kim/);
    expect(clean).not.toMatch(/C:\\Users/);
    expect(clean).not.toMatch(/ws-9f3/);
    expect(clean).not.toMatch(/conv-22/);
    expect(clean).not.toMatch(/550e8400-e29b/);
    expect(clean).not.toMatch(/:7373/);
  });
});

function adversarialInput(): FeedbackBundleInput {
  return {
    note: 'My key is sk-live-SECRET999 and my file is /home/sam/secret.txt',
    appVersion: '1.2.3',
    commit: 'abc1234',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    routePath: '/projects/ws-realproject/conversations/conv-realconv',
    events: ['Startup: F1 shown', 'Leaked ws-deadbeef at 127.0.0.1:7373'],
    healthReachable: false,
    now: NOW,
  };
}

describe('buildFeedbackBundle — privacy exclusions', () => {
  it('contains none of the forbidden raw substrings', () => {
    const serialized = serializeFeedbackBundle(buildFeedbackBundle(adversarialInput()));
    for (const forbidden of [
      'sk-live-SECRET999',
      '/home/sam',
      'secret.txt',
      'ws-realproject',
      'conv-realconv',
      'ws-deadbeef',
      ':7373',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('includes the expected safe fields', () => {
    const bundle = buildFeedbackBundle(adversarialInput());
    expect(bundle.kind).toBe('manthanos-feedback');
    expect(bundle.app.version).toBe('1.2.3');
    expect(bundle.app.commit).toBe('abc1234');
    expect(bundle.environment.userAgent).toContain('Mozilla/5.0');
    expect(bundle.screen).toBe('/projects/:projectId/conversations/:id');
    expect(bundle.health.reachable).toBe(false);
    expect(bundle.referenceCode).toMatch(/^FB-\d{8}-/);
    // The note is kept but scrubbed.
    expect(bundle.note).toContain('My key is');
    expect(bundle.note).not.toContain('sk-live-SECRET999');
    expect(bundle.note).not.toContain('/home/sam');
  });

  it('omits the note when blank and defaults commit to null', () => {
    const bundle = buildFeedbackBundle({
      appVersion: 'dev',
      userAgent: 'UA',
      routePath: '/',
      healthReachable: true,
      now: NOW,
    });
    expect(bundle.note).toBeNull();
    expect(bundle.app.commit).toBeNull();
  });

  it('names the file by date', () => {
    expect(feedbackFileName(NOW)).toBe('manthanos-feedback-2026-05-26.json');
  });
});
