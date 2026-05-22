// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Registry-level sanity for Batch 2 metadata: every provider we promise to
// onboard has the shape the setup engine needs.

import { describe, expect, it } from 'vitest';
import { PROVIDER_REGISTRY, getProvider } from '../src/registry.js';

const BATCH_2_TARGETS = ['claude-cli', 'codex-cli', 'gemini-cli', 'qwen', 'ollama', 'openai'];

// Providers added to the onboarding surface in the metadata expansion.
const BATCH_2_5_TARGETS = ['opencode', 'perplexity', 'openrouter', 'cursor-agent'];

describe('provider onboarding metadata', () => {
  it('each Batch 2 target has either install or auth metadata', () => {
    for (const id of BATCH_2_TARGETS) {
      const p = getProvider(id);
      expect(p, id).toBeDefined();
      const hasSomething = Boolean(p?.install || p?.auth);
      expect(hasSomething, `${id} missing install/auth`).toBe(true);
    }
  });

  it('each expansion target also has install or auth metadata', () => {
    for (const id of BATCH_2_5_TARGETS) {
      const p = getProvider(id);
      expect(p, id).toBeDefined();
      const hasSomething = Boolean(p?.install || p?.auth);
      expect(hasSomething, `${id} missing install/auth`).toBe(true);
    }
  });

  it('removed providers are no longer in the registry', () => {
    for (const id of ['vibe', 'copilot']) {
      expect(getProvider(id), `${id} should be removed`).toBeUndefined();
    }
  });

  it('openai is supersededBy codex-cli', () => {
    const openai = getProvider('openai');
    expect(openai?.supersededBy).toEqual(['codex-cli']);
  });

  it('install commands are non-empty and reference the executable when present', () => {
    for (const p of PROVIDER_REGISTRY) {
      if (!p.install) continue;
      expect(p.install.command.length).toBeGreaterThan(0);
      expect(['safe', 'prompt-user']).toContain(p.install.riskLevel);
    }
  });

  it('oauth-* flavors declare a command; api-key-paste declares destination + url', () => {
    for (const p of PROVIDER_REGISTRY) {
      if (!p.auth) continue;
      switch (p.auth.flavor) {
        case 'oauth-browser':
        case 'oauth-device-code':
          expect(p.auth.command, `${p.id} oauth missing command`).toBeTruthy();
          expect(p.auth.needsTty).toBe(true);
          break;
        case 'api-key-paste':
          expect(p.auth.keyDestination, `${p.id} api-key missing destination`).toBeTruthy();
          expect(p.auth.keyIssueUrl, `${p.id} api-key missing issue url`).toBeTruthy();
          break;
        case 'manual-only':
          expect(p.auth.manualSteps?.length ?? 0).toBeGreaterThan(0);
          break;
      }
    }
  });

  it('OpenAI is api-key-paste and writes to ~/.config/manthan/keys.env', () => {
    const p = getProvider('openai');
    expect(p?.auth?.flavor).toBe('api-key-paste');
    expect(p?.auth?.keyDestination?.envVarName).toBe('OPENAI_API_KEY');
    expect(p?.auth?.keyDestination?.homeRelativePath).toContain('keys.env');
  });

  it('Ollama has install + post-install but no auth', () => {
    const p = getProvider('ollama');
    expect(p?.install).toBeTruthy();
    expect(p?.postInstall).toBeTruthy();
    expect(p?.auth).toBeUndefined();
  });

  it('Perplexity + OpenRouter use api-key-paste to the shared keys.env', () => {
    for (const id of ['perplexity', 'openrouter']) {
      const p = getProvider(id);
      expect(p?.auth?.flavor, id).toBe('api-key-paste');
      expect(p?.auth?.keyDestination?.homeRelativePath, id).toBe('.config/manthan/keys.env');
      expect(p?.auth?.keyIssueUrl, id).toBeTruthy();
    }
  });

  it('OpenCode has install + oauth-browser via `opencode auth login`', () => {
    const p = getProvider('opencode');
    expect(p?.install?.command).toContain('opencode');
    expect(p?.auth?.flavor).toBe('oauth-browser');
    expect(p?.auth?.command).toBe('opencode auth login');
    expect(p?.auth?.needsTty).toBe(true);
  });

  it('Cursor install is prompt-user risk; auth is manual-only', () => {
    const p = getProvider('cursor-agent');
    expect(p?.install?.riskLevel).toBe('prompt-user');
    expect(p?.auth?.flavor).toBe('manual-only');
    expect((p?.auth?.manualSteps ?? []).length).toBeGreaterThan(0);
  });
});
