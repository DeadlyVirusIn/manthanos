# ManthanOS — Trust Operations

> The mechanics, UX, and discipline of the trust gate.
> Status: Phase 1.6 spec (promote / demote / undo implemented);
> Phase 2+ UX additions deferred.
> Last revised: 2026-05-15.

---

## 1. The trust gate philosophy

The product value of ManthanOS depends on one rule:

> **Nothing enters a future workflow's trusted prompt without a human
> deciding it should.**

That rule has consequences that ripple through every other design:

- No automatic promotion from any signal, including model-generated
  "consensus."
- No corroboration-based promotion (corroboration is informational
  metadata only).
- No "AI-suggested promotions for review" workflow that lets the
  user click through a list of pre-checked items — the cognitive
  load of reviewing each fact is the value.
- No silent state changes during plan runs that affect future trust.

The friction is not a bug. The friction is what makes the trusted
set worth trusting.

---

## 2. The five permitted transitions

Per `ARCHITECTURE.md §7.5`, six tiers exist. Trust operations move
facts between them via these allowed transitions:

| From → To | Trigger | Implementation status |
|---|---|---|
| T0 → T+1 | `manthan brain promote` | ✅ implemented |
| T+1 → T+2 | `manthan brain promote` | ✅ implemented |
| T+2 → T+3 | `manthan decision sign` (not yet built) | Phase 3+ |
| T+1 → T0 / T-2 | `manthan brain demote --reason` | ✅ implemented |
| T+2 → T+1 / T0 / T-2 | `manthan brain demote --reason` | ✅ implemented |
| any tier → T-1 (contradicted) | contradiction detector | Phase 3 |
| any non-T+3 → undo-prior-state | `manthan brain undo-correction <seq>` (≤ 7 days) | ✅ implemented |

**Forbidden by design:**
- Any direct movement to T+3. Signed decisions require the future
  `manthan decision sign` workflow, not the simple promote path.
- Demotion of T+3 via the simple demote command. T+3 facts can only
  be retired by a new signed decision that supersedes them.
- Promotion of T-1 (contradicted) facts before contradiction is
  explicitly resolved.
- Promotion of T-2 (reversed) facts at all, in any path.

These forbidden transitions are enforced in `@manthanos/orchestrator/
src/brain-trust.ts` and tested in `tests/brain-trust.test.ts`.

---

## 3. What makes a good T+1 fact

