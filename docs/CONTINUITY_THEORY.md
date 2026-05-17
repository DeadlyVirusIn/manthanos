# ManthanOS — Continuity Theory

> Why trust-gated re-injection of prior commitments reduces AI project
> drift, what evidence supports the claim, and what the limits are.
> Status: theory grounded in two live experiments (Phase 1.7
> within-Claude; E6 cross-model probe); not generalized.
> Last revised: 2026-05-16 (E6 finding added to §9.6).

---

## 1. The problem of project drift

A team using an AI assistant on the same codebase across days, weeks,
and months experiences a specific failure mode:

> The AI on Tuesday morning has the same priors as on the previous
> Friday afternoon — even though substantial architectural decisions
> were made in between.

The drift manifests as:

- **Re-derived assumptions.** "We're using Express 4.x because passport
  compatibility" gets re-deduced from scratch each session, sometimes
  arriving at a different answer.
- **Contradicted decisions.** Friday's plan committed to Google OAuth;
  Tuesday's plan invents a generic provider-agnostic library.
- **Re-invented choices.** Test framework picked thrice; logging
  library swapped three times in two months in different unrelated
  PRs.
- **Forgotten risks.** A risk identified in last month's debate
  resurfaces as a "new" surprise.

This is not a model-quality problem. The model is competent. The
**inputs** to it are amnesic.

Existing approaches address this with varying inadequacy:

| Approach | What it does | Why it fails for drift |
|---|---|---|
| Chat history scrollback | Keeps prior turns in context | Lossy, expensive, conflates trusted and untrusted |
| Long context windows (1M+ tokens) | Dumps the repo into the prompt | Solves "code visibility" not "decision continuity"; the model doesn't know which past commitments are still binding |
| Semantic memory plugins | Embeddings + retrieval | Retrieves by similarity, not by trust; cannot say "these 3 facts are binding, the rest are observations" |
| Editor-side "rules" files | Static project conventions | Static, human-authored, never reflects what the AI itself produced and the team approved |
| Decision logs in README | Human-maintained markdown | Drift between "what's in README" and "what we're actually building this week" |

None of these have a **trust gate**. None of them distinguish "an
assumption the AI proposed in passing" from "a commitment the team
explicitly endorsed."

That distinction is the continuity hypothesis.

---

## 2. The continuity hypothesis

Stated formally:

> H: Adding a human-promoted subset of prior workflow commitments
> (assumptions, decisions, identified risks) into the prompts of
> future workflows in the same project will materially reduce drift
> — measured as architectural contradiction with prior plans,
> re-derivation of settled assumptions, and re-invention of resolved
> choices.

The hypothesis is testable. It is also bounded: it claims a specific
mechanism (trust-gated re-injection), a specific failure mode
(drift), and a specific scope (related tasks within a single project).

It does **not** claim:

- That re-injection makes the model "smarter."
- That continuity solves all AI-assistance failure modes.
- That the loop generalizes to arbitrary task types.
- That continuity replaces good documentation, code review, or
  architectural governance — it augments them.

---

## 3. Why the mechanism plausibly works (a priori)

Three reasons supported by general LLM behavior:

1. **Prompt injection beats inference.** A model asked "what did we
   decide about session storage?" will hallucinate or hedge. The same
   model told "in this project, in-memory storage was approved as the
   session store strategy" will work within that constraint. Stating
   commitments is dramatically more reliable than asking the model
   to remember.

2. **Trust-tier annotations are observable.** Phase 1.6 showed the
   model literally citing `[T+1 fact]` in its risk-mitigation prose.
   Models read structured metadata and adjust their output. They do
   not treat all input text as having equal weight.

3. **Provenance reduces hallucination risk.** A fact tagged
   `src=wf_34b9da60` (a workflow that actually existed) gives the
   model an attribution it can reason about. A free-floating fact
   without provenance is indistinguishable from prompt injection.

These are not proofs. They are mechanism hypotheses consistent with
how transformer-based models behave. The actual test is empirical.

---

## 4. The Phase 1.6 evidence

A live A/B experiment ran on 2026-05-15 against Claude Sonnet (via
Claude Code CLI subscription auth). The full experiment is recorded
in this workspace's audit chain at `/tmp/manthan-experiment-7jJp/`.

### 4.1 Design

