# ManthanOS — Future Command Center (Product Vision)

> A single command center where humans manage AI agents, hand work
> between them, and let the Project Brain own continuity.
>
> **Status: future product direction. NOT Phase 2. NOT on the current
> build plan.** This document captures intent so the project does not
> drift into building it prematurely.
> Captured: 2026-05-16.

---

## Scope discipline (read first)

This document is **vision**, not specification, not roadmap, not work.

The current build remains:

- Phase 2: fact hygiene, promotion UX, adaptive shaping, continuity
  observability, brain entropy control.
- Continuity lifecycle management first. Frontend later — *if and only
  if* the underlying layer proves it deserves a visual surface.

If reading this doc tempts you to start scaffolding a UI, a multi-agent
runtime, an orchestration engine, or a provider marketplace, stop.
The point of writing this down is to **stop carrying the idea in your
head** while you ship hygiene work. Capture it here, then close the
file.

---

## 1. Product vision

ManthanOS evolves into a single command center where:

- The human registers the AI agents they already pay for.
- Each agent has a defined role inside the project.
- Work flows between agents without the human becoming the manual
  synchronization layer.
- All agent activity reads from and writes to the same trust-gated
  Project Brain.
- Continuity is owned by the project, not by any individual agent.

This is the natural endpoint of the continuity thesis: once the brain is
durable, the human stops being the integration substrate.

---

## 2. Core user pain

Today, a working engineer using multiple AI systems is doing this all
day, manually:

- Asks ChatGPT to refine a prompt → copies the prompt.
- Pastes it into Claude → gets an implementation.
- Pastes that implementation into Gemini → gets critique.
- Re-pastes the critique into ChatGPT to decide what to do.
- Manually re-states project context to every tool, every time, with
  drift on every restatement.

The human **is** the bus. Every restatement is an opportunity for
context loss, contradiction, and silent quality decay.

ManthanOS, eventually, removes that burden. The agents talk to the
brain; the brain remembers; handoffs are explicit, audited, and
human-gated where it matters.

---

## 3. Agent role model

In the future model, each registered agent is described by a
deterministic record:

| Field | Meaning |
|---|---|
| **provider** | Anthropic, OpenAI, Google, xAI, Z.ai, Perplexity, Meta (Ollama), local, etc. |
| **access method** | API key, OAuth subscription, CLI (`claude --print`, `codex`, `gemini`), browser/manual paste-in, local process. |
| **role** | The function this agent is allowed to perform (see §4). |
| **strengths** | Free-text strengths the human asserts (used for routing hints, never for autonomous scoring). |
| **cost profile** | API rate, subscription cap, or free-local. |
| **context window** | Tokens; informs bundle sizing per agent. |
| **privacy level** | What classes of repo content this agent is allowed to see (public-OK, repo-only, no-secrets, offline-only). |
| **project permissions** | Read-brain, propose-facts, propose-edits, sign-decisions — explicit, not implicit. |
| **allowed workflows** | The set of workflow steps this agent may participate in. |

The record is human-authored. No agent self-describes its strengths.
No "auto-discovery." Trust boundaries stay explicit.

---

## 4. Example role assignments

These are illustrative defaults a user might pick. None are mandatory;
the model is configurable.

- **ChatGPT** — prompt strategist, reviewer, product thinker. Strong at
  framing tasks, generating critique on plans, deciding what step
  comes next.
- **Claude** — implementation, architecture, deep reasoning. Long
  context, careful execution, good at large coherent edits.
- **Codex** — repo edits, patch generation, focused diff work.
- **Gemini** — adversarial critique, broad review, surface
  alternative perspectives.
- **Perplexity** — web research, citations, current events, library
  lookups.
- **Ollama (local)** — private/offline reasoning over sensitive code
  or secrets that must not leave the machine.
- **Grok / GLM / others** — alternate review perspectives, used
  selectively for diversity rather than as primary actors.

The same agent can hold multiple roles in different workflows. Role is
per-workflow-step, not per-agent.

---

## 5. Workflow examples

Concrete user-defined chains the command center should eventually
support. None of these are implemented; they are illustrations.

**Prompt → Implement → Review → Revise**
1. ChatGPT refines a vague task into a precise implementation prompt.
2. Claude implements against the brain.
3. Gemini reviews the implementation for blind spots.
4. ChatGPT decides whether to apply, ignore, or escalate the critique.
5. Claude applies the agreed-on changes.

**Design → Debate → Implement → Audit**
1. ChatGPT proposes 2–3 architectural options.
2. Gemini and Claude debate the options against trusted brain facts.
3. The human picks. Decision is signed (T+3).
4. Claude implements.
5. Codex generates the final patch.
6. The human reviews the audit log.

**Bug report → Forensic analysis → Patch → Review**
1. Perplexity searches for known issues and CVEs.
2. Claude reads the relevant code and forms a hypothesis.
3. Codex generates the patch.
4. Gemini reviews the patch adversarially.
5. The human approves.

**Research → Architecture → Implementation plan**
1. Perplexity gathers current best practices.
2. ChatGPT synthesizes into options.
3. Claude turns the chosen option into a plan with steps and risks.
4. The plan is logged to the brain.

**Long project handoff across models**
A workflow that runs for weeks. The brain is the only continuity layer.
Agents come and go (subscription expired, new model launched, the user
switched providers). The work continues because the brain remembers,
not because any one model does.

These examples should be reachable through a workflow builder, not
hand-coded into the runtime. The runtime executes; the human composes.

