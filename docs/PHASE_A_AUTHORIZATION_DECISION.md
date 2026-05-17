# ManthanOS — Phase A Authorization Decision

> Final gate. Determines whether Phase A is authorized to begin. Cold,
> forensic, decision-oriented. Not motivational. Not optimistic.
> Date: 2026-05-16.

The four governance documents preceding this one — `TRUTH_CHECKPOINT`,
`STABILIZATION_VERDICT`, `STABILIZATION_LESSONS`,
`PHASE_SELECTION_MEMO`, `PHASE_A_CONSTITUTION`, `PHASE_A_PREMORTEM` —
are the inputs to this decision. They are summarized only where
necessary. The decision itself follows.

---

## 1. Current state summary

### 1.1 Validated

- Phase 1.7 single-model drift reduction (MEDIUM confidence, very
  small N: 3 facts, 2 plans, 1 model, 1 project, 1 author).
- Substrate runs end-to-end on Linux (HIGH).
- Trust mechanics: no model self-promotion; transitions audited; undo
  within 7-day window (HIGH).
- Hygiene primitives execute deterministically (HIGH).
- Dedup detector catches engineered paraphrase clusters (HIGH for
  engineered patterns; LOW for real-world generalization).
- Audit chain detects accidental corruption (HIGH within stated
  scope; not tamper-evident against a local attacker).
- Cross-model adapter mechanical path is in place (`adapter-openai`
  built; `cpt-probe --adapter openai` wired; execution blocked at
  provider billing).

### 1.2 Unproven

- Whether continuity helps on real engineering work outside the
  Phase 1.7 microcosm (Q1).
- Whether continuity ports across models (Q2).
- Whether real engineers maintain the trust queue across months
  under realistic conditions (Q3).
- Whether the substrate operates correctly on Windows or macOS for
  real workflows (cross-platform parity is asserted; CI smoke tests
  cover `--version` and `doctor` only).
- Whether the trusted-token plateau observed in long-horizon
  simulations is a substrate property or a workload-and-bug
  artifact.
- Whether the audit chain provides any meaningful security property
  against an active attacker.

### 1.3 Stabilization corrected

- Three substrate correctness bugs: `last_corroborated` semantic
  flaw in decay; `undoCorrection` intervening-correction safety;
  audit metadata `decision='auto-approve'` for human-initiated
  transitions.
- Five documentation overclaims: cross-model "underneath whichever
  AI you happen to use"; "deterministic replay verifies past runs";
  "tamper-evident audit chain"; "ESLint-enforced PAL seam";
  "substrate self-bounds at ~1500 tokens" as a substrate property.
- Absence of an honest security boundary section.
- Cross-model adapter infrastructure built mechanically for the
  bounded E6.1 side-experiment.

### 1.4 What Phase A intends to answer

One question (Q1): under an experimental design that survives
external scrutiny for tautology, does trust-gated re-injection of
human-promoted commitments produce measurably better engineering
outcomes on real work than a no-brain baseline?

Phase A does not intend to answer Q2 (cross-model port) or Q3
(real-user queue maintenance). Phase A may produce signal on Q3
during recruitment but Q3's resolution is a follow-on phase.

---

## 2. Argument for authorization

The strongest evidence-based case for running Phase A now:

- **Cheapest informative path on Q1.** The redesigned Phase 3
  experiment is the lowest-cost way to convert the Phase 1.7
  microcosm result into something larger or to disprove it. No
  alternative produces Q1 evidence at lower cost.
- **The substrate is ready.** Step 1's correctness fixes,
  Step 2's documentation reconciliation, Step 3's security
  posture clarification, Step 4's mechanical adapter work — all
  pre-conditions for honest Phase A execution are met.
- **The governance scaffolding is in place.** The constitution
  defines scope. The pre-mortem identifies failure modes. The
  fourteen hardening amendments name procedural defenses against
  the most likely drifts. No project at this stage has stronger
  pre-execution governance.
- **Null results are informative.** A null Phase A result closes
  Q1 with publishable evidence and triggers a clean Path D
  decision. The 10–15% positive-defensible probability is the
  ceiling; the probability of producing useful research signal
  (in any direction) is substantially higher.
- **Continued "ready but not running" is itself a drift.** The
  project's state is unstable: the longer authorization is
  deferred, the more the context decays and the substrate
  ages. Indefinite delay converts implicitly into Path D
  without the explicit decision Path D would require.
- **The methodology improvements compound.** Even if Phase A
  produces no empirical evidence on Q1, the discipline of
  running a real bounded research phase against a real
  constitution produces methodology artifacts that transfer to
  any subsequent work.

---

## 3. Argument against authorization

The strongest evidence-based case for not running Phase A:

### 3.1 Low probability of externally-defensible positive result

