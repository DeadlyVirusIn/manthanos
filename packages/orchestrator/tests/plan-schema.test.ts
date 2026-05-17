// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { describe, expect, it } from 'vitest';
import { parsePlan } from '../src/plan-schema.js';

describe('parsePlan', () => {
  it('extracts a fenced JSON block', () => {
    const txt = [
      'Sure, here is the plan:',
      '',
      '```json',
      JSON.stringify(
        {
          summary: 'Add OAuth login',
          steps: [
            {
              id: 'S1',
              description: 'Install passport',
              files_affected: ['package.json'],
              depends_on: [],
              estimated_difficulty: 2,
            },
          ],
          assumptions: ['Node.js available'],
          risks: [
            {
              description: 'Token leak',
              severity: 4,
              mitigation: 'use httpOnly cookies',
            },
          ],
          open_questions: ['Which providers?'],
        },
        null,
        2,
      ),
      '```',
    ].join('\n');

    const result = parsePlan(txt);
    expect(result.ok).toBe(true);
    expect(result.plan?.summary).toBe('Add OAuth login');
    expect(result.plan?.steps.length).toBe(1);
    expect(result.plan?.steps[0]?.id).toBe('S1');
    expect(result.plan?.risks[0]?.severity).toBe(4);
  });

  it('falls back to a top-level object when no fence is present', () => {
    const txt = `{"summary":"Quick plan","steps":[],"assumptions":[],"risks":[],"open_questions":[]}`;
    const result = parsePlan(txt);
    expect(result.ok).toBe(true);
    expect(result.plan?.summary).toBe('Quick plan');
  });

  it('reports an error when JSON is malformed', () => {
    const result = parsePlan('```json\n{not valid json}\n```');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid JSON');
  });

  it('reports missing summary as an error', () => {
    const result = parsePlan('```json\n{}\n```');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('summary');
  });

  it('coerces difficulty to 3 when out of range', () => {
    const txt = `\`\`\`json
${JSON.stringify({
  summary: 'x',
  steps: [
    {
      id: 'S1',
      description: 'd',
      files_affected: [],
      depends_on: [],
      estimated_difficulty: 99,
    },
  ],
  assumptions: [],
  risks: [],
  open_questions: [],
})}
\`\`\``;
    const result = parsePlan(txt);
    expect(result.ok).toBe(true);
    expect(result.plan?.steps[0]?.estimated_difficulty).toBe(3);
  });
});
