# ManthanOS — Phase 3 CpT Measurement Pass

> Does trusted continuity produce meaningfully better engineering outcomes
> relative to its token cost?
> Status: experimental design, written before execution.
> Written: 2026-05-16.

---

## 1. The question

Phase 2 proved the substrate is stable. Trusted continuity self-bounds
under decay+dedup; the trusted layer equilibrates to roughly the same
size regardless of human review attention. **Quantity is controlled.**

Phase 2 did *not* answer:

> Does the bounded trusted continuity actually help the LLM produce
> better engineering output?

That is the Phase 3 question. Until it is answered empirically, the
whole project's central claim is unverified.

## 2. Hypothesis

For the same task brief, model, and budget:

- **H1.** A healthy bounded brain (Run A: trusted=41, ~1500 tokens)
  produces output that references project-specific commitments more
  often, contradicts the brain less often, and hallucinates project
  facts less often than the empty baseline.

- **H2.** A stressed brain (Run B: trusted=41 but with 51 unreviewed T0
  facts behind it) produces output of *similar quality to Run A* —
  because the trusted layer that enters the prompt is the same. The
  T0 backlog is irrelevant to single-shot plan workflows.

- **H3.** Both A and B materially outperform the empty baseline on
  reuse-of-prior-commitments and project-specific reasoning.

If H1 and H3 hold, continuity earns its token cost. If H2 holds,
queue-health stress is an *operational* problem, not a
*quality* problem — confirming Phase 2's most important finding.

If H3 fails — i.e., the brain doesn't actually help the model — the
whole project's central thesis needs revisiting.

## 3. What we will NOT do

- **No synthetic quality scores.** No "rate this output 7/10."
- **No automated rubric grading.** The rubric is for the human.
- **No new mechanisms.** No embeddings, retrieval, scoring, routing.
  Phase 3 tests the substrate as Phase 2 shipped it.
- **No multi-seed averaging for cherry-picking.** Each (workspace,
  brief) pair runs once unless you explicitly authorize re-runs.
- **No proxy metrics dressed as conclusions.** Token counts are
  objective; everything quality-shaped is rubric.

## 4. Comparison protocol

For each task brief, run the *same* `manthan plan` invocation against
three workspaces:

| Workspace | State |
|---|---|
| `empty` | fresh `manthan init`; charter facts only; no trusted facts |
| `healthy` (Run A) | post long-horizon, attention=0.6: T+1=37, T+2=4, T+0=2, ~1500 trusted tokens |
| `stressed` (Run B) | post long-horizon, attention=0.15: same T+1/T+2 layer, T+0=51, oldest 87d |

Same flags everywhere: `--model sonnet --adapter cli --budget 0.50
--context-budget 60000 --max-output 4096`. Same brief content.

For each run, capture:

- bundle hash + prompt tokens + output tokens
- raw output text + parsed plan steps/risks/assumptions
- run id + audit seq

Write per-workspace captures to `cpt-runs/<label>/<workspace>.json`,
then a `cpt-runs/<label>/compare.json` with side-by-side numbers and
objective metrics.

## 5. Brief set

Four briefs, one per area where the corpus has the strongest signal:

1. **`auth-reset-password.brief`** — "Add a /reset-password endpoint
   to the auth service that emails a single-use token." The brain has
   facts about session cookies, OAuth, refresh tokens, single-use
   token policy, and httpOnly storage. Empty should hallucinate a
   default scheme; healthy should reuse the project's existing
   primitives.

2. **`db-audit-table.brief`** — "Add a write-once audit table to the
   database layer." The brain has a contradiction-shaped pair:
   originally Postgres, migrating to SQLite for v1 launch. Healthy
   should pick the *correct current* technology; empty cannot. This
   probes contradiction handling and recency.

3. **`testing-new-endpoint.brief`** — "Wire up integration tests for
   the new POST /api/v1/users endpoint." The brain has facts about
   real SQLite test instance, no Jest (rejected), coverage targets,
   beforeEach store-clear. Healthy should reuse these conventions.

4. **`deploy-staging.brief`** — "Set up a staging deploy for the auth
   service." The brain has Docker + Hetzner + GitHub Environments +
   manual approval facts. Healthy should reference the project's
   actual deploy stack; empty will invent one.

These briefs are short (one sentence), realistic, and each tests a
specific continuity behavior. They are not exhaustive — they are
diagnostic probes.

