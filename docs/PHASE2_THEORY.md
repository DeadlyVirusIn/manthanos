# ManthanOS — Phase 2 Theory

> Why hygiene is not maintenance work. It is the mechanism that
> determines whether continuity compounds or collapses under realistic
> long-term usage.
> Status: theory, written before implementation.
> Last revised: 2026-05-16.

---

## 1. The premise

Phase 1.7 proved the continuity loop works in microcosm — three
carefully-chosen facts, two related tasks, one model. The model
visibly used the facts. The drift was measurably reduced.

That result is real and it remains the project's strongest claim.

But Phase 1.7 was a clean-room demonstration. **Real usage looks
different.** A team using ManthanOS for six months on the same
codebase will not have three promoted facts. They will have eighty.
Maybe two hundred. Spread across a dozen areas. Half re-stating the
others in paraphrase. A handful subtly contradicting each other.
Several promoted three months ago by an engineer who now disagrees
with them. A few that match no current code because the codebase
moved on.

The Phase 1.7 mechanism — *trusted facts shape the next prompt* —
does not become weaker at scale. It becomes louder. **And that is
the problem.**

If every plan's bundle carries 80 promoted "facts," the model gets
80 priors of mixed quality. Some help. Some hurt. Some contradict
the current code. Some no longer apply. The continuity loop
stops compounding clarity and starts compounding noise.

**Phase 2 is the work that decides which of those two futures we get.**

This is not maintenance. This is whether the product survives.

---

## 2. The four entropy mechanisms

A trusted-facts brain decays along four distinct axes. Each has a
separate failure mode. Each requires a separate counter-mechanism.
None of them is optional at scale.

### 2.1 Brain entropy — information decay

Without active hygiene, the brain accumulates:

- **Near-duplicates.** "Sessions use httpOnly cookies" and "Sessions
  kept in httpOnly cookies" both land at T0 from different plans.
  Both get promoted. The trusted set inflates without new signal.
- **Stale facts.** A fact promoted in January about "we use Postgres"
  remains in every prompt in July, after the team migrated to SQLite.
  The model now has a confidently wrong prior.
- **Orphaned context.** Facts whose originating workflow has been
  forgotten, whose rationale no human can reconstruct. The trust
  tier says T+1 but the human meaning is gone.
- **Subtle contradictions.** "Express 4.x" and "Fastify (preferred
  going forward)" both promoted, both visible, neither resolved.
  The model gets to pick.

Entropy compounds. Three months of unmanaged accumulation is harder
to repair than two weeks. By the time the human notices the brain
is "kind of a mess," repair becomes a multi-hour project, and most
users will choose to abandon the brain rather than fix it.

**The Phase 2 counter-mechanisms:**

- Normalized-text dedup (`manthan brain dedup`)
- Decay rules tied to `last_corroborated` (`manthan brain age-facts`)
- Supersession ("this old fact is replaced by this new fact")
- Contradiction surfacing (informational, human-resolved)

Each is small. Together they bound entropy. Without them, entropy is
unbounded.

### 2.2 Trust fatigue — attention decay

Every promotion costs human attention. The Phase 1.7 experiment had
the human (me) review three facts carefully, read each statement,
decide deliberately. **That model does not scale to 30 facts per day.**

At 30 facts per day, the human starts:

- Scrolling past statements without reading.
- Pattern-matching ("looks like an OAuth fact, sure") instead of
  evaluating.
- Batch-approving via `--yes` because the prompt friction has become
  annoying.
- Letting the review backlog grow until "I'll do it later" becomes
  never.

**When the human stops actually reading what they promote, the trust
gate has failed even though every command still executes cleanly.**
The brain still accumulates "trusted" facts. The model still injects
them. But the human signal that was supposed to be the discriminator
is gone. The system now operates without its essential ingredient
and no error is raised.

This is the most dangerous failure mode because it is invisible.
The audit chain still verifies. The promotion events are still
written. Nothing looks broken. The product is silently degrading.

**The Phase 2 counter-mechanisms:**

- Bulk interactive review (`manthan brain review`) with grouping +
  dedup so 30 raw facts collapse to 10 distinct decisions
- Inline promotion shortcuts in `manthan brain facts` so the cost
  per decision drops from "open another command" to "press p"
- Promotion-rate visibility (Phase 3) so the human can see when
  their own approval rate is climbing into "rubber stamp" territory

