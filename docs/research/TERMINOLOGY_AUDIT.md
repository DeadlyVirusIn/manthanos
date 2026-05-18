# TERMINOLOGY_AUDIT

> **Status:** Vocabulary-governance memo. Not a rename sweep.
> **Date:** 2026-05-17.
> **Purpose:** Decide which conceptual terms are canonical, which
> are acceptable shorthand, and which should be avoided in
> public-facing docs — so the project's vocabulary stops drifting
> and a future reader has one stable set of words for each concept.
> **Constraints:** No rename sweep. No code changes. No CLI surface
> changes. No new architecture. This memo decides governance only.

---

## 1. Method

For each term, this memo records:

- **Current usage count** (case-insensitive, across `docs/`,
  `README.md`, `apps/`, `packages/`; excludes `node_modules`, `dist`,
  internal review/hardening artifacts).
- **Where it appears** (CLI command names, implementation,
  user-facing prose, internal memos).
- **Intended meaning** in the project's vocabulary.
- **Risk of misunderstanding** (anthropomorphic, overclaim,
  conceptual collision with similar terms).
- **Recommendation** — one of:
  - **CANONICAL** — preferred everywhere.
  - **CANONICAL (implementation-only)** — preferred in code / CLI / technical docs; gloss on first public use.
  - **ACCEPTABLE SHORTHAND** — OK as quick reference; canonical term preferred in prose.
  - **INTERNAL-ONLY** — fine in internal memos; avoid in user-facing surfaces.
  - **AVOID PUBLICLY** — anthropomorphic or overclaim risk; do not reintroduce.

The memo's job is **conceptual coherence**, not aesthetics. A term
can be ugly and still canonical if it's mechanically precise.

---

## 2. The canonical vocabulary (summary)

If you need one table to remember, it is this:

| Concept | Canonical term (public prose) | CLI / implementation shorthand |
|---|---|---|
| The unit of scope | **workspace** | `workspace`, `.manthan/` |
| What a workspace belongs to | **project** | — |
| The recorded continuity for a project | **continuity record** | **brain** |
| The recorded fact units inside the record | **facts** | `semantic_facts` |
| Facts at T+1/T+2/T+3 | **trusted facts** / **trusted layer** | same |
| Facts at T0 | **quarantine** / **quarantined facts** | `tier='T0'` |
| The shape of the prompt sent to an adapter | **context bundle** | same |
| The hash-chained log of effectful actions | **audit chain** / **audit log** | `audit_events` |
| The pre-bundle-pack filter on trusted facts | **adaptive shaping** | `shape-trusted-facts.ts` |
| The user-invoked read-back of a past run | **recorded-run inspection** | `manthan replay` |
| The next AI tool the user opens | **AI tool** / **model** | adapter |
| The provider integration | **adapter** | `@manthanos/adapter-*` |

Terms that fall **outside** the canonical set:

- **memory** — internal-only (locked as package name `@manthanos/memory`).
- **cognition** — avoid publicly. Removed in commit `edb747b`.
- **intelligence**, **knows**, **understands**, **learns** (as in self-learning) — avoid publicly per `docs/research/EARLY_FEEDBACK_SYNTHESIS.md` §4.4.
- **agent** — use sparingly; prefer "AI tool" or "model" in prose; `AgentAdapter` is locked in the adapter package internals.

---

## 3. Per-term analysis

### 3.1 `workspace` (canonical, 283 uses)

- **Where:** Everywhere — CLI command outputs, doc prose, internal
  memos, SQLite schema (`workspaces` table).
- **Intended meaning:** A single git repository under ManthanOS
  management, identified by canonical absolute path. The unit of
  isolation; `.manthan/` lives at its root.
- **Risk:** Low. The term is mechanically defined by the
  `workspaces` table row and the `.manthan/` directory.
- **Recommendation: CANONICAL.** Use everywhere without further
  qualification.

### 3.2 `project` (canonical, 313 uses)

