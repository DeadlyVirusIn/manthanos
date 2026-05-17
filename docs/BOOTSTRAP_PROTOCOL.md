# ManthanOS — Bootstrap Protocol

> What happens between "the user installed ManthanOS" and "the user
> got real value from it." First-run UX as a designed system.
> Status: design lock — pre-implementation.

---

## 1. Goal

A user types `manthan init` in a real repo, and **within five
minutes** has run a workflow that produced concrete, useful output —
without confusion, without surprise costs, and without 10 onboarding
prompts.

Five minutes is not aspirational. It is an acceptance criterion for
Phase 0. If first-useful-value takes longer, the runtime has
already lost most adopters before the value proposition is visible.

---

## 2. Non-goals (deliberate)

- **No marketing/welcome tour.** Engineers do not want to be
  onboarded; they want to be unblocked.
- **No "configure everything first" gate.** The runtime works with
  one adapter, one workspace, and defaults.
- **No expensive first workflow.** First runs are explicitly cheap
  (small model, capped budget, no debate). The full debate
  experience comes when the user asks for it.
- **No phone-home telemetry on first run** (or any run, in MVP).

---

## 3. First-run sequence

The five-minute path:

```
T+0:00   User runs: manthan init
T+0:10   Runtime detects workspace, asks 3 questions max.
T+0:30   Runtime creates .manthan/, writes defaults.
T+0:40   Runtime checks for provider auth; prompts if missing.
T+1:30   Provider auth completed.
T+1:40   Runtime indexes repo (cheap, no LLM).
T+2:30   Index complete. Brain has charter + project facts.
T+2:35   User runs: manthan plan "<a real task>"
T+3:00   Routing engine selects a cheap adapter.
T+3:05   Context packer produces a small bundle.
T+3:10   Adapter invoked. Tokens reported. Cost reported.
T+3:50   Plan produced and rendered.
T+4:00   User has a plan. Brain is populated.
```

Five minutes leaves a minute of headroom for unexpected latency.

---

## 4. `manthan init` — what it does

### 4.1 Detection

- Confirms `cwd` is a git repository (offers to `git init` if not).
- Reads `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
  `pom.xml`, `Gemfile` — extracts language, framework hints.
- Runs `git log --max-count=20` to estimate repo age and activity.
- Checks for an existing `.manthan/` (refuses to overwrite without
  `--force`).

### 4.2 Questions (maximum three)

```
1. Is this a project you primarily own/maintain?
   ◯ Yes — long-running project
   ◯ No — exploring or short-term

2. What's the primary language?
   (Auto-detected: TypeScript. Override?)

3. Pick a default adapter for this workspace:
   ◯ Anthropic Claude (recommended; needs ChatGPT or API key)
   ◯ OpenAI / Codex (needs ChatGPT or API key)
   ◯ Google Gemini (needs Google account or API key)
   ◯ Skip — I'll configure later
```

No more than three. Each has a sensible default. The user can
skip the third (defer adapter config).

### 4.3 What gets written

```
.manthan/
├── config.yaml                  # provider prefs, budgets, routing
├── memory/
│   └── manthan.db               # SQLite, schema initialized
├── audit.log                    # empty hash chain, genesis event
├── workflows/                   # empty; user-defined go here
├── protocols/                   # empty; user-defined go here
└── .gitignore                   # ignores audit, memory, blobs
```

The runtime also appends `.manthan/` to the repo's top-level
`.gitignore` (asking first). The user can opt to commit some of it
later — but the default is "ManthanOS state stays local."

### 4.4 What `manthan init` does NOT do

- It does not pack repo context yet.
- It does not call any LLM.
- It does not create any decisions or semantic facts.
- It does not run any workflow.
- It does not phone home.

Init is **cheap and offline**. Total wall-clock target: under 30
seconds (excluding the user's response time on the three questions).

---

## 5. Provider auth (first-time)

If the user selected an adapter in §4.2 and no credentials are
configured, the runtime detects the absence and prompts:

```
Anthropic Claude needs authentication. Pick one:
  ◯ Use my ChatGPT subscription (codex login)         [if Codex]
  ◯ Use my Google account (gemini login)              [if Gemini]
  ◯ Use API key from environment (ANTHROPIC_API_KEY)
  ◯ Skip — I'll set this up later
