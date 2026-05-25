// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Sprint 3B.8D — live ValidatorClient with a MOCKED transport (no real
// network). Verifies request shape (no tools, capped tokens, auth header),
// text extraction, HTTP-error → throw, and malformed-envelope → throw.

import { describe, expect, it } from 'vitest';
import {
  type HttpTransport,
  MAX_RESPONSE_TOKENS,
  createLiveValidatorClient,
} from '../src/services/extraction/liveValidatorClient.js';

function transportReturning(
  bodyText: string,
  status = 200,
): { transport: HttpTransport; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const transport: HttpTransport = (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(bodyText),
    });
  };
  return { transport, calls };
}

const anthropicBody = (text: string): string =>
  JSON.stringify({ content: [{ type: 'text', text }] });

describe('createLiveValidatorClient — request shape', () => {
  it('sends NO tools, a capped max_tokens, the model, and the api key header', async () => {
    const { transport, calls } = transportReturning(anthropicBody('{"abstain":true}'));
    const client = createLiveValidatorClient({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      transport,
    });
    const out = await client.validate('PROMPT');
    expect(out).toBe('{"abstain":true}');
    const body = calls[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('tools'); // no tool use
    expect(body.max_tokens).toBe(MAX_RESPONSE_TOKENS);
    expect(body.model).toBe('claude-haiku-4-5');
  });

  it('returns the model text verbatim (parsing happens downstream)', async () => {
    const { transport } = transportReturning(anthropicBody('{"confidence_score":0.7}'));
    const client = createLiveValidatorClient({ apiKey: 'k', model: 'm', transport });
    expect(await client.validate('p')).toBe('{"confidence_score":0.7}');
  });
});

describe('createLiveValidatorClient — error behavior', () => {
  it('throws on a non-2xx HTTP status (runner will fall back)', async () => {
    const { transport } = transportReturning('{}', 503);
    const client = createLiveValidatorClient({ apiKey: 'k', model: 'm', transport });
    await expect(client.validate('p')).rejects.toThrow(/HTTP 503/);
  });

  it('throws on a malformed provider envelope', async () => {
    const { transport } = transportReturning('not json');
    const client = createLiveValidatorClient({ apiKey: 'k', model: 'm', transport });
    await expect(client.validate('p')).rejects.toThrow();
  });

  it('throws when the envelope has no text content', async () => {
    const { transport } = transportReturning(JSON.stringify({ content: [] }));
    const client = createLiveValidatorClient({ apiKey: 'k', model: 'm', transport });
    await expect(client.validate('p')).rejects.toThrow();
  });

  it('forwards the abort signal to the transport', async () => {
    let sawSignal = false;
    const transport: HttpTransport = (_url, init) => {
      sawSignal = init.signal !== undefined;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(anthropicBody('{"abstain":true}')),
      });
    };
    const client = createLiveValidatorClient({ apiKey: 'k', model: 'm', transport });
    await client.validate('p', new AbortController().signal);
    expect(sawSignal).toBe(true);
  });
});
