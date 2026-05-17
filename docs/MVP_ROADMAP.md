# ManthanOS — Roadmap

> Phase status, completed work, and the narrowed plan after the
> Phase 1.6 live experiment.
> Status: substrate complete; continuity loop empirically validated;
> Phase 2+ scope narrowed to continuity-strengthening work only.
> Last revised: 2026-05-15.

---

## 1. Project goal (revised, evidence-backed)

> Make AI-assisted engineering on a single project **drift less** over
> time — measured as architectural continuity across related workflows
> — by capturing structured commitments, human-gating their trust,
> and re-injecting the trusted subset into future prompts.

This replaces the prior "persistent runtime where multiple agents
collaborate through one project brain" framing. The earlier goal was
aspirational and partially unrealizable in the near term; the
revised goal is specific and empirically supported by Phase 1.6.

Concrete success criteria (most already achieved):

1. ✅ **Cross-platform from day one** (Windows/macOS/Linux equal,
   PAL-enforced).
2. ✅ **One workspace, one local repo.**
3. ✅ **Deterministic context bundle** with replay byte-identity.
4. ✅ **Single high-quality Claude integration** via API key OR via
   Claude Code CLI subscription auth.
5. ✅ **Audit-first runtime** — hash-chained, replayable, undoable.
6. ✅ **Trust-gated brain mutations** — promote / demote / undo
   with full provenance.
7. ✅ **Live empirical validation** (Phase 1.6 A/B experiment).
8. ⏳ **Hygiene at scale** — Phase 2: dedup, decay, contradiction
   surfacing.
9. ⏳ **Promotion UX at low friction** — Phase 2.
10. ⏳ **Long-horizon continuity validation** — Phase 3.

---

## 2. Non-goals (hard — strengthened by experiment evidence)

The Phase 1.6 result narrowed the project. The following are
**deferred indefinitely** until continuity alone proves indispensable
at scale:

