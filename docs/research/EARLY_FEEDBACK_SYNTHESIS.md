# EARLY_FEEDBACK_SYNTHESIS

> **Status:** Research / product synthesis memo. Not marketing.
> **Date:** 2026-05-17.
> **Source:** External feedback from advanced users on cross-project
> isolation and long-context degradation concerns.
> **Predecessors:**
> [`docs/POSITIONING.md`](../POSITIONING.md),
> [`docs/POSITIONING_CORRECTION.md`](../POSITIONING_CORRECTION.md),
> [`docs/TRUTH_CHECKPOINT.md`](../TRUTH_CHECKPOINT.md),
> [`docs/CONTINUITY_THEORY.md`](../CONTINUITY_THEORY.md),
> [`docs/PHASE3_CPT.md`](../PHASE3_CPT.md).

This memo records what was said, separates what the current substrate
already addresses from what it does not, and names the unresolved
research problems explicitly. The framing this memo defends is
**"disciplined continuity," not "infinite memory."** No
implementation work is proposed; no architecture is changed.

The memo's three layers, kept separate throughout, are:

- **Current capabilities** — what the code in tree at HEAD does today.
- **Hypotheses** — claims that are plausible from the design but
  unmeasured.
- **Unresolved research problems** — questions the project does not
  yet have an answer for.

---

## 1. The feedback, verbatim themes

Two clusters of concern surfaced. Both are taken seriously.

### 1.1 Cross-project contamination

Advanced users reported (or anticipated):

- Older projects' decisions resurfacing inside the current project's
  workflow.
- Continuity bleed between unrelated workspaces.
- Mental model: "I worked on Project A six months ago. When I'm
  working on Project B today, I don't want Project A's architectural
  choices to influence the AI's reasoning."
- Implicit concern about a global "memory blob" approach silently
  conflating contexts.

### 1.2 Context rot / retrieval degradation

Advanced users expressed skepticism about:

- Accumulated context eventually degrading model reasoning
  ("lost in the middle," dilution of signal by stale noise).
- The marketing-shaped assumption that 200k–1M token windows mean
  "store everything forever."
- A "store everything forever" approach becoming noisy and unusable
  even when the model technically accepts the tokens.
- The implicit claim that more context = better output. (It's not.)

Both concerns are legitimate. Both have published research behind
them — long-context recall degradation is a measured property of
current models, not a guess.

---

## 2. Why these concerns matter for ManthanOS

The project's positioning is "continuity infrastructure for
multi-model engineering workflows." Both concerns sit at the core of
whether that positioning is honest:

- **If cross-project isolation is leaky**, the substrate is a
  liability rather than an asset. Users would correctly prefer to
  start every session "clean" rather than risk contamination.
- **If accumulated continuity degrades the next model's output**, the
  product's value proposition inverts. The case for ManthanOS is that
  curated continuity beats no continuity. The case fails if "more
  recorded facts" → "worse output."

This memo's purpose is to be honest about which of these risks the
substrate already addresses, which it partially addresses, and which
it does not address yet.

---

## 3. What the current substrate does about cross-project contamination

### 3.1 Current capabilities

- **Per-workspace SQLite + audit log + blob store.** Each `manthan
  init` creates `.manthan/` *inside* the target repo. Memory file,
  audit log, and blob store are physical files in that directory.
  Two workspaces cannot share state by accident — they don't share
  files.
- **`workspaceId` is derived from the canonical workspace root path**
  (`apps/cli/src/commands/init.ts:207`). All facts, audit events, and
  decisions in `semantic_facts`, `audit_events`, and `decisions`
  tables carry a `workspace_id` column and every query filters on
  it. There is no read path that returns facts across workspaces.
- **No global facts store.** The only global state is
  `~/.config/manthan/api-keys.env` (provider credentials). It does
  not contain facts.
- **`manthan plan --show-trusted`** prints the exact trusted facts
  about to enter the prompt, before the LLM call burns quota. A user
  can see (and audit) what's coming from "this project's brain"
  rather than trusting the system silently.
- **CLI is `cwd`-scoped.** `manthan plan` resolves the workspace from
  the current working directory. Switching projects means `cd`-ing
  into a different repo; the substrate physically cannot read a
  different `.manthan/`.

### 3.2 Hypotheses (plausible from the design, not yet measured)

- Because workspaces are physically isolated, **the typical user-error
  failure mode is "operating in the wrong workspace,"** not "the
  system silently mixed them." This is recoverable (the user
  notices their `pwd` is wrong) rather than catastrophic.
