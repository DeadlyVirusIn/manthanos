// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// API client tests — Sprint 2 M1 C1.7.
//
// Covers: client construction + base URL handling; request helpers
// (get/post/patch/getText); response parsing (JSON success + JSON error
// envelope + plain-text export); transport error normalisation; branded
// enum guards + branders; query-key factory shape stability; compile-
// time guarantees on branded types (@ts-expect-error fences).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiError, createApiClient, defaultApiClient } from '../src/api/client.js';
import { conversationsKeys } from '../src/api/conversations.js';
import { factsKeys } from '../src/api/facts.js';
import {
  EnumBrandError,
  type FactTier,
  asAudienceFit,
  asConversationOutcome,
  asConversationType,
  asExtractor,
  asFactExtractionStatus,
  asFactTier,
  asLifecycleState,
  asProvenanceKind,
  asWorkspaceStatus,
  isAudienceFit,
  isConversationOutcome,
  isConversationType,
  isExtractor,
  isFactExtractionStatus,
  isFactTier,
  isLifecycleState,
  isProvenanceKind,
  isWorkspaceStatus,
} from '../src/api/types.js';
import { workspacesKeys } from '../src/api/workspaces.js';

// Helper: build a fetch mock that returns a single canned response.
function mockFetch(opts: {
  status?: number;
  body?: unknown;
  text?: string;
  throws?: Error;
}): typeof fetch {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    if (opts.throws) throw opts.throws;
    const status = opts.status ?? 200;
    const text =
      opts.text !== undefined
        ? opts.text
        : opts.body === undefined
          ? ''
          : JSON.stringify(opts.body);
    return new Response(text, {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('ApiClient — construction (M1 C1.7)', () => {
  it('defaults baseUrl to empty string', () => {
    const c = createApiClient();
    expect(c.baseUrl).toBe('');
  });

  it('uses provided baseUrl when set', () => {
    const c = createApiClient({ baseUrl: 'http://localhost:9999' });
    expect(c.baseUrl).toBe('http://localhost:9999');
    expect(c.resolve('/api/v1/x')).toBe('http://localhost:9999/api/v1/x');
  });

  it('resolves paths against the empty default baseUrl unchanged', () => {
    const c = createApiClient();
    expect(c.resolve('/api/v1/x')).toBe('/api/v1/x');
  });

  it('exports a singleton default client', () => {
    expect(defaultApiClient).toBeInstanceOf(ApiClient);
    expect(defaultApiClient.baseUrl).toBe('');
  });
});

describe('ApiClient — request helpers (M1 C1.7)', () => {
  it('GET parses a JSON response into the declared type', async () => {
    const c = createApiClient({
      baseUrl: '',
      fetch: mockFetch({ body: { id: 'ws-1', name: 'demo' } }),
    });
    const result = await c.get<{ id: string; name: string }>('/api/v1/workspaces/ws-1');
    expect(result).toEqual({ id: 'ws-1', name: 'demo' });
  });

  it('POST attaches Content-Type and JSON-encodes the body', async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(init?.body).toBe(JSON.stringify({ name: 'hi' }));
      return new Response(JSON.stringify({ id: 'ws-new' }), { status: 201 });
    });
    const c = createApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    const result = await c.post<{ id: string }>('/api/v1/workspaces', { name: 'hi' });
    expect(result).toEqual({ id: 'ws-new' });
  });

  it('PATCH attaches Content-Type and JSON-encodes the body', async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PATCH');
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const c = createApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await c.patch('/api/v1/x', { foo: 'bar' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('getText returns raw response text (used for Markdown export)', async () => {
    const markdown = '# Conversation with Alex\n\nSome content.\n';
    const c = createApiClient({ fetch: mockFetch({ text: markdown }) });
    const result = await c.getText('/api/v1/workspaces/ws-1/conversations/conv-1/export');
    expect(result).toBe(markdown);
  });

  it('204 No Content returns null', async () => {
    const c = createApiClient({
      // Node's Response constructor rejects 204 with any body (per spec).
      // Pass null explicitly to construct a valid 204 response.
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
    });
    const result = await c.get<null>('/api/v1/x');
    expect(result).toBeNull();
  });
});

describe('ApiClient — error handling (M1 C1.7)', () => {
  it('non-2xx response throws ApiError carrying the parsed body', async () => {
    const c = createApiClient({
      fetch: mockFetch({
        status: 400,
        body: { error: 'validation', field: 'reason', details: 'reason must be a string' },
      }),
    });
    await expect(c.post('/api/v1/x', {})).rejects.toBeInstanceOf(ApiError);
    try {
      await c.post('/api/v1/x', {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(400);
      expect(e.body).toEqual({
        error: 'validation',
        field: 'reason',
        details: 'reason must be a string',
      });
      expect(e.path).toBe('/api/v1/x');
    }
  });

  it('non-2xx response with non-JSON body has body=null', async () => {
    const c = createApiClient({
      fetch: mockFetch({ status: 500, text: '<html>500 Internal Server Error</html>' }),
    });
    try {
      await c.get('/api/v1/x');
      throw new Error('expected ApiError');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(500);
      expect(e.body).toBeNull();
    }
  });

  it('network failure (fetch throws) becomes ApiError with status=0', async () => {
    const c = createApiClient({
      fetch: mockFetch({ throws: new Error('connection refused') }),
    });
    try {
      await c.get('/api/v1/x');
      throw new Error('expected ApiError');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(0);
      expect(e.message).toContain('network error');
      expect(e.body).toBeNull();
    }
  });

  it('getText also throws ApiError on non-2xx', async () => {
    const c = createApiClient({
      fetch: mockFetch({ status: 404, body: { error: 'not_found' } }),
    });
    await expect(c.getText('/api/v1/x/export')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('Branded enum types — runtime guards (M1 C1.7)', () => {
  it('isFactTier accepts all four tiers and rejects everything else', () => {
    expect(isFactTier('T+1')).toBe(true);
    expect(isFactTier('T0')).toBe(true);
    expect(isFactTier('T-1')).toBe(true);
    expect(isFactTier('T-2')).toBe(true);
    expect(isFactTier('T+2')).toBe(false);
    expect(isFactTier('high confidence')).toBe(false);
    expect(isFactTier(null)).toBe(false);
    expect(isFactTier(undefined)).toBe(false);
    expect(isFactTier(42)).toBe(false);
    expect(isFactTier({})).toBe(false);
  });

  it('isAudienceFit / isConversationType / isConversationOutcome reject foreign values', () => {
    expect(isAudienceFit('target')).toBe(true);
    expect(isAudienceFit('maybe')).toBe(false);
    expect(isConversationType('discovery')).toBe(true);
    expect(isConversationType('chitchat')).toBe(false);
    expect(isConversationOutcome('follow_up')).toBe(true);
    expect(isConversationOutcome('follow-up')).toBe(false);
  });

  it('isFactExtractionStatus / isWorkspaceStatus / isLifecycleState / isProvenanceKind / isExtractor', () => {
    expect(isFactExtractionStatus('pending')).toBe(true);
    expect(isFactExtractionStatus('extracted')).toBe(true);
    expect(isFactExtractionStatus('skipped')).toBe(true);
    expect(isFactExtractionStatus('reviewed')).toBe(false);

    expect(isWorkspaceStatus('active')).toBe(true);
    expect(isWorkspaceStatus('killed')).toBe(true);
    expect(isWorkspaceStatus('deleted')).toBe(false);

    expect(isLifecycleState('tombstoned')).toBe(true);
    expect(isLifecycleState('already_skipped')).toBe(true);
    expect(isLifecycleState('reopened')).toBe(false);

    expect(isProvenanceKind('quote')).toBe(true);
    expect(isProvenanceKind('conversation')).toBe(true);
    expect(isProvenanceKind('email')).toBe(false);

    expect(isExtractor('manual')).toBe(true);
    expect(isExtractor('ai-v1')).toBe(false); // Sprint 3+
  });
});

describe('Branded enum types — branders (M1 C1.7)', () => {
  it('asFactTier returns the branded value on valid input', () => {
    const t = asFactTier('T+1');
    expect(t).toBe('T+1');
  });

  it('asFactTier throws EnumBrandError on invalid input', () => {
    expect(() => asFactTier('T+2')).toThrow(EnumBrandError);
    expect(() => asFactTier(null)).toThrow(EnumBrandError);
    expect(() => asFactTier(123)).toThrow(EnumBrandError);
    try {
      asFactTier('banana');
    } catch (err) {
      const e = err as EnumBrandError;
      expect(e.field).toBe('FactTier');
      expect(e.value).toBe('banana');
    }
  });

  it('every brander has its own field name in the thrown error', () => {
    const branders = [
      ['AudienceFit', asAudienceFit],
      ['ConversationType', asConversationType],
      ['ConversationOutcome', asConversationOutcome],
      ['FactExtractionStatus', asFactExtractionStatus],
      ['FactTier', asFactTier],
      ['WorkspaceStatus', asWorkspaceStatus],
      ['LifecycleState', asLifecycleState],
      ['ProvenanceKind', asProvenanceKind],
      ['Extractor', asExtractor],
    ] as const;
    for (const [field, brander] of branders) {
      try {
        (brander as (v: unknown) => unknown)('definitely-not-valid');
        throw new Error(`brander ${field} should have thrown`);
      } catch (err) {
        expect(err).toBeInstanceOf(EnumBrandError);
        expect((err as EnumBrandError).field).toBe(field);
      }
    }
  });
});

describe('Branded enum types — compile-time guarantees (M1 C1.7)', () => {
  it('the brand phantom prevents raw string assignment to branded type', () => {
    // The two assertions below are the compile-time contract: the
    // @ts-expect-error fences only compile if the assignment they
    // guard does indeed fail. If a future TS update silently allows
    // raw string → branded type, these tests fail (the
    // @ts-expect-error directive itself errors).

    // OK: branded values flow through.
    const good: FactTier = asFactTier('T+1');
    expect(good).toBe('T+1');

    // @ts-expect-error — raw string literal must not be assignable to FactTier
    const bad1: FactTier = 'T+1';
    expect(bad1).toBe('T+1');

    // @ts-expect-error — even a string of valid value with `as string` cast can't bypass
    const bad2: FactTier = 'T+1' as string;
    expect(bad2).toBe('T+1');
  });
});

describe('Query-key factories (M1 C1.7)', () => {
  it('workspacesKeys produces stable, deterministic arrays', () => {
    expect(workspacesKeys.all).toEqual(['workspaces']);
    expect(workspacesKeys.list()).toEqual(['workspaces', 'list']);
    expect(workspacesKeys.detail('ws-1')).toEqual(['workspaces', 'detail', 'ws-1']);

    // Same call → same shape (and deeply equal, not the same reference —
    // each call returns a fresh array; that's intentional for TanStack
    // Query's reference-equality cache invalidation).
    expect(workspacesKeys.detail('ws-1')).toEqual(workspacesKeys.detail('ws-1'));
  });

  it('conversationsKeys nests opts payload into the list key for cache granularity', () => {
    expect(conversationsKeys.list('ws-1', { audience_fit: 'target' as never })).toEqual([
      'conversations',
      'list',
      'ws-1',
      { audience_fit: 'target' },
    ]);
    expect(conversationsKeys.detail('ws-1', 'conv-a')).toEqual([
      'conversations',
      'detail',
      'ws-1',
      'conv-a',
    ]);
    expect(conversationsKeys.facts('ws-1', 'conv-a')).toEqual([
      'conversations',
      'detail',
      'ws-1',
      'conv-a',
      'facts',
    ]);
  });

  it('factsKeys produces history/provenance/areas sub-keys under the detail prefix', () => {
    expect(factsKeys.history('ws-1', 'fact-a')).toEqual([
      'facts',
      'detail',
      'ws-1',
      'fact-a',
      'history',
    ]);
    expect(factsKeys.provenance('ws-1', 'fact-a')).toEqual([
      'facts',
      'detail',
      'ws-1',
      'fact-a',
      'provenance',
    ]);
    expect(factsKeys.areas('ws-1')).toEqual(['facts', 'areas', 'ws-1', null]);
    expect(factsKeys.areas('ws-1', 6)).toEqual(['facts', 'areas', 'ws-1', 6]);
  });
});

describe('Per-entity module smoke (M1 C1.7)', () => {
  // We don't exercise every endpoint; the existing apps/api integration
  // tests prove the backend behavior. Here we just confirm the modules
  // import cleanly and that a representative wrapper composes the URL
  // correctly through the injected mock client.

  it('listFactAreas composes the right URL and parses the response', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('/api/v1/workspaces/ws-1/facts/areas?limit=6');
      return new Response(JSON.stringify({ areas: [{ area: 'Audience', count: 12 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const { listFactAreas } = await import('../src/api/facts.js');
    const c = createApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    const result = await listFactAreas('ws-1', 6, c);
    expect(result.areas).toEqual([{ area: 'Audience', count: 12 }]);
  });

  it('exportConversationMarkdown returns plain text (not JSON-parsed)', async () => {
    const md = '# Conversation with Alex\n\nQuotes...\n';
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain('/conversations/conv-1/export?format=markdown');
      return new Response(md, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    });
    const { exportConversationMarkdown } = await import('../src/api/conversations.js');
    const c = createApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    const result = await exportConversationMarkdown('ws-1', 'conv-1', c);
    expect(result).toBe(md);
  });
});

// Sanity: clean up any spies between tests.
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());
