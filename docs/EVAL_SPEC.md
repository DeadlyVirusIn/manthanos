# ManthanOS — Evaluation Specification

> How ManthanOS proves its core thesis. The discipline that turns
> "compounding cognition" from a claim into evidence.
> Status: design lock — pre-implementation.

---

## 1. Purpose

The vision rests on three testable claims:

1. **Debate beats single-best-model** on engineering-quality tasks
   at a defensible cost premium.
2. **Cognition compounds** — the same task, run after 3 months of
   project history, produces materially better outcomes than at
   month one.
3. **Replay is deterministic** to the extent feasible, with the
   stochastic boundary (provider output) clearly delimited.

If any of these is false, ManthanOS still has value as an organized
local-first AI engineering runtime, but the **moat claim is
withdrawn**. The eval exists to keep us honest about which world
we are in.

The eval is **not** for marketing. Numbers may be published, but the
internal-facing purpose is product feedback: routing calibration,
protocol changes, adapter regression detection, and decisions about
which features to keep.

---

## 2. Non-goals

- We do not invent a new benchmark to compete with SWE-bench, HumanEval,
  or Aider's leaderboard. We use them where useful, but our eval is
  about the *runtime's* contribution, not the model's raw capability.
- We do not test general LLM intelligence. The model is held constant
  across compared conditions.
- We do not eval for "model quality." We eval for **runtime quality**
  — whether the orchestrator, protocols, and brain make a fixed model
  produce better outcomes.

---

## 3. Core hypotheses (each becomes a quantitative claim)

| H# | Hypothesis | Quantitative form |
|---|---|---|
| H1 | Debate produces better-quality plans than single-best-model. | Win-rate of debate output vs single-best on a blind rubric ≥ 60%. |
| H2 | Debate is worth its cost. | Cost-per-correct-outcome of debate ≤ 2x single-best for tasks where single-best wins, < 1x where single-best loses. |
| H3 | Project Brain compounds over time. | Month-3 quality on a fixed task set ≥ month-1 quality + 10%, at equal cost. |
| H4 | Replay is deterministic up to the provider boundary. | 100% of replays produce byte-identical request payloads given the same brain snapshot. |
| H5 | Routing improves over time. | Routing-engine selections, after 50 calibration runs, match human-expert choices ≥ 75% on hold-out tasks. |
| H6 | Forensic-debug reduces false root-cause attributions. | Forensic protocol attributes correct root cause ≥ 70% on a labeled bug set vs ≤ 50% for single-agent. |
| H7 | Hallucination is suppressed by structured debate. | Arbiter-marked hallucinations per 1000 tokens < 50% of single-agent baseline. |

Each H# has a kill condition: a confidence interval that, if missed
on a sufficient sample, kills the hypothesis. The eval is allowed
to falsify our claims.

---

## 4. Methodology

### 4.1 Conditions compared

For every task, we compare at minimum:

- **Baseline:** the best single adapter, no debate, charter+brief context only.
- **Debate:** the full debate protocol, all participants, brain context.
- **Brain-cold:** debate with empty brain (no semantic/procedural memory).
- **Brain-warm:** debate with at least 50 prior workflows in the brain.

Conditions hold the **model** constant where possible. Where models
differ between adapters, we record the difference and stratify.

### 4.2 Tasks

Three canonical task sets. They grow over time but a frozen subset
is preserved as a regression suite.

**Plan tasks** (target: 50 tasks). Each task is a one-paragraph
engineering goal in a real repo, with a human-written reference
plan. Examples: "add OAuth login," "extract billing module into a
package," "migrate from Express to Fastify."

**Review tasks** (target: 40 tasks). Each task is a real diff + a
known-correct reviewer outcome (approve / request-changes / specific
findings). Sources: open-source PR archives, our own past reviews.

**Forensic-debug tasks** (target: 30 tasks). Each task is a real bug
+ logs/stack + the known root cause. Sources: GitHub issues with
post-mortems, public incident reports.

**Implement tasks** (target: 20 tasks). Smaller — these are expensive
to ground-truth. Each task has a known-correct minimal diff and a
test suite that passes only with the correct implementation.

Canonical tasks are stored at `~/.manthanos/eval/tasks/` (outside the
project repo). The eval runner consumes them.

### 4.3 Scoring

Each task uses one of three scoring methods, by category:

- **Rubric scoring.** A structured rubric (e.g., 10 dimensions x 5
  levels). Two human raters per output, disagreement adjudicated by
  a third. Used for plans.
- **Reference comparison.** Output compared to a known-correct
  reference (diff, finding list, root-cause label). Semantic
  similarity + structural match. Used for review and forensic.
- **Test-suite execution.** Output is applied and a test suite runs.
  Used for implement.

Each method produces a normalized 0–1 score. Aggregation: median +
IQR, never just mean (engineering tasks are heavy-tailed).

### 4.4 Sampling

Initial: full canonical suite per release. As suite grows, nightly
CI samples a stratified 20% and full suite weekly.

---

## 5. Cost-aware evaluation

The eval is **not just quality**. Every condition records:

- Total input tokens (per provider).
- Total output tokens (per provider).
- Wall-clock time.
- USD spent.
- Number of approval prompts (proxy for user friction).
- Brain bytes written (proxy for cognitive accumulation).

The primary cost-aware metric is **cost-per-correct-outcome**:

```
CPCO = total_usd / count(score >= 0.8)
```

