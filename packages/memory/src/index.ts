// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { openDb } from './db.js';
export type { ManthanDb, ManthanSqliteHandle, OpenDbOptions } from './db.js';

export { createBlobStore } from './blob-store.js';
export type { BlobStore } from './blob-store.js';

export { auditedWrite, AsyncMutex } from './audited-write.js';
export type {
  AuditedWriteContext,
  AuditedWriteInput,
  AuditedWriteResult,
} from './audited-write.js';

export { runRecovery } from './recovery.js';
export type {
  RecoveryFinding,
  RecoveryFindingCategory,
  RecoveryInput,
  RecoveryReport,
  RecoveryStatus,
} from './recovery.js';

export { MIGRATIONS } from './schema.js';
