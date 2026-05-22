// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS provider connector foundation — shared types.
//
// A ProviderEntry is the single source of truth for everything about a
// provider that ManthanOS needs to know without invoking it: how to
// detect it, how to detect its auth, what kind of integration it is,
// whether `cpt-probe` can use it today.

export type IntegrationType = 'cli' | 'api' | 'local';
export type AuthMode = 'oauth' | 'env' | 'local' | 'none';
export type CostMode = 'subscription' | 'api' | 'local' | 'unknown';
export type ProviderStatus = 'implemented' | 'detected-only' | 'planned';
export type AuthSource = 'oauth' | 'env' | 'local' | 'none' | 'unknown';

export interface CredentialFileSpec {
  /** Path relative to $HOME (POSIX-style; the resolver expands and normalizes). */
  readonly homeRelative: string;
  /** Optional JSON field probed for an `expires_at` epoch (seconds or ms). */
  readonly expiresAtField?: string;
}

export interface ProviderEntry {
  readonly id: string;
  readonly displayName: string;
  readonly integrationType: IntegrationType;
  readonly authModes: ReadonlyArray<AuthMode>;
  /** Executable name on PATH if integrationType === 'cli'. */
  readonly executable?: string;
  /** Env vars consulted, in precedence order. First-match wins. */
  readonly envVars: ReadonlyArray<string>;
  /** On-disk credential files consulted, in precedence order. */
  readonly credentialFiles: ReadonlyArray<CredentialFileSpec>;
  /** For local providers (Ollama): an http(s) endpoint probed to confirm liveness. */
  readonly localEndpoint?: string;
  readonly costMode: CostMode;
  readonly supportsStructuredOutput: boolean;
  /** True iff `manthan experiments cpt-probe --adapter <id>` accepts this id. */
  readonly supportsCptProbe: boolean;
  /** Workspace package name if an adapter exists; null if not. */
  readonly adapterPackage: string | null;
  readonly status: ProviderStatus;
  /** Short one-line description of what makes this provider "runnable". */
  readonly runnableHint: string;
  /**
   * When true, the CLI's binary being present on PATH is treated as
   * "runnable" even if no env var or credential file is detected.
   * Reserved for providers that manage their own auth state inside the
   * CLI host (e.g. Claude Code's session), where ManthanOS cannot
   * mechanically verify auth without invoking the CLI.
   */
  readonly runnableIfBinary?: boolean;
  /** How to install the binary, when applicable. */
  readonly install?: InstallSpec;
  /** How to authenticate, when applicable. */
  readonly auth?: AuthSpec;
  /** Optional post-install action (e.g. Ollama starter model pull). */
  readonly postInstall?: PostInstallSpec;
  /**
   * When any of the listed provider ids is currently runnable, this
   * provider is treated as "already covered" by that account/session.
   * Doctor displays a `→` mark and "covered by …" message instead of
   * "✗ needs setup", and `manthan setup` skips it.
   *
   * Used for providers that share an underlying account (e.g. OpenAI
   * HTTP API is covered by an active Codex CLI session — both consume
   * the same OpenAI account). Does not affect cpt-probe acceptance:
   * the user can still pick `--adapter openai` if they want the
   * API-key path specifically.
   */
  readonly supersededBy?: ReadonlyArray<string>;
}

export interface AuthDetectionResult {
  readonly source: AuthSource;
  /** Resolved absolute path to a credential file when `source === 'oauth'`. */
  readonly credentialPath?: string;
  /** Env var name when `source === 'env'`. */
  readonly envVar?: string;
  /** Epoch-ms expiry if known and parseable. */
  readonly expiresAtMs?: number;
  /** True iff `expiresAtMs` is in the past. */
  readonly expired?: boolean;
  /** Short human-readable explanation for diagnostics. */
  readonly detail: string;
}

export interface ProviderHealth {
  readonly providerId: string;
  readonly binaryFound: boolean;
  readonly binaryPath?: string;
  readonly auth: AuthDetectionResult;
  readonly localReachable?: boolean;
  readonly runnable: boolean;
  /** Concise next-step a novice operator can act on. Empty when runnable. */
  readonly nextAction: string;
  /** Set when this provider is `supersededBy` another runnable provider. */
  readonly supersededBy?: { providerId: string; displayName: string };
}

/**
 * How a novice gets the binary on their machine. Omit on `install` for
 * providers that need no install step (e.g. API-only providers).
 */
export interface InstallSpec {
  /** Exact shell command. May contain `|`/`&&`; runs via bash -c when so. */
  readonly command: string;
  /** True when the install command itself elevates (e.g. `sudo`). */
  readonly requiresSudo: boolean;
  /**
   *  - 'safe': the command is widely-trusted (npm install -g) and runs after
   *    a single confirm.
   *  - 'prompt-user': the command is heavier (`curl | sh`, system service
   *    install) and gets an extra explicit confirmation.
   */
  readonly riskLevel: 'safe' | 'prompt-user';
  /** Defaults to `<executable> --version`. Used to confirm install worked. */
  readonly verifyCommand?: string;
  /** Source URL the command was taken from; shown in --dry-run output. */
  readonly sourceUrl?: string;
}

/** Four supported auth flavors, plus the trivially-no-auth shape (absence). */
export type AuthFlavor = 'oauth-browser' | 'oauth-device-code' | 'api-key-paste' | 'manual-only';

/** Where an api-key-paste flow writes the user's key. */
export interface ApiKeyDestination {
  /** Path relative to $HOME, e.g. ".config/manthan/keys.env". */
  readonly homeRelativePath: string;
  /** Variable name written into the env file as KEY=VALUE. */
  readonly envVarName: string;
}

export interface AuthSpec {
  readonly flavor: AuthFlavor;
  /** Command to drive the auth flow. Required for oauth-* flavors. */
  readonly command?: string;
  /**
   * True when the auth command takes over the terminal (browser OAuth, TUI).
   * The setup engine refuses to run such flows in a non-TTY shell and
   * instead emits a script the user can run elsewhere.
   */
  readonly needsTty: boolean;
  /** For api-key-paste: where the user issues a key. Shown verbatim. */
  readonly keyIssueUrl?: string;
  /** For api-key-paste: where to persist the key. */
  readonly keyDestination?: ApiKeyDestination;
  /** For manual-only: ordered steps printed to the user. */
  readonly manualSteps?: ReadonlyArray<string>;
}

/** Optional post-install nicety (e.g. Ollama: pull a starter model). */
export interface PostInstallSpec {
  /** Shown to the user as "would you like to <description>?". */
  readonly description: string;
  readonly command: string;
  /** When true, the user is prompted; when false, runs automatically. */
  readonly optional: boolean;
}

export type ProviderErrorClass =
  | 'auth'
  | 'missing_binary'
  | 'quota_exhausted'
  | 'model_not_found'
  | 'timeout'
  | 'schema_rejection'
  | 'transient'
  | 'unknown';

export interface ClassifiedError {
  readonly class: ProviderErrorClass;
  readonly matchedPattern?: string;
  readonly retriable: boolean;
}