- **Where:** Public framing ("the project owns its continuity
  record"), README, POSITIONING.
- **Intended meaning:** The user-facing concept that maps 1:1 to a
  workspace. Distinct from "workspace" only by audience — "project"
  is what users call their codebase; "workspace" is the substrate's
  internal name for the same thing.
- **Risk:** Low. The pair is well-defined: project = user-facing
  noun; workspace = substrate noun. They are not synonyms in
  documentation but they map 1:1 by construction.
- **Recommendation: CANONICAL** in public framing. Internal docs
  may still use "workspace."

### 3.3 `continuity` (canonical, 214 uses)

- **Where:** Positioning anchor — README header, lockup tagline
  ("CONTINUITY INFRASTRUCTURE for MULTI-MODEL AI ENGINEERING"),
  POSITIONING.md, EARLY_FEEDBACK_SYNTHESIS, this memo.
- **Intended meaning:** The substrate's mechanical property of
  preserving project commitments across sessions / tools / models.
  *Not* model-side reasoning continuity.
- **Risk:** Low when paired with a noun (continuity *record*,
  continuity *infrastructure*, continuity *across tools*). Slight
  risk when used standalone — a careless reader could hear
  "continuity" as "the AI maintains a consistent self." Always pair
  it with what kind of continuity.
- **Recommendation: CANONICAL.** This is the project's anchor.

### 3.4 `continuity record` (NEW canonical, 2 uses so far)

- **Where:** Introduced in commit `edb747b` (the language sweep)
  as the corrected substrate vocabulary. POSITIONING.md §5,
  ARCHITECTURE.md §7 in updated form.
- **Intended meaning:** The combined audit chain + facts +
  decisions stored in a workspace. The disciplined, mechanical
  alternative to "memory" / "cognition."
- **Risk:** Low (slightly awkward English, but precise). Two-word
  noun phrase is easy to scan.
- **Recommendation: CANONICAL** for the substrate's content in
  public prose.

### 3.5 `brain` (727 uses — large, locked in CLI surface)

This is the term the request specifically asked about. The
analysis below answers each of the questions:

- **Where it appears:**
  - **CLI surface:** `manthan brain *` is a top-level command
    with 19 subcommands (`brain review`, `brain stats`, `brain
    facts`, `brain promote`, `brain demote`, `brain trust-log`,
    `brain duplicates`, `brain age-facts`, `brain queue-health`,
    `brain undo-correction`, `brain merge`, `brain
    observability`, `brain sim`, `brain long-horizon`, etc.).
    The CLI surface is **locked** — renaming would be a breaking
    change.
  - **Implementation:** Docstrings and comments refer to "the
    brain layer," "brain snapshot," "Project Brain" (capitalized
    in some older docs).
  - **Public prose:** ARCHITECTURE.md §7 ("Project Brain"),
    DEBATE_PROTOCOL.md ("the project brain"),
    BOOTSTRAP_PROTOCOL.md ("Brain has charter + project facts").

- **Intended meaning:** The combined `semantic_facts` table +
  trust ladder + adaptive-shaping output. Roughly equivalent to
  "the trusted-facts portion of the continuity record."

- **Risk of misunderstanding:**
  - Anthropomorphic. The word literally invokes biological
    cognition. A new reader who arrives at "the project brain"
    without context can reasonably infer ManthanOS is claiming
    something about cognition that the substrate does not claim.
  - Conceptual collision with the just-introduced "continuity
    record." A reader who sees both terms may ask "are these
    the same thing? Different things?" without an answer
    visible in the docs.

#### Specific questions, answered

**Q: Is "brain" acceptable CLI shorthand?**

Yes. The CLI surface is locked for two practical reasons: 19
subcommands, and the term is so embedded in the project's history
that the cost of renaming exceeds the cost of keeping it. The
term is well-bounded *as a CLI command surface* — when a user
types `manthan brain review`, the mechanical action is unambiguous
(triage T0 facts).

**Q: Does it accidentally reintroduce anthropomorphic framing?**

In CLI command names, no — `manthan brain` is read by users as
"the brain *command surface*," analogous to `git branch` or
`git remote` being read as command surfaces rather than as
claims about plants or telecoms. The framing risk arises in
**prose**, where "the project brain" reads as a noun about the
substrate rather than as a command surface.

**Q: Should "brain" remain implementation terminology while
public docs prefer "continuity record"?**

Yes. This is the recommended split:

| Surface | Preferred term |
|---|---|
| CLI commands | `manthan brain *` — locked, no rename |
| Implementation code, comments, internal type names | "brain," "brain layer," "BrainTrustError" — locked |
| ARCHITECTURE.md, internal technical docs | "brain layer," "brain snapshot" — acceptable, gloss on first use |
| README, POSITIONING.md, BRANDING.md | "continuity record" or "trusted facts" preferred; "brain" only as quick reference with prior gloss |
| Marketing / external write-ups (future) | "continuity record"; "brain" only when explaining the CLI surface |

**Q: Is there now a mismatch between CLI vocabulary and
positioning vocabulary?**

Yes — a mild, manageable one. The CLI says "brain"; positioning
says "continuity record." The two refer to overlapping but not
identical things:

- "Brain" = the trusted-facts + dedup-cluster + queue surface
  that the `manthan brain *` commands operate on.