- The `workspaceId` being keyed on canonical absolute path means
  **moving a workspace to a new disk path implicitly creates a new
  workspace**. This is a feature for isolation (no accidental
  re-attachment) and a possible footgun for continuity (deliberate
  move loses brain unless paths are preserved).

### 3.3 Unresolved research problems

- **No mechanism for "this fact applies to this project class but not
  the current one."** Workspaces are isolated as units; there's no
  intra-workspace concept of "tags this fact as portable to similar
  projects." Users who want a "carryover" model (e.g., language
  conventions that hold across all of *my* Go projects) have no
  surface for that today.
- **No alert if the trusted set looks topically unrelated to the
  brief.** If a tester's workspace has 41 facts about
  session-handling and they type `manthan plan "add a graph data
  structure"`, the system presents all 41 facts. No relevance check
  flags this mismatch — see §4 for the broader version of this
  problem.
- **`workspaceId` derivation is not yet user-visible.** If two
  workspaces end up with the same SHA-16 prefix (very unlikely but
  possible), there's no surface telling the user. This is a tail
  concern.
- **Cross-workspace re-execution / sharing.** Some teams will want
  intentional cross-project continuity (e.g., a "house style"
  workspace whose trusted facts are imported into per-project
  workspaces). The substrate does not address this; it is not on the
  roadmap.

### 3.4 Where the docs / positioning should stop short

Avoid:

- "ManthanOS prevents cross-project contamination."
  *Correct framing:* "ManthanOS is workspace-scoped by construction.
  Cross-project contamination is a user-error failure mode (operating
  in the wrong workspace) rather than a system failure mode."

- "Workspaces are perfectly isolated."
  *Correct framing:* "Workspaces share no state by default. The only
  exception is provider credentials in `~/.config/manthan/`."

- "ManthanOS knows what's relevant to your current project."
  *Correct framing:* "ManthanOS knows what's in *this* project's
  workspace. It does not yet measure topical relevance to the
  current task."

---

## 4. What the current substrate does about context rot / retrieval degradation

This is the harder concern. The substrate has partial mitigations,
some explicit non-goals, and one significant unresolved problem.

### 4.1 Current capabilities

The substrate has **five distinct defenses against accumulated
context degradation**, all already in tree:

| Mechanism | File / surface | What it actually does |
|---|---|---|
| **Trust ladder** | `packages/orchestrator/src/brain-trust.ts` | Only T+1/T+2/T+3 facts reach the prompt. T0 is quarantine — explicitly excluded from default bundles. T-1/T-2 are demoted/reversed — physically present but filtered. Promotion is human-gated. |
| **Decay** | `packages/orchestrator/src/decay.ts` | Facts whose `last_corroborated` ages past `warn` reduce confidence; past `demote` drop a tier; past `archive` get sent to T-2. Three thresholds: conservative (90/180/270 days), default, aggressive. |
| **Dedup** | `packages/orchestrator/src/dedup.ts` | Jaccard similarity over meaningful tokens, same-area only, threshold 0.25 default. Surfaces clusters; merge is human-confirmed. Paraphrase collisions get collapsed before they bloat the layer. |
| **Adaptive shaping** | `packages/context/src/shape-trusted-facts.ts` | Optional `trustedFactsTokenBudget` caps the trusted-facts layer in tokens. Optional `minConfidence` drops facts below a confidence floor. Optional `priorityAreas` packs declared-important areas first. All omissions are recorded in `BundleMetrics.omittedFacts` with explicit reasons. |
| **Queue health diagnostic** | `apps/cli/src/commands/brain-queue-health.ts` | Reports T0 aging buckets, oldest fact age, dedup-cluster count, drain rate, and a HEALTHY/STRESSED/DEGRADED verdict. Makes accumulation visible *before* it harms output. |

Plus the meta-mechanic:

| Mechanism | What it does |
|---|---|
| **Replay / audit chain** | `manthan replay <runId>` and `.manthan/audit.log` let a user see exactly which facts entered any past prompt. If a tester suspects the bundle was noisy, the evidence is recoverable, not "wherever the magic happened." |
| **Per-workspace trust ladder is human-gated.** | Nothing enters the prompt that a human did not explicitly promote at least once. There is no "auto-promote on confidence" path. |
| **`--show-trusted` preview** | Print-before-call inspection of the trusted set. Lets a tester *see* what the brain is sending without burning provider quota. |

### 4.2 Hypotheses (plausible from the design, not yet measured)

