# ManthanOS — Platform Abstraction Layer (PAL)

> The contract by which ManthanOS touches the operating system.
> Status: design lock — pre-implementation.

---

## 1. Purpose

ManthanOS is a cross-platform engineering runtime. Windows, macOS,
and Linux are equal first-class targets. WSL is an acceptable
fallback for users who prefer it, but it is never the primary
Windows strategy.

The Platform Abstraction Layer (PAL) is the **single seam** through
which ManthanOS touches the host OS. Every component above the PAL
is OS-agnostic. Every OS-specific decision lives below the PAL.

The PAL is not optional. The architecture rule that supports the
cross-platform commitment is:

> If a file imports `child_process`, `fs.watch`, `os`, `tty`, or
> hand-built path strings, it must live inside `packages/platform`.
> Everywhere else, those imports are an ESLint error.

This rule is what makes Windows support sustainable. Without a
single seam, platform-specific code metastasizes; with one, it is
audited and tested.

---

## 2. Non-goals

- The PAL is not a general-purpose cross-platform toolkit. It exposes
  only the primitives the ManthanOS runtime needs.
- It is not a shell scripting framework. Workflows do not assemble
  shell strings. They invoke processes with argv arrays.
- It does not abstract everything; some things (e.g., the npm
  registry, HTTPS) are inherently cross-platform via Node and need
  no abstraction.
- It is not a sandbox. Sandboxing has its own contract
  (`SandboxAdapter`) layered above the PAL.

---

## 2b. Scope: PAL-v0 vs PAL-full

The full PAL surface described in §3 is the **target**. Building it
all before `manthan init` exists is overengineering — and the review
flagged this explicitly. The MVP delivers **PAL-v0**, a strict subset.
Later phases extend toward PAL-full.

**PAL-v0 (Phase 0–1):**

- `PlatformInfo` (OS, arch, isTTY, isWSL, userDataDir / userCacheDir /
  userLogDir / tempDir).
- `PathOps`: `toPosix`, `toNative`, `join`, `resolve`,
  `canonicalizeWorkspaceRoot`.
- `ProcessOps`: `spawn` (argv-based), `which`. **No** `runInShell`
  (deferred — workflows must spawn directly in v0).
- `FsOps`: `ensureDir`, `atomicWrite`. **No** `setFileMode` POSIX-only
  helper yet (use Node `fs.chmod` directly in PAL-internal code).
- `TerminalOps`: `width`, `height`, `isInteractive`, `enableUnicode`.
- `SignalOps`: `onTermination` (SIGINT + SIGTERM + Windows console-close
  equivalents).
- Lint enforcement (§16) is enforced from Phase 0.

**Deferred to PAL-full (Phase 2–4):**

- `WatchOps` (chokidar-based file watching) — first needed for
  observability `manthan audit tail -f`.
- `ShellAdapter` + `ProcessOps.runInShell` — first needed when user
  hooks / custom shell workflows arrive (Phase 4+).
- Named-pipe / IPC abstractions — first needed when `manthand`
  daemon arrives (Phase 4+).
- `setFileMode` with Windows ACL helper — first needed when secrets
  storage hardens (Phase 5).
- Sandbox primitives — Phase 5+ (per SAFETY_MODEL.md §15 roadmap).

**Rule:** any primitive not in PAL-v0 must not be imported by Phase
0–1 code. The ESLint rule (§16) is configured per-phase: PAL-full
APIs not yet shipped throw a clear "not implemented in Phase X"
error rather than failing silently.

## 3. Contract overview

The PAL exports the following primitives. Names are illustrative;
exact API may evolve before code is written. **PAL-v0 subset is
marked inline with `[v0]`** — everything else is deferred per §2b.

