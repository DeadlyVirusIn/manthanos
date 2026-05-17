# ManthanOS — Stabilization Phase Constitution

> Derived from TRUTH_CHECKPOINT.md (2026-05-16). Strict execution plan
> for the bounded period between the truth checkpoint and the E6.1
> decision gate. No roadmap dreaming. No mechanism creep. No new
> abstractions. No speculative futures.
> Date: 2026-05-16.

This document is the operational rulebook. While stabilization is
active, any action not explicitly authorized here is out of scope.
Authorization to deviate requires writing an addendum to this document,
not informally proceeding.

---

## 1. STABILIZATION PHASE PLAN

Five steps. Ordered. Each step has a time budget, a done criterion,
and a stopping rule. Subsequent steps may not begin until the
preceding step's done criterion is met OR explicitly waived in writing.

### Step 1 — Correctness fixes (≤1 day)

**Scope:**
- Fix decay semantic bug (§3.1).
- Fix `undoCorrection` intervening-check (§3.2).
- Fix `applyTransition` decision-field inconsistency (§3.3).
- Add tests for the three fixes.

**Done criterion:** all four bug-fix specs (§3.1–§3.4) closed; new tests
green; `manthan doctor` passes on every existing test workspace
(`/tmp/lh-test`, `/tmp/lh-test-low`, `/tmp/shape-test`).

**Stopping rule:** if any fix takes more than 4 hours, stop and reassess
in writing. Do not exceed the day.

### Step 2 — Documentation truth reconciliation (≤2 hours)

**Scope:**
- Apply the wording changes in §4 to README.md and POSITIONING.md.
- Update CONTINUITY_THEORY.md §9.6 disposition note.
- Add a "Known correctness gaps fixed in stabilization" line to
  PHASE2_THEORY.md (one paragraph).
- Add a top-of-README "Research-grade prototype" disclaimer.

**Done criterion:** every claim listed in §4 is either fixed or struck.
No new claims added. Documentation is not rewritten beyond the items
in §4.

**Stopping rule:** writing more than 2 hours of new documentation is
out of scope. If a section needs rewriting beyond the listed
reconciliation, defer.

### Step 3 — Security boundary clarification (≤2 hours)

**Scope:**
- Move plaintext API-key documentation to a new top-level section in
  README explicitly labeled "Security posture (research-grade)."
- The section enumerates: in-process adapters, plaintext key storage,
  accidental-corruption-only audit chain, denylist shell patterns
  (advisory only), TOCTOU symlink race window.
- The section ends with: *"Until OS-keychain integration and adapter
  sandboxing land, do not install third-party adapters and do not run
  this against repositories you do not personally control."*

**Done criterion:** the section exists, lists every item above, and is
linked from the README top.

**Stopping rule:** do NOT begin implementing keychain or sandboxing in
this step. Documentation only.

### Step 4 — E6.1 implementation (≤2 days)

**Scope:** see §5 for the concrete checklist.

**Done criterion:** the four-run matrix (§5.5) has executed, captures
have been written, the binary judgment has been recorded.

**Stopping rule:** see §5.6.

### Step 5 — Post-E6.1 decision gate (≤2 hours)

**Scope:**
- Apply the criteria in §6 to the recorded E6.1 outcome.
- Write the resulting decision into a new section of
  TRUTH_CHECKPOINT.md (§14: "E6.1 outcome and resulting direction").
- Do NOT begin executing the chosen direction in this step. Stabilization
  ends with a written decision, not with new work.

**Done criterion:** TRUTH_CHECKPOINT.md §14 exists with one of the four
outcomes (A/B/C/D from §6) and its triggering criterion cited.

**Stopping rule:** indecision is not an outcome. If the data is
ambiguous, write that explicitly and re-trigger §6's "data is ambiguous"
clause. Do not extend Step 4 to gather more data.

---

## 2. HARD SCOPE BOUNDARIES

This is the strict prohibition list. Items here are out of scope until
TRUTH_CHECKPOINT.md §14 has been written and a new phase has been
opened in writing.

### 2.1 Forbidden during stabilization

- **No new hygiene primitives.** No new dedup variants, no new decay
  models, no new shaping rules, no semantic-similarity additions to
  dedup, no AI-assisted promotion suggestions.