- Because **every fact entering the prompt passed through a human
  promotion gate at least once**, the trusted layer's signal-to-noise
  ratio should be substantially higher than an auto-extracted "store
  everything" approach. (Hypothesis. Not measured.)
- Because **decay automatically demotes stale facts**, the
  steady-state trusted-set size should self-bound for healthy
  workspaces. The Phase 1.6 long-horizon simulation observed
  self-bounding at ~1500 tokens of trusted-layer content under
  synthetic stress; see `docs/STABILIZATION.md` / `STABILIZATION_VERDICT.md`.
  (Hypothesis transferred from synthetic to real workloads is *not*
  validated.)
- Because **adaptive shaping is deterministic and explainable**, a
  user can always see why a fact was omitted (`omittedFacts` with
  `reason`). This means continuity stays auditable even under budget
  pressure. (Hypothesis: this auditability translates to user trust
  in the bundle. Not measured.)

### 4.3 Unresolved research problems

These are real. Naming them honestly is the point of this memo.

#### 4.3.1 No relevance-to-brief retrieval scoring

Shaping orders facts by `priorityAreas → tier → confidence → area →
statement`. It does *not* compute topical relevance to the *current
task brief*. If a workspace has 200 trusted facts and the user's
brief is "add Redis caching," the substrate presents the trusted set
sorted by tier/area/confidence, not by topical match to "caching" or
"Redis."

Current mitigation:
- A user can pass `priorityAreas` (e.g., `['storage', 'caching']`)
  via shaping config.
- A user can pass `--file=...` to include specific source files in
  the bundle.

Real gap:
- No automatic ranking of "facts most likely to matter for *this*
  brief."
- No measurement of when the trusted set starts hurting output vs
  helping.

This is a **research problem**, not an oversight. Embedding-based
retrieval is the obvious candidate; the project has deliberately
avoided it so far (see `docs/CONTINUITY_THEORY.md` on
"non-semantic-retrieval" rationale). Whether that constraint is
correct at scale is itself an open question.

#### 4.3.2 No measured ceiling on healthy trusted-set size

The Phase 1.6 stabilization run observed ~1500 trusted tokens
self-bounding under synthetic stress. That number is **conditional**
(per `docs/TRUTH_CHECKPOINT.md` §2.10): it depends on the simulator's
corpus and parameters. We have not measured:

- At what trusted-set size do real LLM outputs start degrading?
- Is the degradation gradient gradual (continuous quality loss) or
  cliff-like (sudden incoherence past a threshold)?
- Does the threshold differ across models?

The CpT measurement harness (`manthan experiments cpt-probe`) can
*observe* the cost / signal tradeoff per workspace, but does not
itself define a "healthy ceiling."

#### 4.3.3 No automatic detection of "topically unrelated brief"

If a user runs a brief whose tokens have near-zero overlap with the
workspace's trusted facts, the current system still ships the full
trusted set. No alert, no shaping fallback.

A user could in principle:
- Pass `--no-trusted` (does not exist today; would have to be added).
- Drop the workspace `.manthan/` and start a fresh workspace for the
  off-topic brief (works, but lossy).