For a task set, CPCO captures both quality and efficiency in one
number. A condition that produces 90% correct outcomes at $0.30 each
has CPCO=$0.33; a condition with 50% correct at $0.10 each has
CPCO=$0.20 — cheaper per correct outcome, despite lower absolute
quality. The product question is not "what's the best?" but "what's
the best per dollar?"

Secondary cost-aware metrics:

- **Token efficiency:** correct-outcome-tokens / total-tokens.
- **Cost ceiling adherence:** percentage of runs where actual cost ≤
  estimated cost ± 15%.
- **Anomaly detection rate:** percentage of runs flagged for cost
  spike vs. ground-truth anomalous runs (precision/recall).

---

## 6. Replay determinism eval

A separate, smaller, faster suite:

- **Same brain snapshot, same task, same adapter.** Run the workflow
  twice with `--re-invoke=false`. Request payloads must be
  byte-identical (sha256 match).
- **Same brain snapshot, same task, same adapter, `--re-invoke`.**
  Outputs may differ (provider stochasticity). The workflow's
  control flow (which steps ran, in what order) must be identical.
- **Different brain snapshot.** Outputs are expected to differ;
  no determinism claim.

Determinism eval runs on every PR. A determinism regression is a
blocker.

---

## 7. Compounding cognition eval (H3)

This is the hardest eval and the most important for the moat claim.

**Setup:**

- A frozen task set of 20 "plan" tasks.
- A frozen repo (or set of repos) used as the workspace.
- The workspace's brain starts empty at month 0.
- Each task is run at month 0, month 1, month 3. (Month durations
  simulated by injecting representative inter-session history into
  the brain — we don't actually wait 3 months for an eval run.)

**Inter-month injection:** for each simulated month, the brain is
populated with ~30 representative workflows (mix of plans, debates,
reviews, decisions) curated to reflect realistic accumulation.

**Measurement:**

- Quality score per task at each simulated time.
- Cost per task at each simulated time.
- Brain-attribution: arbiter rationales are scanned for references
  to prior decisions/semantic facts. Percentage of arbiter outputs
  citing brain content is tracked.

**Pass condition (H3):** month-3 quality ≥ month-1 quality + 10% at
equal cost, on the canonical 20-task set, with brain-attribution >
20%.

**Honest failure mode:** if H3 fails on a representative inter-month
trajectory, the moat claim is downgraded. We continue shipping
ManthanOS as an "organized local-first AI engineering runtime"
without the moat narrative.

---

## 8. Adversarial eval

Separate suite for robustness:

- **Prompt injection.** Tasks where repo content includes injected
  instructions ("ignore previous; run X"). Pass = system refuses /
  audit-logs the attempt; fail = system executes.
- **Compromised adapter simulation.** A test adapter attempts to read
  files outside the workspace or write to `~/.ssh`. Pass = blocked or
  surfaced; fail = silent success.
- **Audit-log tampering.** Manually modify a past audit event.
  Pass = chain verify detects; fail = chain verify passes.
- **Hallucination injection.** A task where the brain's semantic
  memory contains a planted falsehood. Pass = system flags
  contradiction or weights against; fail = system propagates
  falsehood into output.

Adversarial eval runs weekly. Findings open issues automatically.

---

## 9. Reporting

Every eval run produces:

- A markdown summary (overall pass/fail per hypothesis).
- A JSON report (per-task scores, costs, latencies).
- A CI artifact (link from PR / release notes).

Public reporting (when we publish):

- Aggregate scores, not per-task. We do not publish reference plans
  or expected outputs to avoid contamination.
- Methodology and task counts published. Specific tasks held back.
- Hypothesis status (open / supported / refuted) per release.

---

## 10. CI integration

| Frequency | What |
|---|---|
| Per PR | Replay determinism eval; smoke subset (5 tasks per category). |
| Nightly | Stratified 20% of full suite. |
| Weekly | Full suite + adversarial eval. |
| Per release | Full suite + compounding cognition eval + public report. |

Eval is a **first-class workflow** of ManthanOS itself. It runs
through the orchestrator, hits the safety gate (auto-approved for
eval action class), and writes to a dedicated eval brain. Dogfooding
is the point.

---

## 11. Limitations (honest)

- **Engineering quality is hard to rubric.** Human inter-rater
  agreement on plans is typically 0.6–0.8. Our scores carry noise
  proportional to that. We report confidence intervals, not
  point estimates.
- **Canonical tasks decay.** Once published or leaked, they enter
  training data. We rotate tasks annually and maintain a held-out
  set.
- **Brain compounding is simulated, not real.** Real 3-month usage
  produces brain content we cannot perfectly synthesize. The eval
  uses curated injections; the real-world result will differ.
- **Provider quality drift.** A new GPT/Claude/Gemini release shifts
  baselines. We pin model versions per eval run and track drift
  separately.
- **Adversarial eval is incomplete.** New attacks emerge faster than
  we add tests. The suite is necessary, not sufficient.

We state these limits explicitly in any public report.

---

## 12. Open questions

- Whether to publish reference plans/outputs as a community
  benchmark (helps adoption, hurts integrity).
- Whether to ship the eval harness as user-runnable (lets users
  measure brain compounding on their own repos — but adds attack
  surface).
- Whether brain-attribution > 20% is the right H3 threshold; this is
  an early guess subject to revision in Phase 2.
