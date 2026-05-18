# HIGHEST_LEVERAGE_ENHANCEMENTS

> **Status:** Systems-prioritization memo. Not a roadmap.
> **Date:** 2026-05-18.
> **Stance:** Principal-engineer review of what would most
> strengthen the substrate's *trust, usefulness, evidence,
> and clarity* — and what would weaken it if pursued too early.
> **Constraints:** No implementation work. No commitments. No
> feature explosion. No speculative AGI framing.

The project has reached a stage where feature breadth would
*subtract* value. The substrate's discipline — workspace-scoped,
human-gated, audit-traceable, run-and-exit — is the moat. Every
addition needs to be judged not on "is it useful" but on
**"does it preserve the discipline that makes the rest work."**

For each candidate enhancement, this memo records:

- **What problem it solves** — concrete, not aspirational.
- **Why it matters** — the leverage rationale.
- **Expected leverage** — what we'd observe if it worked.
- **Implementation complexity** — low / medium / high.
- **Drift risk** — how easily this addition could pull the
  product toward Hermes-style autonomy or infinite-memory framing.

The memo is intentionally short on candidates and long on
justification. Few items. High filtering.

---

## 1. Continuity quality enhancements

The substrate's value is the *quality* of what reaches the next
prompt. These items improve that quality without changing what's
stored.

### 1.1 Brief-aware relevance preview

- **Problem:** Users have no surface that tells them which trusted
  facts are likely to matter for the brief they're about to run.
  Per `EARLY_FEEDBACK_SYNTHESIS.md` §4.3.1, the shaping rule is
  tier/area/confidence — not topical relevance to the brief.
- **Why it matters:** Closes the largest user-visible quality gap
  named in real external feedback. The fix is purely additive
  (a preview surface), not a re-architecting of shaping.
- **Expected leverage:** Users notice off-topic facts before the
  bundle is sent; they pre-emptively narrow via `--include-areas`
  or skip a problematic run.
- **Implementation complexity: medium.** Requires a simple
  token-overlap or TF-IDF-style score between brief and each
  trusted fact. No embeddings (would cross the
  "no-semantic-retrieval" line from `CONTINUITY_THEORY.md`).
- **Drift risk: medium.** The line between "show relevance"
  (acceptable) and "let the system decide relevance"
  (architectural drift toward auto-curation) is thin. The
  preview must stay informational; the *bundle composition*
  must remain deterministic.

### 1.2 Omission visibility in `manthan plan`

- **Problem:** `BundleMetrics.omittedFacts` already records every
  trimmed/omitted fact with a reason (`budget_overflow`,
  `below_min_confidence`, `tier_below_floor`). That information
  is not surfaced in CLI output. Users with `trustedFactsTokenBudget`
  active have no idea which facts didn't make the bundle.
- **Why it matters:** Transparency-as-feature. The substrate already
  computes this; the question is whether the user sees it. Surfaces
  the disciplined trade-offs the shaping pass makes.
- **Expected leverage:** Users adjust their shaping config (or
  decay-promote some facts off the bottom of the trusted layer) in
  response to seeing what's omitted.
- **Implementation complexity: low.** The data is already in the
  `BundleMetrics` object; needs a print path in `plan.ts`.
- **Drift risk: low.** Surfacing existing data does not introduce
  new architectural commitments.

### 1.3 Continuity drift detection (off-topic brief warning)

- **Problem:** A brief with near-zero token overlap with the
  workspace's trusted layer still gets the full trusted set sent
  to the model. Named as unresolved in
  `EARLY_FEEDBACK_SYNTHESIS.md` §4.3.3.
- **Why it matters:** Cross-project contamination's most plausible
  failure mode is "user in workspace A asks a question that
  belongs to workspace B." A drift warning catches this before
  the bundle goes out.
- **Expected leverage:** Users notice they're in the wrong
  workspace; or they explicitly choose to bypass the warning.
- **Implementation complexity: low.** Same token-overlap math as
  §1.1 but at the bundle level (does ANY trusted fact share
  tokens with the brief?).
- **Drift risk: low.** A warning is informational; no behavior
  changes silently.

### 1.4 Decay / aging visibility in `manthan plan` preflight

- **Problem:** `manthan brain queue-health` exists, but users have
  to know to run it. Stale facts can accumulate silently until
  they degrade output quality.