- **Multi-provider orchestration** (OpenAI/Codex, Gemini, Grok, etc.).
- **Debate engine** as a runtime feature.
- **Autonomous workflows** (no `--yes-everything` mode, ever).
- **AI-operating-system positioning** — retired by `POSITIONING.md`.
- **Routing engine with calibration weights.**
- **Vector / embedding-based memory.**
- **Plugin marketplace / discovery beyond config-file declarations.**
- **Hosted SaaS / team-shared brain / cloud sync.**
- **Web UI / IDE plugin / GUI.**
- **Background agents / daemons / watchers.**
- **YAML-authored user workflows** (continuity is the value; workflow
  authoring isn't urgent until users ask).
- **Multi-repo workspaces.**

If a Phase 2/3 experiment surprises us and shows one of these is
suddenly the right next thing, we revisit. Until then, every line of
code is judged against "does this strengthen the continuity loop?"

---

## 3. Completed phases

### Phase 0 — Foundations (DONE)
Substrate: pnpm workspaces, TypeScript strict, biome, vitest, 3-OS CI
matrix, PAL-v0, adapters-sdk types, SQLite + WAL + migrations + indexes,
secret-pattern redactor, hash-chained audit log, CLI scaffold (`init`,
`doctor`).

**Evidence:** 49 tests passing offline, `manthan init` in 71ms,
audit chain verifies on all three OSes (CI matrix configured).

### Phase 1 — Single-adapter vertical slice (DONE)
Real Claude integration via Anthropic SDK + API key path. Context
packer v0 (charter + brief + diff + keyword-ranked source). Workflow
runner. `manthan plan` end-to-end. Adapter contract tests with
recorded fixtures.

**Evidence:** Phase 1 report (offline) — 82 tests passing, runtime
shape verified, replay determinism proven against fixtures.

### Phase 1.5 — Tool-use + brain compounding (DONE)
Migrated plan extraction from fenced-JSON to Claude tool-use. Wired
brain compounding so plans deposit T0 facts and open issues.
`manthan brain stats / facts / issues / history`. Phase 1.5 report:
"recording surface works, prompting surface doesn't yet."

**Evidence:** 93 tests passing, demonstrable plumbing, no live
provider yet.

### Phase 1.6 — Trust gate + cognition loop (DONE)
Trust mutations: `manthan brain promote / demote / undo-correction`.
Packer split into trustedFacts / quarantineFacts with provenance
rendering. The prompting surface closed: promoted facts re-enter
future workflows' system prompts. Offline cognition-loop
demonstration script. Phase 1.6 report: "mechanism proven, outcome
unproven without live API."

**Evidence:** 104 tests passing, offline demo shows byte-different
prompts after promotion, hash determinism preserved.

### Phase 1.7 — Live moat experiment (DONE)
Added `@manthanos/adapter-claude-cli` for subscription-auth via
Claude Code CLI (no API key required). Ran live A/B experiment:
same task, same workspace, only 3 promoted facts differed between
B0 and B1. Claude visibly used the trusted facts (citing `[T+1 fact]`
in its mitigation prose). B1 continued architectural commitments;
B0 contradicted them.

**Evidence:** Live experiment archived; `CONTINUITY_THEORY.md §4`.
Empirical CIS: ~42% of B1's structural plan items traced to the 3
promoted facts. Verdict: **"useful improvement, with substantial
improvement on architectural-continuity tasks."** Moat thesis
narrowed but supported.

---

## 4. Phase 2 — Continuity strength (CURRENT PRIORITY)

**Theme:** make the trust loop usable at realistic engineering scale.
The Phase 1.6/1.7 experiment used 3 carefully-chosen facts. Real
usage will surface dozens or hundreds. Without hygiene + UX, the
brain becomes a liability.

### 4.1 Deliverables

| # | Deliverable | Spec | Status |
|---|---|---|---|
| P2.1 | Normalized-text dedup | `FACT_HYGIENE §3` | not started |
| P2.2 | Stale-fact decay workflow | `FACT_HYGIENE §4` | not started |
| P2.3 | Anti-injection check at promotion | `FACT_HYGIENE §8` | not started |
| P2.4 | Bulk interactive review (`brain review`) | `TRUST_OPS §4.2` | not started |
| P2.5 | Inline promotion shortcuts (`brain facts` TTY) | `TRUST_OPS §4.2` | not started |
| P2.6 | Continuity visibility commands (`why-injected`, `lineage`) | `TRUST_OPS §5` | not started |
| P2.7 | Fact compression in packer (collapse paraphrases at render) | new | not started |
| P2.8 | Prompt-budget enforcement (adaptive bundle shaping when trusted set bloats) | new | not started |

### 4.2 Acceptance criteria

- `manthan brain dedup` finds and collapses ≥80% of near-duplicates
  on a synthetic test set of 30 paraphrased facts.
- `manthan brain age-facts` correctly demotes a fact whose
  `last_corroborated` was artificially aged > 60 days.
- `manthan brain review --area auth` walks through 10 facts in ≤ 2
  minutes of human keystroke time (real measure, not synthetic).
- A promotion attempt of a known-injection-pattern fact is refused
  unless `--accept-injection-risk` is passed.
- `manthan brain why-injected <run-id>` correctly identifies the 3
  promoted facts from the Phase 1.7 experiment as the trusted-layer
  source for B1.
- At 50 trusted facts in a workspace, plan-bundle assembly < 500ms
  (perf budget for adaptive shaping).

### 4.3 Out of scope for Phase 2

- Embedding-based / semantic similarity dedup (Phase 4+).
- Contradiction detector (Phase 3).
- Supersede / replace operations (Phase 3).
- Anything multi-provider or debate-related (deferred indefinitely).

### 4.4 Estimated effort

12 deliverables × ~150–300 lines of TS each + tests. Solo budget:
**3–4 weeks**.

---

## 5. Phase 3 — Long-horizon continuity validation

**Theme:** validate (or refute) that the loop works beyond one
related-task pair. This is the empirical work the Phase 1.7 report
listed as "not yet validated."

### 5.1 Experimental program

Each experiment is an A/B with held-constant variables and a
specific hypothesis. Designed to falsify or strengthen the moat
claim:

| Exp | Task class | Hypothesis | Status |
|---|---|---|---|
| E1 | Debugging | Promoted prior-bug-context reduces re-diagnosis time | not started |
| E2 | Refactoring | Promoted invariants prevent the refactor from violating prior commitments | not started |
| E3 | Migrations | Promoted target-state facts guide the migration plan | not started |
| E4 | Code review | Promoted code-conventions are reflected in review findings | not started |
| E5 | Brain-age | At 50 trusted facts (10 weeks of simulated use), does the loop still help? | not started |
| E6 | Cross-model | Does GPT-5 / Gemini honor T+1 annotations as Claude does? (would inform whether the value is model-specific) | not started |

### 5.2 Tooling required first

- A reproducible experiment harness (extract from Phase 1.7 demo).
- A scoring rubric per task class (each class has different
  success criteria).
- A "synthetic brain aging" tool that injects N representative
  workflows into a workspace's brain to simulate weeks of usage,
  so we can run brain-age experiments without waiting weeks.

### 5.3 Phase gate

Phase 3 cannot complete until at least 3 of E1–E6 produce conclusive
results. If 3+ experiments show **no useful improvement**, the moat
claim is downgraded further (continuity helps in narrow task classes
only; ManthanOS is repositioned as "audit-first project memory layer"
without the continuity claim).

### 5.4 Estimated effort

Each experiment: ~1 week of design + execution + report. 3+
experiments = **3+ weeks**. Likely overlap with Phase 2 work.

---

## 6. Phase 4 — Correction-loop maturity (CONDITIONAL)

**Only if Phase 3 strengthens the continuity claim.**

### 6.1 Deliverables (specced, not started)

- **Contradiction detector** (`brain detect-contradictions`). Per
  `ARCHITECTURE.md §7.6 (C1)` and `FACT_HYGIENE.md §6`.
- **Supersede operation** (`brain supersede <old> --with <new>`).
- **Replace operation** (`brain replace <old> --with <new>`).
- **Signed decisions** (`manthan decision sign`) — T+2 → T+3.
- **Prune workflow** — operational cleanup pass.
- **Observability**: `manthan brain why-injected`, `manthan brain
  lineage`, continuity-trace view.

### 6.2 Phase gate to enter

- Phase 2 deliverables shipped.
- ≥ 2 of Phase 3 experiments show useful improvement.
- Real user data showing the brain hits hygiene-relevant scale
  (≥ 30 promoted facts in at least one workspace).

If none of these arrive, Phase 4 doesn't begin. The runtime ships
in its Phase 2 state.

---

## 7. Phases 5+ — Reserved (not currently planned)

Reserved labels for work that is **not** on the active roadmap, only
mentioned so contributors know where they'd live if the project
direction expands later:

- Adapter process isolation (`worker_threads` permission model).
- Per-plugin network allow-lists.
- Remote audit witness (Phase 5 in original roadmap; still future).
- Hardware-backed signing.
- Sandbox abstraction (`SandboxAdapter`).
- IDE / editor surface (LSP).
- Hosted sync of `.manthan/` for team-shared brain.
- Multi-workspace.

**None of these are scheduled.** They are deferred until continuity
itself becomes undeniably valuable at scale AND a user need surfaces
for the specific capability.

---

## 8. Timeline (honest)

Solo developer estimates:

| | Optimistic | Realistic | If hard |
|---|---|---|---|
| Phase 2 | 3 weeks | 4 weeks | 6 weeks |
| Phase 3 | 3 weeks | 6 weeks | 8 weeks |
| Phase 4 (if entered) | 4 weeks | 6 weeks | 10 weeks |
| **Total to Phase 3 completion** | **6 weeks** | **10 weeks** | **14 weeks** |

These numbers do NOT include time for marketing, OSS-community
building, or external contributor onboarding. The roadmap is purely
the engineering plan.

---

## 9. What "shipping" looks like

The project does not need a launch event. It needs:

1. Phase 2 deliverables in `main` with tests.
2. Updated documentation (this roadmap + the new continuity-focused
   docs).
3. A README that anyone can follow to a successful first promotion.
4. Honest reports of Phase 3 experiments (positive or negative).

The product can be "version 0.2" or "version 1.0" — labels matter
less than evidence. **Each release ships with new evidence in
`docs/.experiment-<date>-<topic>.md`**, archived alongside the audit
artifacts from Phases 1.5/1.6/1.7.

---

## 10. The honest discipline going forward

After every Phase 2 or Phase 3 deliverable lands, the project applies
two questions to itself:

1. **Did this strengthen the continuity loop, or just add surface?**
   If it added surface without strengthening the loop, it shouldn't
   have shipped.
2. **What is the next empirical question we cannot yet answer?**
   The next priority is whichever experiment closes the most open
   question.

The original roadmap shipped 4 phases of speculative architecture.
The revised roadmap ships 2 phases of focused continuity work + an
empirical program that decides whether the project deserves to grow
further. **If the experiments fail, ManthanOS ships at its current
size as a useful tool and stops growing.** That outcome is acceptable.

The thesis is small but real. The roadmap should reflect that.
