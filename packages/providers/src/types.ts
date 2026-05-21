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
