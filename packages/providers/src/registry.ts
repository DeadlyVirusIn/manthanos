// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// The provider registry — single source of truth for everything ManthanOS
// knows about a provider without invoking it. Discovery, doctor diagnostics,
// and cpt-probe adapter validation all read from this list.
//
// To add a new provider, add a single ProviderEntry below. There is no
// second list to keep in sync. There is no per-provider switch statement.

import type { ProviderEntry } from './types.js';

export const PROVIDER_REGISTRY: ReadonlyArray<ProviderEntry> = Object.freeze([
  {
    id: 'claude-cli',
    displayName: 'Claude (via Claude Code CLI)',
    integrationType: 'cli',
    authModes: ['oauth'],
    executable: 'claude',
    envVars: [],
    credentialFiles: [],
    costMode: 'subscription',
    supportsStructuredOutput: true,
    supportsCptProbe: true,
    adapterPackage: '@manthanos/adapter-claude-cli',
    status: 'implemented',
    runnableHint: '`claude` on PATH with active Claude Code session.',
    // Claude Code owns its own auth state; presence of the binary is
    // taken as evidence the host environment can invoke it.
    runnableIfBinary: true,
  },
  {
    id: 'openai',
    displayName: 'OpenAI (HTTP API)',
    integrationType: 'api',
    authModes: ['env'],
    envVars: ['OPENAI_API_KEY'],
    credentialFiles: [],
    costMode: 'api',
    supportsStructuredOutput: true,
    supportsCptProbe: true,
    adapterPackage: '@manthanos/adapter-openai',
    status: 'implemented',
    runnableHint: 'OPENAI_API_KEY set on a funded account.',
  },
  {
    id: 'codex-cli',
    displayName: 'OpenAI Codex (via codex CLI)',
    integrationType: 'cli',
    authModes: ['oauth', 'env'],
    executable: 'codex',
    envVars: ['OPENAI_API_KEY'],
    credentialFiles: [{ homeRelative: '.codex/auth.json', expiresAtField: 'expires_at' }],
    costMode: 'subscription',
    supportsStructuredOutput: false,
    supportsCptProbe: true,
    adapterPackage: '@manthanos/adapter-codex-cli',
    status: 'implemented',
    runnableHint:
      '`codex` on PATH; signed in via ChatGPT subscription (~/.codex/auth.json) or OPENAI_API_KEY set.',
  },
  {
    id: 'gemini-cli',
    displayName: 'Google Gemini (via gemini CLI)',
    integrationType: 'cli',
    authModes: ['oauth', 'env'],
    executable: 'gemini',
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    credentialFiles: [{ homeRelative: '.gemini/oauth_creds.json' }],
    costMode: 'subscription',
    supportsStructuredOutput: false,
    supportsCptProbe: true,
    adapterPackage: '@manthanos/adapter-gemini-cli',
    status: 'implemented',
    runnableHint:
      '`gemini` on PATH; signed in via Google account (~/.gemini/oauth_creds.json) or GEMINI_API_KEY/GOOGLE_API_KEY set.',
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot (via copilot CLI)',
    integrationType: 'cli',
    authModes: ['oauth', 'env'],
    executable: 'copilot',
    envVars: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
    credentialFiles: [{ homeRelative: '.copilot/config.json' }],
    costMode: 'subscription',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'detected-only',
    runnableHint:
      '`copilot` on PATH; signed in via GitHub (~/.copilot/config.json) or a GitHub token in env.',
  },
  {
    id: 'qwen',
    displayName: 'Alibaba Qwen (via qwen CLI)',
    integrationType: 'cli',
    authModes: ['oauth', 'env'],
    executable: 'qwen',
    envVars: ['QWEN_API_KEY'],
    credentialFiles: [
      { homeRelative: '.qwen/oauth_creds.json' },
      { homeRelative: '.qwen/config.json' },
    ],
    costMode: 'subscription',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'detected-only',
    runnableHint: '`qwen` on PATH; Qwen OAuth or QWEN_API_KEY set.',
  },
  {
    id: 'ollama',
    displayName: 'Ollama (local model server)',
    integrationType: 'local',
    authModes: ['local'],
    executable: 'ollama',
    envVars: [],
    credentialFiles: [],
    localEndpoint: 'http://localhost:11434/api/tags',
    costMode: 'local',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'detected-only',
    runnableHint: '`ollama` on PATH with the local daemon listening on :11434.',
  },
  {
    id: 'perplexity',
    displayName: 'Perplexity (HTTP API)',
    integrationType: 'api',
    authModes: ['env'],
    envVars: ['PERPLEXITY_API_KEY'],
    credentialFiles: [],
    costMode: 'api',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'planned',
    runnableHint: 'PERPLEXITY_API_KEY set.',
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter (HTTP API)',
    integrationType: 'api',
    authModes: ['env'],
    envVars: ['OPENROUTER_API_KEY'],
    credentialFiles: [],
    costMode: 'api',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'planned',
    runnableHint: 'OPENROUTER_API_KEY set.',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode (multi-provider CLI)',
    integrationType: 'cli',
    authModes: ['oauth'],
    executable: 'opencode',
    envVars: [],
    credentialFiles: [{ homeRelative: '.local/share/opencode/auth.json' }],
    costMode: 'unknown',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'detected-only',
    runnableHint: '`opencode` on PATH; auth managed by the opencode CLI itself.',
  },
  {
    id: 'cursor-agent',
    displayName: 'Cursor Agent (via agent CLI)',
    integrationType: 'cli',
    authModes: ['oauth', 'env'],
    executable: 'agent',
    envVars: ['CURSOR_API_KEY'],
    credentialFiles: [{ homeRelative: '.cursor/cli-config.json' }],
    costMode: 'subscription',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'planned',
    runnableHint:
      '`agent` on PATH (Cursor CLI) with Cursor session or CURSOR_API_KEY. Detection is conservative: identity must be confirmed separately.',
  },
  {
    id: 'vibe',
    displayName: 'Mistral (via vibe CLI)',
    integrationType: 'cli',
    authModes: ['env', 'oauth'],
    executable: 'vibe',
    envVars: ['MISTRAL_API_KEY'],
    credentialFiles: [{ homeRelative: '.vibe/.env' }, { homeRelative: '.vibe/config.toml' }],
    costMode: 'unknown',
    supportsStructuredOutput: false,
    supportsCptProbe: false,
    adapterPackage: null,
    status: 'planned',
    runnableHint: '`vibe` on PATH; MISTRAL_API_KEY or vibe config present.',
  },
]);

export function getProvider(id: string): ProviderEntry | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function listProviderIds(): ReadonlyArray<string> {
  return PROVIDER_REGISTRY.map((p) => p.id);
}

export function cptProbeAdapterIds(): ReadonlyArray<string> {
  return PROVIDER_REGISTRY.filter((p) => p.supportsCptProbe && p.status === 'implemented').map(
    (p) => p.id,
  );
}
