# ManthanOS — Phase A Constitution

> Bounded execution framework for the path recommended by
> `PHASE_SELECTION_MEMO.md`. Strict scope. Anti-drift. Constitutional.
> This document is operational law, not planning.
> Date: 2026-05-16. Phase A authorization is required separately;
> this document defines the rules under which authorization, when
> granted, governs work.

While this document is in force, any action not explicitly permitted
under §5 is out of scope. Deviation requires a signed addendum at the
bottom of this document and a corresponding update to
`TRUTH_CHECKPOINT.md`. Informal proceeding does not constitute
authorization.

---

## 1. Phase objective

Determine — under an experimental design that survives external
scrutiny for tautology — whether trust-gated re-injection of
human-promoted commitments produces measurably better engineering
outcomes on real work than a no-brain baseline.

---

## 2. Non-goals

Phase A does NOT pursue any of the following. Each is named so
drift cannot occur by accident.

- No cross-model positioning. Cross-model continuity is preserved
  as a bounded side-experiment under §5.6 only; it is not Phase
  A's primary work.
- No orchestration runtime.
- No agent systems, multi-agent runtime, debate engine, or swarm
  patterns.
- No SaaS platform, hosted service, or remote brain.
- No FUTURE_COMMAND_CENTER activation. The document remains
  quarantined; no code change references it.
- No mechanism invention without observed friction. The hygiene
  primitives (decay, dedup, shaping, queue-health, promotion UX)
  are frozen at their post-stabilization state.
- No "AI OS" framing in any user-facing surface.
- No retroactive long-horizon re-runs designed to produce more
  favorable magnitudes. The PHASE2_THEORY appendix is the
  canonical reinterpretation.
- No new theory documents.
- No new CLI commands beyond those the experiment requires.
- No keychain integration, adapter sandboxing, external audit
  anchoring, or aggregate cost ceilings. These remain deferred per
  STABILIZATION §2.2.
- No README or POSITIONING edits beyond inserting Phase A findings
  *if* they materialize, and only under §8's evidence standards.
- No marketing copy or external communication about Phase A
  results before the phase closes.

---

## 3. Success criteria

Three categories, evaluated independently. A phase outcome may
satisfy any subset.

### 3.1 Research success

At least one of:

- Blinded rubric review across ≥3 real briefs × ≥3 workspace
  states produces an effect size measurably distinguishable from
  zero (positive *or* negative direction).
- The same protocol produces a clean null result that survives
  external review as evidence of non-effect.