```ts
export interface PlatformInfo {
  os: 'windows' | 'macos' | 'linux';
  arch: 'x64' | 'arm64' | 'arm' | 'ia32';
  release: string;
  shell: ShellInfo;          // resolved default shell
  isWSL: boolean;            // true when running on Linux inside WSL
  isCI: boolean;             // env-driven heuristic
  isTTY: boolean;
  supportsAnsi: boolean;
  supportsUnicode: boolean;
  userDataDir: string;       // env-paths resolved
  userCacheDir: string;
  userLogDir: string;
  tempDir: string;
}

export interface PathOps {
  // Always work in POSIX style internally for storage.
  toPosix(p: string): string;
  toNative(p: string): string;
  // Safe joins; never use string concatenation for paths anywhere.
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  // Canonicalize a workspace root: absolute + symlink-resolved +
  // case-normalized on case-insensitive filesystems.
  canonicalizeWorkspaceRoot(p: string): Promise<string>;
}

export interface ProcessOps {
  // Spawn with argv array; never composes a shell command line.
  spawn(opts: SpawnOptions): Promise<SpawnResult>;
  // For commands that genuinely need a shell (rare), pick the right one.
  // Caller passes a structured CommandPlan, not a string.
  runInShell(plan: ShellCommandPlan): Promise<SpawnResult>;
  // Resolve an executable on PATH (handles .exe / .cmd / .ps1 on Windows).
  which(bin: string): Promise<string | null>;
}

export interface FsOps {
  // All FS ops via PAL when the operation has cross-platform pitfalls.
  ensureDir(p: string): Promise<void>;
  atomicWrite(p: string, content: Buffer | string): Promise<void>; // tmp + rename
  // chmod is a no-op on Windows but PAL still records intent.
  setFileMode(p: string, mode: number): Promise<void>;
}

export interface WatchOps {
  // Always chokidar-based; never fs.watch.
  watch(paths: string[], opts: WatchOpts): Watcher;
}

export interface ShellAdapter {
  // Default shell choice per OS.
  default(): ShellInfo;
  // Quote an argument correctly for the chosen shell.
  quoteArg(arg: string, shell: ShellInfo): string;
}

export interface TerminalOps {
  width(): number;
  height(): number;
  enableUnicode(): void;     // on Windows, sets console output to UTF-8
  isInteractive(): boolean;
}

export interface SignalOps {
  // Cross-platform abstraction over termination signals.
  onTermination(handler: () => void): void;
}
```

The exported `Platform` is the bundle:

```ts
export interface Platform {
  info: PlatformInfo;
  path: PathOps;
  process: ProcessOps;
  fs: FsOps;
  watch: WatchOps;
  shell: ShellAdapter;
  terminal: TerminalOps;
  signals: SignalOps;
}
```

Components above the PAL receive `Platform` via dependency injection.
Singletons are allowed for the default instance, but tests substitute
a mock `Platform`.

---

## 4. Path handling

**Internal representation:** POSIX-style (forward slashes), absolute
where possible. This is what gets stored in the database and the
audit log.

**External (filesystem) representation:** OS-native. Conversion is
done by `path.toNative` / `path.toPosix` at the boundary.

**Workspace identity:** `path.canonicalizeWorkspaceRoot` performs:

1. `path.resolve` to make absolute.
2. `fs.realpath` to dereference symlinks.
3. On case-insensitive filesystems (macOS HFS+/APFS default, Windows
   NTFS), case-fold using a recorded canonical case (read the
   directory entry and use the actual on-disk casing).
4. POSIX-normalize.

This is the only correct identity. Two CLI invocations that resolve
to the same directory must produce the same workspace ID.

**Forbidden patterns:**

```ts
// ❌ Wrong
const file = root + '/' + 'docs' + '/' + name;
const home = process.env.HOME;
spawn('bash', ['-c', `cd ${dir} && git status`]);

// ✅ Correct
const file = platform.path.join(root, 'docs', name);
const home = platform.info.userDataDir;
await platform.process.spawn({
  command: 'git',
  args: ['status'],
  cwd: dir,
});
```

---

## 5. Process & shell execution

**Default rule: do not use a shell.** Spawn `git`, `node`, etc. with
argv arrays. This avoids quoting bugs (especially on Windows) and
eliminates shell injection.

```ts
// process.spawn signature
interface SpawnOptions {
  command: string;            // resolved via PATH or absolute
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: 'inherit' | 'ignore' | 'pipe' | string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}
```

**Shell-only path:** for commands that truly require a shell (e.g.,
user-defined hooks), the caller passes a `ShellCommandPlan`:

```ts
interface ShellCommandPlan {
  // The intent is described separately from the rendered string.
  describe: string;             // for audit log
  shell?: 'auto' | 'pwsh' | 'bash' | 'zsh' | 'cmd' | 'sh';
  script: string;               // already-validated by caller
  cwd?: string;
  env?: Record<string, string>;
}
```

`runInShell`:
- On Windows, prefers `pwsh` (PowerShell Core) if available; falls
  back to `powershell` (Windows PowerShell 5.1); falls back to `cmd`.
- On macOS, uses the user's `$SHELL` (commonly zsh).
- On Linux, uses the user's `$SHELL` (commonly bash).
- Always passes the script via stdin or a temp file (`-File` on
  PowerShell; `-` on POSIX shells), never as a `-c` argument with
  embedded interpolation.

**Quoting:** `shell.quoteArg` is the single source of truth. PowerShell
quoting rules differ materially from POSIX; PAL gets it right once.

