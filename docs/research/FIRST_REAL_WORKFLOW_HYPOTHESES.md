# FIRST_REAL_WORKFLOW_HYPOTHESES

> **Status:** Pre-field-study hypotheses memo. Not a launch plan.
> **Date:** 2026-05-18.
> **Purpose:** Define the hypotheses the first real users will
> validate, falsify, or surprise us on — *before* we observe their
> behavior, so we can tell signal from coincidence later.
> **Scope:** Predictions only. No instrumentation, no analytics
> roadmap, no telemetry plan, no benchmark targets.

This memo is a discipline exercise. The point of writing hypotheses
in advance is to commit to *what we believe now*, so the
post-observation memo can honestly say "we predicted X, we got Y,
update prior by Z" instead of "we always knew." Tools used for this
purpose are called pre-registration in scientific contexts; the same
hygiene applies here.

Each hypothesis records:

- **Why we believe it** — the prior, in one or two sentences.
- **What evidence would support it.**
- **What evidence would falsify it.**
- **Confidence level:** low / medium / high. Low = we genuinely
  don't know. Medium = we have a directional intuition but no
  measurement. High = the design assumption rests on this.

Hypotheses are numbered for later cross-reference.

---

## 1. Core product hypotheses

These are the load-bearing claims. If H1.1–H1.3 are wrong, the
product is wrong; everything else is downstream.

### H1.1 — Workspace-scoped, human-gated, audit-traceable continuity is more useful than session-only chat memory for sustained engineering work.

- **Why:** The substrate is built around three mechanical properties
  (scoping, gating, auditing) that session-memory tools do not have.
  If any of the three doesn't matter to real users, the substrate's
  cost-benefit inverts.
- **Support:** Users describe specific moments where the recorded
  trust ladder prevented a re-explanation or contradicted a
  hallucinated assertion.
- **Falsify:** Users report re-explaining is *easier* than
  maintaining the trust ladder; the substrate adds work without
  measurable saving.
- **Confidence: medium.** The mechanical case is clear; the
  human-cost case is unmeasured.

### H1.2 — The trust ladder produces a higher signal-to-noise context bundle than an auto-extracted "memory blob."

- **Why:** Human gating is the strongest available filter. Promoting
  via deliberate action is a high-confidence signal of "this matters."
- **Support:** When promoted facts appear in subsequent plan outputs,
  the model references them in ways that auto-extracted facts (T0)
  do not when included in `--include-quarantine` mode.
- **Falsify:** Model output treats promoted and auto-extracted facts
  equivalently. Or: model output ignores trusted facts entirely.
- **Confidence: medium.** Phase 1.6 synthetic evidence is positive
  but bounded; E6.1 (cross-model) has not run.

### H1.3 — "Continuity infrastructure for multi-model engineering" resonates as positioning with real users — i.e., the multi-tool workflow it names is the workflow they recognize.

- **Why:** The corrected positioning (`POSITIONING_CORRECTION.md`)
  was based on inferred multi-tool behavior. We have not validated
  that inference against external users.
- **Support:** ≥3 of first 5 testers, unprompted, describe using
  two or more AI tools on the same project.
- **Falsify:** Testers describe single-tool primary workflows. The
  multi-tool framing is correct *aspirationally* but wrong
  *operationally*.
- **Confidence: medium.** Strong from one founder's workflow;
  unvalidated externally.

---

## 2. Human-behavior hypotheses

### H2.1 — Users will tolerate promotion friction if the promoted facts later prevent re-priming.

- **Why:** Re-priming a new chat costs minutes per session; promotion
  costs seconds. Per-act, the ratio favors promotion.
- **Support:** Users continue to promote across sessions 2-N after
  experiencing at least one session where promoted facts were
  visibly recalled.
- **Falsify:** Users promote in session 1, do not promote in
  subsequent sessions despite running `brain review`.
- **Confidence: medium.** The economics support this; the
  habit-formation question is unsolved.

### H2.2 — Promotion-queue review will decay into neglect after novelty wears off, even when the queue contains useful facts.

- **Why:** Software-tool engagement curves are well-known; the
  per-session friction is small but the per-week friction
  accumulates. The "manual labor" of fact triage is the kind of
  task humans defer when uncoerced.
