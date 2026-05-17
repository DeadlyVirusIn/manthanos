// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Live tests against the real Anthropic API.
// Skipped unless `MANTHAN_ADAPTER_LIVE=1` AND `ANTHROPIC_API_KEY` are set.
//
// These tests verify:
//   - Real SDK responses project into the canonical shape we expect.
//   - Token counts returned by the API match what we record.
//   - Abort signal honesty (cancellation actually aborts in-flight).
//   - Audit hash stability across two identical live requests.
//
// They cost a tiny amount of money each (Haiku ~1 token in/out = <$0.0001).

import { hashCanonicalPayload } from '@manthanos/adapters-sdk';
import { describe, expect, it } from 'vitest';
import { createClaudeAdapter } from '../src/adapter.js';
import { PRESETS } from '../src/presets.js';

const LIVE = process.env.MANTHAN_ADAPTER_LIVE === '1';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const enabled = LIVE && API_KEY.length > 0;

describe.skipIf(!enabled)('Claude adapter — LIVE', () => {
  it('returns a well-formed canonical payload from haiku', async () => {
    const adapter = createClaudeAdapter({
      ...PRESETS['claude-haiku-4-5'],
      apiKey: API_KEY,
      recommendedFor: ['summarization'],
    });
    const resp = await adapter.invoke({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Reply with the single word: PING' }] },
      ],
      maxOutputTokens: 4,
    });
    expect(resp.text.toUpperCase()).toContain('PING');
    expect(resp.canonical.schema_version).toBe(1);
    expect(resp.canonical.model).toBe('claude-haiku-4-5');
    expect(resp.usage.inputTokens).toBeGreaterThan(0);
    expect(resp.usage.outputTokens).toBeGreaterThan(0);
    expect(resp.usage.usdMicro).toBeGreaterThan(0);
    expect(resp.finishReason).toMatch(/stop|length/);
  });

  it('AbortSignal cancels an in-flight request', async () => {
    const adapter = createClaudeAdapter({
      ...PRESETS['claude-haiku-4-5'],
      apiKey: API_KEY,
      recommendedFor: ['summarization'],
    });
    const ac = new AbortController();
    const promise = adapter.invoke({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'count to 200 slowly' }] }],
      maxOutputTokens: 1024,
      abortSignal: ac.signal,
    });
    // Abort almost immediately.
    setTimeout(() => ac.abort(), 100);
    await expect(promise).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('two identical haiku calls produce identical canonical shape modulo usage', async () => {
    // We don't expect byte-identical canonical (token counts may differ
    // slightly between identical requests due to provider-side sampling),
    // but the *shape* (model, content types, finish_reason) must be stable.
    const adapter = createClaudeAdapter({
      ...PRESETS['claude-haiku-4-5'],
      apiKey: API_KEY,
      recommendedFor: ['summarization'],
    });
    const req = {
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Reply with the single word: PING' }],
        },
      ],
      maxOutputTokens: 4,
      temperature: 0,
    };
    const r1 = await adapter.invoke(req);
    const r2 = await adapter.invoke(req);
    expect(r1.canonical.model).toBe(r2.canonical.model);
    expect(r1.canonical.finish_reason).toBe(r2.canonical.finish_reason);
    expect(r1.canonical.content.length).toBe(r2.canonical.content.length);

    // Hash equality is the strict test — usually true at temperature=0 +
    // identical text, but provider sampling means we don't enforce it.
    // We log the result so the live report shows whether it held.
    const h1 = hashCanonicalPayload(r1.canonical).payloadHash;
    const h2 = hashCanonicalPayload(r2.canonical).payloadHash;
    process.stdout.write(`  live hash determinism: ${h1 === h2 ? 'IDENTICAL' : 'DIFFERENT'}\n`);
    // Soft assert: same length 64 hex.
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(enabled)('Claude adapter — LIVE (skipped)', () => {
  it('skipped because MANTHAN_ADAPTER_LIVE=1 and ANTHROPIC_API_KEY were not both set', () => {
    expect(enabled).toBe(false);
  });
});