- **No new simulators.** No new corpora, no real-corpus injection
  scripts, no synthetic-pressure variants. The long-horizon simulator
  is frozen as-is until E6.1 resolves.
- **No frontend work.** No TUI, no Ink, no blessed, no web UI, no
  Electron, no VS Code extension. Terminal CLI remains the only
  surface.
- **No orchestration runtime.** No multi-step plan chaining, no agent
  handoff, no workflow DAGs.
- **No multi-agent systems.** FUTURE_COMMAND_CENTER stays frozen. No
  code is allowed to reference it.
- **No SaaS infrastructure.** No telemetry, no remote brain, no team
  features, no Postgres branch, no cloud deploy.
- **No Phase 3 reruns before redesign.** The current `experiments
  cpt-probe` harness exists and the briefs exist; running them against
  any LLM is forbidden until the corpus is replaced or the design is
  formally redesigned in writing.
- **No additional theory docs.** No new PHASE_X_THEORY files. No new
  POSITIONING-shape docs. Existing docs may be edited per §4 only.

### 2.2 Deferred work (allowed to be re-opened only post-stabilization)

- OS-keychain integration for API key storage.
- Adapter sandboxing (worker_threads + Node permission model).
- External audit-chain anchoring (transparency-log style).
- Bundle-hash recomputation in `replayRun`.
- ESLint enforcement of PAL seam.
- Tests for `dedup.ts`, `decay.ts`, `replay.ts`, `plan-runner.ts`,
  long-horizon simulator.
- `manthan brain status` (single combined health screen).
- Consolidation of the 19-command `brain *` surface.
- attention=0.05 simulation pass.

These are real gaps surfaced by the truth checkpoint. They are
deliberately not assigned to stabilization because stabilization's
purpose is to converge to the E6.1 decision, not to perfect the
substrate.

### 2.3 Tempting-but-banned work (do not start during stabilization)

Each of these will feel productive. They are not. They are avoidance
of the E6.1 commitment.

- **Improving the simulator.** "If I just add corpus variety / real
  workloads / attention=0.05" — banned. The simulator's verdict on the
  substrate is already in §1.6 / §2.10 of TRUTH_CHECKPOINT. More
  simulator work cannot move that verdict.
- **Polishing the promotion UX.** "If I just add an editor hook / a
  desktop notification / a status bar" — banned. The initiation problem
  is real but does not need to be solved before E6.1. Solving it without
  E6.1 evidence is building features for a product whose existence is
  not yet validated.
- **Refining the shaping rules.** "If I just add area-priority / a
  smarter token budget / a learned ranking" — banned. Shaping is
  acceptable as Phase 2 shipped it. Refinement is mechanism creep.