**PowerShell ExecutionPolicy.** On many corporate Windows machines,
`pwsh` scripts are blocked by `ExecutionPolicy=Restricted` or
`AllSigned`. PAL's `runInShell` must address this:

1. **Detection.** On Windows, PAL runs `Get-ExecutionPolicy -List` at
   PAL initialization and records the effective policy.
2. **Invocation strategy.** For PowerShell, PAL always invokes with
   `-NoProfile -NonInteractive -ExecutionPolicy Bypass -InputFormat None`.
   This bypasses the user's ExecutionPolicy for the runtime's own
   shell calls without changing the machine-wide setting.
3. **Honest scope.** The `-ExecutionPolicy Bypass` flag is allowed
   for **command-line invocations** by default on most policies, but
   some hardened group policies disable it. If PAL detects an
   environment where `Bypass` is itself denied, it surfaces a
   precise error rather than failing silently:
   ```
   PowerShell ExecutionPolicy disallows -Bypass on this machine.
   Workflows requiring a PowerShell shell will fail until policy is
   adjusted (consult your administrator). POSIX-equivalent shells
   (bash via Git for Windows, sh) remain available as a fallback.
   ```
4. **Audit recording.** Every `runInShell` call records the effective
   `ExecutionPolicy` at invocation time in the audit event, so policy
   changes are detectable in the log.

---

## 6. Filesystem operations

**Atomic writes:** every write that must survive a crash uses
`atomicWrite` — write to a sibling `*.tmp` file in the same directory,
fsync, then rename. On Windows, the rename uses `MoveFileExW` with
`MOVEFILE_REPLACE_EXISTING` (Node 14+ rename behavior is correct).

**File modes:** Linux/macOS use POSIX mode bits. Windows ignores most
mode bits. PAL records the *intent* and applies what the OS supports.
Sensitive files (e.g., the SQLite brain) are protected on Windows via
ACLs only when the user opts in; the default protection is "the file
lives under the user's profile directory, which OS ACLs already cover."

**Line endings:** All text files are written with LF internally
(`audit.log`, JSONL transcripts, config files). When a workflow
produces user-facing output to disk, the platform's native EOL is
applied at write time. Stored content does not vary by OS.

**Case sensitivity:** Treat the filesystem as case-sensitive in code.
Never depend on case-folding to find a file. When listing a directory
to detect a known filename, read entries and compare canonically.

**Case-canonicalization for workspace identity** (workspace ID and
brain keys). On case-insensitive filesystems (macOS HFS+/APFS
default, Windows NTFS default), `Repo.ts` and `repo.ts` are the same
file. If the workspace ID or brain keys depend on case, the brain
fragments when a repo migrates between OSes.

PAL's `canonicalizeWorkspaceRoot` returns the **on-disk casing** of
each path segment by reading directory entries and comparing
case-insensitively. The returned canonical form is what gets hashed
into the workspace ID. This ensures identity stability across OS
migrations.

The brain stores file paths in their on-disk-canonical form. A path
provided by the user (e.g., `manthan brain decisions --file=README.md`)
is canonicalized before lookup. Two paths that differ only in case
on a case-insensitive filesystem resolve to the same brain key.

**PATH vs Path on Windows.** Node's `process.env` is case-sensitive,
but Windows environment variables are case-insensitive (`PATH` and
`Path` are the same variable to the OS). The PAL exposes a
case-insensitive `getEnv(name)` helper for lookups that may vary by
OS convention. Direct `process.env.PATH` access in non-PAL code is
discouraged; the lint rule forbids it.