- A mechanism-failure result (e.g., "the model demonstrably fails
  to use trusted facts despite their presence") is recorded with
  full provenance.

All three count as research success because each updates the
evidence record on Q1 from LESSONS §7.

### 3.2 Product success

All of:

- At least one real user, not the document author, maintains the
  trust queue for ≥4 consecutive weeks.
- Sustained promotion rate ≥0.3 promotions per workflow over the
  observation window.
- The user provides a written statement, unprompted by leading
  questions, that they would continue using the tool on their
  next project.

Product success is harder than research success. A phase that
delivers research success but not product success is a legitimate
outcome.

### 3.3 Operational success

All of:

- Phase A completes within the maximum duration declared in §10.
- Phase 3 redesign survives one external review pass without
  rejection on tautology grounds.
- No mid-phase scope expansion occurs (i.e., no §5 expansion
  addendum is required).
- All experimental artifacts are replayable end-to-end.
- The phase produces, at minimum, a TRUTH_CHECKPOINT update and a
  Phase A results document under §8 standards.

Operational success is independent of research or product success.
A phase may operationally succeed while producing a null result.

---

## 4. Failure criteria

The phase terminates immediately (with a Phase A truth-checkpoint
update and a Phase D re-evaluation) under any of the following:

- **Healthy ≈ empty under blinded rubric review.** The non-tautological
  Phase 3 produces no detectable effect across the pre-committed
  brief set.
- **Trust queue abandonment.** No recruited user maintains the
  promotion workflow beyond the first two weeks under realistic
  conditions.
- **Blinded rubric cannot separate conditions.** Reviewers cannot
  distinguish healthy from empty outputs at rates exceeding chance
  across the brief set.
- **CpT negative under realistic constraints.** Trusted-token cost
  exceeds useful-output gain by any defensible measure.
- **External review rejects the redesigned Phase 3** as still
  tautological after one revision cycle.
- **Phase 3 redesign exceeds 4 weeks** without producing a
  reviewer-approved design.
- **Real-user recruitment fails** within 6 weeks of phase start
  (defined as: no user other than the document author is observed
  in the workflow).
- **Substrate bugs requiring new mechanism work** surface during
  real usage. Triggers immediate truth-checkpoint and possible
  return to stabilization.

If any failure criterion fires, work stops the same day. Sunk-cost
reasoning cannot override the criterion.

---

## 5. Legal work

Bounded list. Work outside this list is prohibited under §6 and
requires a §10 reassessment to consider.

### 5.1 Phase 3 redesign

Per §7's design constraints. Includes corpus sourcing, brief
authoring (by an independent party), rubric instrument design,
and pre-registration of analysis protocol.

### 5.2 Real-user recruitment

Up to three engineers from outside the document author's
collaboration network. Recruitment communications must not contain
positioning language ahead of evidence; recruits are told this is
a research-grade prototype undergoing evaluation.

### 5.3 Substrate-reinterpretation activity

A long-horizon re-run under corrected decay semantics, framed
explicitly as substrate reinterpretation per LESSONS §7.1. Output
goes into a new TRUTH_CHECKPOINT addendum, not into POSITIONING or
README.

### 5.4 Documentation of Phase A findings

A `PHASE_A_RESULTS.md` document, authored after the phase closes
and only if the closing criteria of §3 or §4 fired. The document
follows the structure of `STABILIZATION_VERDICT.md`: forensic,
non-aspirational, evidence-cited.

### 5.5 Bug fixes that surface during real usage

Only if a real user encounters a behavior-blocking defect.
Feature-adding changes are prohibited even in this case. The fix
must be documented as a Phase A bug-fix, not as Phase A
improvement.

### 5.6 Cross-model side-experiment (bounded)

E6.1 may execute as a one-day side-experiment under Phase A's
authorization *only if*:

- OpenAI billing is restored, or an explicitly authorized
  substitute is in scope.
- Execution does not displace any Phase A primary work.
- Outcome is recorded in TRUTH_CHECKPOINT §15 (new section), not
  in POSITIONING.

E6.1 is not Phase A. It is a preserved side-channel. Its result
does not unlock Path B without a separate phase decision.

### 5.7 Periodic progress check-ins

A weekly written status update against §3 success criteria, §4
failure criteria, and §10 timeline. Failure to write the weekly
check-in is itself a §9 review-gate trigger.

---

## 6. Prohibited work

Each item is named so it cannot be performed by accident or
rationalized as adjacent.

- New CLI commands beyond those the experiment requires.
- New substrate primitives (continuity hygiene, shaping rules,
  trust-tier additions).
- New theory documents.
- New experimental designs outside the Phase A redesigned Phase 3.
- Cross-model adapter work beyond §5.6's one-day side-experiment.
- Orchestration runtime, multi-step plan chaining, agent handoff.
- Multi-agent systems, debate engines, swarm patterns.
- SaaS infrastructure, hosted brain, remote audit, team features.
- FUTURE_COMMAND_CENTER activation in any form.
- Frontend / IDE plugin work as core Phase A work. (A separately-
  scoped prototype is permitted only if a §10 reassessment
  authorizes it; Phase A does not.)
- Adapter sandboxing, OS-keychain integration, external audit
  anchoring, aggregate cost ceilings. (Deferred per STABILIZATION
  §2.2.)
- Long-horizon re-runs designed to produce favorable magnitudes.
- Refactors outside the experiment's surface.
- Public communication of Phase A findings (blog, social,
  conference, README marketing) before phase closes.
- Marketing positioning shifts in any user-facing copy ahead of
  §8 evidence.
- Re-opening Path B as a primary phase. (Side-experiment per §5.6
  is the only legal cross-model work.)
- Re-opening Path C without external compliance-buyer signal that
  meets STABILIZATION §6.3's documented precondition.

---

## 7. Phase 3 redesign requirements

Design constraints. Every constraint is required. A design that
fails any constraint is rejected and re-drafted.

### 7.1 Corpus independence

The corpus must be generated from a codebase the document author
did not curate. Acceptable sources:

- A public open-source project at a fixed commit hash.
- A partner team's repository (with written permission, with
  secrets stripped).
