// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { type DeferredItem, emitDeferredScript } from './defer.js';
export { type DefaultIoOptions, createDefaultIo, isInteractiveTty } from './io.js';
export { authRunner, defaultRunners, installRunner, postInstallRunner } from './runners.js';
export { runProviderInstall, runProviderLogin, runSetup } from './engine.js';
export type {
  PhaseId,
  PhaseResult,
  PhaseStatus,
  PromptIo,
  ProviderSetupResult,
  SetupEngineOptions,
  SetupRunners,
  SetupSummary,
} from './types.js';
