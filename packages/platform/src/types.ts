// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export type OsName = 'windows' | 'macos' | 'linux';
export type Arch = 'x64' | 'arm64' | 'arm' | 'ia32' | 'unknown';

export interface PlatformInfo {
  readonly os: OsName;
  readonly arch: Arch;
  readonly release: string;
  readonly isWSL: boolean;
  readonly isCI: boolean;
  readonly isTTY: boolean;
  readonly supportsAnsi: boolean;
  readonly userDataDir: string;
  readonly userCacheDir: string;
  readonly userLogDir: string;
  readonly tempDir: string;
}

export interface PathOps {
  /** Convert to POSIX (forward-slash) form for storage. */
  toPosix(p: string): string;
  /** Convert to OS-native form for execution / display. */
  toNative(p: string): string;
  /** Safe join — never string-concatenate paths. */
  join(...parts: string[]): string;
  /** Resolve to an absolute path. */
  resolve(...parts: string[]): string;
  /** Canonicalize a workspace root: absolute + realpath + posix-normalized. */
  canonicalizeWorkspaceRoot(p: string): Promise<string>;
  /** Check whether a path is inside a base directory (after canonicalization). */
  isInside(parent: string, child: string): Promise<boolean>;
}

export interface SpawnOptions {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  stdin?: 'inherit' | 'ignore' | 'pipe' | string;
  /**
   * When true, all three stdio streams are inherited from the parent
   * process. Used for interactive flows (OAuth in a TUI, sudo prompts)
   * that need a real terminal. Mutually exclusive with `stdin` as a
   * string payload; the literal-string-stdin form requires capture.
   * Result `stdout`/`stderr` are empty strings when inherit is set.
   */
  inherit?: boolean;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ProcessOps {
  spawn(opts: SpawnOptions): Promise<SpawnResult>;
  /** Locate an executable on PATH; handles .exe/.cmd/.ps1 on Windows. */
  which(bin: string): Promise<string | null>;
}

export interface FsOps {
  /** Atomic write: write to <path>.tmp, fsync, rename, fsync parent dir. */
  atomicWrite(path: string, content: Buffer | string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  /** Defensive: never readdir without sorting; ordering is deterministic. */
  readSortedDir(path: string): Promise<string[]>;
  /** Compute sha256 of file contents. */
  sha256OfFile(path: string): Promise<string>;
}

export interface TerminalOps {
  width(): number;
  height(): number;
  isInteractive(): boolean;
}

export interface SignalOps {
  onTermination(handler: () => void): () => void;
}

export interface LockInfo {
  pid: number;
  startedAt: string;
  host: string;
}

export interface LockOps {
  /** Acquire workspace lock per CRASH_CONSISTENCY §7. Returns false if held. */
  tryAcquire(lockPath: string): Promise<boolean>;
  /** Release the lock held by this process. */
  release(lockPath: string): Promise<void>;
  /** Read the current holder for diagnostics; returns null if absent. */
  inspect(lockPath: string): Promise<LockInfo | null>;
}

export interface Platform {
  readonly info: PlatformInfo;
  readonly path: PathOps;
  readonly process: ProcessOps;
  readonly fs: FsOps;
  readonly terminal: TerminalOps;
  readonly signals: SignalOps;
  readonly lock: LockOps;
}