The pre-mortem's §12 estimate is **10–15%**. This estimate is
calibrated against external-reviewer thresholds — not against the
author's internal "I think we have something" judgment. A
research program with a 10–15% probability of producing the
intended outcome is below the threshold most institutional
research budgets would clear.

### 3.2 Methodological-over-product risk

The pre-mortem's verdict explicitly states: *"primary value is
more likely to be methodological than empirical."* This is the
project's most candid admission to date. Running Phase A
primarily to produce more methodology artifacts is the
meta-level version of the mechanism-creep failure mode the
substrate's hygiene loop was supposed to prevent.

### 3.3 Solo-founder operational limitations

Most of the pre-mortem's failure modes are structural to solo
execution:

- External red-team reviewer recruitment.
- External blinded reviewer recruitment (paid freelance).
- Public pre-registration setup and discipline-maintenance.
- Recruitment of ≥1 representative beta user.
- Independent corpus + brief sourcing.
- Mid-phase external review.

None of these are made easier by time alone. They require either
external partnerships or budget that solo founders typically do
not have ready access to.

### 3.4 Reviewer-skepticism threshold structurally unmeetable

PRE_MORTEM §9 enumerates ten properties a skeptical external
reviewer would require. Phase A as designed achieves three to
four. The structural gap between "what Phase A can produce" and
"what would actually convince a skeptic" is not closed by Phase
A; it is closed by Phase A + replication + cross-model + N>5
sustained users + open peer review. Those are multi-phase
prerequisites.

### 3.5 Likelihood of null or ambiguous result

PRE_MORTEM §12's failure-path estimates total ~85%. The
distribution skews toward ambiguous-then-frozen outcomes. A
project's standing is not improved by an ambiguous result; in
some ways it is harmed (the next phase becomes harder to
justify).

### 3.6 Opportunity cost

12–16 weeks of founder time committed to a 10–15% probability
result. The same time could be spent on (a) a separately-scoped
project that has a clearer path to evidence, (b) compliance-
adjacent customer discovery for Path C re-evaluation, or (c)
explicit Path D closure with publication of the four
stabilization documents. Each of these has a higher expected
value than the modal Phase A outcome.

### 3.7 Hardening amendments not yet adopted

The 14 amendments from PRE_MORTEM §11 are recommendations, not
constitutional law. Authorizing Phase A under the current
constitution — without those amendments — runs the higher-risk
version of the experiment. The constitution's discipline is
load-bearing; running Phase A while the load is incomplete is
materially different from running it after the load is fully
placed.

---

## 4. Cost of waiting

What is lost by delaying authorization:

- **Context decay.** Each week, the operational details of the
  substrate become less fresh in the founder's working memory.
  Re-engagement cost grows.
- **AI tooling landscape moves.** Anthropic, Cursor, GitHub
  Copilot, Letta, MCP-shaped tools — each could ship competing
  memory or continuity features in 6–12 weeks. The window in
  which Phase A's result is novel is finite.
- **Stabilization gains atrophy.** The discipline practices
  established during stabilization (truth-checkpoint pattern,
  claim-evidence alignment, anti-drift constitution) require
  active practice to retain.
- **Recruitment difficulty compounds.** Beta-user willingness is
  highest at the moment of personal contact; delays between
  contact and execution lose recruits.
- **Public stabilization artifacts are uncompleted without an
  application.** The lessons document is a methodology
  contribution. Without Phase A as the application, the
  methodology is theoretical.

The dominant cost is the first two: context decay and competitive
window. Both are real but not catastrophic over 2–4 weeks. Both
become significant beyond 8 weeks.

---

## 5. Cost of proceeding

What is risked by authorizing now:

- **12–16 weeks of solo-founder time** committed to a path with
  ~10–15% probability of producing the intended outcome.
- **Higher likelihood of methodology-over-product outcome.**
  Phase A produces well-written documents and no empirical
  resolution on Q1. The project's standing relative to the
  questions it claims to address does not change.
- **Risk of small-effect false-positive.** A marginal effect on
  one task class that gets cited as success internally. The
  constitution forbids this; under pressure, the forbidden
  pattern is most likely.
- **Risk of operational failure mid-phase.** A bug or design
  flaw surfacing partway through, triggering a third
  stabilization cycle and consuming weeks of unbudgeted work.
- **Risk of recruitment failure.** No real user signs on; the
  phase exits at §4 failure criteria with nothing learned about
  Q3 either.
- **Risk of external review surfacing tautology** in the
  redesigned Phase 3 design, requiring re-design and consuming
  sub-phase 1's budget beyond its hard stop.
- **Risk of authorization fatigue.** Running Phase A under
  current constraints, having it produce ambiguous results, and
  then needing to choose between Path B / Path C / Path D in a
  third decision cycle is itself a depletion of decision
  capital.

