// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

import { getPlatform } from '@manthanos/platform';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface GitDiffOptions {
  /** Include staged + unstaged + untracked summary. Default true. */
  readonly comprehensive?: boolean;
  /** Maximum size of diff content in bytes (truncated with notice if larger). */
  readonly maxBytes?: number;
}

export interface GitDiffResult {
  readonly content: string;
  readonly truncated: boolean;
  readonly hasUncommitted: boolean;
}

export async function gitDiff(
  workspaceRoot: string,
  opts: GitDiffOptions = {},
): Promise<GitDiffResult> {
  const platform = getPlatform();
  const max = opts.maxBytes ?? 64 * 1024;
  const comprehensive = opts.comprehensive ?? true;

  const gitBin = await platform.process.which('git');
  if (!gitBin) {
    return { content: '(git not found on PATH)', truncated: false, hasUncommitted: false };
  }

  const parts: string[] = [];

  // 1. Working tree status (concise).
  const status = await platform.process.spawn({
    command: gitBin,
    args: ['status', '--porcelain'],
    cwd: workspaceRoot,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  if (status.code === 0 && status.stdout.trim().length > 0) {
    parts.push('## git status\n');
    parts.push(status.stdout);
    parts.push('\n');
  }

  // 2. Diff of staged + unstaged.
  const diffArgs = ['diff', '--stat'];
  const diff = await platform.process.spawn({
    command: gitBin,
    args: diffArgs,
    cwd: workspaceRoot,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  if (diff.code === 0 && diff.stdout.length > 0) {
    parts.push('## git diff --stat\n');
    parts.push(diff.stdout);
    parts.push('\n');
  }

  if (comprehensive) {
    const fullDiff = await platform.process.spawn({
      command: gitBin,
      args: ['diff', '--unified=2', '--no-color'],
      cwd: workspaceRoot,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    if (fullDiff.code === 0 && fullDiff.stdout.length > 0) {
      parts.push('## git diff (working tree)\n');
      parts.push(fullDiff.stdout);
      parts.push('\n');
    }
  }

  const combined = parts.join('');
  const truncated = combined.length > max;
  const content = truncated
    ? `${combined.slice(0, max)}\n\n[truncated: original ${combined.length} bytes]`
    : combined;
  const hasUncommitted = status.stdout.trim().length > 0 || diff.stdout.length > 0;
  return { content, truncated, hasUncommitted };
}

export async function gitLog(workspaceRoot: string, maxCommits = 10): Promise<string> {
  const platform = getPlatform();
  const gitBin = await platform.process.which('git');
  if (!gitBin) return '';
  const result = await platform.process.spawn({
    command: gitBin,
    args: ['log', `--max-count=${maxCommits}`, '--oneline', '--no-decorate'],
    cwd: workspaceRoot,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  return result.code === 0 ? result.stdout : '';
}