- **Support:** Weekly active review (≥1 `brain review` invocation per
  week) declines noticeably after week 2-3.
- **Falsify:** Sustained or increasing review activity through
  week 4+.
- **Confidence: high.** This *will* happen for some testers; the
  open question is the threshold at which the residual activity
  is still useful.

### H2.3 — Users will batch-process promotion queues rather than review immediately after each plan.

- **Why:** Many small frictions cost more than one bigger one. People
  defer small tasks to weekly check-ins. The substrate's design
  (review queue with aging) accommodates this; the question is
  whether testers actually use that affordance.
- **Support:** `brain review` sessions show ≥5 T0 facts processed
  per session.
- **Falsify:** Review happens immediately after each plan, with
  small (1-2 fact) batches.
- **Confidence: medium.**

### H2.4 — Users will demote less often than they skip; skip will be used more than demote and promote combined.

- **Why:** Skip is the lowest-cost option ("I don't know yet"). The
  d demote action requires forming an opinion. Many T0 facts are
  not obviously wrong, just not obviously right.
- **Support:** Among brain-review actions, ratio of s : d : p shows
  s dominant.
- **Falsify:** Balanced or promote-dominant usage.
- **Confidence: medium-high.**

### H2.5 — Users will dismiss the audit-chain framing as overengineered until they hit a specific bug it would have caught.

- **Why:** Prevention systems are invisible until they trigger.
  Most testers won't have a workflow that produces an auditable
  failure in the first 2-4 weeks.
- **Support:** Testers verbalize "I don't need this" or skip
  audit-related docs.
- **Falsify:** Testers actively reference audit features in
  conversation unprompted.
- **Confidence: high.**

---

## 3. Continuity-value hypotheses

### H3.1 — Continuity value compounds non-linearly with workspace age.

- **Why:** More decisions → more cross-references → more places
  where re-priming is expensive. Month-3 workspaces should benefit
  more per session than week-1 workspaces.
- **Support:** Month-3 sessions reference month-1 promoted facts in
  ways visible in plan output.
- **Falsify:** Month-3 sessions show no observable continuity signal
  beyond month-0 baseline. Value is flat or declines.
- **Confidence: low.** Only synthetic evidence (Phase 1.6); no
  real workspace has reached month 3 in production use.

### H3.2 — Continuity has diminishing returns past a small N of trusted facts (in the dozens, not hundreds).

- **Why:** Long-context degradation is a measured property of
  current models. Adding more trusted facts past some threshold
  must hurt at the margin. The threshold is the open question.
- **Support:** Plan-output quality plateaus or declines for
  workspaces with very large trusted layers, holding other
  factors constant.
- **Falsify:** Linear improvement past 100 facts with no
  observable degradation.
- **Confidence: medium.** Literature supports the directional
  claim; the *threshold* is unmeasured for ManthanOS specifically.

### H3.3 — Cross-model continuity (E6.1) shows a measurable but small effect — second-model output references trusted facts more than baseline.

- **Why:** Trusted facts are plain-text strings, model-agnostic by
  construction. There is no architectural reason a second model
  couldn't see them. There are several reasons the *effect* could
  be small (different model's attention patterns, different
  baseline, different instruction-following).
- **Support:** E6.1 produces a positive but bounded delta (e.g.,
  10-30% increase in trusted-fact reference count on X-healthy
  vs X-empty).
- **Falsify:** E6.1 produces no measurable cross-model effect.
- **Confidence: low.** Genuinely unknown.

### H3.4 — Continuity quality matters more than continuity quantity for engineering workflows.

- **Why:** Engineering work has narrow correctness — one
  trusted-but-wrong fact ("we use Express 5") corrupts every
  downstream plan. The cost of a noisy 50-fact brain is higher
  than the cost of a precise 10-fact brain.
- **Support:** Users report better outcomes after culling than
  after expanding their trusted layer.
- **Falsify:** Users report linear value with brain size.
- **Confidence: medium-high.**

---

## 4. Failure hypotheses

These predict the failures *we expect to see*, so we don't
misinterpret them as proof the substrate is fundamentally broken.