- **Why it matters:** Surfaces queue-health *at the moment of
  use*, not as a separate ritual. Aligns with the substrate's
  "make accumulation visible before it hurts" discipline.
- **Expected leverage:** Users see "12 trusted facts haven't been
  touched in 60+ days" inline with `manthan plan`; they age them
  out before the next run.
- **Implementation complexity: low.** One SQL query, one summary
  line.
- **Drift risk: low.**

### 1.5 Promoted-fact provenance in bundle output

- **Problem:** When `--show-trusted` displays the trusted layer,
  it shows tier and statement but not *which run originally
  introduced this fact* or *which run promoted it*. Provenance
  is in the audit chain; it's not in the preview.
- **Why it matters:** Users can't currently audit why a fact is
  in the bundle without leaving the plan flow. This is the
  smallest gap between the substrate's promise (auditable
  continuity) and the user-facing surface.
- **Expected leverage:** Users challenge facts they don't recognize
  ("when did I promote that?") and demote when appropriate.
- **Implementation complexity: low.** JOIN against the audit log
  in the preview path.
- **Drift risk: low.**

---

## 2. Human workflow ergonomics

Workflow ergonomics is the thing humans abandon a tool over.

### 2.1 7-day undo window discoverability

- **Problem:** Per `OCTO_REVIEW_PRE_USER_TESTING.md` §B/H6.2, the
  audit chain has `undo-correction <seq>` with a 7-day window —
  but a user who made a wrong promotion has to know:
  - That undo exists
  - That it's 7 days
  - The seq number of the action they want to undo
- **Why it matters:** Trust is built when mistakes are recoverable.
  If the recovery path is invisible, the trust benefit doesn't
  land.
- **Expected leverage:** After a `brain review`, the output prints
  "Undo with: manthan brain undo-correction <seq>" (this *already
  partially exists* in `brain-review.ts:578-583`). Extending the
  pattern: every trust mutation prints the seq number of the
  event needed to undo it, prominently.
- **Implementation complexity: low.** Already partially in place;
  needs propagation to other surfaces (promote/demote/merge).
- **Drift risk: low.**

### 2.2 Confidence-sorted T0 queue (alongside chronological)

- **Problem:** `brain review` lists T0 facts by `last_corroborated`
  ascending — oldest first. A user with 20 facts to review has no
  way to surface "the 3 most confident ones the LLM extracted, so
  I can promote those quickly and skip the rest."
- **Why it matters:** Triage cost dominates promotion behavior
  (per `FIRST_REAL_WORKFLOW_HYPOTHESES.md` H2.4 — skip dominates
  promote). Confidence-sorted view reduces the cognitive cost of
  the first-pass triage.
- **Expected leverage:** Per-session promotion count rises; skip
  ratio drops; users feel they're making efficient decisions.
- **Implementation complexity: low.** Add `--sort=confidence`
  flag (or make it the new default and add `--sort=age` for the
  current behavior).
- **Drift risk: low.** Sort order is a UX preference, not a
  semantic change.

### 2.3 Workspace-root discovery for non-init commands

- **Problem:** Per `OCTO_REVIEW_PRE_USER_TESTING.md` §C10: `manthan
  init` now correctly detects "you're in a git subdirectory" and
  suggests `cd <repoRoot>`. The other commands (`plan`, `doctor`,
  `brain *`, `replay`) still use cwd as workspace root. Users
  invoking from a subdir hit "workspace not initialized" with no
  guidance.
- **Why it matters:** Monorepo users are real; consistency between
  init and the rest of the CLI is a baseline expectation.
- **Expected leverage:** Subdirectory invocations either work (if
  walking up) or emit "your workspace appears to be at <path>,
  run from there" instead of a misleading "not initialized."
- **Implementation complexity: medium.** Touches every command that
  resolves a workspace; some commands have legitimate reasons to
  prefer cwd (e.g., when init is the next step). Needs care, not
  a sweeping rewrite.
- **Drift risk: low.** Mechanical fix.

### 2.4 Post-plan T0 review nudge with sample preview

