# ManthanOS — Architecture

> The conceptual and structural foundation of ManthanOS.
> Status: design lock — pre-implementation.

---

## For contributors

If you are writing code in this repo, the docs scoped to a single
concern each are:

- [ADAPTER_SPEC.md](./ADAPTER_SPEC.md) — provider adapter interface.
- [WORKFLOWS_SPEC.md](./WORKFLOWS_SPEC.md) — workflow shape (currently
  one workflow, `plan`).
- [PLATFORM_LAYER.md](./PLATFORM_LAYER.md) — cross-platform PAL seam.
- [BOOTSTRAP_PROTOCOL.md](./BOOTSTRAP_PROTOCOL.md) — workspace init
  and charter extraction.
- [CRASH_CONSISTENCY.md](./CRASH_CONSISTENCY.md) — audit chain
  invariants under crash.
- [FACT_HYGIENE.md](./FACT_HYGIENE.md) — dedup, decay, shaping rules.
- [OBSERVABILITY.md](./OBSERVABILITY.md) — runtime metrics and
  diagnostics.
- [TRUST_OPERATIONS.md](./TRUST_OPERATIONS.md) — promotion / demotion
  / undo semantics.

Process artifacts, narrative corrections, and phase governance are
indexed in [NOTES.md](./NOTES.md) — not required for writing code.

---

## 1. Vision

ManthanOS is a **local workspace for AI-assisted engineering** —
a CLI that runs and exits, and a `.manthan/` directory that persists.

The motivating workflow is the one most engineers actually live in:
ChatGPT for early framing, Claude for implementation, Codex or Gemini
for review. Each tool starts every session as if the project never
happened, and the human is the only one keeping the books across them.
ManthanOS records the structured commitments each session produces,
lets the human promote what's worth keeping into a trust ladder, and
presents that record on the next workflow — regardless of which
adapter routes the call.

It is not a chatbot wrapper, an IDE plugin, a memory store, a daemon,
or an agent orchestrator. The substrate is the trust ladder and the
audit chain; provider adapters are how the substrate reaches the
tools. The brain layer has no provider-specific code by design — the
same workspace state is presented whether the next adapter is Claude
(API or CLI), Codex CLI, Gemini CLI, or OpenAI.

The name *Manthan* — Sanskrit for the churning that separates signal
from noise — names the operating principle: project commitments are
surfaced through structured human review of AI output, not synthesized
by autonomous agents.

