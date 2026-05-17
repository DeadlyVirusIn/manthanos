# ManthanOS — Stabilization Verdict

> Closing the stabilization phase. Decision-gate application against the
> §6.2 / §6.3 / §6.4 logic in `STABILIZATION.md`. No new experiments.
> No roadmap expansion.
> Date: 2026-05-16.

This document is the post-investigation verdict. It is the canonical
output of the stabilization phase. The work that becomes legal after
this document is signed is named in §8.

---

## 1. Application of §6.2 / §6.3 / §6.4

### 1.1 §6.2 — the four-run matrix

The matrix as defined in `STABILIZATION.md` §6.2:

| C-healthy | X-healthy | Resulting direction |
|---|---|---|
| ✓ uses facts | ✓ uses facts | Option B — cross-model continues |
| ✓ uses facts | ✗ does not | Option A — narrow to single-provider |
| ✗ does not | — | Pause — Phase 1.7 did not reproduce |
| Both empty cases ≈ healthy | Both empty cases ≈ healthy | Re-run with `db-audit-table.brief` |

**State at decision time:** zero rows produced. The C-empty, C-healthy,
X-empty, and X-healthy runs each have status `not executed`. The
OpenAI account returned `429 insufficient_quota` on the first attempted
call; per STAB §5.6 the experimental layer halted immediately and the
remaining runs were not initiated.

**Direct fit against §6.2:** none of the four rows is satisfied. The
table is empty.

### 1.2 §6.3 — option criteria

Reviewed literally against the Step 4 outcome:

- **Option B (continue cross-model)** requires §6.2 row 1 AND adapter
  cost ≤ 2 days. Adapter cost was met (~23 minutes); row 1 was not.
  **Not satisfied.**
- **Option A (narrow to single-provider)** requires §6.2 row 2 OR
  Option B's cost-blowing. Neither directly fired. **Not satisfied
  by §6.3's literal text.**
- **Option C (compliance pivot)** is explicitly out of stabilization
  scope. **Not applicable.**
- **Option D (pause entirely)** requires §6.2 row 3 AND failure to
  re-validate Phase 1.7 within one week. Row 3 did not fire (the
  empty-matrix is a separate failure mode); the Phase 1.7 evidence
  was not invalidated by Step 1's bug-fix work (it pre-dates the
  long-horizon work that the decay-fix reinterprets). **Not
  satisfied.**

None of the four options satisfies its §6.3 criteria as literally
written. This is the same problem as §6.2's empty table, restated.

### 1.3 §6.4 — anti-extension clause

§6.4: *"Indecision is not an outcome. If §6.2 produces 'data is
ambiguous,' the next step is to re-run with a second brief
(`db-audit-table.brief`) ONCE, with no other changes. If that second
run is also ambiguous, default to Option A (narrow). Do not run a
third brief in stabilization."*

**Literal applicability:** §6.4 was written for the case where data
was produced and was ambiguous. The empty matrix is a different
failure mode. The literal text does not cover the present situation.

**Spirit of §6.4:** the rule's purpose is to prevent stabilization
from staying open indefinitely while more data is sought. That
purpose applies directly to the empty-matrix case. An indefinite
hold on stabilization while OpenAI billing is resolved would be a
form of indecision; §6.4 was authored to foreclose exactly this
pattern.

**Operational read:** the empty matrix is treated as "no evidence
gathered" rather than as "data is ambiguous." But the §6.4 spirit
— close the phase with the position the evidence supports — still
applies. The evidence currently supports the narrowed single-provider
thesis. The default is Option A.

---

## 2. Empty-matrix classification

The user's four candidate classifications, evaluated:

| Classification | Verdict |
|---|---|
| Operational block | **Accurate.** OpenAI returned `429 insufficient_quota`. The block is at the provider-billing layer; no project-side code path failed. |
| Ambiguous result | **Inaccurate.** Ambiguous data presupposes data. Zero runs produce no data, ambiguous or otherwise. |
| Failed execution | **Partially accurate.** The execution failed in the sense that the matrix did not run. The wording is misleading because the project-side implementation succeeded; the failure was external. |
| Effective negative evidence | **Inaccurate, with one caveat.** A non-execution produces no evidence in either direction. The caveat: E6.1's *purpose* was to discharge a burden of proof on the cross-model thesis. The burden was not discharged. The cross-model thesis remains in the same status it held entering stabilization — refuted at the minimal-adapter level, unproven at the proper-adapter level. The empty matrix does not strengthen the refutation; it leaves it where TRUTH_CHECKPOINT §2.1 placed it. |