- **Problem:** `plan.ts:233-251` already prints the "N facts in
  quarantine; run `manthan brain review`" footer. Users may not
  realize the facts include items they explicitly mentioned in
  the brief. A 1-line preview ("...e.g., 'use bcrypt for password
  hashing'") would make the queue feel less abstract.
- **Why it matters:** The brain-review queue is invisible until a
  user opens it. A preview tip reduces the activation energy.
- **Expected leverage:** Increased proportion of plans that result
  in a `brain review` session within 1 hour.
- **Implementation complexity: low.** Sample one or two random
  T0 statements from the run; print truncated.
- **Drift risk: low.**

### 2.5 `manthan plan --explain` flag

- **Problem:** A user receives a plan with no surface that says
  "this plan was shaped by these N trusted facts; here are
  the M promoted in the last 7 days that are most likely
  relevant; here is the bundle hash so you can `replay`." This
  information is *almost all* available; it's just not
  consolidated.
- **Why it matters:** One CLI flag turns the substrate's "we
  recorded everything" promise into a "you can see what we used"
  experience.
- **Expected leverage:** A first tester runs `--explain` once
  after their second plan; they verbalize "ah, that's what this
  is doing."
- **Implementation complexity: medium.** Pulls together data from
  brain, audit chain, and bundle metrics; renders as a single
  inspection view.
- **Drift risk: low.**

---

## 3. Evidence-generation improvements

The project has lots of synthetic evidence (Phase 1.6 simulation).
It has zero real-workflow evidence. Closing that gap is the highest
leverage available right now — higher than any feature.

### 3.1 First-5 case-study archive

- **Problem:** No documented record of real-workflow usage exists.
  When a future advisor / contributor / collaborator asks "does
  it actually work for engineering," we cite a synthetic
  simulator.
- **Why it matters:** A handful of well-documented case studies
  (one per real tester, written *with* them) is the highest
  evidence-fidelity artifact the project can produce per unit of
  effort. Beats any benchmark.
- **Expected leverage:** Within a quarter, the project has 3-5
  case studies showing real promoted-fact reuse, real
  re-priming-cost reduction (qualitatively), real failure
  recovery via undo.
- **Implementation complexity: low.** Pure documentation work,
  governed by the testers' willingness to share.
- **Drift risk: low.** Case studies do not change the substrate.

### 3.2 E6.1 cross-model continuity experiment (already designed)

- **Problem:** The most important claim — that the substrate's
  output is useful across providers — has no live measurement.
  Designed in `docs/PHASE3_CPT.md` §6 / `docs/TRUTH_CHECKPOINT.md`
  §6. Not run.
- **Why it matters:** A single executed E6.1 produces the
  load-bearing evidence for the project's multi-model
  positioning. A null result is a falsification — which is also
  high-leverage information.
- **Expected leverage:** Either positive result (the substrate
  works cross-model — positioning gains evidence), or null
  result (positioning narrows to single-tool, per
  `FIRST_REAL_WORKFLOW_HYPOTHESES.md` N1). Both move the project
  forward.
- **Implementation complexity: medium.** The harness exists;
  the cost is provider time + a careful writeup.
- **Drift risk: low.** Already designed inside the discipline.

### 3.3 Continuity-failure archive

- **Problem:** When the substrate doesn't help (or actively hurts)
  a workflow, we have no place to put that. Without a structured
  failure archive, the project will only learn from successes.
- **Why it matters:** Codifies negative-result discipline.
  Mirrors `TRUTH_CHECKPOINT.md`'s "invalidated" section for
  product-level claims.
- **Expected leverage:** Six months in, the project can point at
  a documented archive of "here's where continuity hurt; here's
  what we did about it." This is the kind of artifact serious
  reviewers respect.
- **Implementation complexity: low.** A markdown subdirectory.
- **Drift risk: low.**

### 3.4 Recordable re-priming reduction (qualitative)

- **Problem:** The substrate's value proposition includes
  "reduces re-priming cost." That's measurable in a
  conversational sense — testers can self-report whether they
  spent less time re-explaining the project this session vs the
  prior one. We have no rubric for capturing that.
- **Why it matters:** Re-priming reduction is the most visceral
  user-side measure of continuity working. A simple
  before/after question in tester interviews produces signal.
- **Expected leverage:** First-cohort tester reports give a
  qualitative "yes / unchanged / no" signal across multiple
  sessions; the aggregate is meaningful even at N=5.
- **Implementation complexity: low.** Interview-protocol work,
  not code.
- **Drift risk: low.**

### 3.5 Trust-impact observation (do model outputs use trusted facts?)

- **Problem:** Per `FIRST_REAL_WORKFLOW_HYPOTHESES.md` H1.2 —
  trusted facts may or may not be referenced by the model. The
  CpT harness can measure shared-token-counts, but doing this
  on real briefs across the cohort is the load-bearing
  evidence.
- **Why it matters:** This is the most basic question about
  whether continuity *works at all*. If a tester's promoted facts
  are not visible in subsequent plan outputs, the trust ladder
  isn't doing what it claims.
- **Expected leverage:** A few hundred bundle-output pairs across
  the cohort generate enough signal to falsify or confirm.
- **Implementation complexity: low.** The CpT harness's
  shared-vocabulary metric already exists; needs to be run on
  real workspaces rather than synthetic ones.
- **Drift risk: low.**

---

## 4. Safety / trust hardening

These are items from the `OCTO_REVIEW_PRE_USER_TESTING.md` §C
list — fix-before-public-launch items that are not blockers
for first-5 testing but are blockers before any broader rollout.

### 4.1 Workspace-boundary enforcement for `--file`

- **Problem:** `packages/context/src/packer.ts:187-227` (per
  `OCTO_REVIEW_PRE_USER_TESTING.md` §C4) trusts user-provided
  `--file` paths verbatim. `--file=../../etc/passwd` escapes the
  workspace root.
- **Why it matters:** Security defense in depth. A workspace
  containment check is the kind of guarantee the substrate's
  positioning ("local-first by construction") quietly implies.
- **Expected leverage:** Closes the only obvious file-escape
  vector. Removes a hypothetical "ManthanOS was used to exfil
  ~/.ssh/id_rsa" story.
- **Implementation complexity: low.** Reject any `--file` whose
  `path.resolve(...)` does not `startsWith(workspaceRoot)`.
- **Drift risk: low.**

### 4.2 Tool-call argument redaction

- **Problem:** Per `OCTO_REVIEW_PRE_USER_TESTING.md` §C6 / Codex
  audit: `packages/orchestrator/src/plan-runner.ts:49-66`
  redacts `response.text` but leaves `response.canonical.tool_calls`
  un-redacted. A secret leaked through a tool-call argument
  persists into the audit blob.
- **Why it matters:** Redaction's purpose is to defend the audit
  log. Half-applied redaction is worse than no redaction (creates
  false confidence).
- **Expected leverage:** The redaction guarantee is whole.
- **Implementation complexity: low.** Run the existing redactor
  over the canonical payload's `tool_calls` field.
- **Drift risk: low.**

### 4.3 Redaction visibility in `manthan plan` output

- **Problem:** When the redactor strips content, the user sees
  "redactions: api_key×2, jwt×1" in the run summary but doesn't
  see *where* in the response the redaction happened, or what
  was approximately there.
- **Why it matters:** Users currently have to trust that the
  redactor caught the right things. Visibility into where and
  what (loosely) was redacted increases trust in the substrate.
- **Expected leverage:** Users verify the redactor on their own
  outputs; their trust in the system increases beyond
  documentation claims.
- **Implementation complexity: low.** The redactor already
  records spans; surface them.
- **Drift risk: low.**

### 4.4 Audit-log readable view (chronological summary)

- **Problem:** Per `OCTO_REVIEW_PRE_USER_TESTING.md` §B3, the
  `manthan audit *` commands listed in SAFETY_MODEL §13 don't
  exist. A reasonable first step is a single `manthan audit log
  [--limit N]` that prints the last N audit events in a
  human-readable format.
- **Why it matters:** Closes the most reputation-damaging gap from
  the audit (SAFETY_MODEL describes commands that don't exist).
  Single-command, low surface area.
- **Expected leverage:** A user who reads SAFETY_MODEL §7 and
  tries to inspect the audit log can do so. Closes a credibility
  gap.
- **Implementation complexity: low.** SELECT + pretty-print.
- **Drift risk: low.** Implements what's already documented.

### 4.5 Queue-health proactive surface

- **Problem:** `manthan brain queue-health` exists but is opt-in.
  When the queue is DEGRADED, users only know if they ask. The
  warning should surface at the moment of use (in `manthan plan`
  output if degraded conditions are present).
- **Why it matters:** Operational hygiene becomes load-bearing as
  workspaces age. Proactive surfacing prevents silent decay of
  bundle quality.
- **Expected leverage:** Users notice DEGRADED status without
  invoking the diagnostic; act on it before output quality
  visibly suffers.
- **Implementation complexity: low.** Run a lightweight version
  of the queue-health check inline; surface only when non-HEALTHY.
- **Drift risk: low.**

---

## 5. Strategic anti-goals — what would weaken the project if pursued too early

These are explicit *do-not-pursue* items. Each is named because
each would be plausible to argue for, and each would compromise
the substrate's discipline if accepted.

### 5.1 Autonomous agents

- **Why tempting:** Every other "AI tool" in 2026 is racing to add
  agent loops. The lateral pressure to "do that too" is constant.
- **Why it would weaken the project:** Autonomy negates the
  human-gated trust ladder. The substrate's value depends on the
  fact that a human approved every promotion; "the agent
  decided" inverts that property at its root.
- **Drift risk if pursued: high.**
- **Discipline:** Stay run-and-exit. Stay "every effectful action
  is approved." If autonomy is needed for a specific workflow,
  add a *new* command surface that's explicitly bounded — never
  retrofit the existing commands.

### 5.2 Daemon / always-on runtime

- **Why tempting:** Background processing, scheduled tasks,
  "always available" assistant patterns. Hermes Agent ships this.
- **Why it would weaken the project:** A daemon is a long-lived
  state machine. The substrate is currently a recoverable flat-
  file store. Adding a daemon multiplies failure modes (crash
  recovery, IPC, port allocation, supervisor logic) and changes
  the threat model.
- **Drift risk if pursued: high.**
- **Discipline:** Keep `manthan plan` as run-and-exit. If
  scheduled workflows become real demand, they go through cron
  or systemd, not through a ManthanOS-owned daemon.

### 5.3 Hidden / background mutation

- **Why tempting:** "Auto-promote facts that have appeared 5+
  times." "Auto-archive after 90 days." "Auto-merge near-duplicates
  on detection." Each is mechanically defensible.
- **Why it would weaken the project:** Every silent mutation is
  a future surprise. The substrate's audit-chain `decision` field
  exists specifically to distinguish `human-approved` from
  `auto-approve`. Expanding the latter category dilutes the
  human-gating story.
- **Drift risk if pursued: high.**
- **Discipline:** The current `auto-approve` use is *narrow*
  (decay's `last_administratively_touched` adjustments, never
  tier changes). Keep it that way. New "automatic" features need
  a separate approval gate per event, not blanket consent.

### 5.4 Self-improving memory

- **Why tempting:** Hermes' explicit framing; intuitive narrative
  ("the substrate gets better over time").
- **Why it would weaken the project:** The substrate's discipline
  is that *humans* improve it via promotion and demotion. The
  word "self-improving" is in the never-publicly-appear list in
  `TERMINOLOGY_AUDIT.md` §5. Building toward it would require
  abandoning the trust ladder.
- **Drift risk if pursued: high.**
- **Discipline:** Improvements come from human curation. If
  workflow heuristics are added later (e.g., "show me the facts
  most often referenced in recent plans"), they are *suggestions*
  for human review, never automatic mutations.

### 5.5 Cloud sync

- **Why tempting:** Multi-machine workflows; team collaboration;
  "always have your brain wherever you are."
- **Why it would weaken the project:** Local-first is a deliberate
  constraint. Cloud sync changes the threat model (network
  exposure, identity management, conflict resolution),
  introduces dependencies on infrastructure the project would
  have to run, and conflicts with the "no account, no login"
  property documented in README §6.
- **Drift risk if pursued: high.**
- **Discipline:** `.manthan/` is in a git repo. If multi-machine
  is desired, `git push` already works. If teams need shared
  brains, that's a deliberate larger conversation governed by a
  Phase ≥4 checkpoint memo.

### 5.6 Swarm orchestration

- **Why tempting:** "Run 5 models in parallel against the same
  brief; let the substrate arbitrate." Sounds powerful.
- **Why it would weaken the project:** Coordinator complexity
  scales superlinearly. The project's positioning is
  *continuity*, not *arbitration*. Adding a swarm layer expands
  the failure-mode surface and the documentation surface without
  evidence the underlying claim works at all (E6.1 hasn't run).
- **Drift risk if pursued: high.**
- **Discipline:** One adapter per `manthan plan` invocation. If
  arbitration becomes interesting, it comes after — and only after —
  cross-model continuity is *measured*.

### 5.7 Broad SaaS / platform ambitions

- **Why tempting:** Investor framing; "platform" is a more
  defensible business than "CLI."
- **Why it would weaken the project:** SaaS implies multi-tenancy,
  which conflicts with workspace isolation, the local-first
  threat model, and the BSL 1.1 license rationale. The project's
  current commercial model is BSL with optional commercial-use
  licenses; that path is intact. SaaS is a different product.
- **Drift risk if pursued: high.**
- **Discipline:** Stay local-first. If hosted-ManthanOS becomes a
  real demand, it is a *separate* product, not an evolution of
  this one.

### 5.8 Hype-driven AI framing

- **Why tempting:** Market pressure to use the language everyone
  else uses. "Cognition," "intelligence," "self-improving,"
  "infinite memory."
- **Why it would weaken the project:** Per
  `TERMINOLOGY_AUDIT.md` §5 — these terms have been deliberately
  removed. Their return contradicts substrate claims. The
  positioning correction work
  (`POSITIONING_CORRECTION.md`) and the language sweep
  (commit `edb747b`) are the load-bearing public commitments.
- **Drift risk if pursued: high.**
- **Discipline:** The canonical vocabulary is in
  `TERMINOLOGY_AUDIT.md`. New writing draws from it. New
  marketing surfaces submit to the same constraints.

---

## 6. What this memo deliberately does not do

- It does not propose a roadmap. Each candidate enhancement is
  named for *consideration*, not commitment.
- It does not specify acceptance criteria, timelines, or owners.
- It does not propose telemetry, analytics, or instrumentation to
  measure the enhancements' effectiveness.
- It does not propose new architecture, new primitives, or new
  packages.
- It does not predict that any specific enhancement will be done
  in any specific order.
- It does not soften the §5 anti-goals to leave room for
  ambiguous half-measures. The anti-goals are hard.

The memo's job is to give a future engineer or contributor —
human or LLM — **a filter** for evaluating ideas: does this
candidate enhancement preserve the substrate's discipline, or
does it pull the project toward Hermes-style autonomy / infinite
memory / hype framing? The §5 list answers the second half
explicitly; the §1-§4 candidates answer the first half by example.

---

## 7. Implementation-complexity × drift-risk matrix

For quick reference, the §1-§4 candidates plotted by cost and
drift:

| Item | Complexity | Drift risk |
|---|---|---|
| 1.1 Brief-aware relevance preview | medium | medium |
| 1.2 Omission visibility in `plan` | low | low |
| 1.3 Continuity drift detection | low | low |
| 1.4 Decay visibility preflight | low | low |
| 1.5 Promoted-fact provenance in preview | low | low |
| 2.1 Undo discoverability | low | low |
| 2.2 Confidence-sorted T0 queue | low | low |
| 2.3 Workspace-root discovery (other commands) | medium | low |
| 2.4 Post-plan T0 nudge with preview | low | low |
| 2.5 `manthan plan --explain` flag | medium | low |
| 3.1 First-5 case-study archive | low | low |
| 3.2 E6.1 cross-model experiment | medium | low |
| 3.3 Continuity-failure archive | low | low |
| 3.4 Re-priming reduction (qualitative) | low | low |
| 3.5 Trust-impact observation | low | low |
| 4.1 Workspace-boundary enforcement (`--file`) | low | low |
| 4.2 Tool-call argument redaction | low | low |
| 4.3 Redaction visibility | low | low |
| 4.4 `manthan audit log` command | low | low |
| 4.5 Queue-health proactive surface | low | low |

The cluster shape is intentional: **low-cost, low-drift items
dominate.** That is what a healthy enhancement candidate list
looks like at this stage. If a future memo proposes a
high-complexity, high-drift item, it is — by construction — a
candidate for the §5 list, not the §1-§4 list.

Only one item (1.1, brief-aware relevance preview) carries
medium drift risk; it is named that way explicitly because the
line between "preview" and "auto-curation" is real and worth
guarding.

---

## 8. One-sentence summary

> **At this stage, leverage compounds from low-cost,
> discipline-preserving polish — visibility into what the
> substrate already records, ergonomic improvements to the human
> review loop, qualitative evidence from real workflows, and
> security hardening already named in the audit. Leverage
> *decays* from any addition that resembles autonomy, daemons,
> hidden mutation, self-improvement, cloud sync, swarms, SaaS,
> or hype vocabulary. The §5 anti-goals are not "later"; they
> are *not.***

If a future memo proposes an item that conflicts with that
sentence, that memo is the one that should change — not this one.
