// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// UX-2A regression test: pure-function test of the phase-event
// renderer. Pin exact wording so a future "polish" pass can't slip
// in anthropomorphic / hype / fabricated-progress language.

import type { PhaseEvent } from '@manthanos/orchestrator';
import { describe, expect, it } from 'vitest';
import { formatPhaseEvent } from '../src/commands/plan.js';

const BANNED = [
  'thinking',
  'working hard',
  'almost there',
  'just a moment',
  'beep boop',
  'magical',
  'intelligent',
  'smart',
  'ai is',
  'ai will',
  'guaranteed',
  'remembered',
  'understood',
];

function render(event: PhaseEvent): string {
  return formatPhaseEvent(event).join('\n');
}

describe('formatPhaseEvent', () => {
  it('bundle_ready renders one line with real counts and est cost', () => {
    const out = render({
      kind: 'bundle_ready',
      trustedFactsInBundle: 6,
      quarantineFactsExcluded: 8,
      estimatedTokens: 1234,
      estCostUsdMicro: 12_345,
    });
    expect(out).toBe(
      '[manthan] bundle ready: 6 trusted facts, 8 quarantine excluded, ~1234 tokens, est input cost $0.0123',
    );
  });

  it('adapter_invoke_start names the adapter without ETA', () => {
    const out = render({ kind: 'adapter_invoke_start', adapterId: 'anthropic-cli:sonnet' });
    expect(out).toBe('[manthan] calling anthropic-cli:sonnet...');
    // Discipline: must NOT include any time-estimate language. The
    // heartbeat handles "still waiting"; the start line just states
    // what is about to happen.
    expect(out.toLowerCase()).not.toContain('typical');
    expect(out.toLowerCase()).not.toContain('seconds');
    expect(out.toLowerCase()).not.toContain('eta');
  });

  it('adapter_invoke_heartbeat reports elapsed time in whole seconds', () => {
    expect(render({ kind: 'adapter_invoke_heartbeat', elapsedMs: 60_500 })).toBe(
      '[manthan] still waiting (61s elapsed)',
    );
    expect(render({ kind: 'adapter_invoke_heartbeat', elapsedMs: 120_000 })).toBe(
      '[manthan] still waiting (120s elapsed)',
    );
  });

  it('adapter_invoke_done reports real token count and elapsed time', () => {
    expect(render({ kind: 'adapter_invoke_done', outputTokens: 11_954, elapsedMs: 228_577 })).toBe(
      '[manthan] response received: 11954 tokens in 229s',
    );
  });

  it('extracted reports real fact count (singular/plural)', () => {
    expect(render({ kind: 'extracted', factsRecorded: 0 })).toBe(
      '[manthan] extracted plan; recorded 0 new facts for review',
    );
    expect(render({ kind: 'extracted', factsRecorded: 1 })).toBe(
      '[manthan] extracted plan; recorded 1 new fact for review',
    );
    expect(render({ kind: 'extracted', factsRecorded: 5 })).toBe(
      '[manthan] extracted plan; recorded 5 new facts for review',
    );
  });

  it('avoids anthropomorphic / hype / fabricated-progress wording in every shape', () => {
    const cases: PhaseEvent[] = [
      {
        kind: 'bundle_ready',
        trustedFactsInBundle: 3,
        quarantineFactsExcluded: 0,
        estimatedTokens: 100,
        estCostUsdMicro: 200,
      },
      { kind: 'adapter_invoke_start', adapterId: 'stub:test' },
      { kind: 'adapter_invoke_heartbeat', elapsedMs: 45_000 },
      { kind: 'adapter_invoke_done', outputTokens: 100, elapsedMs: 30_000 },
      { kind: 'extracted', factsRecorded: 2 },
    ];
    for (const ev of cases) {
      const lower = render(ev).toLowerCase();
      for (const banned of BANNED) {
        expect(lower).not.toContain(banned);
      }
    }
  });

  it('every line starts with the [manthan] prefix', () => {
    const cases: PhaseEvent[] = [
      {
        kind: 'bundle_ready',
        trustedFactsInBundle: 0,
        quarantineFactsExcluded: 0,
        estimatedTokens: 0,
        estCostUsdMicro: 0,
      },
      { kind: 'adapter_invoke_start', adapterId: 'x' },
      { kind: 'adapter_invoke_heartbeat', elapsedMs: 1000 },
      { kind: 'adapter_invoke_done', outputTokens: 0, elapsedMs: 0 },
      { kind: 'extracted', factsRecorded: 0 },
    ];
    for (const ev of cases) {
      for (const line of formatPhaseEvent(ev)) {
        expect(line.startsWith('[manthan] ')).toBe(true);
      }
    }
  });
});
