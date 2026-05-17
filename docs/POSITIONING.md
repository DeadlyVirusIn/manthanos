# ManthanOS — Positioning

> Trust-gated project continuity for AI-assisted software engineering.
> Status: empirically narrowed after Phase 1.6 live experiment.
> Last revised: 2026-05-15.

---

## 1. What ManthanOS is

**ManthanOS is a trust-gated project continuity engine for AI-assisted
software engineering.**

It captures the architectural decisions, assumptions, and risks that
emerge as you work with AI on a codebase, holds them at human-gated
trust tiers, and re-injects the trusted subset into the prompts of
future AI workflows — so the next plan continues the project's
commitments instead of drifting away from them.

That single sentence is the whole product. The supporting capabilities
exist to make that loop reliable, replayable, and safe:

- **Audit-first runtime** — every effectful action is hash-chained.
  Detects accidental corruption; not tamper-evident against a local-disk
  attacker.
- **Auditable inspection of recorded workflows** — `manthan replay
  <runId>` retrieves the stored inputs, bundle metadata, and outputs.
  Bundle-hash recomputation is deferred (see
  `docs/TRUTH_CHECKPOINT.md` §2.4).
- **Deterministic trust mutation** — `promote / demote / undo` events
  are first-class chain entries with full provenance.
- **Structured project memory** — facts, decisions, and open issues
  live in indexed SQLite with explicit tiers (T+3 signed → T-2 reversed).
- **Cross-platform PAL** — Windows, macOS, Linux are equal targets;
  PAL is a canonical seam by convention, lint enforcement is deferred.

These are the substrate. Continuity is the product.

---

## 2. The problem ManthanOS actually solves

The problem is **project drift** when AI assists across many sessions.

After ten plans, fifteen reviews, and a handful of forensic debugging
sessions on the same codebase, the AI on hour 1 of week 12 has the
same priors as on day one of week one. It re-derives the same
assumptions. It contradicts last week's architectural decisions. It
re-invents the testing framework choice. It suggests a session store
strategy that conflicts with the one the team already committed to.

You've seen this. Every team using AI tools has seen this.

The cause is structural: chat interfaces, coding assistants, and most
"memory" plugins keep history *as chat*, not as **structured project
commitments**. Even when they have memory, the memory is unstructured
narrative — useful for "remember my name" but unreliable for "remember
that we decided Express 4.x, not Express 5."

ManthanOS does one specific thing about this:

1. When an AI workflow produces structured commitments (a plan's
   assumptions, risks), they land in the brain at **T0 (quarantine) —
   not trusted yet, not in future prompts**.
2. The human reviews them (`manthan brain facts`, `manthan brain
   promote`) and explicitly elevates the ones worth keeping.
3. Future workflows' prompts include the trusted set, tagged with tier
   and provenance.
4. The audit chain records every promotion, every workflow's bundle
   composition, every output — so you can replay, undo, or trace any
   continuity decision.

That's the entire mechanic. It is small. It works. It changes outputs.

---

## 3. Why we know this works

Phase 1.6 (2026-05-15) ran a live A/B experiment:

- **Same task** (OAuth session expiry, refresh, revocation)
- **Same model** (Claude Sonnet via Claude Code CLI)
- **Same workspace, same repo state, same audit chain**
- **Only variable:** three facts from a prior plan were promoted from
  T0 → T+1 between runs.

The treatment run (B1) — with 3 trusted facts in its bundle —
produced:

- A plan that continued the prior plan's Google OAuth + Passport +
  Express 4.x commitments (the control run B0 invented a different,
  framework-less design).
- An explicit citation: `"In-memory session store wiped on every
  process restart — Accepted per workspace constraint (T+1 fact)"`.
  Claude visibly read the trust tier annotation.
- ~42% of structural plan items traced to the promoted facts.
- ~80% more output tokens, but the output was concrete project-specific
  reasoning rather than generic OAuth advice.

**The control run contradicted the prior plan. The treatment run
continued it.** That is the continuity engine working.

Full experiment in `docs/CONTINUITY_THEORY.md` §4.

---

## 4. What ManthanOS deliberately is NOT

This is more important than what it is, because the original framing
was aspirational and the narrowed framing must be honest.

- **Not an "AI operating system."** That phrase implies many agents
  collaborating through one runtime. We deferred multi-provider work,
  debate engines, orchestration routing, and swarm-agent patterns
  pending evidence that any of those produce value beyond
  single-provider continuity. As of Phase 1.6, that evidence does not
  exist.
- **Not autonomous.** Every trust mutation requires human approval.
  No model self-promotion. No "the AI decides what to remember."
- **Not a multi-agent orchestrator.** The runtime supports adapter
  plugins by contract, but the empirically-validated path is one
  provider (Claude) doing one type of task (plan) with one human gate
  (promotion).
- **Not a moat-via-scale.** The value of continuity at month 12 may
  prove substantial — we cannot yet claim it. The day-1 value is real
  but narrow.