---

## 6. Hardening amendment review

Evaluation of each of the 14 amendments from PRE_MORTEM §11.
Format: ADOPT / REJECT / DEFER with one-sentence justification.

| # | Amendment | Verdict | Justification |
|---|---|---|---|
| 1 | External corpus + brief sign-off | **ADOPT** | The single highest-leverage amendment. Without external verification, §7 cannot deliver true independence. |
| 2 | Public pre-registration (OSF or equivalent) | **ADOPT** | Cheap; standard practice; defends against forking-paths failure that no internal discipline alone can prevent. |
| 3 | External blinded reviewer (paid freelancer) | **ADOPT** | Author-as-reviewer is the most obvious contamination vector; budget-affordable; high impact. |
| 4 | Commit to open publication regardless of direction | **ADOPT** | Reduces publication-bias-shaped optimism. Costs nothing structural. |
| 5 | Mandatory red-team pass before authorization | **ADOPT** | This is the load-bearing precondition. Without an external red-team pass on the redesigned design, all subsequent work risks the tautology the project specifically designed Phase A to escape. |
| 6 | Hard stop for sub-phase 1 at week 3 | **ADOPT** | Stronger than the constitution's current §10 budgets; prevents the most-likely §1 failure path identified in the pre-mortem. |
| 7 | Explicit gating between sub-phases | **ADOPT** | Already implied by §10 budgets; making it explicit costs nothing and surfaces drift earlier. |
| 8 | Externally-received weekly check-ins | **DEFER** | Useful but adds external dependency that may be hard for a solo project. Adopt later if drift becomes evident. The internal weekly check-in still applies. |
| 9 | Pre-commit exit-condition decision tree with locked thresholds | **ADOPT** | Reduces interpretation latitude at decision time; prevents §11.5 indecision pressure. |
| 10 | Forbidden language list | **ADOPT** | Cheap; high-impact discipline; surfaces hedging-language drift. |
| 11 | Mid-phase adversarial review at week 6 | **ADOPT** | Catches drift; reuses the external reviewer pool that #5 establishes. |
| 12 | Lock CpT formula in pre-registration | **ADOPT** | Critical for §7.5; CpT is the most-gameable metric. |
| 13 | Forbid author as reviewer in any capacity | **ADOPT** | The single most important contamination defense. |
| 14 | Two-track artifact lifecycle (pre-reg vs results timestamping) | **ADOPT** | Cheap; surfaces deviations between pre-registration and final reports. |

**Aggregate: 13 ADOPT, 1 DEFER, 0 REJECT.**

Most amendments are cheap procedural changes. The non-cheap ones —
external red-team reviewer, paid blinded freelancer, public
pre-registration — are exactly the items that determine whether
Phase A is operationally viable under solo execution. Their
assemblability is itself a precondition test.

---

## 7. Minimum conditions for safe authorization

The smallest set of conditions that must be true before
authorization is responsible:

1. **The 13 ADOPT amendments are formally added as constitutional
   addenda.** A single document edit at the bottom of
   PHASE_A_CONSTITUTION.md.
2. **An external red-team reviewer for the redesigned Phase 3
   design has been identified by name and committed in writing
   to perform the review.** Not a hypothetical; a named person
   with stated availability.
3. **A public pre-registration platform account (OSF or
   equivalent) has been created.** Account exists; minimal
   placeholder draft is posted.
4. **A budget for an external blinded reviewer is allocated.**
   ≥$500 (freelance scoring at standard rates for ~20 outputs).
   The budget is committed, not aspirational.
5. **At least one prospective beta user has indicated willingness
   in writing.** A soft pre-commit — a brief email or message
   stating "yes, I would be willing to participate in a
   research-grade trial of this tool for ~4 weeks." Not a legal
   contract; written intent.
6. **The corpus and brief sourcing process has produced at least
   one candidate corpus + candidate brief authoring path that
   the document author has not touched.** A specific public OSS
   project + a specific identified non-author brief writer.

These six conditions are the precondition gate. Each is bounded,
falsifiable, and operationally meaningful. None requires Phase A
work to begin; all require the external infrastructure Phase A
depends on to be demonstrably assemblable.

---

## 8. Most likely outcome if authorized now

If authorized in the current state (without the six preconditions
met): Phase A reaches sub-phase 2 (recruitment) but fails to
assemble the required external infrastructure within budget. By
week 6 the redesigned Phase 3 design has not been externally
reviewed; recruitment has produced zero or one
disciplined-but-non-representative user; the project enters week
8 with no clean experimental track. The week-12 reassessment
fires; sub-phase budgets compress; the eventual closing produces
a Phase A truth-checkpoint that records operational difficulty
and produces no empirical evidence on Q1. The project's
epistemic position is approximately unchanged from where
stabilization closed, with three more months of context decay.