- **Rewriting the package boundaries.** The orchestrator is a
  junk-drawer (Codex's word); fixing it is a refactor that does not
  move the E6.1 decision. Defer.
- **Writing more docs.** The instinct to "document the new direction"
  before E6.1 has run is precisely how the project drifted in the first
  place. Direction follows evidence, not the other way around.

### 2.4 "This feels productive but is actually avoidance" work

These items have been considered or might be tempted during stabilization.
Each is named so it cannot be done by accident.

- Re-running long-horizon with a longer span "to see what happens."
- Adding a `manthan brain status` command because the 19-command
  surface is bloated.
- Writing a "Phase 3 CpT redesign" doc before E6.1 has resolved.
- Adding an MCP server adapter or any other integration that requires
  new abstractions.
- Looking at competitor releases and writing positioning responses.
- Setting up a personal blog post / Twitter thread about the truth
  checkpoint. Public communication is out of scope until §14 is
  written.

---

## 3. BUG FIX SPECS

### 3.1 Decay semantic fix

**Root cause:** `packages/orchestrator/src/decay.ts:147-151` uses
`semantic_facts.last_corroborated` as staleness basis. That column is
overwritten by every `applyTransition` call
(`packages/orchestrator/src/brain-trust.ts:362-364`) and by every
dedup-merge (`packages/orchestrator/src/dedup.ts:370-378`). Decay
therefore measures "time since any administrative touch," not "time
since corroboration."

**Exact fix:**

1. **Schema migration**: add column
   `semantic_facts.last_administratively_touched TEXT NOT NULL DEFAULT ''`.
   Migration body: `UPDATE semantic_facts SET last_administratively_touched = last_corroborated`
   so the new column carries forward the conservative state.
2. **`applyTransition`** (`brain-trust.ts:357-365`): change the UPDATE
   to set `last_administratively_touched = effectiveTs`, leave
   `last_corroborated` untouched UNLESS `reason === 'human_promotion'`
   or `reason === 'simulator:human_promotion'` or
   `reason === 'simulator:corroborated_via_followup_plan'`. Promotion
   IS corroboration; demotion, dedup-supersede, and decay are not.
3. **`mergeDuplicates`** (`dedup.ts:370-378`): update only
   `last_administratively_touched`, leave `last_corroborated` alone.
4. **`runDecay`** (`decay.ts`): same — update only
   `last_administratively_touched`.
5. **`planDecay`** (`decay.ts:142-148`): keep reading `last_corroborated`
   as the staleness basis. It is now semantically correct.

**Migration implications:** existing data has `last_corroborated` set
by all sorts of events. The migration line above carries the existing
(wrong) values forward into both columns. New events will diverge the
columns correctly. Decay computed *immediately* after migration will
see facts as "fresh" if they were promoted or merged recently — that
is the corrected behavior.

**Risk level:** MEDIUM. Additive schema change; existing tests do not
rely on the conflated semantic; long-horizon results may now differ
from the prior runs (this is the *point* of the fix).

**Required tests:**
- Create a fact via `brain.fact_quarantined`. Both columns equal.
- Promote → both columns updated to promotion time.
- Run `applyTransition` with reason='decay:tier_demote' → only
  `last_administratively_touched` updated.
- Run `mergeDuplicates` → only `last_administratively_touched` updated
  on demoted facts.
- Run `runDecay` twice in a row → second run is a no-op because
  `last_corroborated` did not change. (This is the bug fix's key
  observable behavior.)

**Rollback strategy:** drop the new column; reinstate
`last_corroborated` updates in `applyTransition`, `mergeDuplicates`,
`runDecay`. Schema is additive, so rollback is non-destructive of
existing rows.

### 3.2 `undoCorrection` safety

**Root cause:** `brain-trust.ts:285-302` reads the original correction
and resets the fact to `original.from_tier` without verifying that the
fact's current tier matches `original.to_tier`. Two consecutive
corrections + an undo of the older one yields silent state corruption.

**Exact fix:**

In `undoCorrection`, between the blob-read and the `applyTransition`
call (~`brain-trust.ts:285`):

```
if (currentFact.tier !== original.to_tier) {
  throw new BrainTrustError(
    'INTERVENING_CORRECTION',
    `cannot undo seq=${opts.auditSeq}: fact is now at ${currentFact.tier}, ` +
    `but the correction left it at ${original.to_tier}. Resolve newer corrections first.`,
  );
}
```

Also add `'INTERVENING_CORRECTION'` to the `BrainTrustError` code enum
(~`brain-trust.ts:84-90`).

**Migration implications:** none.

**Risk level:** LOW. Strict refusal is conservative; no existing test
case currently exercises a stacked-correction undo.

**Required tests:**
- Promote A → T+1 (seq=X). Promote A → T+2 (seq=Y). Try to undo seq=X.
  Expect `INTERVENING_CORRECTION` error.
- Promote A → T+1 (seq=X). Undo seq=X. Expect success.

**Rollback strategy:** delete the new check; remove the new error
code. Trivial.

### 3.3 Audit metadata decision-field inconsistency

**Root cause:** `applyTransition` (`brain-trust.ts:351`) hard-codes
`decision: 'auto-approve'` for all corrections. Human-initiated
promotions are recorded as auto-approved despite the actor being a
human.

**Exact fix:**

1. Add `decision: 'auto-approve' | 'human-approved'` to
   `ApplyTransitionInput` (~`brain-trust.ts:324-334`).
2. Default behavior in `applyTransition`: use the passed-in value;
   fallback `'auto-approve'`.
3. `promoteFact` and `demoteFact` pass `'human-approved'`.
4. `runDecay` and `mergeDuplicates` continue to set `'human-approved'`
   (they already do, via `auditedWrite`'s `decision` field — these
   don't go through `applyTransition`).
5. `undoCorrection` passes `'human-approved'` (a human is initiating
   the undo).

**Migration implications:** existing audit events have the wrong
decision value. Do NOT rewrite history. Going forward, new events have
correct values.

**Risk level:** LOW. Metadata-only change; no behavioral impact on
state transitions; existing tests should pass with no modification.

**Required tests:**
- New test: `promoteFact` writes an event with `decision='human-approved'`.
- New test: a hypothetical caller passing `decision='auto-approve'` to
  `applyTransition` directly still works.

**Rollback strategy:** revert the `applyTransition` signature change
and re-hardcode `'auto-approve'`. Trivial.

### 3.4 Replay verification truth reconciliation

**Root cause:** `replayRun` (`packages/orchestrator/src/replay.ts:97-138`)
inspects recorded values rather than recomputing the bundle hash and
comparing. POSITIONING.md and README claim "deterministic replay
verifies past runs." The claim is unsupported.

**Exact fix (documentation, not code):**

This is a documentation-only fix during stabilization. The code change
to actually recompute is deferred (§2.2).

1. Rename the user-facing CLI hint: keep `manthan replay <runId>` (no
   command rename), but update its `--help` text to *"Inspect a
   recorded workflow run from audit + blobs (no hash verification)."*
2. Strike the word "verify" / "verification" from `replay.ts` doc
   comments where they currently appear.
3. In TRUTH_CHECKPOINT.md §2.4, this is already noted as INVALIDATED.
4. README + POSITIONING changes per §4.

**Migration implications:** none.

**Risk level:** LOW.

**Required tests:** none new; existing replay tests continue to test
what the code actually does (inspect).

**Rollback strategy:** revert documentation. Trivial.

### 3.5 PAL enforcement truth reconciliation

**Root cause:** README claims "ESLint-enforced PAL seam." The repo
uses Biome and has no ESLint config. Raw `node:fs`/`node:path` imports
exist in `apps/cli/src/commands/{init,doctor,brain-long-horizon,brain-sim}.ts`,
`packages/context/src/packer.ts`, `packages/orchestrator/src/replay.ts`,
`packages/memory/src/audited-write.ts`, `recovery.ts`.

**Exact fix (documentation, not code):**

Strike the ESLint claim per §4. Add a sentence to `docs/PLATFORM_LAYER.md`
(or to the README's "Security posture" section per §1 Step 3) that
states: *"PAL is the canonical seam by convention. Lint enforcement is
deferred. Raw Node imports remain in N files (see git grep) and will
be migrated incrementally."*

**Migration implications:** none.

**Risk level:** LOW.

**Required tests:** none.

**Rollback strategy:** revert documentation.

---

## 4. README / POSITIONING RECONCILIATION

Exact wording changes. Each item is "find this current text → replace
with this new text." Do not invent additional changes.

### 4.1 README — cross-model claim

**Find** (substantively, exact line may vary):
> *"a continuity layer that sits underneath whichever AI you happen to
> use"*

**Replace with:**
> *"a continuity layer for a single AI provider per workspace today.
> Cross-model handoff was the original goal; the first cross-model
> experiment (E6) failed at the adapter level. See E6.1 in
> docs/STABILIZATION.md §5 for the bounded follow-up experiment."*

### 4.2 README — replay verification claim

**Find** (substantively):
> *"deterministic replay verifies past runs"*

**Replace with:**
> *"deterministic inspection of past runs from the audit chain and
> content-addressed blob store. Bundle-hash recomputation is not yet
> implemented (see docs/STABILIZATION.md §3.4)."*

### 4.3 README — tamper-evident claim

**Find** (substantively):
> *"tamper-evident audit chain"*

**Replace with:**
> *"hash-chained audit log that detects accidental corruption.
> Defense against a local-disk attacker requires external anchoring,
> which is not implemented."*

### 4.4 README — PAL enforcement claim

**Find** (substantively):
> *"ESLint-enforced PAL seam"*

**Replace with:**
> *"PAL is the canonical seam by convention. Lint enforcement is
> deferred."*

### 4.5 POSITIONING.md — value-proposition framing

**Find** (substantively, the strongest cross-model claim wherever it
appears):
> any sentence implying "across providers" / "across models" /
> "vendor-neutral continuity" as a current property.

**Replace with:**
> *"Single-provider continuity is empirically supported (Phase 1.7).
> Cross-provider continuity is the original goal and the open question.
> See E6.1."*

### 4.6 New top-of-README section

**Add a new section at the top of README.md, immediately after the
project title and one-sentence description:**

```markdown
## Research-grade prototype

ManthanOS is currently a research-grade local prototype, not a
production-safe tool. Specifically:

- API keys are stored in plaintext at `~/.config/manthan/api-keys.env`
  or `.manthan/secrets.env`. OS-keychain integration is deferred.
- Adapter packages run in-process with full Node.js privileges. Do
  not install third-party adapters until sandboxing lands.
- The audit chain detects accidental corruption only. A local-disk
  attacker can rewrite the log and recompute hashes.
- The hygiene loop has been validated against synthetic corpora only.
- The cross-model thesis has not been empirically validated; see
  docs/TRUTH_CHECKPOINT.md and docs/STABILIZATION.md.

Until OS-keychain integration and adapter sandboxing land, do not
install third-party adapters and do not run this against repositories
you do not personally control.
```

### 4.7 What stays exactly as written

- All citations of Phase 1.7 results (substantively validated, see
  TRUTH_CHECKPOINT.md §1.2).
- All description of the trust ladder, audit chain mechanism, BSL
  license terms.
- The full FUTURE_COMMAND_CENTER.md (it is correctly quarantined as
  future vision).
- The CONTINUITY_THEORY.md §9.6 E6 finding (already honest).

### 4.8 What is forbidden to add

- No new positioning sentences invented during this reconciliation.
- No new sections beyond §4.6.
- No "vision" language. No "we believe" / "we will" / "the future is."
- No marketing rephrasing of mechanisms.

---

## 5. E6.1 IMPLEMENTATION PLAN

Concrete engineering checklist. Intentionally minimal.

### 5.1 Adapter structure

- **New package**: `@manthanos/adapter-openai`. Location:
  `packages/adapter-openai/`.
- **Package contents**: `package.json`, `tsconfig.json`,
  `src/index.ts`, `src/preset.ts` (model presets).
- **Dependencies**: `openai` (official SDK) + `@manthanos/adapters-sdk`
  for the `AgentAdapter` contract.
- **Single exported function**: `createOpenAIAdapter(config: OpenAIAdapterConfig): AgentAdapter`.
- **Config shape**: `{ apiKey: string; model: string; maxOutputTokens: number; }`.
- **Match the existing `adapter-claude` shape exactly.** No new
  abstractions, no new types beyond what's strictly required for the
  API surface.

### 5.2 Parser strategy

- **Primary path**: OpenAI `chat.completions.create` with
  `response_format: { type: 'json_schema', json_schema: <PLAN_TOOL.input_schema> }`.
  Supported by gpt-4o-2024-08-06 and newer.
- **No fallback path.** If `response_format` fails for any reason,
  log the failure and abort the run. Fallback complexity is what the
  Codex CLI adapter showed is the failure mode.
- **Validation**: parse the returned JSON; validate against the
  existing PlanArtifact schema (re-use `plan-schema.ts:parsePlan`).

### 5.3 Response normalization

- Map `response.choices[0].message.content` (when using
  `response_format`, it's a JSON string) → JSON.parse → existing
  PlanArtifact validation.
- Map `response.usage.prompt_tokens` → `inputTokens`.
- Map `response.usage.completion_tokens` → `outputTokens`.
- **Cost**: use OpenAI's published gpt-4o pricing — $2.50/MTok input,
  $10/MTok output (verify against current pricing page before run).
  Derive `usdMicro` deterministically.
- **Finish reason**: pass through verbatim (`stop`, `length`, etc.).

### 5.4 Logging

- **Re-use existing `runPlanWorkflow` machinery.** The adapter plugs in
  as a regular `AgentAdapter`.
- **All audit events flow through `auditedWrite` as normal.** No
  E6.1-specific logging, no separate experiment-only audit stream.
- **The four runs are recorded as normal `plan` workflows** in their
  respective workspaces.

### 5.5 Evaluation workflow

- **Use the existing `manthan experiments cpt-probe` harness.** No new
  CLI command.
- **Brief**: `docs/phase3_briefs/auth-reset-password.brief` (already
  written; the brief is the one with the strongest brain signal).
- **Workspaces**:
  - `/tmp/lh-empty` (already exists; empty).
  - `/tmp/lh-test` (already exists; healthy Run A, 41 trusted facts).
- **Runs** (four total):
  - **C-empty**: Claude (`--adapter cli`) against `/tmp/lh-empty`.
  - **C-healthy**: Claude against `/tmp/lh-test`.
  - **X-empty**: OpenAI (`--adapter openai`) against `/tmp/lh-empty`.
  - **X-healthy**: OpenAI against `/tmp/lh-test`.
- **Capture**: per-run JSON via the existing harness format. Compare
  artifact via `cpt-probe`'s compare.json.
- **Manual rubric step**: open the four output JSONs side-by-side and
  answer the binary judgment (§6.1).

### 5.6 Stopping conditions

- Adapter implementation exceeds 2 days end-to-end: STOP, write
  failure note in TRUTH_CHECKPOINT.md §14 as outcome "E6.1 aborted —
  adapter cost overran budget."
- First successful OpenAI call against `/tmp/lh-empty` fails: STOP,
  write the failure mode, do not attempt to debug for more than 2
  hours.
- Total LLM cost exceeds $1.00: STOP. The four-run budget should be
  $0.10–$0.30 worst case. Overrun signals retry storm or wrong model
  choice.
- `response_format` returns malformed JSON in production: STOP. Do
  NOT add a fallback parser; that path is exactly what the Codex CLI
  failure mode looked like.

### 5.7 Success / failure criteria

**Mechanical success**: all four runs complete with parsed plans.

**Experimental outcomes** (defined in §6).

---

## 6. DECISION GATE

After E6.1 executes, apply these criteria literally. The decision is
binary on each branch; do not allow "let's gather more data" to
escape.

### 6.1 Binary judgment (the one subjective step)

For each of the four outputs, does the model's `/reset-password`
design demonstrably respect at least TWO of the project's trusted
facts about (a) session storage (httpOnly cookies), (b) token
lifetime (single-use), (c) refresh-token interaction?

Record yes/no for each run. The brief asks the model to specify these
explicitly, so the answer is observable in the output text, not
inferred.

### 6.2 Outcomes and resulting direction

| C-healthy | X-healthy | Resulting direction |
|---|---|---|
| ✓ uses facts | ✓ uses facts | **Option B: cross-model thesis continues.** The runtime substrate IS sufficient for cross-model handoff with a proper adapter. Reposition accordingly. |
| ✓ uses facts | ✗ does not | **Option A: narrow to single-provider product play.** The substrate works only for the model it was promoted under. Document and accept the narrowing. |
| ✗ does not | — | **Pause: Phase 1.7 did not reproduce.** Stop and investigate before any cross-model conclusion. C-empty and X-empty become the relevant comparisons; if they too lack the facts, the brain is not load-bearing on this brief. |
| Both empty | Both empty | **Re-run with a different brief.** Try `db-audit-table.brief` next. If two briefs in a row produce ceiling=floor, the brain is not load-bearing on Phase-1.7-style work. That is itself a finding worth recording. |

### 6.3 Criteria for the four phase-reset options

The TRUTH_CHECKPOINT named four options (A, B, C, D). These are the
pre-committed criteria for each.

- **Option B (continue cross-model)**: requires the top row of §6.2
  AND total adapter implementation cost ≤2 days.
- **Option A (narrow to single-model)**: requires either the second
  row of §6.2 OR Option B's cost-blowing.
- **Option C (pivot to compliance/audit)**: NOT a stabilization-phase
  choice. Re-open consideration only if (a) Option A is chosen AND
  (b) at least one external signal (interview, pilot inquiry, public
  feedback) is collected within 30 days of §14 being written.
- **Option D (pause)**: requires *all* of: §6.2 third row (Phase 1.7
  did not reproduce), AND substrate fixes have not produced a
  re-validated Phase 1.7 within 1 week. This is intentionally hard to
  trigger.

### 6.4 Anti-extension clause

Indecision is not an outcome. If §6.2 produces "data is ambiguous,"
the next step is to re-run with a second brief (`db-audit-table.brief`)
ONCE, with no other changes. If that second run is also ambiguous,
default to **Option A** (narrow). Do not run a third brief in
stabilization.

### 6.5 What §14 of TRUTH_CHECKPOINT.md must contain

After §6.2 is applied:

- The four binary judgments (yes/no for each run).
- The token costs of each run.
- The chosen option (A/B/C/D) per §6.3.
- The exact §6.2 row that triggered it.
- The date.

That is the entire §14. No additional reasoning, no roadmap, no
positioning. The choice is recorded; subsequent work is a new phase.

---

## 7. ANTI-DRIFT RULES

These are the operational rules that hold beyond stabilization. Any
future phase inherits them.

1. **No mechanism work without an unresolved product dependency.**
   If a mechanism is "nice to have" but no buyer / user / experiment is
   blocked on it, it is out of scope.

2. **No synthetic result framed as external validation.** Simulator
   results, hand-built corpora, author-written briefs against
   author-curated facts — all of these are scaffolding. They may
   appear in design docs as scaffolding; they may not appear in
   POSITIONING or README as validation.

3. **No future-facing positioning without evidence.** A capability is
   not a positioning claim until at least one of: (a) it is
   demonstrably present in the code AND tested in CI, OR (b) it has
   been empirically validated in a documented experiment. Aspiration
   belongs in `docs/FUTURE_*.md` files explicitly marked as quarantine.

4. **No optionality preservation without bounded follow-through.**
   "Preserving optionality for X" is not an acceptable rationale for
   architectural work unless X is on a written experimental schedule
   with a stop date. Optionality without execution is deferred work
   pretending to be progress.

5. **No new abstractions without observed pain.** If the abstraction
   is "in case we need to," delete the abstraction and the case.
   When the case arrives, the abstraction will be written then.

6. **No documentation claim the code does not enforce.** Every
   claim in README, POSITIONING, and the public-facing docs must
   correspond to either (a) a test that exercises it, or (b) a
   citable file path where it is implemented. If neither exists,
   strike the claim.

7. **No "Phase X complete" until the value proposition is
   empirically demonstrated.** Mechanism-complete is not
   product-complete. A phase's "complete" marker requires evidence
   external to the substrate itself.

8. **No new tests written for features that have no real user.**
   Test coverage follows usage. Add tests when a real workflow
   exercises the feature.

9. **No new commands added before existing commands have been used
   by anyone other than the author.** The 19-command `brain *`
   surface is the cautionary tale.

10. **No "preserving optionality" — either commit or remove.** A
    half-built adapter, a deferred experiment, an unimplemented vision
    doc — each is either on the active execution plan or is removed
    from the repo. Optionality is not a state the repo carries
    silently.

11. **No public communication about ManthanOS results until the
    truth-checkpoint dependencies are closed.** Blog posts, social
    posts, conference talks, README hype — all of these wait until
    §14 is written and the new phase has produced its own evidence.

12. **No accepting reviewer findings as theoretical.** Codex's
    `last_corroborated` finding is a bug. Bugs get fixed during the
    nearest stabilization. Findings do not get archived as "future
    work."

---

## 8. Disposition of prior planning artifacts

- `docs/PHASE3_CPT.md`: **frozen, do not execute.** Will be replaced
  by a redesigned doc only if Option B or A is chosen.
- `docs/phase3_briefs/*.brief`: **retained**; will be reused for
  E6.1 (auth-reset-password) and potentially for the redesigned
  Phase 3.
- `apps/cli/src/commands/experiments-cpt-probe.ts`: **retained**;
  the harness is sound, the design that called it was tautological.
  The harness gets re-used by E6.1 unchanged.
- `docs/FUTURE_COMMAND_CENTER.md`: **retained, frozen.**
- All other docs: untouched except for the §4 reconciliations.

---

## 9. End of stabilization

Stabilization is over when TRUTH_CHECKPOINT.md §14 has been written
and signed (`Decided: <date>` line). The chosen option (A/B/C/D)
becomes the input to the next phase. That next phase MUST begin with
its own bounded plan analogous to this one before any code is
written.

Stabilization explicitly does NOT end with new features, new docs, or
new positioning. It ends with a recorded decision and nothing else.

---

*This document is the operational rulebook for the stabilization
phase. Edits to it require an addendum block at the bottom dated and
signed. Do not silently revise.*