- **Not a vector DB or RAG system.** Facts are exact strings with
  exact hashes. Semantic similarity for de-duplication is on the
  roadmap (`FACT_HYGIENE.md`); semantic *retrieval* is not.
- **Not a chat product.** No conversation surface. CLI invocations
  produce structured artifacts.
- **Not a hosted SaaS.** Local-first, BSL-licensed, runs on your
  machine against your provider auth.

---

## 5. The unit of intelligence is the project

A specific design rule that follows from §1:

**The project owns its own cognition.** Agents are temporary tenants.
Models churn. CLIs update. Adapters get rewritten. The brain stays
with the repository.

Practical consequences:

- A new contributor running `manthan brain stats` sees the curated
  T+1+ facts the team has trusted. The contributor is not catching up
  with a chat log; they are inheriting commitments.
- The unit of audit is the project: every effectful action that
  touched this repo is in `.manthan/audit.log` and chain-verifiable
  against accidental corruption. (Re-running a prior workflow against
  a different model adapter is the open cross-model question — see
  `docs/STABILIZATION.md` §5 for E6.1.)

This is the design property that makes "less project drift" mechanically
achievable. Without it the loop would be theatre.

---

## 6. The moat (honest, narrow)

The Phase 1.6 evidence supports one specific moat claim:

> For engineering tasks with strong architectural-continuity
> requirements across related plans within a single project,
> trust-gated re-injection of prior commitments materially improves
> the next plan's continuity, specificity, and risk-awareness — at
> small token cost.

Things that are NOT yet supported by evidence:

- That the loop generalizes to debugging, refactoring, code review,
  migration planning, or any other task class. (Phase 2+ experiments.)
- That the human cost of promotion (the friction tax) pays off at
  scale beyond 5–10 facts per area.
- That brain content remains coherent and useful at month 6 or
  month 12 under realistic usage.
- That a competitor cannot replicate this with a much simpler "include
  prior decisions in next prompt" feature plus a UI for marking
  decisions as trusted.

We do not claim a moat we have not earned. The runtime is good. The
positioning is now narrower than the original framing implied.

---

## 7. Operational comparison (revised, honest)

| Capability | Cursor / Copilot | Aider | OpenDevin | claude-mem | **ManthanOS** |
|---|---|---|---|---|---|
| Repo-aware editing | ✓ | ✓ | ✓ | ✗ | ✓ |
| Cross-session memory | partial | partial | partial | ✓ | ✓ |
| **Trust-gated promotion** | ✗ | ✗ | ✗ | ✗ | **✓** |
| **Provenance in prompts** | ✗ | ✗ | ✗ | ✗ | **✓ (cited tier + src=)** |
| **Audit-chain replay** | ✗ | ✗ | ✗ | ✗ | **✓ (hash-chained)** |
| **Empirically-measured continuity effect** | ✗ | ✗ | ✗ | ✗ | **✓ (Phase 1.6 A/B)** |
| Multi-agent debate as artifact | ✗ | ✗ | ✗ | ✗ | deferred |
| Multi-provider routing | ✗ | weak | partial | ✗ | deferred |
| Local-first | partial | ✓ | partial | ✓ | ✓ |

The differentiators are now narrowed to four specific capabilities,
each of which has working code and (in the continuity case) live
evidence.

---

## 8. What we believe (revised)

The values still hold; the priorities shift.

- **Evidence before assumptions.** Continuity is now evidence-backed.
  Multi-provider value is not. Build what is justified.
- **Less project drift > more intelligent AI.** The Phase 1.6
  experiment showed: the model is plenty smart. What it lacks is
  project memory. Address that first.
- **Trust gates are the product feature, not friction.** Auto-promotion
  would make ManthanOS faster and worse. Human review is the value.
- **Local-first by default.** The brain stays with the repo.
- **Cross-platform-first.** Windows, macOS, Linux equal.
- **Audit-first.** Every effectful action recorded, replayable, undoable.
- **Cost-aware.** Subscription quota counts.
- **No fake moat claims.** Narrower truthful product > grander
  unproven one.
- **Continuity is the product.** Everything else supports it.

---

## 9. Non-goals (positioning level)

What ManthanOS is explicitly NOT trying to be:

- A chat product.
- A coding assistant that lives in your editor.
- A SaaS company.
- A general-purpose multi-agent framework.
- A LangChain alternative.
- A "best wrapper around the best model."
- A vector DB / RAG / embedding-based retrieval system.
- A model trainer / fine-tuner.
- An autonomous-agent platform.
- An "AI operating system."

The original framing as the last item is **retired** by this revision.

---

## 10. Tagline

> ManthanOS — keep your project's commitments across sessions with one
> AI provider. Cross-provider continuity is the open question (E6.1).

Plain. Specific. Defensible by Phase 1.7. Honest about the cross-model
gap that E6 surfaced and E6.1 will resolve.

The earlier tagline ("the runtime where your project's intelligence
lives") was honest about ambition but not honest about evidence. The
revised tagline is now honest about both *and* about the
single-provider scope that the empirical record currently supports.
