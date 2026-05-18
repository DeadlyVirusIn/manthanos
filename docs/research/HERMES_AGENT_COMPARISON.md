# HERMES_AGENT_COMPARISON

> **Status:** Research / comparative-systems memo. Not marketing.
> **Date:** 2026-05-17.
> **Reference:** [Hermes Agent (Nous Research)](https://github.com/nousresearch/hermes-agent),
> [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/).
> **Source materials:** Public README and public docs fetched 2026-05-17. No source-code review.

This memo positions ManthanOS relative to Hermes Agent as a way of
clarifying where ManthanOS *intentionally* diverges versus where
Hermes' existence *validates* the broader problem space. It is not
a hit piece. Hermes is well-engineered and ambitious; the question
is which design choices ManthanOS should make differently, and why.

Throughout the memo, statements are tagged:

- **[observed]** — Verifiable from Hermes' public README / docs.
- **[inferred]** — Philosophy deducible from the observed design choices, but not stated directly.
- **[unknown]** — Not knowable from public materials; would require source-level audit or use.

---

## 1. What Hermes is optimizing for

### Observed properties

- **A persistent, autonomous agent identity.** [observed] The README's
  one-line description is *"the self-improving AI agent built by Nous
  Research"* and *"the agent that grows with you."* The product
  framing is **agent-centric** — there is a *thing* (the agent) that
  has memory, learns, and persists across sessions.
- **Built-in learning loop.** [observed] *"It creates skills from
  experience, improves them during use, nudges itself to persist
  knowledge, searches its own past conversations, and builds a
  deepening model of who you are across sessions."* This is the
  most distinctive Hermes feature relative to comparable tools.
- **Cross-channel presence.** [observed] *"Telegram, Discord, Slack,
  WhatsApp, Signal, and CLI — all from a single gateway process."*
  One agent, many endpoints.
- **Always-on operation.** [observed] *"Lives where you do… talk to
  it from Telegram while it works on a cloud VM."* Seven terminal
  backends (local, Docker, SSH, Singularity, Modal, Daytona,
  Vercel Sandbox) with serverless persistence ("hibernates when
  idle and wakes on demand").
- **Scheduled autonomy.** [observed] *"Built-in cron scheduler with
  delivery to any platform. Daily reports, nightly backups, weekly
  audits — all in natural language, running unattended."*
- **Subagent spawning.** [observed] *"Spawn isolated subagents for
  parallel workstreams. Write Python scripts that call tools via
  RPC, collapsing multi-step pipelines into zero-context-cost
  turns."*
- **Model-agnostic.** [observed] First-class support for many
  providers — Nous Portal, OpenRouter (200+ models), NovitaAI,
  NVIDIA NIM, Xiaomi MiMo, z.ai/GLM, Kimi/Moonshot, MiniMax,
  Hugging Face, OpenAI, "or your own endpoint."
- **Research-grade trajectory output.** [observed] *"Batch trajectory
  generation, trajectory compression for training the next
  generation of tool-calling models."* The agent's runtime is
  itself a research instrument.
- **Honcho dialectic user modeling.** [observed] User-identity model
  is delegated to [Honcho](https://github.com/plastic-labs/honcho),
  a published primitive.
- **Open standard alignment.** [observed] Skills follow the
  agentskills.io open standard.
- **MIT license.** [observed] vs ManthanOS's BSL 1.1.

### Inferred design philosophy

- **An assistant identity is worth building.** [inferred] If the
  agent "grows with you" and "builds a deepening model of who you
  are," then user-modeling is a first-class capability, not a
  side effect.
- **Memory mutation should be agent-driven, not human-gated.**
  [inferred] *"Agent-curated memory with periodic nudges"* and
  *"autonomous skill creation after complex tasks"* both imply the
  agent decides what to remember; the human is asked, not asked
  first.
- **Always-on is desirable.** [inferred] The deployment model
  emphasizes cross-platform reachability and serverless
  persistence; the agent is meant to be a thing that exists, not
  a thing that runs and exits.
- **Skill compounding is a research goal.** [inferred] Trajectory
  compression for training next-gen tool-calling models suggests
  Hermes' learning loop is partly *upstream input* to model
  improvement, not only downstream value to the user.
- **Friction should be minimized at the memory layer.** [inferred]
  "Self-improving" + "autonomous skill creation" + "periodic nudges"
  collectively imply that asking the user "should I remember this?"
  is the wrong UX. The agent decides; the user audits later if
  they care.

### Unresolved unknowns

- **How does self-improvement actually work mechanically?** [unknown]
  The docs describe the outcome ("skills self-improve during use")
  but not the mechanism — whether it's gradient updates, rule
  extraction, prompt-template mutation, or something else.
- **Is there an audit chain or replayable history?** [unknown] The
  docs mention "Command approval" under security but no audit-chain
  primitive is described.
- **What happens when the agent's user model is wrong?** [unknown]
  Recovery semantics for corrupted memory / user-model drift are
  not described in the public materials.
- **Is the "deepening model of who you are" portable or escapable?**
  [unknown] Whether a user can export, inspect, edit, or fully
  delete the persistent user model is not described.
- **How does Hermes handle cross-project contamination?** [unknown]
  If "the agent that grows with you" knows about your last six
  projects, what stops Project A's commitments from influencing
  reasoning about Project B?

---

## 2. What ManthanOS is optimizing for

### Observed properties (from the current codebase at HEAD)

- **Workspace-scoped continuity record.** A `.manthan/` directory
  lives *inside* each git repository. SQLite memory + JSONL audit
  log + blob store are physically per-workspace. `workspaceId` is
  derived from canonical workspace root path; every read filters on
  it. No global facts store.
- **Human-gated trust ladder.** Facts enter at T0 (quarantine);
  every promotion to T+1/T+2/T+3 is human-approved and recorded in
  the audit chain. No `--yes-everything` mode; no auto-promote.
- **Deterministic continuity shape.** Adaptive shaping rules are
  explicit (`priorityAreas → tier → confidence → area → statement`),
  budget-aware, and explainable. Every omission is recorded in
  `BundleMetrics.omittedFacts` with a reason.
- **Hash-chained audit log.** Every effectful action writes a row
  with `payload_hash` + `prev_hash` + `self_hash` for accidental
  corruption detection. Not tamper-proof against an attacker with
  workspace write access; explicitly disclaimed.
- **Replayable recorded runs.** `manthan replay <runId>` reads back
  the audit records for a past run — recorded bundle hash, payload
  hash, usage, finish reason, recorded adapter response. Disclaimed
  as recorded-run inspection, *not* byte-identity reconstruction.
- **Decay, dedup, queue-health as substrate primitives.** Stale
  facts auto-demote across warn → demote → archive bands. Jaccard
  paraphrase clusters surface for human merge. Queue-health
  diagnostic reports backlog growth and drain rate.
- **Run-and-exit CLI.** No daemon, no service, no cloud. `manthan
  plan "<brief>"` invokes an adapter, records, and exits.
- **Multi-provider adapters.** Claude (API + CLI), Codex CLI, Gemini
  CLI, OpenAI. The brain layer has no provider-specific code; the
  same workspace state is presented whether the next adapter is
  Claude, Codex, Gemini, or OpenAI.

### Inferred design philosophy

- **The project, not the agent, is the unit of continuity.**
  [inferred] Continuity belongs to the repository — agents come
  and go; the recorded facts stay with the code.
- **Human attention is a feature, not a friction.** [inferred] Every
  trust transition is human-gated *deliberately*; the cost of a
  one-second prompt review is judged to be lower than the cost of
  a bad fact silently entering future prompts.
- **Auditability is a primary requirement.** [inferred] Hash chains,
  explicit `decision` fields (`human-approved` vs `auto-approve`),
  recordable redactions, and 7-day undo windows treat "could you
  reconstruct why the model thought X?" as a load-bearing question,
  not a stretch goal.
- **Less context, chosen well, beats more context.** [inferred] The
  trust ladder, decay, dedup, and shaping primitives collectively
  defend the prompt against accumulated noise. The substrate is
  designed around the hypothesis that small, curated, human-blessed
  context outperforms large, auto-curated context.
- **Cross-provider equivalence is by construction, not magic.**
  [inferred] The brain layer's provider-agnosticism is intentional;
  the project's value proposition does not depend on any one
  vendor's memory feature.

### Unresolved unknowns (in our own substrate)

- **Whether the trust-ladder discipline scales as a habit.** Phase 1.6
  evidence is synthetic; we have not measured a real human's
  willingness to perform sustained promotion-queue triage.
- **Whether the no-relevance-scoring shaping rule holds at workspace
  sizes >200 facts.** Documented in
  [`docs/research/EARLY_FEEDBACK_SYNTHESIS.md`](./EARLY_FEEDBACK_SYNTHESIS.md)
  §4.3.1 as an open research problem.
- **Whether cross-model continuity (E6.1) produces a measurable
  improvement.** Per `docs/PHASE3_CPT.md` and
  `docs/TRUTH_CHECKPOINT.md` §6.4 — the live measurement has not
  been run.

---

## 3. Where Hermes validates the market / problem

The existence and ambition of Hermes Agent is evidence that the
underlying problems ManthanOS targets are real to the broader market,
not just to one solo engineer.

### Continuity fragmentation [observed in Hermes' framing]

Hermes' "talk to it from Telegram while it works on a cloud VM"
and "cross-platform conversation continuity" features only make
sense if users *experience* fragmentation across surfaces. That's
the same pain ManthanOS centers — users don't stay in one tool, and
they pay a cost when context doesn't follow them. Hermes validates
that this pain is mainstream enough to be worth building product
around.

### Cross-session workflow pain [observed]

Hermes' FTS5 session search + LLM summarization + "deepening model
of who you are across sessions" all address the same gap that
ManthanOS's audit chain + trust ladder address: information from
session N is lost by session N+1 by default, and users want it
preserved.

### Retrieval / compression importance [observed]

Hermes ships *"trajectory compression"* explicitly as a feature.
This is independent confirmation that "remember everything" doesn't
work; meaningful selection / compression of accumulated history is
necessary. ManthanOS's decay + dedup + adaptive shaping primitives
make the same architectural bet from a different starting point.

### Memory shaping necessity [observed]

The "periodic nudges" Hermes uses to curate memory are themselves
an acknowledgment that raw accumulation is not enough. Whether the
curator is a human (ManthanOS) or the agent itself (Hermes) is the
philosophical divergence, but the *necessity* of curation is
shared.

### Multi-provider engineering reality [observed]

Hermes supports 10+ provider classes and emphasizes "no lock-in."
That a Nous Research project — a research org with strong
single-model investments — chose to build provider-agnostic
infrastructure suggests the multi-provider workflow ManthanOS
targets is recognized industry-wide as load-bearing.

### Audit / approval friction is felt [observed, weakly]

Hermes lists "Command approval" under its security section. The
mere existence of an approval-gate concept (even minimally
described) means even an autonomous-agent-leaning team recognizes
that *some* gating is necessary. ManthanOS's choice to put that
gating front-and-center, not behind it, is a difference of degree,
not kind.

---

## 4. Areas where ManthanOS should intentionally diverge

These are not "ManthanOS is better than Hermes" arguments. They are
"ManthanOS should make the opposite choice, on purpose, for a
specific reason." If Hermes is right, ManthanOS is wrong here. The
divergence is principled, not competitive.

### 4.1 Avoid "self-improving" framing

Hermes' tagline is *"the self-improving AI agent."* ManthanOS
should not adopt this framing.

- **Why diverge:** Self-improvement implies the agent is the unit
  of accumulated value. ManthanOS's value-unit is the *project's
  record*. The project owns its continuity (see
  `docs/POSITIONING.md` §5). The agent is a tenant.
- **Why Hermes' framing works for Hermes:** Hermes' user is
  building a personal assistant identity. ManthanOS's user is
  building software in a repo, and wants the repo's commitments
  to outlast any specific agent or model.

### 4.2 Avoid anthropomorphic memory claims

Hermes uses "memory," "remembers," "skills," "deepening model" —
all anthropomorphic vocabulary.

- **Why diverge:** ManthanOS's recent language sweep
  ([commit `edb747b`](https://github.com/DeadlyVirusIn/manthanos/commit/edb747b))
  explicitly removed "cognition," "intelligence," and "knows"
  framings in favor of "continuity record," "trusted facts," and
  "presents." This is the same content with mechanical vocabulary,
  on purpose. Anthropomorphic vocabulary smuggles in claims about
  understanding that the substrate does not make.
- **What ManthanOS uses instead:** *records*, *audits*, *promotes*,
  *presents*, *retains*, *shapes*. Verbs that describe what the
  system mechanically does.

### 4.3 Avoid persistent autonomous identity

Hermes builds a "deepening model of who you are." ManthanOS
explicitly does not.

- **Why diverge:** A persistent user model creates cross-project
  contamination risk by construction — the same model that knows
  "user prefers Python" knows "user's last project used Postgres,"
  and the substrate would need to decide which preferences apply
  to which project. ManthanOS sidesteps this by *not having* a
  user model: each workspace is its own continuity unit. The user
  is the operator who switches workspaces, not the subject of a
  cumulative model.
- **Trade accepted:** ManthanOS gives up the "the assistant just
  knows your style" UX in exchange for "no project will ever leak
  into another."

### 4.4 Avoid hidden / background mutation

Hermes' "agent-curated memory with periodic nudges" and "autonomous
skill creation after complex tasks" both imply state changes the
user does not explicitly authorize at the moment of change.

- **Why diverge:** ManthanOS's audit chain treats *every* effectful
  state change as a recorded event with `decision: human-approved`
  or `decision: auto-approve` (the latter reserved for narrow
  decay-band touches that never change tier). The user can always
  ask "why does the brain currently believe X?" and walk the
  audit log back to the exact human-approved moment, or — if the
  answer is "auto-approve" — know it was decay or dedup, never
  silent fact-creation.
- **Trade accepted:** ManthanOS gives up "the agent just learns" in
  exchange for "every learning event is timestamped, signed, and
  reversible within 7 days."

### 4.5 Avoid uncontrolled cross-project carryover

Hermes' framing is one persistent agent across all of a user's
work. ManthanOS's framing is one workspace per project.

- **Why diverge:** *"Older projects resurfacing unexpectedly"* is
  named as a real concern in
  [`docs/research/EARLY_FEEDBACK_SYNTHESIS.md`](./EARLY_FEEDBACK_SYNTHESIS.md) §1.1.
  ManthanOS makes this *structurally impossible* at the substrate
  level — there is no read path that returns facts from another
  workspace. A bug couldn't leak Project A into Project B; the
  workspaces don't share the file the facts live in.
- **Trade accepted:** ManthanOS makes intentional cross-project
  knowledge sharing harder (it requires explicit export/import,
  which doesn't exist today). For users who *want* one personal
  agent across everything, Hermes is the better fit.

### 4.6 Avoid "infinite memory" positioning

Hermes' framing is asymptotic ("the agent that grows with you").
ManthanOS's framing is bounded ("disciplined continuity").

- **Why diverge:** Long-context degradation is real (see
  `docs/PHASE2_THEORY.md` §11 and the external feedback that
  triggered `EARLY_FEEDBACK_SYNTHESIS.md`). A claim of unbounded
  growth either contradicts the model's measured limits or
  implicitly accepts a hidden compression / retrieval layer whose
  trade-offs are opaque. ManthanOS prefers an explicit shaping
  layer with documented omissions.
- **Trade accepted:** ManthanOS is harder to demo as a "wow"
  moment ("look, the AI remembers everything!") because the
  honest demo is "look, the AI knows the *one* commitment the
  human said was load-bearing two months ago." Less impressive,
  more defensible.

### 4.7 Avoid daemon / always-on runtime

Hermes runs continuously across platforms. ManthanOS runs and
exits.

- **Why diverge:** A daemon is a long-lived state machine; a
  recoverable workspace is a flat-file substrate. The latter is
  cheaper to reason about, audit, and version with `git`. ManthanOS
  treats this as a deliberate constraint, not a missing feature.
- **Trade accepted:** ManthanOS cannot do scheduled background
  work, cron deliveries, or "work while you sleep" workflows.
  Hermes can. For ManthanOS's target user — an engineer making
  human-led decisions in a repo — the trade is favorable; for
  Hermes' target user — someone wanting an always-on personal
  assistant — it would be a regression.

---

## 5. Failure modes visible from external feedback

These are concerns advanced users have raised about
agent-with-memory systems in general (not specifically about
Hermes — we have not used Hermes — but applicable to the design
space). They are documented in
[`docs/research/EARLY_FEEDBACK_SYNTHESIS.md`](./EARLY_FEEDBACK_SYNTHESIS.md)
and re-stated here in the comparative frame.

### 5.1 Contamination

A persistent agent identity that grows across all of a user's work
creates a vector for older-project assumptions to influence
current-project reasoning. Whether Hermes addresses this is
**[unknown]** from public docs. ManthanOS sidesteps the failure
mode entirely via workspace-scoped isolation.

### 5.2 Retrieval degradation

A "store everything forever" approach interacts poorly with current
LLMs' long-context characteristics (lost-in-the-middle, attention
dilution). Hermes' trajectory-compression feature suggests they're
aware of this; the public materials do not describe what gets
compressed away or how compression is validated. ManthanOS uses
human-gated decay + tier-aware shaping; the trade-offs are
explainable per fact.

### 5.3 Context rot

The signal-to-noise ratio of a growing memory blob is not
self-improving even if the agent is — adding more low-value
"observations" dilutes the high-value commitments. ManthanOS's
trust ladder is the primary defense (T0 quarantine is the default
sink; T+1 promotion requires a human action). The "self-improving
memory" path requires solving signal-extraction at high recall,
which is itself an open research problem.

### 5.4 Runaway accumulation

A system that "nudges itself to persist knowledge" without an
explicit ceiling will, by construction, hit one eventually. The
ceiling will either be (a) the model's context window, (b) the
retrieval system's recall budget, or (c) the user's attention
budget when reviewing. None of (a)/(b)/(c) is explicitly bounded
in Hermes' public framing. ManthanOS bounds (c) via per-session
review batches and (b) via deterministic shaping with explicit
omission accounting.

### 5.5 User confusion around relevance

If the agent decides what's relevant, and the user disagrees, the
user has limited recourse — the model that produced the relevance
judgment is the same model the user is now arguing with. ManthanOS
makes relevance a human decision at promotion time and a
deterministic-sort decision at bundle-pack time. The user can
always say "no, that fact does not apply here" by demoting it.

These failure modes are *applicable to* Hermes as a design class.
Whether Hermes has mitigations is **[unknown]** from public
materials; the public docs do not describe its handling of any of
the five.

---

## 6. Strategic conclusion

### 6.1 "Disciplined continuity" is a stronger framing for ManthanOS, not for Hermes

Two products can be in the same problem space and still optimize
for opposite design points. Hermes optimizes for *autonomous
persistence*; ManthanOS optimizes for *human-gated continuity*.
The framings should not be mixed.

ManthanOS's framing — "continuity infrastructure for multi-model
engineering workflows" — works *only* if it remains anchored in:

- Workspace-scoped (not user-scoped) memory.
- Human-gated (not agent-curated) trust transitions.
- Recordable (not generative) state changes.
- Bounded (not asymptotic) memory growth.
- Run-and-exit (not daemon-resident) execution.

If any of those drift toward Hermes' design point, ManthanOS
becomes a worse version of Hermes — not a better one. The
discipline is the moat.

### 6.2 Smaller / higher-signal context likely beats larger context for engineering

This is a hypothesis, not a measured result. The current evidence
(stated honestly):

- **For ManthanOS:** Phase 1.6 long-horizon simulation observed
  ~1500-token self-bounding for the trusted layer under synthetic
  stress (`docs/STABILIZATION.md`). Real-workload validation is
  pending.
- **Against ManthanOS:** No live experiment yet shows whether a
  small curated context produces better LLM output than a large
  auto-curated one for engineering tasks. E6.1
  (`docs/PHASE3_CPT.md`) is designed to measure exactly this and
  has not been run.
- **External corroboration:** Long-context degradation papers
  ("Lost in the Middle," etc.) suggest large contexts harm
  retrieval; this is published research, not a ManthanOS claim.

The position to defend is: **smaller-and-curated is a defensible
default; larger-and-auto-curated is an empirical claim that
requires evidence.** Hermes' shipping of "trajectory compression"
implicitly agrees that the larger-is-better hypothesis fails at
some point; the disagreement is over where the boundary is and who
gets to draw it.

### 6.3 Trustworthiness may matter more than autonomy for engineering workflows

Engineering work has a specific failure-cost structure: a
silently-wrong commitment in week 8 produces a bug in week 12 that
takes a day to track down to its source. Other domains (creative
writing, personal-life note-taking, casual conversation) have a
different cost structure where the cost of a wrong "remembered"
fact is small.

ManthanOS's bet — that engineering workflows specifically reward
auditability over autonomy — is testable. The market signals so
far (the existence of `git blame`, the standard expectation of
code review, the universal "explain your reasoning" norm in
postmortems) suggest engineers already value auditability highly
for human-authored decisions. Whether they extend that value to
AI-authored decisions is the open question. ManthanOS is built on
the hypothesis that they will.

### 6.4 Coexistence is plausible

Hermes and ManthanOS are not in zero-sum competition. A plausible
end state:

- A user adopts Hermes as their personal-assistant identity, for
  cross-platform conversational work, scheduled automation,
  Telegram-mediated long-running tasks.
- The same user adopts ManthanOS for engineering work in specific
  repositories — `manthan plan` against whatever AI tool they're
  using that hour, with the workspace continuity record staying
  with the repo.

In that world, Hermes is the answer to "I want an assistant"; ManthanOS
is the answer to "I want my project to remember." Both can be true.

---

## 7. What this memo deliberately does not do

- It does not claim ManthanOS is better than Hermes.
- It does not criticize Hermes' design — Hermes is internally
  coherent and well-engineered for its stated goals.
- It does not propose copying any Hermes feature into ManthanOS.
- It does not commit to any roadmap item, even ones suggested by
  the comparison (cross-workspace import, scheduled background
  workflows, etc.).
- It does not include benchmarks. We have not run Hermes.
- It does not claim to know Hermes' implementation details beyond
  what's in the public README + docs.

The memo's job is to make the conversation with someone who asks
"why aren't you doing what Hermes is doing?" honest and
repeatable. The answer is: those are different optimizations, and
both are defensible — the divergence is the point.

---

## 8. One-sentence summary

> **Hermes optimizes for an agent that grows with the user;
> ManthanOS optimizes for a project that owns its continuity
> record. Both are honest design points; the divergence — autonomy
> vs auditability, user-scoped vs workspace-scoped, daemon vs
> run-and-exit, agent-curated vs human-gated — is principled. The
> existence of Hermes validates that continuity matters; it does
> not validate any particular design choice for how to provide
> it.**

If any other doc implies that ManthanOS is "doing the same thing
as Hermes but better," that sentence is overclaiming. The honest
relation is **adjacent in problem space, opposite in design point,
not in competition.**