- Use an explicit `priorityAreas` that doesn't match the workspace's
  areas (the shaping rule then trims by tier/confidence within
  whatever's left).

None of these are a clean solution.

#### 4.3.4 Long-context degradation is a property of the model, not the substrate

This is worth stating directly: even an optimally shaped trusted set
can interact poorly with a long-context model's known weaknesses
("lost in the middle," recency bias, position-sensitivity). The
substrate cannot fix the model. It can only *prepare* a smaller,
higher-signal context.

Whether the current default behavior of "include all trusted facts
up to budget" interacts well with each provider's long-context
characteristics is **not measured per-provider**. It is a Phase 3+
research question.

#### 4.3.5 Decay thresholds are policy, not theory

The conservative / default / aggressive decay profiles (90/180/270,
60/120/180, 30/60/90 days) are conservative starting points. They
are not derived from measured optimal staleness curves on real
projects. Whether 90 days is correctly "still fresh" for a typical
codebase is unknown.

### 4.4 Where the docs / positioning should stop short

Avoid:

- "ManthanOS solves context rot."
  *Correct framing:* "ManthanOS has five mechanisms — trust ladder,
  decay, dedup, adaptive shaping, queue health — that bound and
  shape what continuity enters the next prompt. Whether this is
  sufficient defense against any given model's long-context
  degradation is being measured."

- "ManthanOS gives you infinite memory."
  *Correct framing:* "ManthanOS gives you disciplined continuity.
  The substrate is designed around the assumption that **less is
  more, when chosen well**."

- "ManthanOS makes the AI smarter."
  *Correct framing (per `docs/POSITIONING_CORRECTION.md` §3):* "The
  product records and presents continuity; whether populating the
  trusted layer in one tool measurably improves a different tool's
  output is currently being measured."

- "More trusted facts = better output."
  *Correct framing:* "Trusted facts have a cost; the substrate
  defaults are conservative; adaptive shaping is the tool for
  trading recall against budget."

---

## 5. The framing the project should adopt: "disciplined continuity"

Both feedback themes point at the same product narrative:

> **The case for ManthanOS is not "remember everything." The case is
> "remember the things this project has explicitly decided are
> worth remembering, in a way the next AI tool can use."**

This framing is consistent with what the code already does:

- Trust ladder: only human-promoted facts reach prompts.
- Decay: stale facts age out.
- Dedup: paraphrases collapse.
- Adaptive shaping: budget-aware, explainable omissions.
- Queue health: visible backlog before it harms.
- Replay: every bundle is recoverable from audit.
- Workspace isolation: each project is its own continuity unit.

The framing the project should **avoid**:

- "Infinite memory."
- "Persistent project intelligence."
- "Context that scales to 1M tokens."
- "The model never forgets your project."
- "Solves AI's memory problem."

A user who arrives expecting "infinite memory" and finds a trust
ladder with explicit demote/quarantine semantics will (correctly)
read this as a smaller claim. That is the right outcome. The smaller
claim is also the one the substrate can defend.

---

## 6. Possible future research directions (no commitment)

These are problems worth investigating, not promises to investigate.

### 6.1 Topical relevance ranking

What would it cost to add a topical relevance score (token-overlap,
TF-IDF over the workspace's trusted set, or — if we ever cross the
"no semantic retrieval" line — embedding similarity) to the shaping
pass? Open question. The trade is between determinism (current shape
is fully explainable) and recall (relevant facts might be omitted by
the current sort).

### 6.2 Per-model long-context curves

The CpT harness can be extended to vary trusted-set size and measure
output quality / cost across providers. This produces curves of the
form "for model M, output quality starts degrading past N tokens of
trusted layer." Such curves would let `trustedFactsTokenBudget`
defaults be set per provider rather than uniformly.

### 6.3 Decay calibration on real workspaces

Once we have first-cohort real-workspace data, decay thresholds
could be calibrated empirically per workspace (e.g., learn the
typical fact-validity halflife for this user's codebase). The
current conservative-by-default policy is a placeholder, not a
recommendation.

### 6.4 "Brief-aware quarantine"

If a brief's tokens have near-zero overlap with the workspace's
trusted layer, the system could surface this with a warning ("0%
overlap detected; trusted facts may be off-topic; consider
`--no-trusted` or a different workspace"). This is shaping-tier
work, not retrieval-tier work, and stays inside the current
discipline.

### 6.5 Cross-workspace fact import (intentional, not automatic)

A "house-style" workspace whose trusted facts could be imported into
per-project workspaces would address the "I want some carryover"
case raised in the cross-project feedback. The import would be
explicit + human-gated, so it doesn't violate the isolation
guarantee. Not a roadmap commitment.

### 6.6 Effect of trusted-set growth on the human reviewer

A research question of a different kind: at what trusted-set size
does the human reviewer's `manthan brain review` triage rate decay?
The substrate is designed around the assumption that humans can
sustain trust-ladder discipline; we have no data on the
attention-budget side of that assumption.

---

## 7. What this memo deliberately does not do

- It does not commit to implementing any of the §6 directions.
- It does not propose new architecture.
- It does not propose new commands.
- It does not change any positioning beyond restating the existing
  "records and presents, not improves" boundary.
- It does not soften the §4.3 research problems to make the project
  look more solved than it is.
- It does not produce talking points for marketing copy.

The memo's job is to make the conversation with these advanced users
honest, repeatable, and grounded — so the same feedback doesn't
require restarting from zero next time it comes up.

---

## 8. One-sentence summary

> **The substrate already addresses workspace isolation by
> construction and addresses accumulated-context risk through five
> independent mechanisms — trust ladder, decay, dedup, adaptive
> shaping, queue health — but it does not yet measure topical
> relevance, has not calibrated decay or shaping budgets against
> real workloads, and cannot fix model-side long-context
> degradation. The honest framing is "disciplined continuity,"
> not "infinite memory."**

If a single sentence in any other doc conflicts with that one, that
sentence is overclaiming.
