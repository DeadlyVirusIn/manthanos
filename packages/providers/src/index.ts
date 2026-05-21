// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// ManthanOS provider connector foundation — public surface.

export type {
  AuthDetectionResult,
  AuthMode,
  AuthSource,
  ClassifiedError,
  CostMode,
  CredentialFileSpec,
  IntegrationType,
  ProviderEntry,
  ProviderErrorClass,
  ProviderHealth,
  ProviderStatus,
} from './types.js';

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
