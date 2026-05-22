#!/usr/bin/env node
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Worker script for the multi-process workspace-lock concurrency test.
//
// Invoked via child_process.fork() with arguments from the parent.
// Writes its outcome to a JSON status file (path passed via argv[7])
// because IPC channel reliability across vitest pools / threads varies.
// The parent reads the status file after the child exits.

import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceLockedError, acquireWorkspaceLock } from '@manthanos/platform';

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

async function writeStatus(statusPath: string, outcome: WorkerOutcome): Promise<void> {
  await writeFile(statusPath, JSON.stringify(outcome), 'utf8');
}

async function main(): Promise<void> {
  const workspaceRoot = process.argv[2];
  const actor = (process.argv[3] ?? 'worker') as 'daemon' | 'cli' | 'worker';
  const holdMs = Number.parseInt(process.argv[4] ?? '50', 10);
  const acquisitionTimeoutMs = Number.parseInt(process.argv[5] ?? '0', 10);
  const appendCount = Number.parseInt(process.argv[6] ?? '10', 10);
  const statusPath = process.argv[7];

  if (!workspaceRoot || !statusPath) {
    process.stderr.write('worker: missing argv (workspaceRoot and statusPath required)\n');
    process.exitCode = 2;
    return;
  }

  try {
    const handle = await acquireWorkspaceLock(workspaceRoot, {
      actor,
      acquisitionTimeoutMs,
      heartbeatIntervalMs: 0,
    });

    const logPath = path.join(workspaceRoot, '.manthan', 'audit.test.log');
    for (let i = 0; i < appendCount; i++) {
      const line = `${handle.info.owner_id} ${process.pid} ${i}\n`;
      await appendFile(logPath, line, 'utf8');
      await new Promise((r) => setTimeout(r, holdMs / Math.max(1, appendCount)));
    }
    await handle.release();
    await writeStatus(statusPath, {
      type: 'acquired_and_released',
      owner_id: handle.info.owner_id,
      pid: process.pid,
      appended: appendCount,
    });
    await writeStatus(statusPath, {
      type: 'acquired_and_released',
      owner_id: handle.info.owner_id,
      pid: process.pid,
      appended: appendCount,
    });
  } catch (err) {
    if (err instanceof WorkspaceLockedError) {
      await writeStatus(statusPath, {
        type: 'blocked',
        pid: process.pid,
        peer_pid: err.peerInfo?.pid ?? null,
        peer_actor: err.peerInfo?.actor ?? null,
        reason: err.reason,
      });
      return;
    }
    const message = (err as Error)?.message ?? String(err);
    await writeStatus(statusPath, {
      type: 'error',
      pid: process.pid,
      message,
    });
    process.exitCode = 1;
  }
}

void main();
