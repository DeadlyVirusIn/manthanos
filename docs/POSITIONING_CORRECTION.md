# POSITIONING_CORRECTION

> **Status:** Internal memo. Not a marketing document.
> **Date:** 2026-05-17.
> **Trigger:** Day 7 outreach surfaced a mismatch between how the README
> currently reads and how the founder actually uses the tool.
> **Predecessor:** `docs/TRUTH_CHECKPOINT.md` (anti-extension §6.4),
> `docs/POSITIONING.md` (current public framing),
> `docs/STABILIZATION_VERDICT.md` (Option A — narrow thesis).

This memo corrects an over-narrowing that happened during stabilization.
It is not a return to "AI operating system," autonomous agents, swarms,
orchestration runtimes, or hidden automation. Those remain deferred.

---

## 1. WHAT WAS OVER-NARROWED

Stabilization was a safety measure. The original cross-model continuity
claim (Phase 0 framing) was unverified by data, so §6.4 of `TRUTH_CHECKPOINT.md`
introduced an **anti-extension rule**: do not publicly claim continuity
improves another model's output until E6.1 produces a number.

That rule was correct. The mistake was narrative, not technical:

- §6.4 constrained what we **claim**, not what we **build**.
- Subsequent doc rewrites (`POSITIONING.md`, `README.md`'s opening) read
  the rule as a product-scope decision, not a measurement-scope decision.
- The result is a public surface that sounds like a Claude memory plugin.
- The codebase did not narrow. The narrative did.

Evidence the codebase did not narrow:

| Adapter package | Present in tree | Compiles | Wired into `manthan plan` |
|---|---|---|---|
| `adapter-claude` (API) | ✓ | ✓ | ✓ (`--adapter=api`) |
| `adapter-claude-cli` (subscription) | ✓ | ✓ | ✓ (default) |
| `adapter-codex-cli` | ✓ | ✓ | ✓ (`--adapter=codex-cli`) |
| `adapter-gemini-cli` | ✓ | ✓ | ✓ (`--adapter=gemini-cli`) |
| `adapter-openai` (E6.1 path) | ✓ | ✓ | available through orchestrator |

The brain layer (`packages/memory`, `packages/context`, `packages/orchestrator`)
has no provider-specific code. The trust ladder, dedup, decay, audit log,
and shaping rules operate on facts whose provenance is the workflow run
that produced them — not the model that produced them. The system has
always been multi-provider by construction.

What got compressed too far:

1. **README opening** reads as "AI memory for Claude" — true for the
   currently most-tested path, but a false floor on the substrate.
2. **POSITIONING.md** centers on Claude in its hero section; the
   multi-tool reality is buried in "Architecture."
3. **TRUTH_CHECKPOINT §6.4** is correct text but was reused as a
   marketing constraint without a footnote distinguishing "measurement
   scope" from "product scope."
4. **Day 7 recruit script** uses "Claude continuity" verbatim,
   pre-filtering away users whose pain is exactly the multi-tool case.

This is fixable with a narrative correction, not a rebuild.

---

## 2. WHAT THE REAL PAIN ACTUALLY IS

The pain is not "the AI forgets my project."
The pain is "**all** the AIs forget my project, **they disagree about it**,
and **I am the only one keeping the books**."

A representative day for the founder, observed during the past two weeks:

- ChatGPT for early strategy and framing.
- Claude (CLI + API) for implementation.
- Codex CLI for second-opinion review.
- Gemini CLI for adversarial critique.
- Browser tabs holding 4–8 chat sessions.
- A scratchpad of decisions that none of those sessions know about.
- Manual copy-paste of "here is what the project decided" into each
  new context window.
- Drift: tool A is reasoning against a stale architectural assumption
  while tool B is reasoning against a corrected one, because the
  correction lived only in a now-archived ChatGPT thread.

The work to keep these tools coherent is real and recurring:

- **Re-priming cost** — every session begins with a paragraph of
  "here is the project, here is what we decided, here is what is
  current." Each retelling is slightly different.
- **Contradiction cost** — tool B confidently states something
  tool A explicitly rejected last week; the human is the only
  arbiter, and is doing it from memory.
- **Lossy handoff cost** — taking a plan from Claude to Codex for
  review involves re-pasting context; the review is implicitly
  scoped to whatever the human remembered to paste.
- **Decision-archaeology cost** — "did we decide X or did we just
  consider X?" is answerable only by re-reading chat logs.

The pain is structural, not a property of any single tool. No model
upgrade addresses it. A longer context window inside one tool does
not address it, because the work moves between tools.

This is the pain the substrate was actually built to handle. Stabilization
narrowed the **claim** to "we can demonstrate this with one model first";
that is honest. The **product** addresses the multi-tool case by default.

---

## 3. WHAT SHOULD REMAIN DEFERRED

Repositioning toward multi-tool continuity must not drag back any of
the following. They were correctly cut during stabilization and the
reasons still hold:

| Deferred | Why it stays deferred |
|---|---|
| **Autonomous agents** | No demonstrated benefit over human-gated workflows in this codebase; adds blast radius without adding measured value. |
| **Swarm systems** | Coordination cost dominates result quality at the scale a solo engineer operates; outside the workflow pain we're addressing. |
| **"AI Operating System" framing** | Vague, hype-coded, indefensible under technical review. Stabilization rejected it for cause. |
| **Full orchestration runtime** | We have one workflow (`plan`). Generalizing to a workflow engine before the first one has paying users is premature. |
| **Hidden automation** | No auto-promote, no auto-dedup, no auto-classify. Every trust-ladder transition is human-gated by design; this is the product's safety property. |
| **Real-time daemons** | The CLI runs and exits. No long-lived process. Adding one would be its own product. |
| **Multi-agent debate / panels** | Tempting but unproven. The substrate could host it later; the current product does not. |
| **SaaS / multi-tenant deployment** | Local-first is a deliberate constraint. Multi-tenant changes the threat model. |
| **MCP server packaging** | Possible later. Not today. |
| **Cloud sync** | Workspaces are local files. Sharing is `git clone`. |

These remain "Phase ≥ 5" or "Not in this product." The correction below
does not move any of them forward.

---

## 4. NEW POSITIONING LANGUAGE

### One-sentence positioning

> **ManthanOS is a local workspace that keeps your project's decisions
> and facts trustworthy across whichever AI tool you happen to be
> using today.**

### README opening direction

Replace the current opening (which reads as Claude-specific) with
something like:

> Most engineers don't use one AI. They use several — ChatGPT for
> framing, Claude for implementation, Codex or Gemini for review.
> Each tool starts every session as if the project never happened.
>
> ManthanOS gives the project a memory of its own. It runs locally,
> records what each session decided, lets you promote what should
> survive, and presents that record to whichever tool you open next —
> in a form the model can use, with an audit trail you can read.

This is honest because:

- The adapters exist (Claude API/CLI, Codex CLI, Gemini CLI, OpenAI).
- The brain is provider-agnostic.
- It is not yet proven that the brain improves a second model's
  output — and the README must not claim it does. The framing should
  say "presents the record to whichever tool you open next," not
  "makes the next tool smarter."

### Elevator pitch (≤ 60 seconds)

> When you work on a real project with AI, you don't stay in one tool.
> You bounce between ChatGPT, Claude, Codex, Gemini. Each one forgets
> the project the moment you close the tab.
>
> ManthanOS is a small command-line tool that holds the project's
> memory in your repo — what was decided, what should be trusted,
> what got contradicted. It records what came out of each session,
> lets you promote what's worth keeping, and feeds it back into the
> next session no matter which tool you're using.
>
> It's local. It's audit-first. Nothing is auto-promoted.
> It does not try to be the AI; it tries to be the part of the
> project that survives between AIs.

### Practical workflow framing

What a user actually does:

1. `cd ~/my-project && manthan init`
2. Use whatever AI tool they prefer for the conversation they're having.
3. When they want a structured plan, `manthan plan "<brief>"` against
   their chosen provider. The plan, its bundle, and the facts it
   surfaced are recorded.
4. Review what was captured: `manthan brain review`. Promote facts
   that should outlive the session. Demote ones that were wrong.
5. Next session — in any supported tool — those promoted facts
   appear in the next `manthan plan` bundle automatically.
6. Periodic hygiene: `manthan brain queue-health` to see backlog;
   `manthan brain duplicates` to spot contradictions.

The unit of value is **the durable record of what your project
decided**, not the model that filled it.

---

## 5. WHAT THE CURRENT PRODUCT ACTUALLY IS

Plainly:

- A monorepo CLI (`manthan`) installed via `npm link` from source.
- A workspace initializer that creates `.manthan/` with a SQLite
  memory file, an append-only JSONL audit log, and a blob store.
- A plan workflow (`manthan plan "<brief>"`) that:
  - Packs a deterministic context bundle (system facts, trusted
    facts, charter, decisions, optional repo snippets).
  - Sends it to a chosen adapter (Claude API, Claude CLI, Codex CLI,
    Gemini CLI, or OpenAI).
  - Parses a structured plan + extracts candidate facts into T0
    quarantine.
- A trust ladder (T-2 .. T+3) with human-gated transitions only.
  Every promotion / demotion / dedup-merge writes an audit event
  whose `decision` field is either `human-approved` or `auto-approve`
  (the latter only used by automatic decay, never by trust changes).
- A promotion UX:
  - `manthan brain review` — interactive queue triage.
  - `manthan brain trust-log` — recent trust mutations with 7-day
    undo windows.
  - `manthan brain undo-correction <seq>` — reverses a recent
    promotion/demotion.
- Dedup (Jaccard similarity, same-area only, conservative threshold).
- Decay / aging (with the `last_administratively_touched` migration
  preventing the prior semantic bug).
- Queue-health diagnostics with aging buckets and projection.
- A CpT measurement harness (`manthan experiments cpt-probe`) that
  runs the same brief across multiple workspaces and records
  objective shared-vocabulary metrics. Phase 3 measurement only.
- A long-horizon simulator (`manthan brain sim long-horizon`) for
  synthetic stress testing of the substrate.
- Cross-platform PAL (Windows / macOS / Linux) with platform-specific
  code paths, not a thin wrapper.
- Hash-chained audit log (SHA-256, accidental-corruption detection
  only — explicitly not tamper-proof against an attacker with write
  access to the workspace).
- BSL 1.1 license, auto-converts to Apache 2.0 after four years.

That is the entire product surface today.

---

## 6. WHAT THE CURRENT PRODUCT IS NOT

Equally important — and this list goes in any honest pitch:

- **Not proven to improve cross-model output.** E6.1 has not been
  run live. The claim is "we record and present the project's
  decisions consistently across tools," not "we make the next
  model smarter." Until a number exists, we do not assert one.
- **Not a daemon, not a service.** It runs when invoked and exits.
- **Not autonomous.** No fact is promoted, demoted, or merged
  without an explicit human action (with the narrow exception of
  decay events, which only adjust an internal `last_administratively_touched`
  field, never tier).
- **Not a chatbot.** There is no conversational interface.
- **Not a UI.** Terminal only, today. A UI is on the roadmap but is
  not a near-term claim.
- **Not Claude-specific** despite the README's current framing.
- **Not a free-form memory tool** — you do not type "remember that
  we use Postgres." Facts enter via workflow runs and human review.
- **Not a documentation replacement.** Decisions are recorded, but
  prose-form architecture docs still live in `docs/`.
- **Not an MCP server.** It could become one. It is not one today.
- **Not multi-tenant.** One workspace, one user, one machine.
- **Not tamper-proof.** Audit log detects accidental corruption only.
- **Not a continuity proof.** It is a continuity *substrate* whose
  measured effect is currently TBD.

If any of these claims slip into a pitch, the pitch is overclaiming.

---

## 7. HOW TO TALK TO EARLY USERS

Recruit conversations should center the **workflow pain**, not the
substrate. Questions that surface real users:

- "When you're working on a real codebase, do you use more than
  one AI tool? Which ones, and for what?"
- "When you switch tools mid-project, what do you find yourself
  re-typing or re-explaining?"
- "Has a second AI ever contradicted a decision you already made
  in a previous session? How did you resolve it?"
- "Where do your project decisions actually live — in chat logs,
  in your head, in a doc, in commit messages?"
- "How long does it take to re-prime a new AI session on a project
  you've been working on for two weeks?"

Language to use:

- "Project memory that lives outside any one AI tool."
- "Audit-first."
- "Human-gated."
- "Local-first."
- "Trust ladder."
- "Continuity across tools, not a smarter model."

Language to avoid:

- "AI Operating System."
- "Autonomous."
- "Self-improving."
- "Agentic."
- "Orchestration."
- "Swarm."
- "Multi-agent panel" (yet).
- "Memory plugin."
- "Makes <X> smarter."
- "Solves AI's memory problem."

Honest framing in a recruit DM:

> I've built a small CLI that keeps a project's decisions and facts
> in a local workspace, then feeds them back into whichever AI tool
> you use next. Right now I'm looking for engineers who actually
> work across multiple AI tools — ChatGPT for one thing, Claude for
> another, Codex/Gemini for review — and feel the pain of keeping
> them all in sync. Would you be open to a 30-minute call to walk
> through your workflow? I'm not pitching anything yet; I want to
> see if what I built matches what you actually need.

That message has no overclaim and no hype. It will filter to the
right users.

---

## 8. HOW THIS CHANGES (OR DOES NOT CHANGE) THE CURRENT ROADMAP

This is narrative correction, not a roadmap reset. Most of the
roadmap stands.

### Unchanged

- **Phase 3 CpT harness.** Still the right measurement. CpT is
  defined provider-independently.
- **E6.1 cross-model experiment.** Still the next measurement
  milestone. Its result is now *load-bearing for positioning* in
  a way it was not when we were framed as single-provider.
- **Phase 2 deliverables.** Dedup, decay, queue-health, promotion
  UX, long-horizon sim — all still relevant.
- **Cross-platform PAL.** Still the right ground for the substrate.
- **BSL 1.1 / commercial model.** Unchanged.
- **Local-first.** Unchanged.
- **Audit-first.** Unchanged.

### Changed (narrative only, no code)

- `README.md` opening: rewrite per §4 above. Current opening is
  Claude-anchored; replacement is tool-agnostic.
- `docs/POSITIONING.md`: update hero/lede to multi-tool framing;
  most of the body stands.
- `docs/TRUTH_CHECKPOINT.md` §6.4: add a one-line clarifying footnote
  distinguishing **measurement scope** ("we claim cross-model effect
  only after E6.1 produces a number") from **product scope** ("the
  product addresses the multi-tool case by default").
- `docs/FIRST_5_TRACKER.md`: replace recruit script with the language
  in §7. Re-filter the current candidate list against the multi-tool
  criterion.
- Demo asciinema: re-record with at least one tool switch in the
  flow once a real cross-tool demo exists (do not stage a fake one).

### Newly elevated (but already on the roadmap)

- **E6.1 live run.** Now blocks the cross-model claim in a way that
  affects positioning, not just internal measurement. The honest
  pitch in §7 does not depend on E6.1 outcome — it only describes
  what the tool records and presents. But if we ever want the
  pitch to say "makes the next tool more coherent," E6.1 must
  produce a positive number first.

### Not added

- No new commands.
- No new packages.
- No new providers.
- No daemon.
- No UI.
- No service surface.
- No MCP server.

---

## 9. RISKS OF REPOSITIONING TOO FAR BACK TOWARD HYPE

The correction in §4 is bounded. The following failure modes are
plausible and worth naming so they can be checked against.

| Risk | Failure mode | Mitigation |
|---|---|---|
| **Multi-tool drift to "AI OS"** | "We give your project a memory across all AI tools" reads adjacent to "operating system for AI." A loose copy edit pushes us back into hype space. | The positioning language in §4 contains the words "records" and "presents" — not "improves" or "orchestrates." Treat those word choices as load-bearing. |
| **Demo overclaim** | Recording a three-tool demo before E6.1 produces a number invites viewers to infer cross-model benefit we have not measured. | No three-tool demo until E6.1. The single-tool demo we already have is enough to show the workflow. |
| **Recruit overclaim** | A user agrees to a call expecting cross-model magic, then sees a CLI that "just" records decisions. They churn and tell others. | The §7 recruit DM says explicitly what the tool does (records, presents, audits). It does not say "makes your AI tools smarter." |
| **Roadmap creep** | Multi-tool framing tempts new features: tool-specific shaping, per-tool fact filters, per-tool dedup. | Each adapter is real code with real maintenance cost. New adapters go behind the same bar as the existing four: live test, dry-run validate, no claim of cross-provider benefit. |
| **Cost explosion** | E6.1's appetite for runs grows: 4 adapters × N briefs × replicates. | Phase 3 is signal, not scores. One brief × 2 adapters with healthy/empty/stressed × 3 replicates is enough to support or fail the cross-model claim. Beyond that is variance hunting. |
| **Conflict with §6.4** | Multi-tool framing reads to a careful reader as the very thing §6.4 ruled out. | Add the §6.4 footnote per §8 above. The distinction between *measurement scope* and *product scope* is the load-bearing clarification. If we cannot articulate it crisply in one sentence, we are overclaiming. |
| **Tool-vendor friction** | If any adapter vendor reads this and disputes the framing, we are in their orbit. | The framing centers on **the user's workflow**, not on any vendor's product. We do not name vendors as competitors. We do not benchmark against them. We do not claim to "fix" their memory. |
| **Confused early users** | Users who arrived at the README expecting a Claude memory tool now find a "multi-tool continuity layer" and bounce. | The README rewrite must still surface the Claude path prominently — it's the most-used adapter today. The opening just stops *defining* the tool around it. |

The single sentence that has to hold under critique:

> **What we record and present is real. What that does to the next
> model's output is currently being measured.**

If a sentence in any public-facing doc cannot be reconciled with
that one, that sentence is wrong.

---

## 10. RECOMMENDED POSITIONING

Concrete actions, ordered by priority. None of them are code changes.

### Priority 0 (this week)

1. **README opening rewrite.** Replace the current Claude-anchored
   opening with the language drafted in §4. Keep "Try It" exactly as
   it stands today — the install path is unchanged.
2. **`POSITIONING.md` lede update.** Same correction; existing body
   sections (architecture, philosophy) stand.
3. **`TRUTH_CHECKPOINT.md` §6.4 footnote.** Single line distinguishing
   measurement scope from product scope.
4. **`FIRST_5_TRACKER.md` recruit script swap.** Replace with §7 DM.
   Re-evaluate the current candidate list against the multi-tool
   filter; some who were borderline may now be a clearer fit, and
   some who looked like a fit may not actually have the multi-tool
   pain.

### Priority 1 (next week)

5. **`POSITIONING_CORRECTION.md`** (this file) committed and pushed
   so the correction is part of the public record, not just a private
   reframe. The transparency is itself part of the product's character.
6. **Day 7+ outreach** uses the §7 DM and the §4 elevator pitch.
   Track whether the new framing changes recruit-to-call conversion
   and call-to-trial conversion.

### Priority 2 (after first 1–2 user calls)

7. **Listen for the words users use.** If they consistently say
   "memory" or "context manager" or "scratchpad" or something
   else, our positioning is wrong. Update from observation, not
   from guess.
8. **Decide on E6.1 timing.** If users' pain is the multi-tool case
   in volume, E6.1's result is high-leverage. If their pain is
   actually about a single tool's session-to-session memory,
   E6.1 is lower-priority and we should say that.

### Not yet recommended

- A landing page beyond the README. (The README is the landing page
  for now; a separate site invites overclaim.)
- A logo, an org, a Discord. (Premature surface area.)
- Any blog post / launch announcement. (Premature distribution.)
- A waitlist. (Implies scarcity that does not exist.)
- A pricing page. (No commercial relationship today.)

### The one-line summary to memorize

> **A local workspace that holds your project's decisions and
> facts, so the next AI tool you open already knows what the
> last one decided.**

If we cannot defend that sentence under hostile review, the
positioning is still wrong. If we can, the correction is enough.

---

## Appendix — what this memo deliberately does not do

- It does not propose a renaming.
- It does not propose a new package.
- It does not propose a new command.
- It does not propose a new license.
- It does not propose any new commitments to users.
- It does not reopen any decision deferred in `STABILIZATION_VERDICT.md`
  beyond §6.4's narrative footnote.
- It does not contradict `PHASE_A_AUTHORIZATION_DECISION.md` — Phase A
  remains in "delay authorization" status pending the six preconditions
  listed there; this memo neither accelerates nor delays that.

The correction is small on purpose. Over-narrowing was a one-paragraph
problem; the fix is a one-paragraph fix carried into four or five
places. Anything larger than that is the failure mode in §9.