---

## 6. Shared Project Brain

The non-negotiable architectural principle:

> All agents read and write through the same trust-gated continuity
> layer. No agent owns the truth. The Project Brain owns continuity.

Practical implications:

- A fact promoted by the human is visible to every agent on the next
  bundle.
- A fact proposed by one agent and rejected by another is recorded as
  a corrective signal, not silently dropped.
- An agent cannot privately remember anything across runs. If it
  matters, it goes through the brain.
- Brand-loyalty switches (Claude → Codex, or the reverse) do not lose
  continuity. The brain survives.

This is what makes the command center more than a router. A router
forwards messages. The command center preserves cognition.

---

## 7. Trust and approval model

The trust ladder from Phase 1 / Phase 2 extends unchanged into the
multi-agent world:

- Agents **propose** facts. They never self-promote.
- Humans **promote** facts. T+1 / T+2 / T+3 are human acts.
- Agent disagreement produces visible contradictions, not silent
  resolution.
- All handoffs between agents are audited as workflow events.
- Every brain mutation is replayable from the audit trail.

The command center is permitted to **propose** the next agent for a
step. It is **not** permitted to commit the result without crossing the
appropriate trust gate for whatever the result claims to be.

The user can always say: "do not run the next step without me."

---

## 8. UI concept (described, not designed)

The command center surfaces about ten major screens. Each is named
here without prescribing pixel layout — the visual designer's job
later.

- **Project dashboard** — at-a-glance: current brain health, active
  workflows, recent handoffs, recent decisions, pending promotions.
- **Agent registry** — list of registered agents with their roles,
  cost, context window, and permissions; one-click enable/disable.
- **Workflow builder** — composes named multi-step workflows from
  available agents and roles; outputs a saved workflow definition.
- **Handoff timeline** — per-workflow, the sequential view of which
  agent did what, when, and what artifact each step produced.
- **Prompt/context packet viewer** — for any step, see the exact
  bundle that was sent: trusted facts, decisions, files, diff,
  task brief, and which were omitted (with reasons, from adaptive
  shaping).
- **Review board** — surfaces critiques and adversarial reviews
  produced in-flow, with "apply", "discard", or "park" actions.
- **Trust queue** — the human's promotion queue: proposed facts,
  contradictions awaiting resolution, dedup clusters, decay
  warnings.
- **Cost dashboard** — per-provider spend, per-workflow spend,
  rate-limit health, subscription quota burn-rate.
- **Audit / replay explorer** — given any past run, replay it
  deterministically against the original brain state. Diff what the
  brain knew then vs. now.

Each screen is a **view onto the brain**, not a side channel. There is
no UI-only state. Whatever the human sees, the runtime can also produce
without the UI.

---

## 9. Safety model

The command center must enforce, not bypass, the existing safety
properties:

- **No hidden agent actions.** Every API call, every CLI invocation,
  every read of a file is logged.
- **No auto-deploy.** Production-affecting actions require human
  signature.
- **No unapproved repo writes.** An agent can propose a patch; only
  the human (or an explicitly-signed approval rule) merges.
- **Cost caps.** Per-workflow, per-agent, per-day. The runtime
  refuses to exceed.
- **Provider isolation.** A secret accessible to one agent is not
  automatically accessible to another. The privacy level on each
  agent is honored.
- **Permission boundaries.** An agent without `propose-edits` can
  read but cannot suggest patches. An agent without `read-brain`
  works in a sandboxed bundle.
- **Audit trail.** Same hash-chained event log Phase 1 introduced.
  Multi-agent activity must remain fully replayable.

The principle: the command center is a **conductor**, not an
authority. The brain and the human remain authoritative.

---

## 10. Roadmap placement

This is **after** continuity itself is proven. The future gates,
in order:

1. **Phase 2 hygiene complete.** Dedup, decay, adaptive shaping,
   promotion UX, observability primitives all landed and stable.
2. **Phase 3 long-horizon experiments positive.** Multi-month
   synthetic experiments show continuity quality stays high under
   bounded cost. CpT measurement shows real plans benefit, not just
   smaller bundles.
3. **E6.1 cross-model continuity proven** with proper adapters
   (the gap E6 surfaced). Until then, the multi-agent promise is
   structurally unsupported.
4. **User demand for visual workflow management is clear.** Not
   inferred. Not assumed. Observed in real usage patterns where the
   human is visibly bottlenecked on cross-agent synchronization
   despite having a working brain.

If any of these gates fails, the command center concept is
re-evaluated rather than implemented. A frontend over a fragile
continuity layer is worse than no frontend at all.

---

## What this doc is not

- Not a spec. No interfaces, no schemas, no APIs.
- Not a commitment. The roadmap remains as it is.
- Not permission to start. No part of this document authorizes work
  toward implementation.
- Not a marketing pitch. The point is internal clarity, not external
  positioning.

The reason this exists: so that during Phase 2 hygiene work the
project does not drift into building a UI for capabilities that have
not yet been earned, and so that **when** these capabilities are
earned, the team remembers what the durable thing is supposed to feel
like.

---

## Summary

The frontend command center is the natural product surface for a
proven continuity engine. It removes the manual-synchronization burden
that current AI workflows impose on the human.

It becomes a real artifact **only** when:

- continuity demonstrably compounds in long-horizon usage,
- hygiene visibly prevents pollution,
- shaping measurably preserves quality at lower cost,
- and cross-model handoff is empirically supported.

Until then, this document is a holding place. Phase 2 continues.