- **Workspace:** fresh ManthanOS-initialized git repo with a minimal
  `src/auth.ts` stub.
- **Plan A:** "Add OAuth login with session management" — produced
  13-step plan, 6 quarantined facts, 2 open issues.
- **Plan B0 (control):** "Implement OAuth session expiry, refresh,
  and revocation" — run **before** any promotion; brain held only
  T0 facts (none in default bundle).
- **Promotion step:** 3 facts from Plan A promoted to T+1 via
  `manthan brain promote <id> --yes`:
  - "Google OAuth 2.0 is the target provider"
  - "In-memory session store is acceptable"
  - "Express 4.x will be used (not Express 5)"
- **Plan B1 (treatment):** same task as B0, with the 3 facts now at
  T+1 and thus in the trusted_facts layer of the bundle.

Held constant: model, repo state, charter facts, git diff, source
files, task wording, runtime version, packer config. **Only the
trusted_facts layer differed.**

### 4.2 Bundle structural diff (the controlled input)

| Layer | B0 | B1 |
|---|---|---|
| charter | 51 tok | 51 tok |
| **trusted_facts** | **— absent —** | **185 tok** |
| task_brief | 16 tok | 16 tok |
| git_diff | 9 tok | 9 tok |
| source files | 103 tok | 103 tok |
| **Total** | **179** | **364 (+103%)** |

### 4.3 Observed output differences

**B0 (control)** — invented a fresh, framework-less design:

- "No real OAuth provider in scope" (a *contradiction* with plan A,
  which specified Google).
- Generic token-store library; no Express, no Passport.
- Test framework: Jest with ts-jest (the workspace actually uses
  vitest — a hallucination).

**B1 (treatment)** — continued plan A's architectural commitments:

- Google OAuth 2.0 + Passport + Express 4.x stack.
- Real Google API integration: `oauth2.googleapis.com/token` for
  refresh, `oauth2.googleapis.com/revoke` for revocation.
- Specific Passport config: `accessType: 'offline'` + `prompt:
  'consent'` to force refresh-token issuance.
- Risk mitigation citing the trust tier: *"In-memory session store
  wiped on every process restart. Mitigation: Accepted per workspace
  constraint (T+1 fact)."*

### 4.4 Quantitative result

- ~42% of B1's structural plan items (steps, risks, assumptions,
  open_questions) traced to content in the 3 promoted facts.
- B1's bundle: +185 tokens (the trusted_facts layer).
- B1's output: +1356 tokens (nearly 2× more — but more concrete and
  project-specific, not padded).
- B1 quota delta over B0: +$0.013 subscription-equivalent.

### 4.5 Single most important observation

**Claude visibly cited the T+1 trust annotation in its output.** Not
just absorbed the fact — actively referenced its trust level as
justification for a design decision. This is the strongest evidence
that the trust-tier metadata is mechanically operational, not just
decorative.

---

## 5. What the experiment validates

- ✓ The continuity hypothesis (H) holds for a single related-task pair
  with the architectural-continuity task category.
- ✓ The trust gate is mechanically reliable: only promoted facts
  entered the prompt; everything else stayed in quarantine.
- ✓ Replay determinism survived contact with the real provider; both
  B0 and B1 replay byte-identically against their recorded bundles.
- ✓ The audit chain remained intact across promotion events.
- ✓ Token cost of continuity is small relative to output gain.

## 6. What the experiment does NOT validate

- ✗ That H holds for other task classes: debugging, refactoring,
  migrations, code review, regression analysis. **Future experiments
  required.**
- ✗ That H holds at brain age > one prior plan. At 50 promoted facts
  spread across 8 areas, does the model still attend to each? Open.
- ✗ That the human cost of promotion (a "friction tax") pays off at
  realistic engineering scale. Probably yes for small teams; unknown
  for large teams.
- ✗ That brain contents remain useful at month 6+ under realistic
  drift (the codebase itself evolves; facts about it can go stale).
- ✗ That a competitor with a much simpler "include prior commitments
  in prompt" feature plus a checkbox UI could not replicate most of
  the value.

## 7. Limits of continuity (honest)

Continuity is one mechanism, not a panacea. Specifically:

- **Continuity does not improve raw reasoning quality.** A model that
  can't write a correct OAuth flow at all is not made correct by
  trusted facts. Continuity preserves prior decisions; it does not
  generate new insight.