These are not UX polish. They are the mechanism that keeps the
trust gate functioning as a gate.

### 2.3 Prompt pollution — signal-to-noise decay

At scale the bundle bloats. Three facts at 60 tokens each is 180
trusted tokens — Phase 1.7 numbers, healthy ratio. **Eighty facts at
60 tokens each is 4,800 tokens** of historical commitments competing
with current code, current diff, current task brief.

Two distinct problems emerge:

- **Context-window pressure.** At 4,800 trusted tokens, the source
  files and git diff start losing budget. The packer's drop-order
  policy protects the trusted layer first — meaning the model sees
  the historical commitments but cannot see what changed yesterday.
  Continuity preserved; situational awareness lost.

- **Attention dilution.** Even with infinite context, the model's
  attention does not scale linearly with prompt size. A single
  critical commitment buried in fifty pages of fact list is
  effectively invisible. The Phase 1.7 evidence showed Claude
  citing `[T+1 fact]` in its output — that observability depends on
  the fact actually receiving attention. At 80 facts, attention is
  diluted to the point where the citation behavior may disappear.

**The Phase 2 counter-mechanisms:**

- Fact compression at render time — collapse paraphrases into a
  single canonical statement before injection.
- Adaptive bundle shaping — when trusted-set exceeds a budget,
  surface only facts in the task's area + recent corroborations.
- Promotion ceiling per area (a soft warning at N=20 trusted facts
  per area, suggesting consolidation).
- Anti-bloat KPI tracking (next section).

### 2.4 Promotion friction — engagement decay

A subtler version of trust fatigue: even when promotion is cheap,
the *integration into the daily workflow* matters. If the user has
to `manthan brain facts | grep oauth | manthan brain promote ...`
through a chain of commands, the loop becomes an annoyance.
Engagement drops. Quarantined facts accumulate unreviewed. The
trusted set becomes a snapshot of "what I cared about in the first
week," not "what is true now."

The opposite failure: if promotion is too cheap (no friction at all),
trust fatigue (§2.2) takes over.

The right design lives at a specific tension: **promotion must be
fast enough that the user does it daily, but slow enough that the
user reads what they promote.** Phase 2 must find this point
empirically.

**The Phase 2 counter-mechanisms:**

