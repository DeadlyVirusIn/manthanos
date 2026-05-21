// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS provider connector foundation — public surface.

export type {
  ApiKeyDestination,
  AuthDetectionResult,
  AuthFlavor,
  AuthMode,
  AuthSource,
  AuthSpec,
  ClassifiedError,
  CostMode,
  CredentialFileSpec,
  InstallSpec,
  IntegrationType,
  PostInstallSpec,
  ProviderEntry,
  ProviderErrorClass,
  ProviderHealth,
  ProviderStatus,
} from './types.js';

export {
  type DeferredItem,
  type PhaseId,
  type PhaseResult,
  type PhaseStatus,
  type PromptIo,
  type ProviderSetupResult,
  type SetupEngineOptions,
  type SetupRunners,
  type SetupSummary,
  authRunner,
  createDefaultIo,
  defaultRunners,
  emitDeferredScript,
  installRunner,
  isInteractiveTty,
  postInstallRunner,
  runProviderInstall,
  runProviderLogin,
  runSetup,
} from './setup/index.js';

export {
  PROVIDER_REGISTRY,
  cptProbeAdapterIds,
  getProvider,
  listProviderIds,
} from './registry.js';

export { type DetectAuthOptions, detectAuth } from './auth.js';
export {
  type ProviderHealthOptions,
  defaultLocalHttpProbe,
  probeProviderHealth,
} from './health.js';
export {
  GEMINI_FALLBACK_MODELS,
  classifyProviderError,
  isGeminiQuotaExhausted,
} from './classify.js';
export { type BuildIsolatedEnvOptions, buildIsolatedEnv } from './env-iso.js';
export {
  type NonceWrap,
  type WrapOptions,
  nonceCollidesWithText,
  unwrapNonce,
  wrapWithNonce,
} from './nonce.js';
