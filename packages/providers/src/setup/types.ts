// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Public types for the provider-setup engine.

import type { ProviderEntry } from '../types.js';

export type PhaseId = 'detect' | 'install' | 'auth' | 'post-install' | 'verify';

export type PhaseStatus = 'skipped' | 'ok' | 'deferred' | 'failed' | 'aborted';

export interface PhaseResult {
  readonly phase: PhaseId;
  readonly status: PhaseStatus;
  /** Concise one-line message — what the user sees per phase. */
  readonly detail: string;
}

export interface ProviderSetupResult {
  readonly providerId: string;
  readonly displayName: string;
  /** Overall outcome — derived from the last phase that ran. */
  readonly outcome: 'ready' | 'deferred' | 'failed' | 'skipped';
  readonly phases: ReadonlyArray<PhaseResult>;
  /** When `outcome === 'deferred'`: path to a generated continuation script. */
  readonly deferredScriptPath?: string;
}

export interface SetupSummary {
  readonly attempted: ReadonlyArray<ProviderSetupResult>;
  readonly readyCount: number;
  readonly deferredCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly elapsedMs: number;
}

/** Prompt callback — abstracts readline so the engine stays testable. */
export interface PromptIo {
  /** Show a yes/no question. Returns true for yes. */
  confirm(question: string, opts?: { default?: boolean }): Promise<boolean>;
  /** Show a free-form prompt and read one line. */
  ask(question: string): Promise<string>;
  /** Read a secret (echo suppressed when possible). */
  askSecret(question: string): Promise<string>;
  /** Print one line of progress to the user. */
  log(line: string): void;
  /** Print one line and overwrite the previous if it's still on the line. */
  status(line: string): void;
  /** Print a header. */
  header(title: string, subtitle?: string): void;
}

export interface SetupEngineOptions {
  /** Subset of providers to consider; defaults to all in registry order. */
  readonly providerIds?: ReadonlyArray<string>;
  /**
   * Skip all confirmation prompts. Provider-specific risky commands
   * (riskLevel='prompt-user', or requiresSudo) still refuse to run in
   * non-interactive mode; they are deferred to a script instead.
   */
  readonly nonInteractive?: boolean;
  /** Don't execute anything; just report what would happen. */
  readonly dryRun?: boolean;
  /** Override TTY detection (tests). */
  readonly forceTty?: boolean;
  /** Override prompt I/O (tests). */
  readonly io?: PromptIo;
  /** Override "is this provider runnable?" probe (tests). */
  readonly probe?: (entry: ProviderEntry) => Promise<{ runnable: boolean; detail: string }>;
  /** Override the install/auth/post-install runners (tests). */
  readonly runners?: SetupRunners;
  /** Where to write deferred-flow continuation scripts. Defaults to ~/.manthan/. */
  readonly scriptDir?: string;
}

export interface SetupRunners {
  /** Execute the install command. Returns true on success. */
  install(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult>;
  /** Execute the auth flow. */
  auth(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult>;
  /** Execute the optional post-install action. */
  postInstall(entry: ProviderEntry, io: PromptIo): Promise<PhaseResult>;
}