- A synthetic corpus generated by a process the author did not
  hand-engineer for the experiment (e.g., a non-author-LLM
  generates the corpus from a real codebase's structure).

The ALPHA_SERVICE corpus is permanently disqualified. The
PHASE3_CPT.md brief set in the repository is permanently
disqualified. Both were author-curated.

### 7.2 Brief independence

Briefs must be authored by someone who has not seen the corpus
contents. Acceptable sources:

- A second engineer authors briefs against the corpus's surface
  (file list, README, but not internal facts).
- An LLM with no access to the corpus authors briefs from a
  high-level task description.
- An independent curator (LinkedIn task list, Stack Overflow
  question archive, public engineering blog tasks) provides
  briefs.

The phase author may not write the briefs. The phase author may
not see the briefs before the experiment runs.

### 7.3 Blinded evaluation

The rubric reviewer must not know, at the moment of evaluation,
which workspace state (healthy / empty / stressed) produced each
output. Workspace state must be revealed only after all rubric
scores are recorded.

Output files must be re-labeled (e.g., A1, A2, A3, B1, B2, B3,
...) before the reviewer sees them. The mapping file is held
separately until scoring completes.

### 7.4 Real-world task diversity

At least three task classes, distinct from "architectural
continuity on related plans." Examples:

- Bug-fix from an existing failing test.
- Refactor of an existing function with stated constraints.
- New-feature implementation from a spec.
- Code-review of a submitted diff.
- Migration from one library to another within a fixed scope.

Each task class is tested across all workspace states. Minimum
3 task classes × 3 workspace states = 9 conditions. Pre-committed
sample size per condition declared before running.

### 7.5 Explicit CpT accounting

For every run, record:

- Input tokens (prompt + bundle, separately).
- Output tokens.
- Useful-output assessment (from the blinded rubric, on a defined
  scale).
- Cost-per-useful-output unit (an explicit ratio, not a vibe).

CpT is reported as a ratio, not as a score. The ratio's units
must be stated.

### 7.6 Reproducibility

- Every workflow run captures full JSON (existing `cpt-probe`
  format suffices).
- The experiment design document is hashed at start-of-experiment;
  the hash is recorded.
- The rubric instrument is a standardized form (Likert scale,
  yes/no items, or comparable), not free-form reviewer prose.
- The mapping from labels (A1, A2...) to workspace state is held
  in a sealed file, opened only at scoring close.
- A third party (not the author, not the reviewer) can re-run the
  scoring from the captured outputs and the rubric instrument
  without phase-author input.

### 7.7 Pre-registration

Before any experimental run, the following are recorded in writing
and version-controlled:

- Hypotheses (H1, H2, H3 — what would constitute support /
  refutation).
- Sample size per condition (minimum N).
- Rubric instrument.
- Stopping rules (when to halt before designed N).
- Analysis protocol (which comparisons; which corrections).

Pre-registration changes after the experiment starts are
prohibited. Any deviation triggers §9.

---

## 8. Evidence standards

Two tiers. Each has a different downstream legal use.

### 8.1 Publishable evidence

Requires all of:

- Blinded rubric (per §7.3).
- Sample size meets pre-committed minimum (per §7.7).
- Independent corpus (per §7.1).
- Independent briefs (per §7.2).
- Replayable runs (per §7.6).
- Effect size with confidence interval where statistically
  applicable.
- Counter-condition tested. Specifically: a "random-facts"
  workspace must be one of the conditions, to control for "any
  injected context helps." The healthy condition's effect size is
  evaluated against the random-facts condition, not only against
  empty.
- Pre-registered analysis protocol followed without deviation.

Only publishable evidence may enter README, POSITIONING, or any
external communication. Publishable evidence may not enter user-
facing copy until phase closes and §11 exit conditions fire.

### 8.2 Exploratory signal

Everything that fails any §8.1 requirement. Exploratory signal
may not enter README, POSITIONING, or external communication. It
may inform private decision-making within the phase but cannot be
cited as evidence in the project's public artifacts.

A phase that produces only exploratory signal exits as if it
produced no evidence at all (§4 failure criteria evaluated).

---

## 9. Review gates

A new truth-checkpoint or stabilization cycle is triggered by any
of the following:

- A substrate bug surfacing during real usage that affects prior
  results.
- An external review pass identifying a new claim-evidence gap not
  named in TRUTH_CHECKPOINT.
- Phase duration crossing 80% of §10's max without measurable
  progress toward §3 success criteria.
- Real-user feedback contradicting a load-bearing Phase 1.7
  assumption.
- Any §5 expansion request — adding work outside the legal list
  requires a written truth-checkpoint update before work proceeds.
- Pre-registration deviation per §7.7.
- Any §6 prohibited-work request — even considering it triggers
  a truth-checkpoint to document the consideration.

The weekly check-ins required by §5.7 are a pre-emptive
review-gate mechanism: they surface gates before they fire.

---

## 10. Maximum phase length

- Phase 3 redesign sub-phase: ≤4 weeks.
- Real-user recruitment sub-phase: ≤6 weeks (may overlap with
  redesign).
- Experiment execution sub-phase: ≤6 weeks.
- Analysis and writeup sub-phase: ≤2 weeks.

**Aggregate maximum: 12 weeks (3 calendar months).** Reassessment
required at week 12 if not closed; reassessment must conclude
within 7 days with either an explicit extension authorization or
phase termination per §11.

**Absolute hard cap: 16 weeks.** No further extension is permitted
under any circumstance after the 16th week. If the phase has not
closed by week 16, it terminates automatically and triggers a §11
Path D evaluation.

---

## 11. Exit conditions

The phase exits via one of the following transitions, evaluated at
phase close (success, failure, or hard-cap):

### 11.1 Continue Path A → next sub-phase

Required:
- §3.1 research success satisfied with publishable evidence
  (§8.1).
- §3.3 operational success satisfied.

Outcome: a new bounded phase begins, focused on the next-priority
question per LESSONS §7 (Q3 — real-user queue maintenance — once
Q1 has a positive answer).

### 11.2 Path A → Path B reconsideration

Required:
- §3.1 research success satisfied.
- §5.6 side-experiment (E6.1) executed during Phase A and produced
  positive evidence on cross-model transfer.
- Capacity exists for a follow-up phase to address Path B as
  primary work.

Outcome: the next phase becomes a bounded Path B execution
(E6.2: multi-model, multi-brief).

### 11.3 Path A → Path C reconsideration

Required:
- One external regulated-industry contact (interview, RFP, pilot
  inquiry) collected during Phase A.
- The contact represents a documented buyer interest, not a
  speculative connection.
- Phase A operational success satisfied (a working tool to
  pilot).

Outcome: a separate bounded Path C scoping phase begins. Phase A
work is preserved; Path C work is additive only if Phase A
research success was also satisfied. Path C in the absence of
Phase A research success triggers §11.4 instead.

### 11.4 Path A → Path D freeze

Required:
- §3.1 research success not satisfied (null or negative result
  under blinded review), AND
- No §11.2 or §11.3 conditions are met.

Outcome: the project freezes per `STABILIZATION_LESSONS.md` §5's
Path D handling. The publishable artifacts (Phase A results
document, four stabilization documents, this constitution) form
the final record. No further phases begin without a separately-
authorized new project.

### 11.5 Indecision is not an exit

If §11.1–§11.4 conditions are evaluated and none fire cleanly,
this constitutes a §9 review-gate trigger requiring an immediate
truth-checkpoint pass before any direction is chosen. Defaulting
to "let's gather more data" is prohibited. The truth-checkpoint
must declare which of §11.1–§11.4 is closest and what specific
evidence would tip the decision.

---

## 12. Governing principle

> Phase A exists to convert one open question — does the
> trust-gated continuity substrate produce measurably better
> engineering outcomes on real work — into evidence that survives
> external scrutiny; every other consideration is secondary until
> that question has an evidence-backed answer.

This principle governs every §5 / §6 decision. When in doubt
about whether a piece of work is permitted, the test is whether
it directly advances or directly serves the resolution of this
one question. If it does not, the work is out of scope.

---

## 13. Authorization

Phase A authorization is required separately. This document is
operational law only after the document author explicitly
authorizes Phase A to begin. Until then, the constitution exists
as a draft governance framework awaiting activation.

When authorization is granted, the authorization line is recorded
below as a signed entry:

```
Authorized: <not yet>
Date: —
By: —
```

---

*End of constitution. This document is operational law if and when
Phase A is authorized. Until then, no work governed by this
document is legal. Deviations require addenda below.*

## Addenda

*None. Future addenda follow the format:*

```
### Addendum N — <topic> (<date>)
<change description>
Authorized by: <name>
```