**Final classification:** operational block + un-discharged burden of
proof. The cross-model thesis is in the same epistemic position now
as before E6.1; the stabilization phase did not produce evidence that
would warrant updating that position in either direction.

---

## 3. Final recommendation

**Option A — continue the narrowed single-provider thesis.**

### 3.1 Reasoning

- The pre-stabilization position (TRUTH_CHECKPOINT §1.2, §2.1)
  is that single-provider continuity is partially validated by Phase
  1.7, and that the cross-model thesis is refuted at the
  minimal-adapter level and untested at the proper-adapter level.
- E6.1 was designed to give the cross-model thesis a bounded chance
  to acquire positive evidence at the proper-adapter level. The
  experiment did not execute.
- The cross-model thesis therefore did not acquire the evidence its
  revival required. Its status is unchanged.
- The narrowed thesis (single-provider continuity, Phase 1.7) has
  not been weakened by any work done during stabilization. The
  long-horizon magnitude reinterpretation (PHASE2_THEORY appendix
  added in Step 2) affects Phase 2 substrate-claim *magnitudes*, not
  the Phase 1.7 result.
- Per §6.4's spirit (indecision is not an outcome), the phase closes
  with the position the existing evidence supports. That position is
  Option A.

### 3.2 What this is and is not

**Option A is:**

- The position with the most empirical support today.
- The honest closing direction given E6.1's non-execution.
- A reversible choice: a future authorization of E6.1 re-run (with a
  funded OpenAI account or an explicitly scoped substitute) can
  re-open Option B.

**Option A is not:**

- A refutation of the cross-model thesis.
- A claim that single-provider continuity is sufficient as a product.
- A commitment to ship as-is.
- A statement that the cross-model question is closed.

### 3.3 Separating evidence, architecture, and what the project wants to be

Three things should not be conflated:

- **What the evidence supports** — single-provider continuity reduces
  drift on related plans in a controlled microcosm. That is the only
  empirical claim with direct backing.
- **What the architecture permits** — the substrate is provider-neutral
  by adapter contract; it can in principle support any provider with
  a structured-output capability. This is an architectural fact
  about the codebase, not an empirical fact about behavior.
- **What the project wants to be** — a cross-model continuity layer
  underneath whichever AI is used. This was the original framing.
  It survives as an aspiration; it does not survive as a current
  claim.

The verdict separates these three layers. The product direction
follows the first. The codebase preserves the second's optionality
without paying for it in roadmap expansion. The third remains a doc
artifact (`FUTURE_COMMAND_CENTER.md`) explicitly quarantined.

---

## 4. Counterfactual analysis

### 4.1 If E6.1 had passed cleanly (C-healthy ✓, X-healthy ✓)

Justified updates:

- TRUTH_CHECKPOINT §2.1 reclassified from "REFUTED at the
  minimal-adapter level" to "DEMONSTRATED on one secondary model
  (gpt-4o) on one brief (auth-reset-password)."
- README's cross-model claim could be restored at narrowed scope
  ("demonstrated against one secondary provider on one brief").
- E6.2 (multi-model, multi-brief, varied brain states) becomes a
  defensible follow-up phase.
- Option B becomes the chosen direction.

Still NOT justified by a clean E6.1 pass:

- "Underneath whichever AI you happen to use" — one demonstration
  does not establish portability.
- Marketing cross-model as a current product property.
- Skipping E6.2 and pivoting roadmap on a single-brief signal.
- Restoring FUTURE_COMMAND_CENTER as active work.
- Citing cross-model continuity in any positioning copy without the
  "one-secondary-model" qualifier.

A clean pass would have moved cross-model from "refuted" to "open
with a single positive datum." Bridging from there to "validated
property" still requires E6.2.

### 4.2 If E6.1 had failed cleanly (C-healthy ✓, X-healthy ✗)

The same Option A would have been selected — by §6.2 row 2 rather
than by §6.4 spirit. The substantive verdict would be unchanged;
the empirical basis for it would be stronger.

The current verdict therefore arrives at the same direction as a
documented failure would have, but with weaker evidence. This is
neither better nor worse than a documented failure; it is
specifically that — no evidence acquired.

---

## 5. Stabilization outcomes

### 5.1 What stabilization corrected

- **Three correctness bugs in the substrate** (Step 1, STAB §3):
  - `last_corroborated` semantic flaw in the decay engine — fixed
    via migration `0002_decay_semantic_fix` adding
    `last_administratively_touched` and stopping non-corroboration
    updates of `last_corroborated`.
  - `undoCorrection` unsafe against intervening corrections — fixed
    via tier-mismatch check.
  - Audit metadata `decision='auto-approve'` for human-initiated
    transitions — fixed to `human-approved` from `promoteFact`,
    `demoteFact`, `undoCorrection`.