A pre-promotion checklist (the human's responsibility):

1. **Verifiable.** A future maintainer reading this fact must be able
   to verify it from the codebase. "Sessions use httpOnly cookies"
   is verifiable; "We prefer clean code" is not.
2. **Specific.** "Use Express 4.x" beats "Use a stable web framework."
3. **Committed.** The fact represents a decision the team has made,
   not a possibility they're considering.
4. **Bounded.** A fact applies to a specific area (`oauth`, `auth`,
   `db`) — not the whole project.
5. **Not a workflow.** Trust facts, not instructions. "Sessions
   expire in 1 hour" is a fact; "Generate the session token using
   crypto.randomUUID()" is closer to instructions and should appear
   in source code, not trusted facts.
6. **Not a hidden directive.** Re-read every fact for prompt-injection
   patterns (per `FACT_HYGIENE.md §8`). "Ignore prior instructions"
   inside an otherwise normal fact is a hard refuse.

The CLI displays the fact verbatim before promotion to support this
check. Phase 1.6 shipped this behavior:

```
$ manthan brain promote fact_a902ae61-…

Promoting fact:
  id:         fact_a902ae61-…
  area:       oauth
  statement:  Google OAuth 2.0 is the target provider; a
              GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET will be
              supplied via environment variables at runtime.
  transition: T0 (conf=0.30) → T+1
  provenance: wf_34b9da60-…

Confirm? [y/N]
```

The default is **No**. Skipping the question is a refuse, not an accept.

---

## 4. Promotion ergonomics

### 4.1 Today (Phase 1.6 shipped)

- One-at-a-time: `manthan brain promote <fact-id>`
- Skip prompt: `--yes`
- Target tier: `--to T+1` or `--to T+2` (default: next-tier-up)
- Free-text note: `--note "..."` recorded in audit payload

The CLI prints the fact, requires confirmation (or `--yes`), writes
the `brain.correction` audit event, returns the audit_seq for
potential undo.

### 4.2 Phase 2 additions (specced, not built)

- **Bulk interactive review** (`manthan brain review [--area X]`):
  walk through quarantined facts, decide each, summarize at end.
- **Inline promotion from `manthan brain facts`**: each fact line
  shows `[p]romote` / `[d]emote` shortcuts when stdin is a TTY.
- **Fact grouping**: facts with overlapping content show together in
  a single review slot ("3 near-duplicates; pick one to promote, the
  others auto-dedupe").
- **Promotion via PR**: future `manthan brain export-pending` writes
  a markdown report a teammate can review and `manthan brain
  apply-review <file>` consumes.

Phase 2 priority order: bulk review → inline promotion → grouping.

### 4.3 What promotion will never be

- **Auto-promote** based on corroboration count. Per §1.
- **AI-suggested approve-all**. Per §1.
- **Silent on stdin-redirect**. Per the existing `--yes` requirement
  for non-TTY use: if stdin is not a TTY and `--yes` was not passed,
  promotion refuses with a precise error.

---

## 5. Provenance and trust-diff rendering

Every promoted fact carries through:

- **Originating workflow ID** (`provenance_workflow_id`) — points to
  the plan run that first produced the fact.
- **Statement hash** — content-addresses the fact's body.
- **Audit chain link** — `audit_seq` of the `brain.fact_quarantined`
  event that originally inserted the fact, plus the audit_seq of the
  `brain.correction` that promoted it.

When rendered in the bundle (per `packer.ts`):

```
- [T+1 · oauth · conf=0.70 · src=wf_34b9da60-…] In-memory session
  store is acceptable for this experiment; persistence across
  restarts is not required.
```

The model can see (and Phase 1.6 evidence shows it *uses*) all of
this metadata.

**Phase 2 addition: `manthan brain lineage <fact-id>`** — show the
full chain of audit events that touched this fact (insertion,
promotion, any demotion / undo). Useful for answering "why is this
in my plan?"

**Phase 2 addition: `manthan brain why-injected <run-id>`** — given
a workflow run, list every trusted fact that entered its bundle with
provenance and the audit_seq that put it there. The continuity
trace.

---

## 6. Demotion

### 6.1 When to demote

Three legitimate reasons:

1. **Stale.** "We decided Postgres last year; we migrated to SQLite
   in March. The Postgres fact must come out of the trusted set."
2. **Wrong.** "On reflection that promotion was a mistake; the
   trade-off goes the other way."
3. **Out of scope.** "This fact applied to the old `v1` API surface;
   we're now on `v2` and the fact is misleading."

Each reason is `--reason "..."` text on the command. The reason is
recorded in the audit payload and visible in lineage queries.

### 6.2 Demote vs supersede

| | Demote | Supersede (Phase 3) |
|---|---|---|
| Use when | The fact is wrong or outdated | A new fact replaces it |
| Audit event | `brain.correction` | `brain.supersede` |
| Old fact tier | Lowered (T+1 → T0 default) | Marked `T-3 superseded` |
| New fact | None | Promoted (if not already trusted) |
| Lineage shows | "demoted: reason" | "superseded by <new-id>" |

Both preserve the old fact in the audit chain; neither deletes data.

### 6.3 Phase 2 addition: demote-with-supersede

A combined operation for the common case:

```
manthan brain replace <old-id> --with <new-id> --reason "..."
```

Equivalent to: demote old + promote new + record supersede link, all
in one audited transaction.

---

## 7. Undo semantics

### 7.1 The 7-day window

`manthan brain undo-correction <audit_seq>` (per `ARCHITECTURE.md
§7.9`) reverses a recent `brain.correction` event:

- Allowed within 7 days of the original event's timestamp.
- Reads the original event's payload from the blob store to recover
  `from_tier` and `to_tier`.
- Applies the reverse transition.
- Writes a new `brain.correction` event with `is_undo_of_seq` set to
  the original seq.

After 7 days, undo refuses. The user can still manually demote /
re-promote, but that creates a fresh audit event with a different
shape (no `is_undo_of_seq` link).

### 7.2 What undo does NOT do

- Does not delete the original event. The chain is intact.
- Does not roll back any downstream consequences. If a plan ran after
  the promotion and used the trusted fact, that plan's recorded
  result stays exactly as it was. Replay still produces the same
  output. Undo only changes future workflows.
- Does not chain. Undoing event N+1 does not auto-undo event N.

### 7.3 Phase 2 addition: undo with consequences view

`manthan brain undo-correction <seq> --show-consequences` will list
the workflow runs that ran *after* the original event and consumed
the affected fact, so the user can decide if any of those runs
should be re-evaluated. This is informational only — the runs
themselves are immutable.

---

## 8. Rollback safety

Three guarantees, enforced in code:

1. **Audit chain integrity is preserved across every trust mutation.**
   Verified by `manthan doctor` and the live experiment's chain check
   (46 events including 3 promotions, all verified ok).
2. **A failed mutation does not partially update the brain.** The
   SQLite transaction wrapping the audit-write + brain-write makes
   the pair atomic.
3. **Stale lock files cannot corrupt trust state.** The workspace
   lock (`PLATFORM_LAYER.md §1`) prevents concurrent runtime
   processes from racing.

These are tested in `packages/orchestrator/tests/brain-trust.test.ts`
and the chain-verify path in `packages/memory/tests/audited-write.test.ts`.

---

## 9. Anti-patterns (what NOT to do)

1. **Promote in bulk without review.** A `manthan brain promote-all`
   command would defeat the trust gate. We don't implement it; we
   actively refuse to.
2. **Promote for convenience.** "I'll just promote this so the model
   stops re-deriving it." If the fact isn't a real commitment,
   promotion is noise, not signal.
3. **Demote silently to hide a mistake.** Demotion takes `--reason`
   for a reason: the audit log should explain *why* the team changed
   its mind. Future maintainers reading lineage need this context.
4. **Use trust mutations as a workaround for context-window limits.**
   If a plan needs more context, expand the bundle budget — don't
   promote facts to squeeze more into the system prompt.
5. **Promote model-generated instructions disguised as facts.** Per
   §3, a fact like "always use crypto.randomUUID()" is closer to a
   workflow instruction than a project commitment. Source code +
   linters belong in the repo; the trusted-fact tier is for
   *decisions*, not *rules*.
6. **Treat the trusted set as comprehensive.** It should reflect a
   curated minimum that prevents drift, not every assumption the AI
   has ever made. The minority of facts that get promoted is the
   point.

---

## 10. CLI command map (current + planned)

```
# Shipped in Phase 1.6
manthan brain promote <fact-id> [--to T+1|T+2] [--note ...] [--yes]
manthan brain demote <fact-id> --reason "..." [--to T0|T-1|T-2] [--yes]
manthan brain undo-correction <audit-seq> [--yes]
manthan brain stats
manthan brain facts [--area X] [--tier Y]
manthan brain issues [--all]
manthan brain history [--limit N]

# Phase 2 (UX-focused, no code yet)
manthan brain review [--area X]              # interactive bulk review
manthan brain dedup [--dry-run]              # normalized-text dedup pass
manthan brain age-facts [--dry-run]          # apply decay rules
manthan brain why-injected <run-id>          # which trusted facts entered a bundle
manthan brain lineage <fact-id>              # chain of audit events for one fact

# Phase 3 (correction-loop maturity)
manthan brain supersede <old-id> --with <new-id>
manthan brain replace <old-id> --with <new-id> --reason "..."
manthan brain detect-contradictions
manthan brain prune [--dry-run]
manthan decision sign <debate-or-fact-id>    # T+2 → T+3 (signed)
```

Each Phase 2/3 command in the table above is a small command (50–200
lines of TS each) over the existing brain-write substrate. They are
deferred until evidence shows they're needed in real usage.

---

## 11. The promotion KPI

If we were measuring the trust loop's health, the relevant signals
would be:

| Metric | Healthy range (rough) | Unhealthy signal |
|---|---|---|
| Promotion rate | 5–20% of generated facts per area | < 1% (loop unused) or > 50% (over-trust) |
| Median time-to-promote | minutes to hours after generation | days (review backlog accumulating) |
| Demotion rate per month | 1–5% of trusted facts | 0% (no maintenance) or > 20% (over-promotion) |
| Undo rate | < 5% of promotions undone | > 10% (review process broken) |
| Trusted-facts-in-bundle per plan | 3–15 | 0 (loop not engaging) or > 30 (bloat) |
| Per-plan CIS-equivalent | positive | negative or zero |

These are not currently measured by ManthanOS. Phase 3 (observability)
adds the metric extraction; for now, the user gets a feel by reading
`manthan brain stats` and the prompt structure in each plan's audit
blob.

---

## 12. Open design questions

1. **Should the trust-gate be relaxable per workspace?** Some users
   may want auto-promotion in a personal-experiment repo where they
   don't care about audit rigor. Default: never. Adding an
   override would weaken the discipline; declining.
2. **Should multiple humans share promotion authority?** Phase 1.6
   assumes one user per workspace. Multi-user trust governance is a
   team-mode feature (`approver` field exists but is currently
   informational).
3. **Should there be a "preview before promoting" step that shows
   how the next plan's bundle would change?** Cool idea, low-cost
   to build. Phase 2 candidate.
4. **Should signed decisions (T+3) require a debate workflow?**
   That was the original design intent. Now that debate is deferred,
   T+3 signing might happen via a simpler `manthan decision sign`
   flow that just records the user's signature. Re-evaluate in
   Phase 3.

---

## 13. Why this matters

Trust operations are how the project itself learns what it believes.

If we got promotion ergonomics right, daily engineering looks like:
plan → glance at new facts → promote the 2 that matter → continue.
The trusted set grows curated. Future plans inherit the team's
real commitments.

If we got promotion ergonomics wrong, daily engineering looks like:
plan → ignore the facts list → continuity loop empty → forever in
day-1 mode.

The Phase 1.6 evidence shows the first scenario works **when the
user actually does the promotion step**. Phase 2's job is to make
that step low-friction enough that real users do it without thinking
of it as a chore.

This is the actual product work now. Not the next adapter, not the
debate engine. The promotion gate.