### H4.1 — Workspace contamination will happen via user error (wrong cwd), not via substrate leak.

- **Why:** The substrate is physically isolated; there is no read
  path that crosses workspaces. The remaining contamination vector
  is the human operator switching projects without switching cwd.
- **Support:** Zero reports of substrate-level facts crossing
  workspaces; non-zero reports of "I ran manthan plan in the wrong
  directory."
- **Falsify:** Substrate-level leak reports (would be a bug).
- **Confidence: high.**

### H4.2 — Users will accidentally commit `.manthan/` to their repo despite the gitignore.

- **Why:** Copy-paste workflows, `git add -A`, fresh clones — many
  paths exist that bypass our `.manthan/.gitignore`.
- **Support:** PRs against external projects show `.manthan/` in
  the tree; testers ask "should I commit this?"
- **Falsify:** Zero such reports.
- **Confidence: medium.**

### H4.3 — Adapter mismatches (CLI not on PATH, wrong API key) will be the #1 source of first-run failure.

- **Why:** Doctor catches this now, but users may run `plan` before
  running `doctor`. The README §7 sanity-check step is the
  mitigation; whether users follow it is the question.
- **Support:** Failure reports cite "spawn ENOENT" or "API key not
  set" most often.
- **Falsify:** Failure reports cite something else entirely (e.g.,
  workspace-init issues, build issues).
- **Confidence: medium-high.**

### H4.4 — "Replay" will recur as a source of confusion despite the explicit "recorded-run inspection" disclaimer.

- **Why:** The English word "replay" carries strong meaning
  ("replay the call"); the disclaimer is one line in a corner.
- **Support:** Users ask "why didn't my replay use the new code?"
  or "can I replay against a different model?"
- **Falsify:** Zero such confusion in user conversations.
- **Confidence: medium.**

### H4.5 — Tier notation (T0, T+1, T-1) will require glossing every time it appears in user-facing output, not just on first use.

- **Why:** Domain-specific notation. Users can't be expected to
  remember which tier is which without a recent gloss.
- **Support:** Users ask "what's T+1?" in conversation; or output
  is interpreted incorrectly.
- **Falsify:** Users adopt the notation from one exposure.
- **Confidence: medium-high.**

---

## 5. Trust hypotheses

### H5.1 — Workspace isolation will increase trust even when continuity *quality* is lower than a hypothetical cross-project system.

- **Why:** Contamination worry is visceral; continuity quality is
  abstract. "My project's record stays here" is more reassuring
  than "your assistant gets smarter over time."
- **Support:** Users cite workspace isolation as a positive feature
  unprompted. Users decline alternative tools when the alternative
  asks for global-memory permission.
- **Falsify:** Users abandon ManthanOS specifically because it
  can't share knowledge across projects.
- **Confidence: medium-high.**

### H5.2 — The hash-chain audit creates *engineer-side* credibility faster than it creates *user-side* value.

- **Why:** Skilled engineers know what an audit chain costs and what
  it buys; that recognition is itself a trust event. Non-engineer
  users (if any try this) won't see the audit.
- **Support:** Engineer-tester feedback cites audit as a positive
  signal of seriousness, even before they need it.
- **Falsify:** Audit chain is unnoticed across the cohort.
- **Confidence: medium.**

### H5.3 — Users will trust a smaller, transparent continuity layer more than a larger, opaque one — when they're given the option to see both.

- **Why:** `--show-trusted` exists; whether users use it and prefer
  it is the open question. Anti-infinite-memory thesis.
- **Support:** Users invoke `--show-trusted` more than once after
  discovering it.
- **Falsify:** Users prefer not seeing the bundle ("just trust it").
- **Confidence: medium.**

### H5.4 — BSL 1.1 will not be a friction source for the first 5 testers.

- **Why:** License is downstream of "does it work." Most early-stage
  testers don't get to commercial-distribution conversations.
- **Support:** Zero license-related early feedback.
- **Falsify:** License complaints in the first 5 conversations.
- **Confidence: high.**

---

## 6. Cognitive-load hypotheses

### H6.1 — Brain-review prompt-grammar (`p`/`d`/`s`/`u`/`c`/`l`/`q`/`a`/`?`) requires the worked example to internalize, not the help table alone.