- **Documentation that did not match code** (Step 2, STAB §4):
  - Cross-model claim downgraded to single-provider scope.
  - Replay claim downgraded to inspection (no bundle-hash
    recomputation).
  - "Tamper-evident audit chain" downgraded to accidental-corruption
    detection.
  - "ESLint-enforced PAL seam" downgraded to convention.
  - Phase 2 long-horizon magnitude claims reinterpreted as
    workload-and-bug-specific in a new PHASE2_THEORY appendix.
- **Absence of an honest security boundary** (Step 3, STAB §1
  Step 3):
  - Dedicated §"Security posture (research-grade, detailed)"
    section added enumerating defended threats, non-defended
    threats, operator assumptions, safe usage envelope, unsafe
    deployment patterns, and dangerous misunderstandings.
- **Cross-model adapter infrastructure** (Step 4, STAB §5):
  - `@manthanos/adapter-openai` package built and integrated.
  - `manthan experiments cpt-probe --adapter openai` available.
  - The mechanical path for E6.1 (or its re-execution) is now in
    place; only provider billing blocks execution.

### 5.2 Claims downgraded

| Claim (before stabilization) | Claim (after stabilization) |
|---|---|
| "Continuity layer underneath whichever AI you happen to use" | "Continuity layer for a single AI provider per workspace today" |
| "Deterministic replay verifies past runs" | "Inspection of recorded workflows from audit + blobs" |
| "Tamper-evident audit chain (Merkle-style)" | "Hash-chained audit log that detects accidental corruption" |
| "Cross-platform PAL with ESLint-enforced seam" | "Cross-platform PAL (canonical seam by convention; lint enforcement deferred)" |
| "Trusted layer self-bounds at ~1500 tokens" (substrate claim) | "Qualitative shape preserved; quantitative figure is workload-and-bug-specific" |
| "Phase 1.7 empirically validates the continuity loop" | "Phase 1.7 empirically validates the loop on one model, one project, two related briefs, three trusted facts — MEDIUM confidence, very small N" |
| `decision='auto-approve'` on human-initiated brain corrections | `decision='human-approved'` for `promoteFact`/`demoteFact`/`undoCorrection` |

### 5.3 Claims that survived scrutiny

- Phase 1.7 single-model drift reduction (MEDIUM confidence,
  unchanged).
- Substrate runs end-to-end on Linux (HIGH confidence).
- Dedup detector identifies engineered paraphrase clusters (HIGH
  for engineered data; LOW for real-world generalization).
- Hash chain detects accidental corruption (HIGH within scope).
- Trust-tier mechanics: no model self-promotion; transitions
  audited; undo within window (HIGH).
- Hygiene primitives execute deterministically (HIGH).
- Adaptive shaping reports every omission with a reason (HIGH
  mechanically; useful-continuity preservation remains the open
  Phase 3 question).

### 5.4 Claims that became more credible because of narrowing

- "Trust-gated single-provider continuity reduces drift on related
  plans within a project." This claim, narrowed from the broader
  cross-model framing, now matches the evidence. The pre-stabilization
  claim was broader than the evidence supported; the post-stabilization
  claim is the strongest defensible position.
- "The substrate, decay+dedup+shaping, exerts downward pressure on
  trusted-layer growth on tested workloads." The magnitude claim
  was downgraded; the qualitative claim is more credible because
  it's now correctly scoped.
- "ManthanOS is a research-grade local prototype with explicit
  security boundaries." The pre-stabilization absence of a dedicated
  security section invited overclaiming by adjacency. The
  post-stabilization clarity is a credibility increase.

---

## 6. Meta-assessment

Did stabilization improve the project itself, or merely reduce
confidence?

**Both, and the two are not the same thing.**

The project is improved in the following concrete senses:

- Three real correctness bugs are fixed. The decay-engine bug
  affected the central hygiene mechanism; its correction is not
  cosmetic.
- Documentation now matches code. Several previously-published
  claims were technically false; they no longer are.
- The security posture is honestly enumerated, allowing an operator
  to make informed installation decisions.
- A reusable framework — TRUTH_CHECKPOINT → STABILIZATION
  constitution → bounded execution → verdict — has been established
  and can be invoked at future phase boundaries.
- One ranking artifact (the long-horizon plateau magnitude) is
  no longer overinterpreted.

Confidence is reduced in the following concrete senses:

- The cross-model thesis is now explicitly absent from positioning.
- The "self-bounding at 1500 tokens" finding is recontextualized
  as workload-specific.