**Long paths on Windows:** Use the `\\?\` long-path prefix in PAL when
constructing absolute paths longer than 260 characters (Node handles
this automatically in modern releases; PAL still verifies).

**Honest scope of `\\?\` long-path handling.** PAL applies the prefix
for paths PAL constructs. PAL **cannot** force the prefix on paths
constructed by:

- The user (e.g., `manthan init` invoked from a 280-char `cwd`).
- Third-party libraries (some npm packages do not handle the prefix).
- `git` itself in certain operations on long paths within deep
  `node_modules`.

Mitigations:

1. **Init-time path-length check.** `manthan init` measures the
   workspace path length. If > 200 chars, it warns the user and
   recommends moving the workspace closer to the drive root.
2. **Pre-spawn validation.** `process.spawn` checks the resolved
   `cwd` length. If a `cwd` with > 240 chars is about to be passed
   to a process known not to handle long paths (git pre-2.36,
   certain build tools), PAL emits a precise warning before the
   spawn rather than a confusing downstream error.
3. **Long-path support detection.** On Windows, PAL reads
   `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled`
   (registry) and `git config --global core.longpaths` at startup,
   recording the result for diagnostics. `manthan doctor` surfaces
   when either is not enabled and recommends enabling them.

The honest summary: long paths on Windows are a hostile environment
no abstraction fully solves. PAL surfaces the constraint early; the
user is informed; failures are precise, not cryptic.

---

## 7. File watching

`fs.watch` is broken on every OS in different ways. PAL uses
**chokidar** uniformly. Reasons:

- On Windows, `fs.watch` doesn't report renames consistently.
- On macOS, `fs.watch` events are coarse (directory-level).
- On Linux, `fs.watch` has inotify limits and silent failure modes.

`watch.watch` returns a `Watcher` with a stable event vocabulary:

```ts
interface Watcher {
  on(event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir',
     fn: (path: string) => void): this;
  close(): Promise<void>;
}
```

Workflows that watch files (e.g., `manthan watch`) never see the
underlying difference.

---

## 8. Terminal & rendering

**TTY detection:** `process.stdout.isTTY` via `terminal.isInteractive`.
Non-TTY (piped output, CI) suppresses interactive prompts; the CLI
must work in both modes.

**Unicode on Windows:** PAL calls `chcp 65001` equivalent at startup
(via `process.stdout.write` of explicit UTF-8 BOM or by setting
output encoding); modern Windows Terminal handles it natively.

**ANSI colors:** auto-detect via `supports-color`; never assume.
Respect `NO_COLOR` and `FORCE_COLOR` env vars.

**Width:** dynamic via `terminal.width()`. Wrap output, do not truncate.

**Prompts:** use `@clack/prompts` (works cleanly on Windows). Avoid
libraries that rely on POSIX-only terminal modes.

---

## 9. Signals & lifecycle

POSIX signals (`SIGUSR1`, `SIGHUP`, `SIGTERM`) do not all exist on
Windows. PAL exposes a single abstraction:

```ts
signals.onTermination(() => { /* graceful shutdown */ });
```

On POSIX, this listens for `SIGINT`, `SIGTERM`, `SIGHUP`.
On Windows, this listens for `SIGINT`, `SIGBREAK`, and console close.

Cross-process communication (CLI ↔ orchestrator) uses Node IPC
(`process.send`) or named pipes (`\\.\pipe\manthan-<id>` on Windows,
`$XDG_RUNTIME_DIR/manthan-<id>.sock` on Linux,
`$TMPDIR/manthan-<id>.sock` on macOS). Both abstracted as
`platform.pipe.create()` when daemon mode arrives.

---

## 10. User-data locations

PAL resolves canonical locations via `env-paths` (or equivalent
hand-rolled, since `env-paths` is permissively licensed and small).

| OS | userDataDir |
|---|---|
| Linux | `$XDG_DATA_HOME/manthan` (fallback `$HOME/.local/share/manthan`) |
| macOS | `$HOME/Library/Application Support/ManthanOS` |
| Windows | `%APPDATA%\ManthanOS` |

| OS | userCacheDir |
|---|---|
| Linux | `$XDG_CACHE_HOME/manthan` |
| macOS | `$HOME/Library/Caches/ManthanOS` |
| Windows | `%LOCALAPPDATA%\ManthanOS\Cache` |

| OS | userLogDir |
|---|---|
| Linux | `$XDG_STATE_HOME/manthan/logs` |
| macOS | `$HOME/Library/Logs/ManthanOS` |
| Windows | `%LOCALAPPDATA%\ManthanOS\Logs` |

Per-workspace state always lives in the workspace's `.manthan/` —
cross-platform-safe, portable when the repo moves, deletable with
the repo.

---

## 11. Git integration

Git is shelled out (via `simple-git` or PAL's `process.spawn`). On
init, the CLI verifies `git --version` resolves and reports a clear
error if not.

**Windows-specific notes:**

- `git` on Windows ships as `git.exe`; PAL's `which` handles `.exe`/`.cmd`
  extensions transparently.
- Line-ending policy: ManthanOS does not touch `core.autocrlf`. The
  user's repo settings are respected. PAL stores audit log content in
  LF regardless.
- File-mode bits: `core.fileMode=false` is common on Windows; PAL
  does not warn about it.

**WSL detection:** when running inside WSL, PAL reports
`info.isWSL = true` and `info.os = 'linux'`. Git operations should
treat the workspace as a Linux workspace. The user is responsible for
not crossing the WSL/Windows filesystem boundary mid-workflow (PAL
warns once per session if `cwd` is under `/mnt/c/...`).

---

## 12. Adapter execution

The provider SDKs we use in MVP (Anthropic, OpenAI, Google) are pure
HTTP-over-Node. They have no platform-specific behavior. Adapters
that wrap a binary (e.g., a future Ollama-via-CLI adapter) must use
the PAL for execution and must declare a `requiresBinaries` field
in their plugin manifest:

```ts
requiresBinaries: [
  { name: 'ollama', minVersion: '0.1.0' }
]
```

The plugin loader verifies presence via `platform.process.which`
before the adapter is registered.

---

## 13. Sandboxing strategy

MVP: **no sandboxing**. The safety gate denies dangerous shell
commands by classification (see SAFETY_MODEL.md), and the user
approves diffs before any file write. This is sufficient for v1.

Phase 4: a `SandboxAdapter` contract with per-OS implementations:

| OS | Implementation |
|---|---|
| Linux | `bubblewrap` (preferred) or `firejail` |
| macOS | `sandbox-exec` with a generated profile |
| Windows | Job Objects + restricted token (or WSL2 fallback) |

A workflow may request a sandbox class (`'network-isolated'`,
`'fs-readonly'`, `'pid-isolated'`). The runtime picks an
implementation or refuses to run that step on platforms where the
class is not available. This is the only place where graceful
degradation is acceptable, and it is always explicit.

---

## 14. Plugin loading

Node's module resolution is portable. Plugins are npm packages.
Constraints:

- Plugins should be **pure JS** or shipped with prebuilt binaries for
  all three OSes. Native modules without prebuilts are rejected by
  the plugin loader on a platform that cannot build them.
- Plugins must not call into `child_process` directly — they receive
  the `Platform` instance via the plugin context.
- Plugins must not write outside of `.manthan/plugins/<id>/` or read
  files outside the workspace without an explicit capability.

---

## 15. Continuous integration

The repository runs CI on three OS matrix entries:

- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

Every PR runs:

- Lint (eslint, biome)
- Type-check (tsc --noEmit)
- Unit tests (vitest) on all three OSes
- Integration tests (`manthan init`, `manthan plan` with a recorded
  adapter) on all three OSes
- A smoke test that boots the CLI, exits cleanly, and produces no
  stray temp files

**A Windows regression is a release blocker.** No "fix in next
release." This is the cultural commitment that makes Windows support
real rather than nominal.

---

## 16. ESLint rule (enforced)

A custom ESLint rule (or, initially, a simpler `no-restricted-imports`)
denies the following imports outside `packages/platform`:

- `child_process`
- `fs.watch` (the function; `fs` itself is fine for reads)
- `os` (use `Platform.info` instead)
- `tty`
- Native shell strings (caught via a `no-template-curly-in-string`
  rule on `spawn` / `exec`).

Violations are CI failures. This is what keeps the abstraction honest.

---

## 17. Open questions

These are decisions deferred until implementation reveals more:

- Whether PAL should expose an event loop primitive for polling
  (currently each watcher owns its own).
- Whether PAL should expose a network primitive (HTTP/HTTPS); leaning
  no, because Node's `fetch` is already cross-platform.
- Whether to ship a tiny native helper on Windows for ACL
  manipulation, or rely entirely on user-profile-directory ACLs.

When implementation begins, these get ADRs.

---

## 18. Stabilization §3.5 — current state of seam enforcement (2026-05-16)

**Status**: PAL is the canonical seam by convention. Lint enforcement
is **deferred**.

Earlier text in this document and in the README asserted "ESLint
forbids raw OS calls outside the PAL." That claim is not backed by
the repository state: the project uses Biome (not ESLint), there is
no lint rule enforcing PAL boundaries, and raw `node:fs` / `node:path`
imports exist in:

- `apps/cli/src/commands/init.ts`
- `apps/cli/src/commands/doctor.ts`
- `apps/cli/src/commands/brain-long-horizon.ts`
- `apps/cli/src/commands/brain-sim.ts`
- `packages/context/src/packer.ts`
- `packages/orchestrator/src/replay.ts`
- `packages/memory/src/audited-write.ts`
- `packages/memory/src/recovery.ts`

These imports are not architectural mistakes — the PAL itself uses
`node:fs`; some above-PAL sites predate it. What was incorrect is the
documentation that asserted build-time enforcement.

**Plan**: lint enforcement and migration of the above call-sites are
deferred to a future phase. This entry is the canonical reference for
the current state; do not restore the "ESLint-enforced" framing
without restoring the lint config + rules first.

See `docs/STABILIZATION.md` §3.5 for the truth-reconciliation entry
that produced this note.
