// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import type { AgentRequest } from '@manthanos/adapters-sdk';
import { describe, expect, it } from 'vitest';
import { encodeRequest } from '../src/messages.js';

const OPTS = { model: 'claude-sonnet-4-5', defaultMaxOutputTokens: 4096 } as const;

describe('encodeRequest', () => {
  it('encodes a simple user message', () => {
    const req: AgentRequest = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    };
    const params = encodeRequest(req, OPTS);
    expect(params.model).toBe('claude-sonnet-4-5');
    expect(params.max_tokens).toBe(4096);
    expect(params.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  });

  it('hoists system text from req.system and inline system messages', () => {
    const req: AgentRequest = {
      system: 'You are helpful.',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Be brief.' }] },
        { role: 'user', content: [{ type: 'text', text: 'task' }] },
      ],
    };
    const params = encodeRequest(req, OPTS);
    expect(params.system).toBe('You are helpful.\nBe brief.');
    expect(params.messages.length).toBe(1);
    expect(params.messages[0]?.role).toBe('user');
  });

  it('rejects messages that do not start with user', () => {
    const req: AgentRequest = {
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] }],
    };
    expect(() => encodeRequest(req, OPTS)).toThrow(/first message must be from user/);
  });

  it('respects an explicit maxOutputTokens', () => {
    const req: AgentRequest = {
      maxOutputTokens: 512,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    };
    const params = encodeRequest(req, OPTS);
    expect(params.max_tokens).toBe(512);
  });

  it('encodes tool_call and tool_result blocks', () => {
    const req: AgentRequest = {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'do thing' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'let me try' },
            { type: 'tool_call', id: 'toolu_1', name: 'read_file', arguments: { path: 'x.ts' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolCallId: 'toolu_1', content: 'file content here' }],
        },
      ],
    };
    const params = encodeRequest(req, OPTS);
    expect(params.messages.length).toBe(3);
    expect(params.messages[1]?.content).toContainEqual({
      type: 'tool_use',
      id: 'toolu_1',
      name: 'read_file',
      input: { path: 'x.ts' },
    });
    expect(params.messages[2]?.content).toContainEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: 'file content here',
    });
  });
});
