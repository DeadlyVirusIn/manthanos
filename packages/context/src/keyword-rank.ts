// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Keyword-based file ranker — Phase 1 only.
// Embeddings/semantic retrieval are deliberately deferred (per Phase 1
// constraints). This ranker uses path-component matching only.

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getPlatform } from '@manthanos/platform';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.manthan',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  '.idea',
  '.vscode',
  '__pycache__',
  'venv',
  '.venv',
  'target',
]);

const SOURCE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.scala',
  '.elm',
  '.ex',
  '.exs',
  '.lua',
  '.zig',
  '.sql',
  '.proto',
]);

const DOC_EXTS = new Set(['.md', '.mdx', '.rst', '.txt']);
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg']);

export interface KeywordRankOptions {
  readonly workspaceRoot: string;
  /** The task brief; tokenized into keywords. */
  readonly taskBrief: string;
  /** Maximum files to return. Default 8. */
  readonly topK?: number;
  /** Max file size to consider (bytes). Default 64KB. */
  readonly maxFileBytes?: number;
  /** Max files to crawl in total. Default 5000. */
  readonly maxCrawl?: number;
}

export interface RankedFile {
  readonly relPath: string;
  readonly score: number;
  readonly sizeBytes: number;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3);
}

function isSourcePath(p: string): boolean {
  const ext = path.extname(p);
  return SOURCE_EXTS.has(ext) || DOC_EXTS.has(ext) || CONFIG_EXTS.has(ext);
}

function scorePath(relPath: string, keywords: readonly string[]): number {
  const lower = relPath.toLowerCase();
  // Path-component matching: tokenize the path by separators + extension.
  const components = lower.split(/[\\\/._-]+/).filter((c) => c.length > 0);
  const set = new Set(components);

  let score = 0;
  for (const k of keywords) {
    if (set.has(k)) {
      score += 10;
    } else if (lower.includes(k)) {
      score += 3;
    }
  }

  // Boost source files; lower-rank docs and configs.
  const ext = path.extname(relPath);
  if (SOURCE_EXTS.has(ext)) score += 2;
  else if (DOC_EXTS.has(ext)) score += 0;
  else if (CONFIG_EXTS.has(ext)) score -= 1;

  return score;
}

async function walk(
  root: string,
  rel: string,
  onPath: (relPath: string) => boolean,
  budget: { remaining: number },
): Promise<void> {
  if (budget.remaining <= 0) return;
  const platform = getPlatform();
  const abs = rel ? path.join(root, rel) : root;
  let entries: string[];
  try {
    entries = await platform.fs.readSortedDir(abs);
  } catch {
    return;
  }
  for (const name of entries) {
    if (budget.remaining <= 0) return;
    if (SKIP_DIRS.has(name)) continue;
    const sub = rel ? path.join(rel, name) : name;
    const subAbs = path.join(root, sub);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(subAbs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walk(root, sub, onPath, budget);
    } else if (st.isFile()) {
      budget.remaining -= 1;
      const keep = onPath(sub);
      if (!keep) continue;
    }
  }
}

export async function rankByKeyword(opts: KeywordRankOptions): Promise<RankedFile[]> {
  const platform = getPlatform();
  const topK = opts.topK ?? 8;
  const maxBytes = opts.maxFileBytes ?? 64 * 1024;
  const keywords = tokenize(opts.taskBrief);
  if (keywords.length === 0) return [];

  const candidates: RankedFile[] = [];
  const budget = { remaining: opts.maxCrawl ?? 5000 };
  await walk(
    opts.workspaceRoot,
    '',
    (rel) => {
      if (!isSourcePath(rel)) return true;
      const score = scorePath(rel, keywords);
      if (score <= 0) return true;
      candidates.push({ relPath: platform.path.toPosix(rel), score, sizeBytes: 0 });
      return true;
    },
    budget,
  );

  // Filter by file size.
  const filtered: RankedFile[] = [];
  for (const c of candidates) {
    try {
      const st = await stat(path.join(opts.workspaceRoot, c.relPath));
      if (st.size <= maxBytes) {
        filtered.push({ ...c, sizeBytes: st.size });
      }
    } catch {
      // skip
    }
  }

  // Sort: score desc, then path asc (deterministic tiebreaker).
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
  });
  return filtered.slice(0, topK);
}
