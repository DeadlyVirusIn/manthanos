// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// `manthan experiments cpt-probe --adapter <id>` should accept only the
// ids that are both implemented and supportsCptProbe=true in the registry.

import { PROVIDER_REGISTRY, cptProbeAdapterIds } from '@manthanos/providers';
import { describe, expect, it } from 'vitest';
import { isAcceptedCptAdapter } from '../src/commands/experiments-cpt-probe.js';

describe('cpt-probe adapter acceptance (registry-driven)', () => {
  it('accepts the four implemented + cpt-enabled providers', () => {
    for (const id of ['claude-cli', 'openai', 'codex-cli', 'gemini-cli']) {
      expect(isAcceptedCptAdapter(id), `${id} should be accepted`).toBe(true);
    }
  });

  it('rejects detected-only and planned providers', () => {
    for (const p of PROVIDER_REGISTRY.filter((q) => q.status !== 'implemented')) {
      expect(isAcceptedCptAdapter(p.id), `${p.id} should not be accepted`).toBe(false);
    }
  });

  it('rejects clearly bogus inputs', () => {
    for (const v of ['', 'codex', 'gpt-4o', 'CLAUDE-CLI', 'codex_cli', 'undefined']) {
      expect(isAcceptedCptAdapter(v)).toBe(false);
    }
  });

  it('matches cptProbeAdapterIds() exactly', () => {
    const accepted = new Set<string>();
    for (const p of PROVIDER_REGISTRY) {
      if (isAcceptedCptAdapter(p.id)) accepted.add(p.id);
    }
    expect(accepted).toEqual(new Set(cptProbeAdapterIds()));
  });
});