- **Bad commitments propagate.** If the team promotes a fact that's
  wrong, every future workflow inherits the wrong fact. This is the
  reason the trust gate must be human and deliberate. Cleanup
  workflow: `manthan brain demote <id> --reason=...`.
- **Continuity has a tax.** Every promoted fact adds tokens to every
  future bundle in its area. At 100+ trusted facts the bundle bloats.
  Fact hygiene (`FACT_HYGIENE.md`) is the counterweight.
- **Continuity does not cure context-window pressure.** If the
  packed bundle exceeds the model's context, trusted facts compete
  for space with source code. The packer's drop-order policy
  (drop source layers first) protects the trusted layer, but a vast
  trusted set can still crowd out useful context.
- **Continuity does not detect contradictions automatically.** Two
  promoted facts can directly conflict. Contradiction detection
  (deferred to a later phase) is the mechanism for catching this;
  for now, the human reviewer catches it during promotion.

## 8. How continuity differs from related approaches

**vs. RAG (retrieval-augmented generation):**
RAG retrieves text chunks by semantic similarity. Continuity injects
**structured, human-trusted commitments** with explicit tier. RAG
optimizes for relevance; continuity optimizes for authority. The two
are complementary; ManthanOS does not implement RAG.

**vs. Chat memory plugins (Mem, claude-mem, etc.):**
These store conversation history as embeddings or notes. They lack
a trust gate. They retrieve by similarity, not by approval. They
treat all memories as equally weighted observations.

**vs. Project rules files (Cursor `.cursorrules`, Aider conventions):**
Rules files are human-authored from scratch. The continuity loop
captures what the **AI itself produced** that the human then approves.
The difference is the closed loop: AI proposes → human curates → AI
inherits → repeat.

**vs. Long context windows (Claude 200k+, Gemini 1M+):**
Long context lets the model see more code. It does not tell the model
which of last week's design decisions are still binding. Continuity
is orthogonal to context window size and remains valuable even at
1M-token context.

## 9. Open research questions

The continuity thesis is supported by two related experiments — Phase
1.7 (the original A/B against Claude) and E6 (the cross-model probe).
The questions below are what would either strengthen or refute it
further. **Question 9.6 has been partially answered by E6**; its
status is recorded inline.

1. **Task generalization.** Does the loop materially improve outputs
   on debugging tasks? Refactoring? Code review? Migration plans?
   Each needs its own A/B with controlled variables.

2. **Brain-age performance.** At 5, 50, 500 promoted facts, does the
   loop continue to help, plateau, or regress? At what fact-density
   does the model start ignoring tier annotations?

3. **Fact decay.** Project codebases change. A fact promoted in
   January about "we use Postgres" may be stale by July (because
   we migrated to SQLite). Without active decay/correction, does
   the brain accumulate harmful priors?

4. **Promotion friction.** What is the maximum human-review tax per
   workflow that users will tolerate? If promoting 3 facts takes 30
   seconds per plan, daily AI engineering accrues 15 minutes/day of
   curation. Is that sustainable?

5. **Cross-developer continuity.** Phase 1.6 used a single user. In a
   team, the brain shared via git (or via a future sync mechanism)
   has different curation dynamics. Two engineers may promote
   different facts. Does conflict-resolution UX become the bottleneck?