- **Why:** REPL grammars are not self-explanatory. The
  `Example: p 1 3-5` line that we added at the bottom of the help
  text is doing the load-bearing work, not the list.
- **Support:** Users fumble until they see the example; users
  who see the example proceed cleanly.
- **Falsify:** Users grok the grammar from the help table alone.
- **Confidence: high.**

### H6.2 — `manthan doctor` is the most-revisited surface after first-run, but only when something has gone wrong.

- **Why:** Doctor is the diagnostic. It's not interesting until
  it's needed.
- **Support:** Doctor invocations spike around failure events;
  doctor is otherwise unused.
- **Falsify:** Doctor used as a routine touchpoint, or never used.
- **Confidence: medium.**

### H6.3 — The trust-ladder mental model (T0 → T+1 → T+2 → T+3, decay to T-1/T-2) is a non-trivial 2-3 minute concept investment users either make or do not.

- **Why:** Six tiers is more nuance than most product UIs ask for.
  We accept the cost because the discipline is the moat. But the
  cognitive entry barrier is real.
- **Support:** Users who explicitly engage with the tier concept
  (e.g., promote some facts to T+1 and others to T+2) retain;
  users who treat everything as binary do not.
- **Falsify:** No correlation between tier-discrimination behavior
  and retention.
- **Confidence: medium.**

---

## 7. Multi-model workflow hypotheses

### H7.1 — Cross-tool promotion ("I promoted this in tool A, now tool B's session has it") produces a memorable "aha" if it works.

- **Why:** The friction point is so visceral that resolving it is
  memorable. The whole positioning rests on this moment landing.