```

Adapters declare their supported auth modes via the SDK; the runtime
asks only about modes the adapter supports.

If the user chooses an interactive auth (OAuth), the runtime opens
the appropriate flow in the user's default browser and waits with a
clear status line. If OAuth fails (state mismatch, network issue),
the prompt falls back to "set the env var manually and re-run."

Auth is one-time per workspace. Subsequent runs skip this step.

---

## 6. Repo indexing — cheap, no LLM

Indexing is a **deterministic local pass** that runs after init.
Total time target: under 90 seconds on a 100-MB repo.

What it does:

- Walks the repo, respecting `.gitignore`.
- Records file types, sizes, modified times.
- Parses recognized manifests (`package.json`, etc.) for the project
  charter.
- Runs `git log` for top contributors and recent activity windows.
- Detects testing frameworks, linters, formatters in use.
- Detects existing CI/CD configs at a structural level.

What it does **not** do:

- No LLM calls.
- No file-content embeddings.
- No tree-sitter parsing (yet — deferred to Phase 2 context packer).
- No external network calls.

The result is the **initial charter**: a structured fact set written
into the brain as `semantic_facts` with provenance `bootstrap`.
Examples: `language=TypeScript`, `testing=vitest`, `package_manager=pnpm`,
`primary_branch=main`.

---

## 7. First memory snapshot

After indexing, the runtime writes a single `context_snapshot` row
representing the bootstrap state. This snapshot is what subsequent
workflows read as their baseline. It is updated on every workflow
run.

The snapshot contains:

- Charter facts (from §6).
- File-tree summary (counts, types, depth).
- Git head + recent activity.
- Empty placeholders for `decisions`, `open_issues`, `semantic_facts`
  beyond charter.

A "bootstrap complete" event is written to the audit log.

---

## 8. First workflow

Recommended first workflow is **`manthan plan`** with a real task.
The runtime explicitly does **not** run a debate for the first
workflow unless the user asks (`--debate`).

Defaults for first-run `plan`:

- Routing engine selects a **fast/cheap adapter** if multiple are
  configured (e.g., Claude Haiku, GPT-5-mini, Gemini 2.5 Flash).
- Context packer uses only **charter + brief + git diff** (no
  semantic recall, no graph slice — brain is empty).
- Budget cap: **$0.10** for first runs (configurable; warns before
  exceeding).
- Cost output is shown after the call: `tokens: 12k in, 3k out;
  cost: $0.04 (within $0.10 budget)`.

The user sees the plan rendered, sees the cost, and the brain has
its first real workflow recorded. From this point, every subsequent
run builds on prior state.

---

## 9. Cold-start budget enforcement

To prevent surprise costs in the bootstrap window, the runtime
applies a **bootstrap budget** for the first 5 runs in a workspace:

- Per-run cap: `$0.25`.
- Cumulative cap for first 5 runs: `$1.00`.
- Debate is disabled by default until the user has run at least one
  `plan` and one `review`.

These caps are warnings, not hard locks. The user can override with
`--budget` or by editing `config.yaml`. But the defaults protect
new users from accidental large debates.

After the bootstrap window, normal per-workflow budgets apply.

---

## 10. Anti-patterns we explicitly prevent

- **The 10-minute first run.** Init must complete cold in under 5
  minutes. CI enforces this on a clean Docker/macOS/Windows runner.
- **The expensive first debate.** Debate disabled by default in the
  bootstrap window.
- **The opaque first invocation.** Every adapter call in the first
  run prints tokens and cost.
- **The "did anything happen?" silence.** Every step prints a status
  line: "Indexing repo... 142 files... done (2.3s)."
- **The 12-config-questions onboarding.** Three questions max.
  Defaults for everything else.
- **The "you need to install X first" wall.** If a dependency is
  missing, the runtime offers to install it where possible, or gives
  a precise install command. No "Google it."

---

## 11. Bootstrap acceptance criteria (Phase 0)

These are the testable bars Phase 0 must clear before being called done.

1. `manthan init` completes in < 30s of wall-clock (excluding
   user-prompt time) on a clean repo, on all three OSes.
2. Total time from `manthan init` to "first plan rendered" is < 5
   minutes on a clean repo with one configured adapter, on all
   three OSes.
3. First `manthan plan` costs < $0.10 by default.
4. No effectful action is taken without an audit event.
5. The CLI never produces silent failure; every error path renders a
   user-facing message with the next action.

A first-run regression — any of the above failing on any OS — is a
**release blocker**.

---

## 12. Recovery from interrupted bootstrap

If the user kills `manthan init` partway:

- `.manthan/` is in a known state (atomic writes; no half-finished
  files).
- A re-run of `manthan init` detects existing state and continues
  rather than restarting.
- A `manthan init --force` is the only way to discard prior state,
  and it requires explicit confirmation.

---

## 13. Open questions

- Whether to ship a "demo workspace" the user can run against
  without committing changes to a real repo. Tentative yes in Phase
  1 (ships with one canonical demo repo as a git submodule).
- Whether the three init questions should include "do you want to
  share anonymized first-run telemetry?" Tentative no in MVP — opt-in
  telemetry adds complexity and we don't need it yet.
- Whether to auto-suggest a second workflow (`manthan review` on the
  latest diff) after the first `plan` succeeds. Tentative no —
  proactive suggestions feel like a paperclip. The user can read
  `manthan --help`.