- The Phase 1.7 result is annotated with stricter scope language
  (n=2 plans, single model, single project, single author).

**The reduction is not a project regression.** It is the closing of
the gap between what was claimed and what was supported. A project
whose claims match its evidence is more durable than a project
whose claims exceed its evidence, even when the former's claim set
is smaller.

The honest meta-finding: **stabilization is a quality-improving
process; "reduced confidence" is a side-effect of the process
discovering overclaim, not a measure of the project's deterioration.**

---

## 7. Next-step rules

### 7.1 Legal after stabilization closes

- Continuing under Option A as the active product direction.
- Re-running the long-horizon simulation under corrected decay
  semantics, framed as a stabilization-reinterpretation activity
  (not new mechanism work). Magnitude numbers from such a re-run
  are publishable as substrate claims for the first time.
- Designing a non-tautological Phase 3 — a corpus the operator did
  not curate, briefs the operator did not author, blinded rubric
  review.
- Soliciting external signal (interviews, small beta) to inform a
  later Option C re-evaluation per STAB §6.3.
- Re-executing E6.1 if and when OpenAI billing is restored, or if
  the user explicitly authorizes a substitute provider with the
  same strict bounded design.
- Promoting `manthan experiments cpt-probe --adapter openai` to a
  documented command (the mechanical path is in place).

### 7.2 Still prohibited

- Reviving the cross-model thesis as a positioning claim without a
  successful E6.1 or equivalent execution.
- Restoring the "AI operating system" framing or the "command
  center" framing in any user-facing copy.
- Multi-provider orchestration, debate engines, agentic workflows,
  swarm-routing, plugin marketplaces.
- New mechanism invention before observed user friction justifies
  it.
- Phase 3 reruns in the current author-curated-corpus design.
- Public communication of stabilization results (blog posts, social,
  conference talks) before any explicit user-facing release
  decision.
- Marketing language ahead of evidence in any documentation file.

### 7.3 Evidence required before broader claims can return

| Future claim | Required evidence |
|---|---|
| Cross-model continuity at "single secondary model" scope | Successful E6.1 execution: C-healthy ✓ + X-healthy ✓ on `auth-reset-password.brief` |
| Cross-model portability as a positioning claim | E6.2: multi-model, multi-brief, varied brain states; consistent positive signal |
| CpT measurement citable in positioning | Non-tautological Phase 3 design + non-author-curated corpus + blinded rubric |
| Adoption/usability claims | Real users observed in real workflows; not the operator |
| "Substrate self-bounds" as a substrate property (not workload) | Long-horizon re-run under corrected decay semantics on a non-recycled corpus |
| Compliance / regulated-industry positioning (Option C) | Two named pilot customers; documented regulatory framing; external audit posture |
| "Equal first-class cross-platform" | Real workflow tested on Windows and macOS; cross-platform behavioral tests in CI |
| "Tamper-evident" against attackers | External anchoring (transparency log or signed checkpoint) implemented and tested |

---

## 8. Final honest positioning

> ManthanOS is a local-first audit-first runtime that captures
> structured architectural commitments produced by an LLM workflow
> at quarantine tier, lets a human review and promote a subset,
> and re-injects the promoted subset into future workflow prompts
> on the same project. A controlled A/B experiment on one model and
> two related plans (Phase 1.7, 2026-05-15) showed the re-injection
> materially reduced architectural drift; outside that single
> demonstration, the broader continuity-economics claims are
> unproven, cross-model continuity has not been validated, and the
> substrate has been operationally exercised only on Linux. The
> hash-chained audit log detects accidental corruption, not active
> tampering. Adapters run in-process with full Node.js privileges
> and API keys are stored in plaintext. Use only on machines and
> repositories you personally control.

That is the positioning. It is what the evidence supports as of
this date. It is not what the project wants to be. It is what the
project currently is.

---

## 9. Verdict signature

- Date: 2026-05-16.
- Decision: **Option A — narrow to single-provider thesis.**
- Triggered by: §6.4 anti-extension principle applied to an empty
  §6.2 matrix; §6.3's literal criteria for A, B, C, D each
  unsatisfied by literal text but Option A is the closing direction
  supported by the existing evidence.
- E6.1 outcome: not executed; OpenAI billing exhausted; mechanical
  adapter implementation succeeded.
- TRUTH_CHECKPOINT.md §14 entry written in parallel with this
  document (short form, per `STABILIZATION.md` §6.5).
- Stabilization phase closes with this verdict signed.

Subsequent work begins as a new phase with its own bounded plan,
authored separately and starting only after the stabilization-fix
re-validation activities in §7.1 are scoped.
