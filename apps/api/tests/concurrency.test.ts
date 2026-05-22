// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Multi-process workspace-lock integrity test.
//
// Mandatory CI gate per Audit Review §6 (TEST-CONCURRENCY).
//
// Forks worker processes that each try to acquire the workspace lock, hold
// it briefly while appending tagged lines to an audit-like log file, and
// release. The worker writes its outcome to a JSON status file (more
// reliable across vitest pools than IPC). Verifies:
//   - the lock is held mutually exclusively (no interleaved tagged lines)
//   - both workers complete when both have a retry budget
//   - a worker with no budget is blocked with a WorkspaceLockedError
//   - the on-disk log is consistent with recorded outcomes

import { fork } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WorkspaceLockedError,
  acquireWorkspaceLock,
  inspectWorkspaceLock,
} from '@manthanos/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'workers', 'lock-worker.ts');

interface WorkerOutcome {
  type: 'acquired_and_released' | 'blocked' | 'error';
  owner_id?: string;
  pid: number;
  appended?: number;
  peer_pid?: number | null;
  peer_actor?: string | null;
  reason?: string;
  message?: string;
}

async function runWorker(
  workspaceRoot: string,
  statusPath: string,
  actor: 'daemon' | 'cli' | 'worker',
  holdMs: number,
  acquisitionTimeoutMs: number,
  appendCount: number,
): Promise<{ exitCode: number | null; outcome: WorkerOutcome | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = fork(
      WORKER_PATH,
      [
        workspaceRoot,
        actor,
        String(holdMs),
        String(acquisitionTimeoutMs),
        String(appendCount),
        statusPath,
      ],
      {
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', async (exitCode) => {
      let outcome: WorkerOutcome | null = null;
      try {
        const content = await readFile(statusPath, 'utf8');
        outcome = JSON.parse(content) as WorkerOutcome;
      } catch (err) {
        stderr += `\n[read-status error] ${(err as Error)?.message ?? String(err)}\n`;
      }
      resolve({ exitCode, outcome, stderr });
    });
  });
}

let workspaceRoot: string;
let statusDir: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), 'mws-conc-'));
  statusDir = await mkdtemp(path.join(tmpdir(), 'mws-stat-'));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(statusDir, { recursive: true, force: true });
});

describe('multi-process workspace-lock concurrency', () => {
  it('two workers serialize correctly when both have a retry budget', async () => {
    const HOLD_MS = 200;
    const COUNT = 10;
    const TIMEOUT_MS = 10_000;
    const status1 = path.join(statusDir, 'w1.json');
    const status2 = path.join(statusDir, 'w2.json');

    const [w1, w2] = await Promise.all([
      runWorker(workspaceRoot, status1, 'cli', HOLD_MS, TIMEOUT_MS, COUNT),
      runWorker(workspaceRoot, status2, 'cli', HOLD_MS, TIMEOUT_MS, COUNT),
    ]);

    expect(w1.exitCode, `w1 stderr: ${w1.stderr}`).toBe(0);
    expect(w2.exitCode, `w2 stderr: ${w2.stderr}`).toBe(0);
    expect(w1.outcome?.type, `w1 stderr: ${w1.stderr}`).toBe('acquired_and_released');
    expect(w2.outcome?.type, `w2 stderr: ${w2.stderr}`).toBe('acquired_and_released');
    expect(w1.outcome?.owner_id).not.toBe(w2.outcome?.owner_id);

    // Verify the log: each owner_id's lines must be contiguous.
    const logPath = path.join(workspaceRoot, '.manthan', 'audit.test.log');
    const log = await readFile(logPath, 'utf8');
    const lines = log.trim().split('\n');
    expect(lines.length).toBe(2 * COUNT);

    const ownerOrder: string[] = [];
    for (const line of lines) {
      const [ownerId] = line.split(' ');
      if (ownerOrder.length === 0 || ownerOrder[ownerOrder.length - 1] !== ownerId) {
        ownerOrder.push(ownerId ?? '');
      }
    }
    // Mutual exclusion: exactly two contiguous runs of owner_id.
    expect(ownerOrder.length).toBe(2);
    expect(new Set(ownerOrder).size).toBe(2);

    // Lock file released.
    const final = await inspectWorkspaceLock(workspaceRoot);
    expect(final).toBeNull();
  }, 25_000);

  it('a worker with no retry budget is blocked when peer holds the lock', async () => {
    const inProcess = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    try {
      const status = path.join(statusDir, 'blocked.json');
      const blocked = await runWorker(workspaceRoot, status, 'cli', 0, 0, 0);
      expect(blocked.exitCode, `stderr: ${blocked.stderr}`).toBe(0);
      expect(blocked.outcome?.type).toBe('blocked');
      expect(blocked.outcome?.peer_pid).toBe(process.pid);
      expect(blocked.outcome?.peer_actor).toBe('daemon');
      expect(blocked.outcome?.reason).toBe('live_peer');

      // No audit log writes from a blocked worker.
      const logPath = path.join(workspaceRoot, '.manthan', 'audit.test.log');
      await expect(readFile(logPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await inProcess.release();
    }
  }, 15_000);

  it('a worker recovers after the in-process lock is released', async () => {
    const inProcess = await acquireWorkspaceLock(workspaceRoot, {
      actor: 'daemon',
      heartbeatIntervalMs: 0,
    });
    setTimeout(() => {
      void inProcess.release();
    }, 200);

    const status = path.join(statusDir, 'recover.json');
    const w = await runWorker(workspaceRoot, status, 'cli', 50, 5_000, 5);
    expect(w.exitCode, `stderr: ${w.stderr}`).toBe(0);
    expect(w.outcome?.type).toBe('acquired_and_released');
    expect(w.outcome?.appended).toBe(5);
  }, 15_000);
});

describe('audited-write paths must funnel through the lock', () => {
  // Static check: Task 2 source contains zero direct auditedWrite call
  // sites. Tasks 3-10 will add them, all inside the daemon's lock window
  // (the daemon holds the lock for its entire lifetime per server.ts).

  it('apps/api source contains no direct auditedWrite call sites in Task 2', async () => {
    const apiSrc = path.join(__dirname, '..', 'src');
    const files = await listSourceFiles(apiSrc);
    const offenders: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.ts')) continue;
      const content = await readFile(file, 'utf8');
      if (/\bauditedWrite\s*\(/.test(content)) {
        offenders.push(path.relative(apiSrc, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = await readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

// Touch unused import to satisfy lint without removing the symbol.
void WorkspaceLockedError;