6. **Generalization across models.** *Partially tested — E6 on
   2026-05-16.* The original question: does the trust-tier
   annotation get respected by GPT-5, Gemini, Codex the way Phase
   1.7 showed Claude respected it?

   **E6 result: NOT supported by the minimal-adapter approach, with
   important caveats.**

   Method: same B0/B1 controlled experiment as Phase 1.7, replicated
   on three providers via subscription-auth CLIs (Claude Code,
   `codex exec` against ChatGPT, `gemini -p` against Google AI Pro).
   Three plan-A facts promoted to T+1. All three B1 runs received
   **byte-identical bundle hashes** — the runtime side delivered the
   same continuity packet to each provider. Findings:

   - **Claude (B0 vs B1):** continuity loop replicated. B1's plan
     explicitly added a `src/pkce.ts` module, a `src/provider.ts`
     reading `OIDC_ISSUER / OIDC_CLIENT_ID / …` from env, and a
     `SessionStore` interface with comment *"fulfils the project
     constraint that a Redis/DB adapter can be layered later
     without API changes"*. All three promoted facts visibly used.

   - **Codex (B0 vs B1):** **adapter implementation failure, not a
     model finding.** Both runs returned zero parseable output via
     the minimal `codex exec` stdin/stdout adapter. The model
     behaviour was not measured. A robust Codex adapter would need
     `--output-schema FILE` for structured output, system-prompt
     separation via config, and `--output-last-message FILE` for
     output capture — roughly another 4–6 hours of adapter work
     before the experimental question can even be asked.

   - **Gemini (B0 vs B1):** **CLI framing drowned out the
     trusted-facts layer.** Both runs produced extensive output
     (B1: 11,692 output tokens) but neither was a structured plan.
     Both responded with "*I have successfully implemented...*"
     hallucinations describing fabricated test results. The Gemini
     CLI's own system prompt (913,533 input tokens for B1) buries
     our ~400-token continuity packet structurally. B1's hallucinated
     "implementation" does not visibly reflect the 3 promoted facts:
     PKCE absent, OIDC providers absent, the in-memory/Redis
     pluggability framing absent. Promoted facts: 0 / 3 visibly used.

   **What E6 supports:**

   - The **runtime side** of cross-model continuity is mechanically
     clean. Identical bundles delivered to three providers; trusted
     facts injected with consistent tier + provenance tags.
   - Within-Claude continuity replicates across fresh workspaces
     and different Plan-A outputs — not a one-off artifact of the
     Phase 1.7 task.

   **What E6 does NOT support:**

   - The broader *multi-model continuity substrate* claim.
   - The "ManthanOS as a synchronization layer across AI tools"
     framing — the empirical evidence does not justify it yet.

   **What E6 does NOT refute:**

   - That GPT/Codex would respect trusted-fact annotations under a
     properly-built adapter. We measured an adapter, not a model.
   - That Gemini *the model* (vs `gemini -p` the CLI) would respect
     them via a direct-API adapter. The CLI is structurally hostile
     to the pattern; the model has not been fairly tested.

   **Conclusion:** Cross-model continuity is *adapter-quality-* AND
   *CLI-framing-dependent*, not just model-dependent. The narrowed
   Phase 1.7 framing — single-model trust-gated continuity within a
   project — remains the strongest evidence-backed claim. A future
   **E6.1** with properly-built Codex and Gemini adapters (the
   former using `--output-schema`, the latter using the official
   Google AI SDK directly rather than the CLI) would be required to
   actually answer the original question. That experiment is a
   candidate Phase 3 work-item, not a Phase 2 pivot.

   Full E6 report archived in conversation log; experiment
   workspace at `/tmp/e6-cross-model-rsRu/` (audit chain seq 1–65,
   65 events, chain verified `ok`). Codex and Gemini adapters
   preserved as `@manthanos/adapter-codex-cli` and
   `@manthanos/adapter-gemini-cli` — marked **experimental, not
   production-ready** — pending E6.1.

7. **Adversarial promotion.** A malicious or careless promotion of
   a prompt-injection-shaped fact lands in every future workflow's
   trusted prompt. What review tooling is needed to make promotion
   safe under attacker influence?

8. **The "competitor with checkbox UI" question.** If Cursor adds a
   "remember this decision" toggle that adds it to system prompt
   in future sessions, does ManthanOS still differentiate?
   Probably yes via the audit chain, replay, and trust-tier semantics
   — but this needs to be explicit.

These questions form the Phase 2+ research agenda. **Until they are
answered, the continuity claim remains narrow but real.**

---

## 10. Engineering implication

Three operational rules follow from §1–9 that drive `FACT_HYGIENE.md`
and `TRUST_OPERATIONS.md`:

1. **Promotion is sacred.** It is the only mechanism by which content
   enters trusted prompts. Make it deliberate, traceable, undoable.
2. **Quarantine is the default.** New facts always start at T0. If
   the user does nothing, nothing gets trusted. The product fails
   safely.
3. **Hygiene is half the runtime.** A brain without active cleanup
   becomes a liability faster than a memory layer becomes an asset.

Continuity is the product. Hygiene is the discipline that keeps it
that way. Trust operations are the surface through which the human
exercises both.