> **Measurement boundary.** The product records continuity across
> tools and presents it on the next run. Whether populating the
> trusted layer in one tool measurably improves a *different* tool's
> output is being measured; see [`PHASE3_CPT.md`](./PHASE3_CPT.md)
> and [`TRUTH_CHECKPOINT.md` §6.4](./TRUTH_CHECKPOINT.md#64-measurement).
> The architectural design supports cross-model continuity by
> construction; the claim that it improves the second tool's output
> has not been asserted.

---

## 2. Why existing tools are insufficient

The problem ManthanOS solves is **fragmentation**. Today, a serious
engineer using AI assistance bounces between:

- A chat UI for architectural reasoning (Claude, ChatGPT, Gemini).
- A coding assistant for implementation (Cursor, Codex, Copilot).
- A memory tool for cross-session continuity.
- An orchestrator for routing between models.
- A review tool for code quality.
- A workflow tool for repeatable engineering processes.

Each tool solves a fragment. Several are excellent at their fragment.
None of them treat the engineering loop as a single substrate.

Concretely, the limitations are structural:

| Class | Example category | What it solves | What it does not solve |
|---|---|---|---|
| Memory persistence tools | session memory plugins | Recall across chats | Don't model agents, debate, or implementation |
| Orchestration wrappers | multi-AI routers | Route a prompt to many models | Don't preserve cumulative project context; each call is stateless |
| Token-compression layers | context-pack helpers | Fit more into a window | Compression is a tactic, not an architecture |
| Workflow routers | task → tool mappers | Pick the right tool per task | Workflows do not learn from past workflows |
| Coding agents | repo-aware editors | Edit files in a single tool's worldview | Cannot debate, cannot replay, cannot share state with peer agents |

The gap none of them close:

> A small local substrate that sits beside whichever AI tool runs the
> next workflow — capturing the structured commitments each run
> produces, gating their trust through human review, and presenting
> the resulting record on every subsequent run regardless of which
> adapter routes the call.

That is what ManthanOS is. It is deliberately *not* an autonomous
agent, an orchestrator, a debate engine, or a runtime daemon — see
the README's "intentionally deferred" list for the full set of
adjacent ideas that were considered and explicitly cut.

---

## 3. Core concepts

Five primitives, all of which are persistent and queryable.

**Workspace** — a single repository (later: workspace = set of repos)
under ManthanOS management. Identified by normalized absolute path +
git remote hash. Owns its own `.manthan/` directory. Path normalization
is platform-aware (POSIX internally, native at the boundary — see
PLATFORM_LAYER.md).

**Project Brain** — the structured, persistent cognitive store for a
workspace. See §7. Composed of decision log, memory layers, debate
transcripts, review history, audit log, and context snapshots.

**Agent** — any reasoning system reachable via an adapter. Carries
metadata (capabilities, costs, latency class) but no privileged
position in the runtime. Even first-party adapters are plugins.

**Workflow** — a deterministic state machine over a sequence of agent
invocations, context operations, and safety gates. Examples: `plan`,
`implement`, `review`, `forensic-debug`. Workflows are programs over
the project brain.

**Action** — any effectful operation: a provider call, a file write,
a git operation, a shell execution. Every action is classified,
gated, and recorded in the audit log. Pure reads against the project
brain are *not* actions — they are queries.

These five primitives are the entire vocabulary. Anything that does
not reduce to {workspace, brain, agent, workflow, action} should not
exist in the runtime.

---

## 4. System architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                            manthan CLI                             │
│  init · plan · implement · review · debate · forensic-debug · ... │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │      Orchestrator Core      │
                  │                             │
                  │  Workflow Runner            │
                  │  Routing Engine             │
                  │  Debate Engine              │
                  │  Safety Gate                │
                  └──┬──────────┬───────────────┘
                     │          │
        ┌────────────▼──┐   ┌───▼─────────────┐   ┌────────────────┐
        │ Context Packer│   │  Project Brain  │◄──┤  Audit Log     │
        │               │   │  (memory layer) │   │  (append-only) │
        └───────────────┘   └───┬─────────────┘   └────────────────┘
                                │
                  ┌─────────────▼─────────────┐
                  │     Adapter Surface       │
                  │  (uniform AgentAdapter)   │
                  └──┬────┬────┬────┬────┬────┘
                     │    │    │    │    │
                  Claude OpenAI Gemini Local Custom
                                                plugins
```

The orchestrator core never touches a provider SDK. It only invokes
adapters that satisfy the `AgentAdapter` contract. This is non-negotiable —
it is the rule that prevents the runtime from rotting around a
single vendor.

---

## 5. Component decomposition

**Orchestrator core** — the only component that knows about workflows.
Composes context, calls agents, gates actions, persists outcomes.
Stateless across invocations (state lives in the brain).

**Workflow runner** — executes a workflow state machine. Each
transition is deterministic given the brain's state, the workflow
definition, and (where applicable) human approval decisions. State
machine, not DAG: simpler, replayable, debuggable.

**Routing engine** — given a workflow step's required capabilities
and a budget, selects the best adapter. Initially rule-based; later
calibrated by an eval harness (see MVP_ROADMAP §6).

**Debate engine** — implements the protocol described in
DEBATE_PROTOCOL.md. Owns transcript persistence and arbiter contracts.

**Safety gate** — every action passes through the gate before it is
executed. Classifies action, looks up policy, requests approval if
needed, records outcome. See SAFETY_MODEL.md.

**Context packer** — assembles a per-call context bundle within the
target adapter's token budget. Layered, deterministic, cacheable.
Critical for cross-model consistency.

**Project brain (memory layer)** — the persistent store. Multiple
memory types (episodic, semantic, procedural). SQLite for MVP.
Repository pattern so Postgres / vector stores can swap in.

**Adapter surface** — the plugin loader, capability registry, and
contract-test harness for adapters.

**Audit log** — append-only, fsync-on-write, tamper-evident. Records
every action with payload hash and human decision. Forensic evidence
trail.

**Git-workspace** — git-aware operations (status, diff, branch,
stash, commit) wrapped behind a safe API. Never auto-pushes. Calls
shell out to `git` through the Platform Layer.

**Platform Abstraction Layer (PAL)** — the single point at which the
runtime touches the operating system. Owns: path normalization, shell
execution, process spawning, file watching, terminal detection,
user-data directory resolution, signal handling. Every other component
calls PAL primitives instead of Node `child_process`, `fs.watch`, or
raw shell strings. See PLATFORM_LAYER.md for the full contract.

---

## 6. Process model

**MVP: single Node.js process.** CLI invokes orchestrator in-process.
No daemon. No Docker requirement. Adapter calls are async; debates
parallelize across adapters using `Promise.all` with concurrency caps.

A daemon process (`manthand`) is a Phase-3-or-later addition, only
introduced when it earns its complexity (streaming UIs,
background debates, long-running watches).

Rationale: a daemon is fragile in a CLI-first product (process supervision,
upgrades, port conflicts, multi-user sessions, security surface). The
runtime should remain a library callable from any host process — the
CLI is one host; an editor extension or future daemon are others.

**Cross-platform implications:**

- Node.js 20+ is the only runtime dependency. No bash, no Make, no
  Docker for the MVP install path.
- Every external command (git, editor, pager, shell) is invoked via the
  PAL using argv arrays — never composed as shell strings.
- Process signals that don't exist on Windows (SIGUSR1, SIGHUP) are not
  part of the protocol between CLI and orchestrator. IPC uses
  `process.send` / `child_process` messaging or named pipes (abstracted
  by PAL), not POSIX signals.
- On Windows, `process.exit(code)` semantics, console UTF-8 handling,
  and CRLF normalization are PAL responsibilities, not caller
  responsibilities.

---

## 7. The Project Brain

> **Terminology.** "Brain" is the CLI shorthand (`manthan brain *`)
> for the operationally-curated portion of a workspace's
> **continuity record** — primarily the trusted-facts layer
> (T+1/T+2/T+3) that the human reviews and promotes. The continuity
> record is the superset: facts at all tiers, decisions, audit
> chain, and bundle metadata. When this document and the CLI say
> "brain," they mean the slice of the continuity record a human
> directly curates. See
> [`docs/research/TERMINOLOGY_AUDIT.md`](./research/TERMINOLOGY_AUDIT.md) §3.5.

This is the unique value of the platform. Without it, ManthanOS is
just another orchestrator.

The brain is a structured, queryable record store. It is **not** a
chat log. It is **not** a vector blob. It is **not** a "memory file."
It is a layered system designed so that trusted facts accumulate
deterministically.

### 7.1 Memory layers

**Episodic memory** — every session's events: workflows run, debates
held, agents invoked, files written, decisions made. Append-only.
Queryable by time, workflow, agent, file, decision.

**Semantic memory** — extracted facts: conventions ("this repo uses
pnpm workspaces"), invariants ("never modify db/migrations/*.sql in
place"), patterns ("error responses use `{code, message}`"). Curated
from episodic memory via a summarization workflow; never trusted
without provenance.

**Procedural memory** — workflows that have been observed to work
*in this repo*. Calibrated routing weights, custom workflow variants,
user-approved templates. The mechanism by which the runtime
specializes to a project.

**Decision log** — the architectural commitments. Every irreversible
choice is recorded with its rationale and the debate (if any) that
produced it. Append-only, signed by approver.

**Open issues** — unresolved tensions. Surfaced at the start of any
workflow that touches the affected area. Closed only explicitly.

### 7.2 What makes it compound

Three properties:

1. **Every workflow run writes to the brain.** No off-the-record runs.
2. **Every agent invocation reads from the brain.** Context packer
   pulls relevant slices into every prompt; no agent ever operates
   on a blank slate within a workspace.
3. **The brain itself is the unit of replay.** A workflow re-run
   against a snapshot of the brain produces a deterministic result
   (modulo non-determinism in the adapter, which is recorded).

Compounding emerges because the surface area exposed to each agent
grows monotonically (and is summarized when it would overflow). The
brain is what makes the runtime "an OS," not "a router."

### 7.3 What it deliberately is not

- Not a long-running chat history.
- Not a vector store with semantic-search-as-a-feature. (Vectors may
  be added later as an index; they are not the substrate.)
- Not a knowledge graph requiring a separate query language.
- Not a sync target for other machines (in v1; see §13).

### 7.4 Brain correction (preventing low-quality compounding)

A naively persistent brain is a liability: poor early decisions
become priors that bias every future run. The brain must have
**corrective mechanisms** as first-class as its accumulative ones.

**Five corrective primitives:**

1. **Reversible decisions.** A signed decision can be **superseded**
   by a later signed decision in the same area. The supersession
   relationship is explicit (`supersedes: <prior_decision_id>`).
   Context packer reads only the head of each supersession chain.
   History is preserved for audit.

2. **Contradiction tracking.** When two semantic facts in the same
   area contradict (e.g., `auth_strategy=jwt` and `auth_strategy=oauth`),
   both are kept but a `contradiction` row links them. Context
   packer surfaces the contradiction to the next workflow as an
   `open_issue`, forcing explicit resolution.

3. **Confidence decay.** Semantic facts have a `last_corroborated`
   timestamp. A fact that has not been re-derived from any workflow
   in 60 days has its confidence weight halved when packed into
   context. A fact not corroborated in 180 days is dropped from
   default context bundles (still queryable directly).

4. **Reversed-approval feedback.** When a human rejects an arbiter's
   recommended action at the safety gate, the rejection is written
   to the brain as a `corrective_signal`. The next debate in the
   same area receives the corrective signal in its context bundle —
   so the system does not repeatedly recommend the same rejected
   plan.

5. **Brain cleaning workflow.** A built-in `manthan brain clean`
   workflow walks the brain looking for: stale facts past decay
   threshold, orphan decisions (supersession chains broken),
   contradictions older than N days without resolution, and
   workflows whose outcomes were later reversed. Output: a curated
   list of corrective actions the user can accept or reject.

The cost of these mechanisms: extra schema (a `supersedes` column on
decisions, a `contradiction` table, a `last_corroborated` column on
facts, a `corrective_signals` table), plus the `brain clean`
workflow. None of these are speculative; they directly address the
"low-quality cumulative memory" failure mode.

**Without these primitives, the moat claim is unjustifiable.**
Accumulated records that cannot be corrected, decayed, or deduped
are just expensive noise accumulation.

### 7.5 Trust tiers (mechanical model)

Every fact, decision, and corrective signal in the brain lives at
exactly one of six tiers. Tier determines whether the item enters
default context bundles.

| Tier | Name | In default bundle? | Weight | Promote rule |
|---|---|---|---|---|
| T+3 | Signed | yes | 1.0 | user explicitly signs via `manthan decision sign` |
| T+2 | Trusted | yes | 0.9 | corroborated by ≥3 independent workflows |
| T+1 | Active | yes | 0.7 | corroborated by ≥2 independent workflows |
| T0 | Quarantine | no (opt-in only) | 0.3 | initial state for facts derived from untrusted sources (bootstrap, tool output, repo content) |
| T−1 | Contradicted | no | n/a | linked to another fact in the same area with conflicting content; surfaced as open_issue |
| T−2 | Reversed | no | n/a | derived from a workflow whose recommendation was rejected by user |

**Corroboration** means: a later workflow, run on a different
session/day, independently produces the same fact. Identical
workflow runs on the same brain do not corroborate (the brain
already had the fact). Corroboration is tracked via the
`corroborations` table linking `(fact_id, workflow_run_id)`.

**Promotion** is the act of moving a fact up a tier. It happens:

- **Automatically** when corroboration thresholds are met (T0 → T+1,
  T+1 → T+2). Each automatic promotion writes a `brain_correction`
  audit event.
- **Manually** via `manthan brain promote <fact_id>` for explicit
  user-driven promotion (T0 → T+1 or T+1 → T+2).
- **By signature** via `manthan decision sign` for T+2 → T+3.

**Demotion** is the act of moving down. It happens:

- **Automatically** on contradiction detection (any tier → T−1).
- **Automatically** on confidence decay (T+1 / T+2 → T0 after
  inactivity thresholds — see §7.6).
- **Automatically** on user rejection of a workflow that produced
  the fact (any tier → T−2).
- **Manually** via `manthan brain demote <fact_id> --reason=...`.

**Forbidden transitions** (lint + repository invariant):

- A T+3 (signed) fact cannot be demoted by automation. Only the
  signer (or another signed decision that explicitly supersedes
  it) can demote.
- A T−1 (contradicted) fact cannot be re-promoted without
  contradiction resolution.
- A T−2 (reversed) fact cannot be re-promoted without an explicit
  `corrective_signal_resolution` event.

### 7.6 Trigger workflows (what runs when)

Each correction primitive has an explicit trigger workflow.
Triggers fire from one of three sources: time, event, or
user-invoked.

**Workflow C1 — `brain.detect_contradictions`** (event-triggered)
- **Fires when:** a new fact is inserted into `semantic_facts`.
- **Logic:** for each existing fact in the same area, compare via
  a deterministic content-similarity check (token-set overlap +
  schema-aware comparison of structured fields). A potential
  contradiction with confidence ≥ 0.7 inserts a `contradictions`
  row and demotes both facts to T−1, writes an `open_issues` row.
- **Outputs:** zero or one `contradiction` per pair. Never an LLM
  call — purely deterministic.
- **Audit:** every detection writes a `brain.contradiction_detected`
  event.

**Workflow C2 — `brain.age_facts`** (time-triggered)
- **Fires when:** `manthan brain clean` is run, or weekly via
  user-set scheduler.
- **Logic:** for each fact with `last_corroborated` >
  decay_threshold_days (default 60), demote one tier toward T0.
  For each fact > archive_threshold_days (default 180), demote to
  archived (tracked separately; queryable but not in default
  bundles).
- **Outputs:** count of demoted facts; list of archived facts.
- **Audit:** `brain.fact_aged` event per fact.

**Workflow C3 — `brain.quarantine_promote`** (user-invoked)
- **Fires when:** user runs `manthan brain review-quarantine` or
  selects T0 facts in `manthan brain facts`.
- **Logic:** presents quarantined facts in batches; user marks
  each as promote / reject / leave. Promote → T+1 + audit event.
  Reject → T−2 + audit event. Leave → no change.
- **Outputs:** user decisions persisted as `brain_correction`
  events.
- **Never automatic.** This is the human-trust gate for
  bootstrap and untrusted-content-derived facts.

**Workflow C4 — `brain.handle_rejection`** (event-triggered)
- **Fires when:** the safety gate records a user rejection of an
  effectful action.
- **Logic:** finds the workflow run that produced the rejected
  action; for each `semantic_fact` or `decision` recorded by that
  run, insert a `corrective_signal` row. If the fact was at T0/T+1,
  demote to T−2. Subsequent debates in the same area receive the
  corrective signal in their context bundle.
- **Outputs:** `corrective_signal` rows; fact tier transitions.
- **Audit:** `brain.rejection_corrective` event.

**Workflow C5 — `brain.invalidate_after_refactor`** (user-invoked)
- **Fires when:** user runs `manthan brain invalidate --area=<x>
  --reason="mass refactor"` or `--after-commit=<sha>` or
  `--paths=<glob>`.
- **Logic:** demotes all facts in the area / matching paths /
  predating the commit to T0 (quarantine). Logs the action.
  Subsequent C3 invocations let the user re-promote what survives.
- **Outputs:** count of demoted facts.
- **Audit:** `brain.invalidated` event with reason and scope.
- **Necessary** because the 60/180-day decay cannot detect that a
  rebase or rename has invalidated a fact that was corroborated
  yesterday.

**Workflow C6 — `brain.replay_divergence_check`** (event-triggered)
- **Fires when:** a `--re-invoke` replay produces an
  arbiter outcome that disagrees with the original.
- **Logic:** inserts a `replay_divergence` row linking the original
  and replay run IDs. Does not auto-demote the original
  decision — divergence is informational, not corrective. Surfaces
  in `manthan brain stats`.
- **Outputs:** `replay_divergence` row.
- **Audit:** `brain.replay_divergence` event.

**Workflow C7 — `brain.confidence_audit`** (time-triggered)
- **Fires when:** `manthan brain clean` is run, or monthly.
- **Logic:** for each T+1/T+2 fact, recomputes corroboration
  count from `corroborations`. If actual count is lower than
  declared tier requires (e.g., due to deleted/quarantined
  workflows), demotes.
- **Outputs:** count of corrected tiers.
- **Audit:** `brain.confidence_corrected` event per change.

### 7.7 Quarantine — the trust boundary

Quarantine (T0) is the most important tier. It is where every fact
from an untrusted source enters the brain.

**Sources that produce T0 facts:**

1. **Bootstrap (BOOTSTRAP_PROTOCOL §6):** charter facts derived
   from `package.json`, `pyproject.toml`, etc. **Untrusted because**
   any committer can plant content in these files. Promoted to T+1
   only after a workflow run corroborates them.
2. **Tool output (SAFETY_MODEL §11b):** facts derived from stdout
   /stderr of any tool execution. Always T0; promotion requires
   explicit user approval (C3).
3. **Repo content (READMEs, source comments, commit messages):**
   facts derived from these never even reach the brain in MVP.
   They live only in workflow-scoped `untrusted_observations`
   rows, not in `semantic_facts`. Deferred consideration after
   Phase 4 isolation.
4. **External web content (Phase 4+):** any future
   web-browsing-enabled adapter's observations land at T0.

**T0 facts in context bundles:** by default, **excluded**. The
user can opt in per-workflow with `--include-quarantine` or via
config `routing.include_quarantine: true`. This is the explicit
trust gate.

**Anti-poisoning rules** (lint + runtime):

- A workflow's `brain.write` step can only insert facts at T0.
  Promotion to higher tiers is **never** part of a workflow's
  step execution — only via C2/C3/C4/etc.
- An adapter response that claims to "establish a fact"
  via tool calls is rejected; the orchestrator extracts facts only
  from structured arbiter outputs, never from free-form text.
- An arbiter consensus does **not** auto-promote a fact past T+1.
  T+2 requires multiple independent corroborations across
  *different* arbiter runs.

### 7.8 Audit trail for corrections

Every tier transition writes a `brain_correction` audit event:

```json
{
  "kind": "brain.correction",
  "fact_id": "...",
  "from_tier": "T+1",
  "to_tier": "T+2",
  "reason": "corroboration_threshold",
  "trigger": "workflow:plan@01HF...",
  "actor": "system|user:<id>",
  "details": { "corroboration_count_before": 2, "after": 3 }
}
```

The `audit_corruption.log` invariant (CRASH_CONSISTENCY.md §5.2)
applies to brain_correction events too: they are first-class audit
rows.

### 7.9 Rollback (limited)

Within 7 days of a `brain.correction` event, the user may run:

```
manthan brain undo-correction <correction_id>
```

This:
- Reverts the tier transition (e.g., demotion T+2 → T+1 becomes T+1 → T+2).
- Records a `brain.correction.undone` event referencing the original.
- Does **not** delete the original event; the chain is preserved.

After 7 days, the correction is "settled" and cannot be undone
via the simple command. The user can still manually demote/promote,
but it leaves a different audit trail.

Rollback is intentionally limited to recent events to prevent
"history rewriting" of the brain — long-settled corrections are
treated as decisions the user has lived with and built on.

### 7.10 Mechanical viability check (what fails this design)

A poisoned fact passes the brain only if:

1. It is corroborated by ≥2 independent workflow runs (T0 → T+1).
2. *And* either it survives confidence decay (60-day silence
   demotes), is signed by the user (T+3), or no contradiction is
   detected.

To get past (1), an attacker would need to plant content that two
distinct workflows independently produce the same fact from — non-
trivial for a structured arbiter output but plausible for
semantic-similarity matching. The mitigation: corroboration
requires arbiter-extracted structured outputs that match by
canonical content hash, not by text similarity.

The model is not perfect. It is mechanically defined and testable.
The eval harness (EVAL_SPEC §8 adversarial eval) includes
"hallucination injection" tests that exercise these paths.

---

## 8. Data flow (one workflow run)

Concrete trace of `manthan plan "add OAuth"`:

```
1. CLI parses args, locates workspace, opens brain.
2. Workflow runner loads "plan" workflow definition.
3. Step 1 (load context):
     - Packer reads charter, brief, git diff, decision log digest,
       semantic memory recall on "auth".
     - Output: a context bundle keyed by (task_id, model_id, repo_hash).
4. Step 2 (select agent):
     - Routing engine reads workflow capability requirements:
       reasoningStrength >= 4, contextTokens >= 100k.
     - Picks adapter (e.g., claude-opus). Logs decision to brain.
5. Step 3 (invoke):
     - Safety gate classifies action as 'network-read' → auto-approved.
     - Adapter invoked. Request + response written to audit log.
6. Step 4 (parse + persist):
     - Structured plan extracted via Zod schema.
     - Saved to .manthan/tasks/<id>.json, indexed in brain.
7. Step 5 (report):
     - CLI renders plan, summarizes cost/tokens, returns.
```

Every numbered step is independently testable, replayable, and
recorded. If the user re-runs the workflow with `--replay <id>`, the
runtime reconstructs the exact same context bundle and shows what
*would* be sent — without calling the provider.

---

## 9. Storage architecture

**MVP: SQLite via better-sqlite3.** Synchronous, embedded, zero-ops.
Lives at `.manthan/memory/manthan.db`. Hand-rolled migrations
(no Prisma — keep dependency surface small).

`better-sqlite3` is a native module. PLATFORM_LAYER.md §14 requires
prebuilt binaries for all three OSes — `better-sqlite3` ships these
via `prebuild-install`. The install script verifies the prebuild is
present and fails fast (no source build attempted) if it isn't, with
a precise error pointing to alternative installation paths.

Indicative schema (real schema lives in migrations):

```
workspaces       (id, root_path, git_remote_hash, created_at)
agents           (id, provider, metadata_json)
workflows        (id, type, started_at, finished_at, status,
                  total_usd, total_input_tokens, total_output_tokens)
workflow_steps   (id, workflow_id, kind, payload_json, parent_id,
                  step_order)
decisions        (id, workflow_id, area, summary, rationale,
                  approver, signed_at, supersedes_id)
debates          (id, workflow_id, protocol, transcript_path,
                  outcome, confidence)
debate_messages  (id, debate_id, round, role, agent_id, content_hash)
context_snapshots (id, workflow_id, bundle_hash, layers_json)
audit_events     (id, ts, seq, actor, action, kind, payload_hash,
                  decision, prev_hash, self_hash)
open_issues      (id, area, summary, opened_at, closed_at,
                  severity, contradiction_id)
semantic_facts   (id, area, statement, provenance_workflow_id,
                  status, last_corroborated, confidence)
corrective_signals (id, area, rejected_workflow_id, signal_text, ts)
contradictions   (id, area, fact_a_id, fact_b_id, detected_ts,
                  resolved_ts)
cost_anomalies   (id, workflow_id, expected_usd, actual_usd,
                  z_score, detected_ts)
```

**Index strategy** (required for Phase 1 query performance —
without these, the brain devolves into table scans):

```
-- Time-ordered scans (audit tail, recent workflows)
audit_events       (workspace_id, ts DESC)
workflows          (workspace_id, started_at DESC)

-- Workflow lookups
workflow_steps     (workflow_id, step_order)
debate_messages    (debate_id, round)

-- Brain queries (the hot path for context packer)
decisions          (workspace_id, area, signed_at DESC)
decisions          (supersedes_id)  -- chain head lookups
semantic_facts     (workspace_id, area, last_corroborated DESC)
                   WHERE status = 'active'
open_issues        (workspace_id, area, closed_at IS NULL)
corrective_signals (workspace_id, area, ts DESC)

-- Cost / observability queries
workflows          (workspace_id, type, started_at DESC)  -- for `manthan costs`
audit_events       (workspace_id, kind, ts DESC)
cost_anomalies     (workspace_id, detected_ts DESC)

-- JSON property indexes (sqlite expression indexes)
workflow_steps     (json_extract(payload_json, '$.adapter_id'))
audit_events       (json_extract(payload_json, '$.action_kind'))
```

The expression indexes on JSON fields keep `metadata_json`-style
columns viable for the Phase 1 query patterns without forcing a
schema rewrite. They are added in migrations alongside the columns
they index.

**Repository pattern.** All access via `MemoryRepo` interface. SQLite
implementation in MVP; Postgres implementation later for team mode.
No raw SQL outside the repository module. The repository exposes a
small, query-specific API (e.g., `getRecentDecisions(area, limit)`),
not a generic query builder — this keeps query patterns inspectable
and indexable.

**Why not Postgres on day one:** SQLite handles single-user
local-first perfectly. Adding Postgres adds an install step. It is
the kind of complexity that should arrive when a user pulls for it.

**Future-proofing:**

- Schema reserves an `embeddings` column on memory tables. Unused in
  MVP. Becomes useful when vector index is added.
- Schema includes `workspace_id` foreign keys on everything, even
  though MVP supports one workspace. Multi-workspace becomes a
  configuration change, not a migration.

---

## 10. Audit & replay

**Audit log** is the runtime's truth. If the database is the brain,
the audit log is the spine.

Format: append-only JSONL at `.manthan/audit.log`. Each event:

```json
{
  "ts": "2026-05-15T14:23:01.124Z",
  "seq": 12491,
  "actor": "workflow:plan#9f3a",
  "action": "agent.invoke",
  "payload_hash": "sha256:...",
  "decision": "auto-approve",
  "prev_hash": "sha256:..."
}
```

Each event references the hash of the previous one (Merkle chain).
Tampering is detectable.

**Replay** is a primary feature, not a debugging afterthought. Three
explicit modes (full spec in WORKFLOWS_SPEC.md §10):

- **`--replay`** (no-network, default): reconstructs every step from
  recorded inputs and recorded outputs. No provider calls. No
  filesystem writes. Useful for debugging and code review.
- **`--re-invoke`** (live replay, brain pinned): rebuilds the context
  from the recorded brain snapshot and re-calls adapters. Useful
  for comparing model behavior over time.
- **`--partial`** (resume-style): replays up to a chosen step, then
  continues live. Useful for bug-bisecting.

**Honest determinism scope.** Replay guarantees:

- The **set of steps executed and their order** is deterministic
  given the same workflow definition, parameters, and recorded
  decisions.
- The **request payloads** sent to adapters are byte-identical for
  the same `(workflow, parameters, brain snapshot)` triple — *if*
  the canonical-encoding rules in DEBATE_PROTOCOL.md §7 are
  followed (sorted JSON keys, NFC unicode, no NaN/Inf, normalized
  whitespace).
- The **brain queries** return identical results given the same
  brain state.
- The **audit log shape** is identical.

Replay does **not** guarantee:

- **Provider outputs.** Models are stochastic; even temperature=0 is
  not strict reproducibility across model deployments.
- **Wall-clock time** or **token counts** for re-invocation runs.
- **Bit-for-bit identical brain state after live replay.**

These limits are stated in user-facing error messages when replay
fails an integrity check.

### 10.1 Deterministic ordering rules (replay foundation)

Replay byte-identity requires that the *inputs* to every step be
ordered deterministically — JSON canonicalization (DEBATE §7.1) is
necessary but not sufficient. The following rules apply at every
ordering boundary:

**File system enumeration:**
- All `readdir` results are sorted by codepoint-compared filename,
  case-sensitive. Case-insensitive filesystems do not affect this
  ordering (the on-disk byte sequence is what's sorted).
- All recursive walks (context packer, init indexer, blob GC) use
  a deterministic depth-first or breadth-first traversal with
  sorted siblings; the choice is per-caller and documented.
- All `.gitignore` traversal uses the deterministic
  `ignore.add(gitignoreContent).filter(sortedPaths)` pattern.

**SQL query ordering:**
- Every query whose result reaches a hash, a context bundle, or a
  workflow input has an explicit `ORDER BY` with a unique tiebreaker.
  Default tiebreaker: `(<primary domain column>, id ASC)`.
- Queries without ORDER BY are linted against. The repository
  pattern allows only named query functions; ad-hoc SQL is forbidden
  outside `packages/memory`.

**Transcript event ordering:**
- Debate round events are persisted in **declared participant
  order** (per the protocol spec), not `Promise.all` completion
  order. Each event records its `participant_index` for verification.
- The persister buffers round outputs until all participants
  complete (or fail / timeout), then writes them in canonical order.
- Failed participants get a placeholder event with `status: failed`
  in their declared slot.

**Promise.all stabilization:**
- Direct use of `Promise.all` in persistence paths is forbidden
  (lint-enforced). Workflows use `runAndOrderParticipants(participants)`
  which returns results indexed by input position, not completion
  order.

**Canonical timestamps:**
- All timestamps stored in audit events and brain rows use RFC 3339
  UTC with **millisecond precision**: `2026-05-15T14:23:01.124Z`.
- Wall-clock is observed once per audited operation at P1
  (CRASH_CONSISTENCY §2) and reused for all sub-events of that
  operation. This avoids per-row clock jitter.
- Display timestamps may be local time; storage is always UTC.

**Numeric stability:**
- Floating-point values in persisted payloads are forbidden (a
  product-rule, not just a stylistic one). All numeric fields use
  integers or decimal strings with explicit precision.
- Costs are stored as integer micro-USD (`int_usd_micro`), not
  floats. `$0.04` is stored as `40000`.
- Token counts are integers as reported by the provider.

**Adapter response normalization:**
- See ADAPTER_SPEC §3.1 — the `AdapterPayloadHasher` produces a
  canonical projection of the provider response for hashing,
  independent of SDK version.

**Audit event sequence ordering:**
- `audit_events.seq` is the authoritative order. JSONL files are
  rebuilt from SQLite (CRASH_CONSISTENCY §10).
- Within a single transaction that inserts multiple audit_events,
  seq is allocated atomically and monotonically.

A workflow whose output depends on the order of an unordered
collection (e.g., environment variables, `Object.keys`) must
canonicalize that collection explicitly. The deterministic
ordering rules are tested by a CI job that runs each canonical
workflow against a fixed brain snapshot 100 times and verifies
identical request payload hashes across runs.

---

## 11. Cost philosophy (architectural, not feature)

Cost-awareness is **woven into the runtime architecture**, not added
as a Phase 4 dashboard. Three principles:

1. **Estimate before execute.** Every workflow step that calls an
   adapter estimates token usage from the packed context before the
   call. The estimate becomes the budget check: if estimated cost
   exceeds remaining workflow budget, the step does not run.
2. **Hard budget caps.** Every workflow has a budget in USD and
   tokens. Defaults are conservative (e.g., `plan` $0.25, `debate`
   $0.50, bootstrap window $1.00 cumulative). Budgets cannot be
   exceeded silently; the step fails or invokes a declared fallback.
3. **Cheap-model-first when value is uncertain.** The routing engine
   defaults to the cheapest adapter that meets capability
   requirements. Escalation to more expensive adapters requires
   either an explicit per-workflow override, a calibration result
   showing the cheap adapter fails the task class, or an arbiter's
   recommendation to escalate.

**Architectural surfaces:**

- `workflows` table tracks `total_usd`, `total_input_tokens`,
  `total_output_tokens` per run (see §9).
- `cost_anomalies` table records spikes for `manthan costs
  --anomalies`.
- Every adapter response carries `usage.usd` (SDK helper computes
  from declared per-model rates).
- `manthan costs` and `manthan trace` (see OBSERVABILITY.md) are
  read-only views over this data — built into MVP, not deferred.

**Routing policy is configurable:**

```yaml
# .manthan/config.yaml
routing:
  policy: cost-first  # 'cost-first' | 'quality-first' | 'balanced'
  budgets:
    plan: { maxUsd: 0.25 }
    debate: { maxUsd: 0.50 }
    review: { maxUsd: 0.10 }
    forensic-debug: { maxUsd: 1.00 }
  escalation_thresholds:
    # When the cheap adapter's confidence drops below this, escalate.
    min_confidence: 0.6
    # When estimated tokens exceed cheap-model context window, escalate.
    context_overflow_pct: 0.85
```

**Anomaly detection:**

- Per-workflow cost > 3σ above the 30-day rolling mean for that
  workflow type → `cost_anomaly` row + warning surfaced in next
  command's preamble.
- Token spike (one call > 5× the workflow's median call) →
  flagged as `token_spike` in the audit event.
- A workflow that triggers > 3 cost anomalies in a session triggers
  a soft pause: the next workflow asks for explicit confirmation
  before running.

These are not Phase 4 features. They are **Phase 1 acceptance criteria**.
The runtime's value proposition is undermined if a user wakes up to a
surprise $50 bill from a runaway debate.

---

## 12. Concurrency model

**Adapter calls:** async, cancellable via `AbortSignal`. Per-provider
concurrency limit (configurable, default 4). Backoff on rate limits
delegated to the adapter; the orchestrator only observes failure.

**Debates:** rounds are sequential (round N depends on round N-1's
outputs). Within a round, agents fan out in parallel.

**File I/O:** any write goes through the safety gate, which holds a
per-workspace lock. No two workflows can write concurrently within
one workspace. Cross-workspace concurrency is fine.

**Brain writes:** SQLite handles single-writer well. Use
`PRAGMA journal_mode=WAL` for concurrent readers + single writer.

---

## 13. Extension boundaries

Three places where external code plugs in:

**Adapters** — see ADAPTER_SPEC.md. Most common extension point.
Plugins discovered via npm package naming + config.

**Workflows** — workflows are declarative state-machine definitions.
**Built-in workflows are TypeScript** in `packages/core/src/workflows/`
(authored by ManthanOS itself, compiled at build time). **User-
authored workflows are YAML only**, loaded from
`.manthan/workflows/<name>.workflow.yaml` at startup. The runtime
does not load `.ts` files from `.manthan/` — no dynamic TS
compilation, no ESM/CJS loader, no `vm` evaluation. This is a hard
rule for MVP; see WORKFLOWS_SPEC.md §15. TS-authored user workflows
are deferred to Phase 5+ with a proper offline compiler.

**Memory views** — read-only queries over the brain, exposed as
commands. Useful for project-specific dashboards and reports
(e.g., "list debates in last 7 days with unresolved disagreements").

Three boundaries that **stay closed**:

- Workflows cannot bypass the safety gate.
- Workflows cannot write directly to the audit log; only the gate can.
- Adapters cannot read the brain. They receive only a prepared
  context bundle. (This prevents an adapter from exfiltrating
  arbitrary project state.)

---

## 14. Long-term scalability

Built in from the start, *not built yet:*

- **Postgres swap.** Repository interface is provider-agnostic. A
  Postgres adapter for the memory layer is a single package, not a
  rewrite.
- **Plugin isolation.** Adapters are pure async functions of input.
  Moving them into a worker thread with a permission manifest is a
  loader change, not a contract change.
- **Distributed debate.** The debate protocol is message-passing.
  Round outputs are content-addressed. Moving an agent to a remote
  worker is an adapter-implementation detail.
- **Team-shared brain.** Encrypted blob sync of `.manthan/` to a
  user-chosen backend (S3, ManthanOS Cloud). Optional, opt-in,
  end-to-end encrypted; never default.
- **Vector index.** Added as an index over `semantic_facts` and
  `debate_messages`. Existing queries continue to work.
- **Eval harness.** Calibrates routing weights from observed quality
  signals. Shipped in Phase 2 as a workflow.

What we explicitly will not scale to (without rearchitecting):
multi-tenant SaaS in the OSS core. That is by design — the open-core
boundary lives there. (See LICENSING_STRATEGY.md.)

---

## 15. Cross-platform commitment

ManthanOS is designed as a **true cross-platform engineering runtime
from day one**. Windows, macOS, and Linux are first-class targets.
WSL is an acceptable fallback for users who prefer it, but it is never
the *primary* Windows strategy.

This commitment shapes the architecture in concrete ways:

1. **One runtime, no platform forks.** No `if (process.platform === 'win32')`
   sprinkled through workflows. Such branches, when unavoidable, live
   only inside the Platform Abstraction Layer.
2. **No bash assumptions.** Shell-mediated workflows go through the
   PAL's `ShellAdapter`, which chooses an appropriate shell per OS
   (pwsh / cmd / bash / zsh / sh). Most workflows should not invoke
   a shell at all — they spawn processes directly with argv arrays.
3. **No POSIX-only paths.** All paths are constructed via `path.join`
   / `path.posix.join` as appropriate. Stored paths use forward
   slashes; presented paths use OS-native separators. Conversion at
   the boundary is PAL's job.
4. **User-data location follows OS conventions.** Global ManthanOS
   state lives under `env-paths`-derived locations (XDG on Linux,
   `Library/Application Support` on macOS, `%APPDATA%` on Windows).
   Per-project state stays in `.manthan/` inside the workspace.
5. **No symlink-heavy designs.** Windows requires admin or developer
   mode for symlinks; the runtime never depends on them. Hard links
   and junctions are likewise forbidden in core flows.
6. **Terminal-aware rendering.** TTY detection via `process.stdout.isTTY`;
   ANSI rendering only when supported; Windows console UTF-8 mode
   set explicitly on startup.
7. **CI runs on all three OSes.** Every PR is tested on
   `ubuntu-latest`, `macos-latest`, `windows-latest`. A Windows
   regression is a release blocker, not a known-issue.
8. **Docker is optional, never required.** Some workflows (notably
   future sandboxing) may use Docker as an *enhanced* mode; the
   default path must work without it.

The cultural rule: when a contributor proposes a feature, the design
review explicitly asks "how does this work on Windows?" before any
code is reviewed. The PAL is the contract that makes that question
answerable.

See PLATFORM_LAYER.md for the full PAL specification.

---

## 16. Non-goals (MVP)

These are explicitly excluded from v1. Saying so up front prevents
scope creep.

- A web UI of any kind.
- A hosted service.
- IDE plugins (an LSP / editor surface is a Phase 4+ topic).
- Vector / embedding-based memory.
- Multi-repo workspaces.
- Streaming or partial output rendering.
- Fine-tuning, distillation, or model training pipelines.
- A query language for the brain (use Repository APIs).
- A "marketplace" for plugins.
- Auto-deployment, auto-pushing to remotes, auto-merging.
- Slack / GitHub / Linear integrations as core features.

If a feature is not in MVP_ROADMAP, it is a non-goal.

---

## 17. Design rules (always)

These are the rules the architecture is held to. They override
local convenience.

1. **Adapters are plugins.** Even first-party. No special-case code paths.
2. **The brain is the unit of replay.** Anything that breaks replay
   is a bug.
3. **The safety gate is non-bypassable.** No `--force-everything` flag.
4. **Local-first by default.** No network call is implicit. Every
   network call is an action in the audit log.
5. **Workflows are deterministic given (brain, definition, approvals).**
6. **No agent operates on a blank slate within a workspace.**
7. **Every effectful action is recorded with payload hash and signature.**
8. **Cumulative trusted facts over clever prompts.** When in doubt,
   curate the brain rather than over-engineer the prompts.
9. **OS-touching code lives in the PAL.** Anything that branches on
   `process.platform`, spawns processes, watches files, or computes
   paths goes through the Platform Abstraction Layer. Callers do not
   import `child_process`, `fs.watch`, or `os` directly.
10. **Windows is not "best-effort."** A bug that affects only Windows
    is a normal bug. A feature that works only on POSIX systems is
    not a feature.
11. **Cost is a runtime concern.** Every adapter call estimates its
    cost before execution, every workflow has a budget, every spike
    is anomaly-detected. Cost dashboards are observability of an
    existing primitive, not a Phase 4 feature.
12. **Plugin trust is honest.** MVP adapter plugins run in-process
    with full Node privileges. Capability manifests are
    informational, not enforced. Documentation, prompts, and trust
    UI never imply otherwise. Process isolation arrives in Phase 4.
13. **Brain correction is first-class.** Decisions can be
    superseded, facts decay, contradictions are tracked, rejected
    plans become corrective signals. Accumulated records without
    correction are noise accumulation, not a moat.
14. **Replay determinism is bounded honestly.** The runtime
    guarantees step order, request payload identity, and brain
    query consistency. It does not guarantee provider output
    reproduction. User-facing messages always state the boundary.

Anything that violates these rules requires an architecture-decision
record (ADR), not a code review.