- **Support:** A tester verbalizes the recognition unprompted ("wait,
  it just appeared"). They tell someone else about it.
- **Falsify:** Testers find it underwhelming — "okay, fine, that's
  what the docs said."
- **Confidence: medium.**

### H7.2 — Most first-week testers will use only Claude (CLI or API), despite having other CLIs available.

- **Why:** Muscle memory + the CLI's default. Switching adapters
  is an active choice; defaults stick.
- **Support:** `--adapter` flag usage shows Claude-dominant.
- **Falsify:** Testers actively switch adapters multiple times in
  the first week.
- **Confidence: high.**

### H7.3 — Most testers will never run `manthan experiments cpt-probe`.

- **Why:** Experimental harness on a research path. Not on the
  critical workflow for an engineering user.
- **Support:** `cpt-probe` invocations remain at maintainer-only.
- **Falsify:** A tester runs it unprompted.
- **Confidence: very high.**

### H7.4 — Multi-tool users will perceive ManthanOS as more valuable than single-tool users.

- **Why:** The positioning *is* the multi-tool case. A
  single-tool user gets the audit/trust-ladder benefits but not
  the cross-tool continuity benefit.
- **Support:** Retention skew: multi-tool users retain longer;
  net-promoter-style language is more positive in multi-tool
  conversations.
- **Falsify:** No measurable difference; single-tool users retain
  equally.
- **Confidence: medium.**

---

## 8. Retention hypotheses

### H8.1 — Retention through week 2 depends primarily on whether the user promoted at least 3 facts in week 1.

- **Why:** Investment effect + curiosity. Users who promoted facts
  in week 1 have a reason to see what happens with them in week 2.
- **Support:** Among week-1 promoters, ≥X% return in week 2; among
  non-promoters, fewer return.
- **Falsify:** Retention uncorrelated with promotion count.
- **Confidence: medium.**

### H8.2 — Multi-tool users retain longer than single-tool users.

- **Why:** Their workflow matches the positioning. The product
  delivers value they were already paying friction-cost for.
- **Support:** Retention skew visible in qualitative reports.
- **Falsify:** Single-tool users retain at same rate.
- **Confidence: medium.**

### H8.3 — The 7-day undo window will be used at least once in the first week by half the testers.

- **Why:** Users make mistakes; the option is documented; the cost
  of trying it is zero. The substrate's safety-net design
  *should* be exercised.
- **Support:** `undo-correction` invocation logs (informal — would
  be reported in conversation, not telemetry).
- **Falsify:** Undo is never used.
- **Confidence: low.** Genuinely uncertain — users may not promote
  enough to need undo.

---

## 9. Null-result possibilities

These are the outcomes most painful to consider in advance. They
are listed *because* they would shift the project's priors
substantially.

### N1 — Cross-model continuity (E6.1) produces no measurable effect.

- **Implication if true:** Continuity is intra-tool only. The
  positioning narrows from "multi-model" to "single-tool with
  better continuity." `docs/STABILIZATION_VERDICT.md` already
  predicted this branch; we'd return to the single-provider
  thesis.
- **Pre-commitment:** If E6.1 is null, the public framing has to
  drop the "multi-model" anchor. This memo names that consequence
  explicitly so it can't be retroactively softened.

### N2 — The trust ladder produces no measurable signal-to-noise improvement over random selection from T0.

- **Implication if true:** Either users are reviewing wrong (skip
  too often, demote too rarely), or selection is unimportant at
  this scale, or the model ignores the substrate's input
  regardless. Each branch implies a different remedy; *all* would
  require us to question the human-gating premise.

### N3 — Adaptive shaping rules are irrelevant in practice because real workspaces never grow large enough to need shaping.

- **Implication if true:** Shaping was over-engineered for prototype
  scale. The mechanism stays in tree (defense in depth) but
  documentation prominence drops; we stop spending narrative
  budget on it.

### N4 — Users abandon `brain review` entirely and use `manthan plan` as a structured plan recorder without ever curating facts.

- **Implication if true:** The "human-gated" positioning is wrong
  for this audience; the product's actual function for them is
  "plan-output recorder + audit chain." That's a real product but
  a different one. We would either rebrand or accept the narrower
  use case.

### N5 — No measurable difference between single-provider and cross-provider users in retention or reported satisfaction.

- **Implication if true:** The multi-tool framing is correct as
  positioning (it describes a real pain) but wrong as
  differentiator (the *substrate* doesn't help more for multi-tool
  users specifically). The framing stays; the differentiation story
  shifts.

### N6 — Anthropomorphic framing slips back into user vocabulary regardless of doc discipline.

- **Implication if true:** Users will call the substrate "the AI"
  or "the assistant" no matter how the docs phrase it. The
  doc-discipline cost is bounded (it doesn't change what users
  say), but the doc-discipline benefit is also bounded (it doesn't
  shape user speech). Both stay; the cost-benefit is still
  positive but the ceiling is lower.

---

## 10. What would constitute a genuinely surprising result

These are outcomes that would update priors substantially. Most
won't happen. Listing them helps us notice if they do.

### S1 — Users promote facts at >2x the rate the design expected, with no decay through week 4.

- **Why surprising:** Would invalidate H2.2 (queue decay).
- **Implication:** Trust ladder may be addictive in a good way —
  the deliberate-promotion micro-action could function like a
  Zettelkasten habit. We would broaden the curation surface.

### S2 — Users use `manthan replay` (or just the audit log) to defend prior decisions in present-day conversations with collaborators.

- **Why surprising:** The audit is currently disclaimed as
  "accidental corruption detection only." Its *social* function
  ("I can show you exactly what we agreed") would be more
  important than its technical function.
- **Implication:** The audit chain may be the load-bearing feature
  for *human-to-human* trust, not just human-to-system trust.

### S3 — Cross-tool effect (E6.1) shows >10% measurable improvement on a single brief.

- **Why surprising:** A large effect from a substrate that just
  records text. We'd expect a small-to-moderate effect.
- **Implication:** Continuity is more model-portable than the
  literature predicts. The positioning gains evidence weight.

### S4 — Users explicitly request *more* anthropomorphic framing.

- **Why surprising:** Directly contradicts the entire vocabulary
  discipline.
- **Implication:** Positioning may need to be re-evaluated for
  non-engineer audiences who want a relatable "assistant" frame.

### S5 — A first tester independently rediscovers the architecture without being told ("so this is git but for AI commitments?").

- **Why surprising:** Validates the metaphor without us seeding it.
- **Implication:** Positioning has the correct anchor; the
  next-tier framing ("git for AI engineering commitments") might
  be the right tagline evolution after we earn it.

### S6 — Workspaces created in week 1 are still active in week 8.

- **Why surprising:** Most prototype tools die by week 2-3 of real
  use.
- **Implication:** The substrate has product-market signal beyond
  curiosity.

### S7 — A tester actively wants to share their brain across projects ("I want my Go conventions in all my Go repos").

- **Why surprising:** Contradicts the workspace-isolation design as
  product, not just as default.
- **Implication:** Cross-workspace fact import is a real need, not
  a hypothetical. We'd consider H6.1 from
  `EARLY_FEEDBACK_SYNTHESIS.md` §6.5 more seriously.

### S8 — A tester runs `manthan experiments cpt-probe` themselves.

- **Why surprising:** This is internal research surface. A user
  reaching for it implies the audit-and-replay discipline is
  contagious into experimentation.
- **Implication:** The "evidence-first" culture is a product
  feature, not just an internal value.

### S9 — Users report disliking workspace-isolation specifically.

- **Why surprising:** Direct inversion of H5.1.
- **Implication:** We'd need to rethink the boundary; possibly add
  explicit, user-gated cross-workspace import.

### S10 — Non-Claude adapters (Codex, Gemini) are used >40% of plan invocations across the cohort.

- **Why surprising:** Muscle-memory bias predicts Claude dominance
  (H7.2).
- **Implication:** Multi-tool positioning is operationally correct,
  not just rhetorically. The substrate is *actively used* as
  multi-tool infrastructure.

---

## 11. What we can vs cannot learn without instrumentation

This memo proposes no telemetry or analytics. The constraints from
the request are explicit. That means we can only learn from
hypotheses that are *observable through user conversation,
feedback, public artifacts, or natural-disclosure moments*. The
boundary is worth naming.

### What we can learn without instrumentation

- All hypotheses in §1, §2, §4, §5, §6, §7, §10 that resolve through
  user *reports* or *direct conversation*.
- §3.3, §N1, §S3 — through E6.1 and CpT measurement, which are
  experiments we run, not telemetry on users.
- Behavioral patterns testers volunteer in office hours / DMs /
  written feedback.

### What we cannot learn without instrumentation (and won't add it)

- Quantitative retention curves (H8.1, H8.2 in their measured form).
- Counts of `--adapter` flag usage (H7.2, S10).
- Counts of `brain review` invocations or undo-correction calls
  (H8.3).
- Per-workspace fact-count growth over time (H3.1).
- Counts of `--show-trusted` invocations (H5.3).

These hypotheses remain *unresolvable* by us. They could become
resolvable later if and when:

- A tester voluntarily shares their workspace's audit log; or
- We add opt-in, transparent, project-owned analytics — which is
  out of scope for the prototype and out of scope for any
  near-term roadmap commitment.

The honest acknowledgement: we are running a hypothesis study with
qualitative-only signal. Quantitative resolution is deferred,
deliberately. The substitution is *trustworthy small-N
conversation* over *untrustworthy unattended metrics*.

---

## 12. What this memo deliberately does not do

- It does not propose telemetry, analytics, or any user-data
  collection.
- It does not commit to running any specific field study (e.g.,
  E6.1 is referenced but its execution is governed by
  `docs/PHASE3_CPT.md`, not by this memo).
- It does not propose retention targets, growth targets, NPS
  targets, or any vanity metric.
- It does not propose pivots based on hypothetical null results.
  Each null result's implication is stated; *whether* to pivot is
  a separate decision.
- It does not commit any of the §10 surprising-result implications
  to the roadmap.
- It does not predict that the project will succeed. The hypothesis
  exercise is consistent with falsifying enough of §1-§3 that the
  product as currently designed is wrong.

---

## 13. One-sentence summary

> **The first five real users will mostly confirm our priors on
> failures (§4) and human behavior (§2), occasionally surprise us
> on trust and retention (§5, §8), and may falsify our most
> important multi-model and continuity claims (§3, §N1).** We will
> learn what we can learn without instrumentation, accept that some
> things cannot be resolved this cycle, and update this memo as
> evidence lands.

If a future memo says "we always knew" something this memo did not
predict, that memo is rationalizing. Pre-registration is the
discipline.