- "Continuity record" = the full set of facts + audit chain +
  decisions + bundle metadata that the workspace persists.

The continuity record is the *superset*; the brain is the part
of it the human reviews and curates. This relationship should
be stated once, in ARCHITECTURE.md, so a careful reader can map
the two.

**Recommendation for "brain": ACCEPTABLE SHORTHAND (CLI surface
+ implementation).** Locked in the CLI. In prose, prefer
"continuity record" or "trusted facts"; if "brain" is used in
prose, gloss it on first use ("the brain — the trusted-facts
portion of the continuity record").

### 3.6 `memory` (internal-only, 180 uses)

- **Where:**
  - **Locked locations:** Package name `@manthanos/memory`, table
    name `episodic_memory` (in older schema; not actively used),
    docstrings like "the memory layer."
  - **Public prose:** Older docs (CONTINUITY_THEORY,
    ARCHITECTURE) use "memory layers," "memory persistence."
- **Intended meaning:** The persistence layer for facts +
  decisions + audit events.
- **Risk:** Anthropomorphic. "Memory" implies the system
  *remembers* in a model-cognitive sense. ManthanOS does not
  claim this.
- **Recommendation: INTERNAL-ONLY** for substrate vocabulary.
  The package name `@manthanos/memory` is locked. In new public
  prose, prefer "continuity record" or "record" or "audit + facts
  store."

### 3.7 `facts` (canonical, 532 uses)

- **Where:** Universal. CLI output, SQLite table name
  (`semantic_facts`), every doc.
- **Intended meaning:** The atomic units of the trust ladder. A
  fact is a single statement carrying tier, confidence, area,
  provenance.
- **Risk:** Low. "Fact" is mechanically defined by the
  `semantic_facts` row schema.
- **Recommendation: CANONICAL.** Use freely.

### 3.8 `cognition` (avoid publicly, 14 uses)

- **Where:** Most occurrences removed in commit `edb747b`.
  Remaining 14 are in: `docs/MVP_ROADMAP.md` (phase name
  "cognition loop" — historical), `docs/EVAL_SPEC.md`,
  `docs/FUTURE_COMMAND_CENTER.md`, and review-artifact files.
- **Intended meaning (when previously used):** The substrate's
  accumulation of facts.
- **Risk:** High. "Cognition" anthropomorphizes; smuggles in a
  claim about reasoning the substrate does not make.
- **Recommendation: AVOID PUBLICLY.** Do not reintroduce. The
  14 remaining uses are in historical / speculative / internal
  docs where rewording would break historical accuracy. Do not
  add new uses.

### 3.9 `record` (canonical, 124 uses)

- **Where:** Increasingly preferred in updated docs.
  "Continuity record," "audit record," "recorded run," "recorded
  bundle."
- **Intended meaning:** Mechanically: a row in a table or a line
  in a log. Conceptually: a stored artifact you can read back.
- **Risk:** Low. "Record" is the disciplined mechanical word.
- **Recommendation: CANONICAL.** Use as the substrate vocabulary
  for "what the system stores."

### 3.10 `context` (canonical for technical use, 201 uses)

- **Where:** "Context bundle," "context window," "context
  packer," `@manthanos/context` package.
- **Intended meaning:** The text payload sent to an adapter.
  Specifically: the system prompt + user prompt assembled by
  `packages/context/src/packer.ts`.
- **Risk:** Slightly overloaded. "Context" in LLM literature is
  the input the model sees; "context" in product literature is
  whatever surrounding info the user provides. ManthanOS uses
  the LLM-literature sense.
- **Recommendation: CANONICAL** for the technical sense.
  Always pair with a qualifier ("context bundle," "context
  window," "context packer") when ambiguity is possible.

### 3.11 `audit` (canonical, 510 uses)

- **Where:** "Audit chain," "audit log," "audit event," "audit
  trail," `audit_events` table.
- **Intended meaning:** The hash-chained JSONL log + SQLite
  mirror of every effectful action.
- **Risk:** Low — but the term needs the SAFETY_MODEL §7
  honesty footnote: tamper-evident scope is *accidental
  corruption detection only*, not adversarial tamper-proofing.
- **Recommendation: CANONICAL.** Always paired with the honest
  scope when used in public prose.

### 3.12 `shaping` (canonical for implementation, 62 uses)

- **Where:** `packages/context/src/shape-trusted-facts.ts`,
  ARCHITECTURE.md, EARLY_FEEDBACK_SYNTHESIS.md.
- **Intended meaning:** The deterministic filter that orders +
  trims trusted facts before they enter the prompt bundle.
  "Adaptive shaping" is the full term.
- **Risk:** Low. Mechanical, well-bounded.
- **Recommendation: CANONICAL** for the technical surface.
  In public prose, "adaptive shaping" or "bundle shaping" are
  both acceptable.

### 3.13 `replay` (locked CLI shorthand, 171 uses)

- **Where:** CLI surface `manthan replay <runId>` and ReplayError
  + replayRun in orchestrator.
- **Intended meaning:** Read back the audit records for a past
  run. *Not* byte-identity bundle reconstruction (disclaimed in
  commit `ae9203c`).
- **Risk:** Medium. The English word "replay" implies
  re-execution. ManthanOS's "replay" is inspection. The CLI
  output and README both now carry the explicit "recorded-run
  inspection; not byte-identity bundle reconstruction"
  disclaimer.
- **Recommendation: ACCEPTABLE SHORTHAND (CLI surface only).**
  In prose, prefer "recorded-run inspection." The command name
  stays per OCTO_REVIEW §B6.

### 3.14 `workspace state` (descriptive, 9 uses)

- **Where:** Mostly in `.manthan/` directory comments and
  init.ts gitignore template.
- **Intended meaning:** The contents of a workspace's
  `.manthan/` directory.
- **Risk:** Low.
- **Recommendation: DESCRIPTIVE** — use as needed; not
  load-bearing. Prefer "workspace contents" or "the workspace's
  record" if a noun phrase is needed.

### 3.15 `trusted layer` / `trusted facts` (canonical, 19 uses)

- **Where:** ARCHITECTURE.md, EARLY_FEEDBACK_SYNTHESIS.md,
  POSITIONING.md.
- **Intended meaning:** The subset of facts at tiers T+1, T+2,
  T+3 — the portion the system presents to the next adapter.
- **Risk:** Low.
- **Recommendation: CANONICAL** in public prose. "Trusted
  layer" reads as a substrate concept; "trusted facts" reads as
  the units.

### 3.16 `agent` (use sparingly, 100 uses)

- **Where:**
  - **Locked locations:** `@manthanos/adapters-sdk` exports
    `AgentAdapter`, `AgentMetadata`, `AgentRequest`,
    `AgentResponse`, `AgentMessage`. These are locked.
  - **Adapter implementations** use "agent" as the
    provider-side counterpart in the API contract.
  - **Public prose:** Used historically; reduced in recent
    sweeps. Hermes comparison memo distinguishes "agent" (their
    framing) from "project" (ours).
- **Intended meaning (in our docs):** A reasoning system
  reached via an adapter. *Not* an autonomous identity or a
  persistent assistant.
- **Risk:** High in public prose. "Agent" carries strong
  industry-wide meaning that ManthanOS has explicitly disclaimed
  (`docs/POSITIONING.md` §4: "Not autonomous"; ARCHITECTURE.md
  "agents are temporary tenants"). Every public use risks
  re-importing that meaning.
- **Recommendation: USE SPARINGLY in public prose.** Prefer
  "AI tool" or "model" or "adapter target" when describing the
  thing on the other side of the adapter. Reserve "agent" for
  the adapter-SDK technical surface and for comparative
  contexts (e.g., "Hermes is an agent platform; we are not").

---

## 4. Conflict / collision analysis

A handful of term pairs create conceptual confusion. Each is
named here with the resolution.

### 4.1 "Brain" vs "continuity record"

- **The collision:** "Brain" is the CLI surface; "continuity
  record" is the public framing. New readers will ask: are these
  the same thing?
- **The answer:** Continuity record = audit chain + facts +
  decisions + bundle metadata. Brain = the trusted-facts
  portion the human reviews and curates. The brain is the
  *operationally human-touched* slice of the continuity record.
- **Where to state this once:** ARCHITECTURE.md §7. A one-line
  gloss like "The 'brain' (CLI surface, `manthan brain *`) is
  the operationally-curated portion of the workspace's
  continuity record." Anywhere else, the relationship is
  inferable.

### 4.2 "Memory" vs "record"

- **The collision:** Older docs say "memory layer." Newer docs
  say "continuity record" or "the substrate's record." Same
  thing.
- **The answer:** "Memory" is internal-only legacy. "Record" is
  the disciplined public term. The `@manthanos/memory` package
  name is locked; the in-prose vocabulary is migrating.
- **Action:** No rename sweep. New writing uses "record"; old
  writing stays.

### 4.3 "Context" vs "continuity"

- **The collision:** Both words evoke "stuff the AI sees."
- **The answer:** "Context" is the prompt payload of a single
  call. "Continuity" is the substrate property of preserving
  project commitments across calls / sessions / tools. They are
  not synonyms; the bundle's *context* contains *continuity-
  derived* trusted facts.
- **Action:** Use "context bundle" or "context window" when
  meaning the per-call payload; use "continuity" when meaning
  the across-time property.

### 4.4 "Agent" vs "AI tool" vs "adapter"

- **The collision:** Three near-synonyms for the thing on the
  other end of an adapter.
- **The answer:**
  - **Adapter** — the integration code (`@manthanos/adapter-claude`).
  - **AI tool** — the user-facing name for the provider
    (Claude, Codex, Gemini, ChatGPT, OpenAI). Preferred in
    public prose.
  - **Agent** — locked in `AgentAdapter` etc. Avoid in public
    prose unless contrasting with autonomous-agent products
    (Hermes etc.).
- **Action:** Public prose says "AI tool" or "model"; code says
  whatever it already says.

### 4.5 "Facts" vs "decisions"

- **The collision:** Both stored in the workspace. Both
  promotable.
- **The answer:** Facts live in `semantic_facts` (granular,
  area-scoped, tier-mutable). Decisions live in `decisions`
  (signed commitments, typically T+3-equivalent for an
  architectural choice). The substrate uses both tables; the
  public docs may use "facts" as the umbrella for both unless
  the distinction is load-bearing.
- **Action:** Reserve "decisions" for the `decisions` table
  specifically. Use "facts" for the umbrella.

---

## 5. Terms that should never appear in public-facing docs

Listed for future reviewers. If any of these show up in a new PR
touching public docs, treat them as red flags.

- **cognition** — removed.
- **intelligence** (as a noun applied to ManthanOS) — removed.
- **self-improving** — kept only in the deferred-list disclaim.
- **self-learning** — never present; should never appear.
- **the AI knows / understands / remembers** — anthropomorphic.
  Substitute mechanical verbs: "has access to," "is presented
  with," "records," "retains."
- **infinite memory** — kept only as the negation framing in
  EARLY_FEEDBACK_SYNTHESIS.
- **persistent intelligence** — never use.
- **AI Operating System** — never use except in the
  deferred-list disclaim.
- **never forgets** — never use.
- **perfect recall** — never use.
- **autonomous learning** — never use.

The full list is in
[`docs/research/EARLY_FEEDBACK_SYNTHESIS.md`](./EARLY_FEEDBACK_SYNTHESIS.md)
§4.4.

---

## 6. Migration discipline

This memo deliberately stops short of a rename sweep. The
discipline is: **the canonical vocabulary becomes the default for
new writing; existing prose is updated only when a doc is
otherwise being revised.** Specifically:

- **Do not** open a PR titled "rename brain → continuity record
  across the repo." Cost-benefit is negative; the CLI surface
  is locked, the term is well-bounded, and a 727-replacement
  sweep would touch every test fixture and breaking-change docs.
- **Do not** rename `@manthanos/memory`. The package name is a
  permanent surface decision.
- **Do** use the canonical terms (record, continuity record,
  trusted facts, AI tool, adapter) in any *new* prose you write.
- **Do** apply per-doc consistency: a single doc should either
  use "brain" throughout (when describing the CLI surface) or
  "continuity record" throughout (when describing the substrate's
  contents). Mixing within one document creates confusion.
- **Do** add a one-line gloss in ARCHITECTURE.md §7 explaining
  the brain ↔ continuity-record relationship. (Not done as part
  of this memo — out of scope.)

---

## 7. What this memo deliberately does not do

- It does not rename anything.
- It does not propose a CLI surface change.
- It does not commit to executing any of the §6 disciplinary
  recommendations.
- It does not propose new architecture, new commands, or roadmap
  items.
- It does not propose a brand-kit revision.
- It does not deprecate any term currently in production use.

The memo's job is to give a future editor — human or LLM —
**one consistent vocabulary to draw from** so the next round of
edits doesn't accidentally drift back toward "memory plugin"
framing or accidentally smuggle "cognition" back into a prominent
doc.

---

## 8. One-sentence summary

> **Canonical public vocabulary: workspace, project, continuity
> (record), trusted facts, audit chain, context bundle, adaptive
> shaping, AI tool, adapter. Acceptable CLI shorthand: brain,
> replay. Avoid publicly: cognition, intelligence,
> self-improving, the AI knows/understands/remembers, infinite
> memory, persistent intelligence, AI Operating System.** The
> CLI surface "brain" remains locked; public prose prefers
> "continuity record" or "trusted facts."

If a future doc edit conflicts with the canonical row above, that
doc is the one that should change — not this memo.