## 6. Objective metrics (per output, computed automatically)

The harness computes these without judgment:

| Metric | How |
|---|---|
| **prompt tokens** | bundle's `totalEstimatedTokens` + bundle's `systemPrompt` length |
| **output tokens** | reported by adapter |
| **total cost USD** | reported by adapter (or 0 under subscription) |
| **trusted-fact references** | count of trusted statements where any 12-character substring of the statement appears in the output (deterministic; conservative) |
| **areas referenced** | count of distinct area names from trusted facts appearing in the output |
| **contradicted-fact references** | count of statements from T-1 / T-2 facts appearing in the output (flags that the model is using rejected content) |
| **plan step count** | parsed from the model's JSON output |
| **risks identified** | parsed count |
| **assumptions declared** | parsed count |

These give *signal*, not *quality*. A higher fact-reference count means
the model used more of the brain's content; whether that is *correct*
use remains a human-rubric question.

## 7. Rubric (human review only)

After the matrix runs, open the three outputs side-by-side and answer
these for each brief:

1. **Did the healthy output reuse a specific project commitment** that
   the empty output didn't? Cite the commitment.
2. **Did the empty output hallucinate a project fact** that the
   healthy output correctly knew? Cite the hallucination.
3. **Did either output contradict a trusted fact?** Cite.
4. **Did the healthy and stressed outputs differ?** If so, in what
   specific way? (Tests H2.)
5. **On reading all three, which would actually be easier to implement
   correctly?** No score — just the answer "empty" / "healthy" /
   "stressed" / "no difference."

These are concrete behavioral observations. They produce a few
sentences of qualitative judgment per brief. Aggregate across four
briefs to draw cautious conclusions.

## 8. Success / failure criteria

A *useful* Phase 3 outcome looks like:

- ≥ 3 of 4 briefs show healthy → ≥1 specific project commitment reused
  that empty missed (supports H1+H3).
- ≥ 2 of 4 briefs show empty → hallucination caught by healthy (also
  H1).
- Healthy and stressed outputs look essentially the same on the
  rubric (supports H2).

An *unfortunate* Phase 3 outcome:

- Healthy outputs no different from empty. → The brain is decorative,
  not load-bearing. Phase 2 mechanisms still correct in isolation,
  but the value proposition needs rethinking.

A *catastrophic* outcome:

- Healthy outputs *worse* than empty (e.g., model gets confused by
  injected context). → Pause and investigate before any further work.

## 9. Cost discipline

- Per run: ~30K input + ~2K output ≈ Anthropic subscription burn.
- Full matrix: 4 briefs × 3 workspaces × 1 seed = 12 plan calls.
- Re-runs for stochastic noise: only if a single result is ambiguous,
  and only with explicit authorization.
- The harness emits a cost summary after each invocation; running the
  full matrix should stay within a normal subscription quota window.

## 10. What this experiment does not test

- Multi-step workflows (only single `plan` calls).
- Cross-session continuity (each call is one-shot).
- Cross-model behavior (only one provider per matrix; E6.1 is separate).
- Long-tail reasoning quality (a 4-brief diagnostic is not a benchmark).
- Production behavior under unbounded usage.

These are all valid future directions. None of them are *prerequisite*
for the first answer to the central question.

## 11. Disposition of results

Whatever the matrix shows is recorded honestly in this document's
follow-up section. If H1+H3 hold, the project has its first empirical
demonstration that continuity earns its cost. If they don't, that is
also a useful result and the roadmap reorganizes around the actual
finding rather than the hoped-for one.

There is no "good result we want." The only good result is **the truth
about whether bounded continuity helps**.

---

## 12. Pre-execution checklist

- [ ] Run A workspace exists at known path (`/tmp/lh-test`)
- [ ] Run B workspace exists at known path (`/tmp/lh-test-low`)
- [ ] Empty workspace created
- [ ] Anthropic provider authenticated (`manthan auth` or subscription
      CLI working)
- [ ] Harness `manthan experiments cpt-probe` available
- [ ] `--dry-run` against all three workspaces produces sane bundle
      comparison
- [ ] User authorizes LLM-driven matrix runs

When all six are checked, run the matrix. Then write the findings into
§13 of this document.

## 13. Findings (filled after execution)

*Pending Phase 3 matrix execution.*