---

## 9. Most likely outcome if not authorized

If not authorized (whether by DELAY or by REJECT): the project
enters a soft-Path-D state. The substrate, stabilization
documents, and pre-mortem remain published as research artifacts.
The author may continue substrate maintenance and answer
occasional questions about the methodology. Within 6–12 months,
the project's relevance decays as AI tooling vendors ship
competing memory or continuity features. The project is cited
intermittently in academic-software contexts as a methodology
example. Phase 1.7 remains the strongest empirical claim and
also the project's last empirical claim. Q1 stays unresolved
indefinitely.

---

## 10. Final authorization verdict

**DELAY AUTHORIZATION.**

This verdict is not "authorize after minor tweaks." It is not
"tentatively authorize." It is a real DELAY, with two
operationally distinct consequences:

- **No Phase A work begins.** The constitution remains a draft
  governance framework; no §5 legal-work activity is permitted;
  no recruitment, no Phase 3 redesign execution, no E6.1
  side-experiment.
- **The six preconditions in §7 must be satisfied within four
  weeks** (by 2026-06-13). If satisfied, return to this document
  with a §10 amendment that records the satisfaction and
  re-evaluates the verdict against the new state. If not
  satisfied within four weeks, the verdict converts automatically
  to **REJECT** — Path D becomes the active phase under
  STABILIZATION_LESSONS §5's handling.

### 10.1 Why DELAY is the honest verdict

- The pre-mortem's 10–15% probability is dominated by structural
  factors that the constitution does not address. Authorizing
  without addressing them is overclaiming the discipline.
- The 13 hardening amendments are not yet adopted; without them,
  the failure-path probability is higher than the pre-mortem
  estimated.
- The six preconditions are themselves the most informative test
  of whether Phase A is operationally viable solo. If the
  preconditions cannot be assembled within four weeks, that
  fact is evidence against Phase A independent of any
  experimental result.
- DELAY does not foreclose AUTHORIZE; REJECT would. DELAY
  preserves optionality with bounded follow-through — exactly
  what STABILIZATION §7 (anti-drift rule #4) requires.

### 10.2 Why not AUTHORIZE

Authorizing now means committing 12–16 weeks of solo founder time
to a 10–15% probability path with the structural defenses
unbuilt. The expected value calculation does not support it.
The pre-mortem explicitly recommended adopting the hardening
amendments *before* authorization, not *after*. Authorizing while
the hardening is incomplete is an overclaim of preparedness.

### 10.3 Why not REJECT

Rejecting Phase A now is rejecting the cheapest path to Q1
resolution without first testing whether the operational
prerequisites are assemblable. REJECT becomes the right verdict
if the preconditions fail; it is not the right verdict until
they fail. Rejecting before that test is itself an overclaim —
asserting that Phase A is infeasible without demonstrating its
infeasibility.

### 10.4 What this verdict explicitly does

- Defers authorization for four weeks.
- Requires §7's six preconditions to be satisfied within that
  window.
- Requires the 13 ADOPT amendments to be added to
  PHASE_A_CONSTITUTION.md as a single constitutional addendum
  before re-evaluation.
- Triggers automatic REJECT if preconditions are not satisfied
  by 2026-06-13.
- Triggers a re-evaluation of this document (not an automatic
  AUTHORIZE) if preconditions are satisfied.

---

## 11. Required next action

**One concrete next step:** add a single constitutional addendum to
`PHASE_A_CONSTITUTION.md` containing (a) the 13 ADOPT hardening
amendments verbatim and (b) the six precondition gates from §7 of
this document. The addendum is one document edit, completable in
under two hours. No work governed by the constitution begins
until that addendum is signed.

After the addendum is signed, the author has up to four weeks to
assemble the six preconditions. The four-week window is the only
work permitted under this verdict; it is precondition-assembly
work, not Phase A work.

---

## 12. Decision signature

- Verdict: **DELAY AUTHORIZATION.**
- Date: 2026-05-16.
- Automatic-conversion trigger: if §7 preconditions are not
  satisfied by **2026-06-13**, this verdict converts to
  **REJECT** without further deliberation.
- Re-evaluation trigger: if §7 preconditions are satisfied at any
  point before 2026-06-13, return to this document with a §10
  amendment recording the new state and re-evaluating the
  authorization verdict against current evidence.

```
Decided: 2026-05-16
By: <name>
```

---

*End of authorization decision. No work governed by
PHASE_A_CONSTITUTION.md begins under this verdict. The
precondition-assembly work permitted by this verdict is itself
out-of-scope of the constitution; it is preparatory administrative
work, not Phase A activity. The decision converts to either
AUTHORIZE (via re-evaluation) or REJECT (via automatic conversion)
on or before 2026-06-13.*