- Inline-from-`brain facts` `[p]romote` shortcuts (single keystroke,
  forces the fact to scroll past the human's eyes first)
- `manthan brain review --area X` as a 5–10-minute weekly ritual
  rather than a daily interruption
- Provenance display by default so the user can answer "where did
  this come from?" without leaving the review session

---

## 3. Continuity-per-token (CpT) — the unified KPI

The four entropy mechanisms above all hurt the same thing, measured
differently. They all reduce the **ratio of useful output reflecting
trusted facts to the token cost of carrying those facts in the
bundle.**

Definition:

```
CpT = (output tokens that visibly cite or build on trusted facts)
    / (trusted-layer tokens in the bundle)
```

Phase 1.7 evidence: B1 produced ~1356 more output tokens than B0,
of which ~42% (call it 569 tokens) was structural plan content
tracing to the 3 promoted facts (185 trusted-layer tokens). Implied
CpT ≈ **569 / 185 ≈ 3.1**. Each trusted token paid back roughly 3
tokens of project-specific useful output.

This is healthy. We do not have data on what CpT looks like at scale.

What we know mechanically:

- **At zero promoted facts** (empty trusted layer): CpT is undefined
  (zero denominator). The loop is not active.
- **At 3 well-chosen facts** (Phase 1.7): CpT ≈ 3.
- **At 80 unmanaged facts**: CpT could fall to ≈ 0.1 or below as
  attention dilutes and most trusted tokens go unread.
- **At ∞ facts**: CpT approaches zero as the bundle becomes
  pure prior with no model attention left for the actual task.

There is **some optimum** — probably in the 5-to-15 facts range per
relevant area — beyond which adding more trusted facts produces
diminishing or negative CpT.

**Phase 2's job is to keep CpT in the healthy range as the brain
ages, without requiring the user to think about CpT directly.** The
dedup, decay, compression, and adaptive-shaping work all exist to
preserve this ratio under accumulation.

In Phase 3 we want to actually measure CpT in real workspaces.
Today, we cannot. The instrumentation is small but does not yet
exist.

---

## 4. The actual test for Phase 2

The Phase 2 deliverables in `MVP_ROADMAP.md §4` are not the test.
They are the *prerequisites* for the test. The test itself is a
single empirical question:

> **At an aged workspace state (50+ promoted facts spread across
> 5+ areas, with realistic accumulation patterns including
> paraphrase, decay candidates, and a planted contradiction), does
> the continuity loop still produce a positive CpT against an
> appropriately matched task?**

If yes: the loop survives long-horizon usage. The narrowed Phase
1.7 thesis generalizes.

If no, but CpT recovers after running `manthan brain dedup +
age-facts + review`: hygiene works mechanically; the discipline is
required.

If CpT remains low even after hygiene passes: the loop's value is
**fundamentally short-horizon**. The product is real but its window
is "this week's work," not "this year's project." That outcome is
acceptable; it just means the project narrows further to a sharper
short-horizon framing.

This experiment cannot run until at least the dedup + age-facts +
adaptive-shaping deliverables ship. **That is the actual reason
Phase 2 exists.** Not to make the brain prettier. To make the
brain measurably valid under aging.

---

## 5. Brain-aging simulator (the unblocking tool)

We cannot wait six months to test long-horizon continuity. Phase 2
must include a small **brain aging simulator** — a deterministic
tool that injects N representative facts into a clean workspace's
brain, dated and tagged as if they accrued over weeks of real
usage.

Inputs:
- A fact corpus (extracted from the Phase 1.7 / E6 experiment
  archives, plus a few hand-crafted hard cases)
- An aging curve (`--span-weeks 8 --promote-rate 0.2`)
- A target area distribution

Outputs:
- A populated workspace with realistic-looking T0 and T+1 facts
- A planted contradiction or two for stress-testing hygiene
- An audit chain consistent with the simulated history

This is a Phase 2 deliverable. Without it, the test in §4 cannot
be run in any reasonable timeframe. The simulator is itself
falsifiable: if real usage at 50 facts looks materially different
from simulated usage at 50 facts, the simulator is wrong and we
update it. That is a strictly better failure mode than waiting six
months.

---

## 6. Architectural cleanliness for E6.1

Per the strategic interpretation: Phase 2 must preserve future
optionality for cross-model continuity experiments **without
expanding scope toward orchestration.** Concretely, while shipping
Phase 2:

1. **Continuity-packet format stays provider-neutral.** The
   trusted_facts layer's rendering already uses generic tier +
   provenance tags ("`[T+1 · oauth · conf=0.70 · src=wf_…]`") —
   nothing Claude-specific. Keep it that way. Resist any
   provider-specific token injection (e.g. Claude-flavoured XML
   delimiters) unless evidence demands it.

2. **Trust semantics stay generic.** The six tiers, the
   confidence-from-tier map, the audit-event shape — all of these
   need to work for any provider that gets tested in E6.1.

3. **Adapter contract stays simple.** The `AgentAdapter` interface
   in `@manthanos/adapters-sdk` is already provider-neutral. Phase
   2 should not add Claude-specific methods.

4. **Rendering layer stays modular.** The packer's render functions
   should be swap-able if a future Codex or Gemini adapter requires
   a different layer format. They already are; preserve that.

5. **What NOT to build in Phase 2:**
   - No orchestration logic.
   - No multi-provider routing.
   - No CLI-vendor-specific workarounds.
   - No autonomous handoff.
   - No expansion of the Codex / Gemini experimental adapters.

This is preservation, not expansion. Every line of Phase 2 code is
judged by "does this strengthen continuity-loop survivability?" If
it does, ship it. If it only enables a hypothetical future feature,
defer it.

---

## 7. What success looks like, concretely

A user runs ManthanOS for two months on their real project. After
two months:

- Their brain has ~40 promoted facts across 6 areas.
- `manthan brain stats` shows a healthy tier distribution (most at
  T+1, a few at T+2 from corroboration, two or three signed at T+3).
- Their daily promotion review takes ≤5 minutes.
- Their `manthan plan` for new tasks consistently produces
  project-specific output that references prior commitments.
- The contradictions table has 1–2 surfaced items they reviewed and
  resolved.
- No facts have been dropped, decayed silently, or auto-promoted.

At that point — without us doing anything more — the user is
experiencing the long-horizon version of the Phase 1.7 finding. The
loop compounds. The product is real.

If after two months instead:

- Their brain has 200+ facts (most never reviewed).
- The trusted set is full of duplicates and stale commitments.
- Plans start ignoring or contradicting trusted facts (the model's
  attention is diluted).
- The user has stopped running `manthan brain review`.

Then Phase 2 did not solve what it was meant to solve. We narrow
further: ManthanOS is a "first month" tool, not a "running project"
tool. We say so honestly.

Both outcomes are acceptable. The truth is determined by Phase 2's
execution and a real test, not by today's optimism.

---

## 8. The discipline that has held

The pattern that has made this project credible:

- Phase 1 / 1.5: substrate first; no AI claims until measured.
- Phase 1.6 / 1.7: trust loop empirically validated; framing
  narrowed *immediately* on evidence.
- E6: cross-model probe; **broader framing refused** when evidence
  did not support it.
- Phase 2 (now): hygiene tested before scaling; brain-aging
  simulator built to make the test runnable.

The next moment that will test the discipline is the result of
Phase 2's actual experiment. If CpT looks good at scale, we will
be tempted to extrapolate further. If it looks bad, we will be
tempted to defend the broader thesis anyway. **Neither temptation
should be indulged.** The narrow truthful product remains stronger
than the grander unproven one.

That is the principle Phase 2 must protect.

---

## 9. Summary

| Mechanism | Failure mode | Phase 2 counter-mechanism |
|---|---|---|
| Brain entropy | duplicates, stale facts, orphans, subtle contradictions | dedup, decay, supersession, contradiction surfacing |
| Trust fatigue | human stops reading what they promote | bulk review + grouping + inline shortcuts |
| Prompt pollution | bundle bloats; signal dilutes | compression, adaptive shaping, per-area ceilings |
| Promotion friction | user disengages from the loop | inline UX, weekly-ritual review pattern |

Single unifying KPI: **continuity-per-token (CpT)** in the healthy
range across aged workspace states.

The actual Phase 2 test: **does CpT survive an aged brain?** Run
it. Report honestly. If yes, the thesis generalizes to long-horizon
usage. If no, the thesis stays short-horizon and we narrow the
product further.

The mechanism that produced this document — narrowing the claim to
what evidence actually supports — is itself the most valuable thing
the project has built. Protect it.

---

## Appendix — Stabilization §3.1 reinterpretation (added 2026-05-16)

A correctness bug in the decay engine (`packages/orchestrator/src/decay.ts`)
was identified during the /octo:review pass and fixed under
Stabilization §3.1. Before the fix, `last_corroborated` was overwritten
by every administrative mutation (decay event, dedup-supersede,
human demotion, human undo). Decay computed staleness against
`last_corroborated` and therefore measured "time since any
administrative touch" rather than "time since corroboration."

What this means for the empirical claims earlier in this document:

- **The qualitative shape "the substrate self-bounds" survives.** Decay
  and dedup do exert downward pressure on the trusted layer; that is
  visible in the audit-event sequence of the long-horizon runs and is
  not bug-dependent.
- **The quantitative figure "~1500 trusted tokens at equilibrium" does
  not survive as a substrate property.** Under the bug, every decay
  event reset the affected fact's clock, so decay was self-limiting
  in a way that flattered the plateau. Under corrected semantics a
  re-run of Run A is expected to equilibrate **lower** than 1500
  tokens on the same workload. The "1500 tokens" is a
  workload-and-bug-specific number; do not cite it as a substrate
  finding.
- **`staleRatio = 0.0%` at the end of the long-horizon runs was an
  artifact** of the bug. Promotions and intervening events bumped
  `last_corroborated`, masking true age-since-corroboration.
  Re-running with corrected semantics is expected to surface non-zero
  stale ratios for cycle-1 facts at week 26.
- **The "decay materially counters accumulation" finding survives at
  the qualitative level.** Decay events fire; trusted tokens come back
  down after corpus injections. The magnitude of that effect is now
  expected to be larger than the long-horizon JSONL recorded, because
  the bug's self-limiting ratchet was suppressing repeat-decay on the
  same facts.

The long-horizon experiment has not been re-run under corrected
semantics. Until it is, prior magnitude numbers should be cited as
"observed under the pre-stabilization decay semantics," not as
substrate properties. Authorization to re-run is a separate decision,
not part of Stabilization. See `docs/TRUTH_CHECKPOINT.md` §1.6 and
§2.10 for the prior framing; this appendix is the post-fix
re-interpretation.
