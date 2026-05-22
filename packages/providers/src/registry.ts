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
    install: {
      command: 'npm install -g @anthropic-ai/claude-code',
      requiresSudo: false,
      riskLevel: 'safe',
      sourceUrl: 'https://docs.claude.com/en/docs/claude-code/setup',
    },
    auth: {
      flavor: 'manual-only',
      needsTty: false,
      manualSteps: [
        'Open Claude Code (the IDE / CLI host) and complete sign-in there.',
        'Once Claude Code reports an active session, `manthan doctor` will show Claude as ✓.',
      ],
    },
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
    auth: {
      flavor: 'api-key-paste',
      needsTty: true,
      keyIssueUrl: 'https://platform.openai.com/api-keys',
      keyDestination: {
        homeRelativePath: '.config/manthan/keys.env',
        envVarName: 'OPENAI_API_KEY',
      },
    },
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
    install: {
      command: 'npm install -g @openai/codex',
      requiresSudo: false,
      riskLevel: 'safe',
      sourceUrl: 'https://github.com/openai/codex',
    },
    auth: {
      flavor: 'oauth-browser',
      command: 'codex login',
      needsTty: true,
    },
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
    install: {
      command: 'npm install -g @google/gemini-cli',
      requiresSudo: false,
      riskLevel: 'safe',
      sourceUrl: 'https://github.com/google-gemini/gemini-cli',
    },
    auth: {
      flavor: 'oauth-browser',
      command: 'gemini',
      needsTty: true,
    },
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
    // No install metadata: the GitHub Copilot CLI story is split across
    // multiple shipping channels (gh-extension vs standalone binary) and
    // we will not encode a specific install command we cannot verify.
    // Auth is manual-only with explicit pointers; the user picks a channel.
    auth: {
      flavor: 'manual-only',
      needsTty: false,
      manualSteps: [
        'Pick a Copilot CLI channel that fits your setup:',
        '  Option A (recommended): `gh extension install github/gh-copilot` then `gh auth login`.',
        '  Option B: the standalone `copilot` binary if your organization provides one.',
        'After either path, ManthanOS detects: ~/.copilot/config.json or a GitHub token in env.',
        'Reference: https://docs.github.com/copilot/github-copilot-in-the-cli',
      ],
    },
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
    install: {
      command: 'npm install -g @qwen-code/qwen-code',
      requiresSudo: false,
      riskLevel: 'safe',
      sourceUrl: 'https://github.com/QwenLM/qwen-code',
    },
    auth: {
      flavor: 'oauth-browser',
      command: 'qwen',
      needsTty: true,
    },
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
    install: {
      command: 'curl -fsSL https://ollama.com/install.sh | sh',
      requiresSudo: true,
      riskLevel: 'prompt-user',
      sourceUrl: 'https://ollama.com/download',
    },
    postInstall: {
      description: 'Pull a small starter model (llama3.2:3b, ~2 GB)',
      command: 'ollama pull llama3.2:3b',
      optional: true,
    },
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
    auth: {
      flavor: 'api-key-paste',
      needsTty: true,
      keyIssueUrl: 'https://www.perplexity.ai/settings/api',
      keyDestination: {
        homeRelativePath: '.config/manthan/keys.env',
        envVarName: 'PERPLEXITY_API_KEY',
      },
    },
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
    auth: {
      flavor: 'api-key-paste',
      needsTty: true,
      keyIssueUrl: 'https://openrouter.ai/keys',
      keyDestination: {
        homeRelativePath: '.config/manthan/keys.env',
        envVarName: 'OPENROUTER_API_KEY',
      },
    },
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
    install: {
      command: 'npm install -g opencode-ai',
      requiresSudo: false,
      riskLevel: 'safe',
      sourceUrl: 'https://opencode.ai',
    },
    // OpenCode's auth flow is interactive (TUI menu that lets the user
    // configure provider-specific keys). Inherits stdio so the menu
    // renders correctly; the engine re-probes via auth.json afterwards.
    auth: {
      flavor: 'oauth-browser',
      command: 'opencode auth login',
      needsTty: true,
    },
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
    install: {
      command: 'curl -fsSL https://cursor.com/install | bash',
      requiresSudo: false,
      riskLevel: 'prompt-user',
      sourceUrl: 'https://cursor.com',
    },
    // Cursor's CLI inherits its session from the Cursor desktop app;
    // there is no headless OAuth flow we can drive. Manual steps point
    // the user at the desktop sign-in.
    auth: {
      flavor: 'manual-only',
      needsTty: false,
      manualSteps: [
        'Sign in to Cursor in the desktop app (the CLI inherits that session).',
        'After signing in, `agent --version` should work and ManthanOS will detect',
        '  ~/.cursor/cli-config.json or a CURSOR_API_KEY in env.',
        'Reference: https://cursor.com',
      ],
    },
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
