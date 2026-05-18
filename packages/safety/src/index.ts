// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export {
  AUDIT_DECISION_AUTO_APPROVE,
  AUDIT_DECISION_HUMAN_APPROVED,
  computeSelfHash,
  GENESIS_PAYLOAD_HASH,
  sha256Hex,
  verifyChain,
} from './audit.js';
export type {
  AuditDecision,
  AuditEventBody,
  ChainedAuditEvent,
  ChainCheckResult,
} from './audit.js';

export { defaultPolicy } from './classifier.js';
export type { ActionKind, Decision, PolicyContext } from './classifier.js';

export { checkDenylist } from './denylist.js';
export type { DenylistMatch } from './denylist.js';

export { DEFAULT_SECRET_PATTERNS, redactSecrets } from './redactor.js';
export type { RedactionResult, SecretPattern } from './redactor.js';

export { scanGitHooks, relativeHookPath } from './git-hooks.js';
export type { GitHookSnapshot } from './git-hooks.js';
