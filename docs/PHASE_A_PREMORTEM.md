# ManthanOS — Phase A Pre-Mortem

> Forensic prediction of how Phase A is most likely to fail despite the
> constitution. Not a risk inventory. Not a planning exercise. A
> document written before authorization on the assumption that
> something will go wrong, predicting what.
> Date: 2026-05-16.

The constitution defines what is permitted. The pre-mortem identifies
what is permitted *and likely to fail anyway*. Authorizing Phase A
without confronting this document would be the same overclaim pattern
stabilization was supposed to correct.

This document is hostile to its own project. That hostility is the
point.

---

## 1. Most likely failure path

A narrative, not a list. The probable arc:

**Weeks 1–4: Phase 3 redesign drifts toward feasibility instead of
correctness.** The author begins sourcing a corpus per §7.1. The
public-OSS-at-a-fixed-commit path is the easiest. The author selects
a project they find interesting and accessible — say, a mid-sized
TypeScript library or a CLI tool. They tell themselves the selection
is independent because they didn't write the code. But the
selection itself was guided by a hundred small judgments about what
would produce a clean signal: code that's well-structured enough to
have findable architectural decisions, a domain the model
understands, a size that fits in the context budget. Selection is
curation in disguise.

Brief authoring drifts similarly. The author asks an LLM (not GPT-5,
because that's the test model; some other LLM) to write briefs
against the codebase's surface. The LLM writes plausible briefs. The
author looks at them and lightly edits the ones that "don't make
sense." Editing is curation.

By week 3, the design is "good enough." The author tells themselves
external review will catch any remaining issues. External review
isn't scheduled yet. Sub-phase 1's stopping criterion (week 3 hard
stop without reviewer approval) is approaching; the author extends
informally for "just a few more days." This is the first §6 erosion.

**Weeks 4–8: Recruitment becomes the bottleneck.** §5.2 budgets 6
weeks for recruiting up to three engineers. By week 6, zero
engineers have signed on. Engineers who would be useful (mid-career,
working on real codebases, willing to write down architectural
decisions in their tooling) have no incentive to commit 4 weeks to
a research-grade prototype.

The author lowers the bar. "Even one engineer for a partial
observation" becomes the new target. The eventual recruit is
unusually disciplined — possibly someone who has already maintained
TODO comments meticulously, possibly a junior engineer who hasn't
yet developed the resistance to extra tooling that senior engineers
have. Either way, n=1 with non-representative subject.

**Weeks 8–14: Execution produces ambiguous data.** The redesigned
Phase 3 runs. The n=1 user maintains the trust queue for 3 weeks
then drops to occasional review. Blinded rubric review shows a
small effect in the expected direction on two of three task
classes. Statistical power is insufficient to call the result
clean. CpT, computed honestly, is roughly neutral.

The author writes the Phase A results document. It is forensic and
honest. It records the effect as exploratory signal under §8.2 —
which means it cannot enter README or POSITIONING. §11.4 (Path D
freeze) is the constitutionally-correct exit.

**Weeks 14–16: §11.5 indecision pressure.** The author finds the
exit hard to accept. The mechanism *does* seem to work, just not at
the threshold the constitution requires. The temptation is to write
the truth-checkpoint update in language that preserves the option
of "later research." Even one or two sentences of optionality
language ("future work may strengthen the signal") would be enough
to soft-undo Path D.

The constitution requires this temptation to be resisted. Whether
it is resisted is the actual test of Phase A.

**End state:** the most likely outcome is that Phase A produces
another set of well-written stabilization-style documents and does
not resolve Q1. The methodology improves; the empirical question
stays where it was. The substrate's value remains unproven.

### Where optimism bias may still exist

- In believing that "select a real codebase" yields independence
  when selection itself is the curation step.
- In believing that recruiting one engineer is recruiting "a real
  user."
- In believing that 12 weeks is enough to redesign, recruit, run,
  and analyze a behavioral experiment with adequate N.
- In believing that the author can write honestly about a result
  they emotionally want to be positive.
- In believing that the constitutional discipline that produced
  stabilization will hold under the longer time horizons of Phase
  A. Stabilization was 4 days. Phase A is 12–16 weeks. Discipline
  decay is not linear.

### Where constitutional discipline may weaken under pressure

- **The week-4 recruitment deadline.** When 6 weeks have passed
  with no recruits, lowering the bar feels rational.
- **The pre-registration deviation moment.** When partial data is
  in and a small adjustment would produce a cleaner signal, the
  adjustment seems harmless.
- **The blinded-rubric reviewer pool problem.** Finding a true
  external blinded reviewer is hard; "the author can blind
  themselves to labels" is the wrong compromise.
- **The §11.4 freeze decision.** Choosing Path D for a project
  with a working substrate and a charismatic Phase 1.7 result
  feels like overcorrection.

### Where "just one exception" pressure appears

- §7.1: "This OSS project is genuinely independent. I didn't curate
  it."
- §7.2: "The LLM-authored briefs are clearly not influenced by
  training data."
- §7.3: "I'll be a careful blinded reviewer. I won't peek at
  labels."
- §7.7: "This isn't really a pre-registration deviation, just an
  exploratory robustness check."
- §8.1: "This counts as publishable evidence with N=2 if we
  caveat carefully."
- §5.6: "Let's just do E6.1 as well, since the adapter is built."
  (E6.1 is permitted as a side-experiment but the temptation to
  spend a week on it instead of a day is the failure mode.)

Each exception is individually plausible. The cumulative effect of
three or four is the reintroduction of the tautology stabilization
ruled out.

### Where the project may optimize for survivable positive signal

Late in the experiment, when partial data is in. The author notices
that with one specific exclusion — say, dropping the failing task
class — the effect becomes statistically significant. Pre-registration
forbids this; the author knows that; the author writes it as an
"exploratory analysis" that "happens to" use the favorable
exclusion. The pre-registered analysis remains in the paper, but
the exploratory analysis is the one that gets cited internally as
"the result."

This is publication-bias-shaped optimization happening inside a
project that explicitly disavows publication bias. The constitution
cannot prevent it; only external pre-registration on a public
registry can.

---

## 2. Hidden tautology risks

Eight specific paths back to tautology despite §7's safeguards:

1. **Selection of "real codebase" is itself curation.** §7.1
   permits public OSS at a fixed commit. The author chooses which.
   That choice is shaped by what will produce clean signal.
2. **LLM-authored briefs may reflect training-data exposure.** If
   the codebase is in the LLM's training data, the LLM's briefs
   implicitly target areas the model under test already "knows
   about." Cross-LLM brief authoring partially mitigates but does
   not eliminate this.
3. **The author's choice of which facts to promote is curation.**
   The corpus is independent; the briefs are independent; but
   the *trusted layer* is still author-curated through promotion.
   The constitution's trust-gate is the author's hand at promotion
   time.
4. **The chosen task classes may align with where the mechanism
   happens to work.** §7.4 requires three task classes; doesn't
   require them to be drawn from a representative distribution.
   The author picks the three. Phase 1.7 worked on
   architectural-continuity tasks; quietly picking three
   architectural-continuity-flavored task classes is a form of
   corpus selection.
5. **Counter-condition (random facts) construction is
   author-determined.** What counts as "random" — facts from a
   different codebase, randomly-permuted facts from the same
   codebase, synthetic noise facts? The choice changes the
   strength of the counter-condition. Without a pre-committed
   definition, the author can choose the version that produces
   the best contrast.
6. **The rubric items may align with effects the mechanism
   produces.** "Did the output reference architectural
   commitments?" is a rubric item the mechanism is designed to
   improve. Even pre-registered, a rubric written by the author
   reflects author intuition about what good output looks like.
7. **Brief-corpus dependency is hard to verify.** A brief must
   "depend on prior plan context" enough that continuity could
   help, but not so much that the dependency is obvious. The
   author calibrates this; the calibration is curation.
8. **The model under test (Claude Sonnet) is the same model the
   author has been working with for months.** The author's
   intuition about what kind of context Claude responds to has
   been trained by extensive prior interaction. This is not
   tautology in the strict sense, but it is selection bias on the
   *model* that's analogous to selection bias on the corpus.

The honest read: §7 reduces tautology but cannot eliminate it.
External red-team review of the design is the only meaningful
mitigation. See §11.

---

## 3. Reviewer-contamination risks

How blinded evaluation may leak signal:

- **Style differences detectable by writing pattern.** Healthy-
  workspace outputs tend to be more specific, more referential,
  longer. Skilled reviewer notices and infers condition.
- **Specific terminology maps back to corpus.** If "httpOnly
  cookies" appears in an output but not in the brief, the
  reviewer can infer the workspace had a fact about it.
- **Token count is a tell.** Healthy outputs tend to be longer.
  Length distribution alone correlates with condition.
- **Author serves as reviewer.** The constitution doesn't
  explicitly forbid this. It should. The author recognizes their
  own promoted facts in outputs.
- **Reviewer's prior project knowledge.** If the reviewer knows
  ManthanOS exists, they apply that frame. Eliminated only by
  recruiting a reviewer from outside the project's network.
- **Label scheme leakage.** If labels (A1, A2...) are assigned
  in run order, the labels map directly to conditions. Random
  label assignment with a sealed mapping is required and easy to
  forget.
- **Multi-reviewer contamination.** Even one casual "I think
  output 7 mentioned OAuth a lot" leaks signal between reviewers.
  Reviewers must be sequestered.
- **Time pressure on the reviewer.** A rushed reviewer scores
  correlated within sessions, producing false structure that
  looks like effect.
- **Document author's own facial expressions / verbal cues.** If
  the author is in the same room while the reviewer scores, the
  author's reactions to specific outputs leak condition. Remote
  scoring with no real-time author contact is required.

§7.3 names blinding but does not enumerate the contamination
vectors. The constitution should be hardened — see §11.

---

## 4. CpT failure modes

Eight specific ways CpT measurement may become misleading:

1. **Numerator-denominator manipulation.** "Useful output" is
   rubric-scored; cost is token-counted. Each can be redefined.
   The constitution requires the units be stated; it doesn't
   require them to be locked at pre-registration.
2. **Bundle-cost-vs-call-cost confusion.** The trusted-facts layer
   adds tokens. CpT must include them. A naive computation that
   compares "useful output gain / bundle-token delta" is the wrong
   ratio.
3. **Counter-condition not actually neutral.** Random facts add
   the same bundle cost but no useful output. CpT for random is
   strongly negative. Comparing trusted-CpT vs random-CpT looks
   favorable but tests "any structured context vs no context," not
   "trusted vs no context."
4. **Per-task variance hidden in aggregate.** Mechanism helps on 2
   of 3 task classes, hurts on 1. Aggregate CpT looks positive.
   The defensible claim is per-task-class, but the headline is
   the aggregate.
5. **"Useful" definition drifts during scoring.** Rubric items
   are interpreted variably across the corpus. Scoring drift
   shifts CpT measurements without anyone noticing.
6. **Ratios behave weirdly at low denominators.** Tasks where the
   model fails regardless of condition have near-zero useful
   output. CpT computations become unstable. Removing them is
   post-hoc filtering. Pre-registration must specify which tasks
   are excluded *before* data collection.
7. **Generalization to "any task" unjustified.** CpT measured on
   three task classes does not generalize. The publishable claim
   is per-task-class. The headline will lose this nuance.
8. **Garden of forking paths.** Without pre-registration of the
   exact CpT formula (numerator definition, denominator
   definition, aggregation method, treatment of outliers), the
   author can choose the formulation that produces favorable
   signal after seeing data.

Hardening: lock the CpT formula in pre-registration, including
specific exclusion criteria for low-useful-output tasks. See §11.

---

## 5. Real-user failure risks

The three usage modes, distinguished:

### Curiosity usage (week 1–2)

**Most likely scenario.** Engineer hears about the experiment,
agrees to try it. Runs `manthan init`. Runs `manthan plan` 2–3
times in the first week. Generates 10–15 T0 facts. Promotes 4–5
out of curiosity ("let me see what this does"). Doesn't run plan
again that week. Returns 2 weeks later. Queue has 30 facts. Doesn't
review them. Drops off.

**Why this fails:** the first-session zero-value problem. The
mechanism's benefit requires accumulated trust to demonstrate;
curiosity users never reach the accumulation point. The mechanism
is asking for upfront investment with deferred payoff. Curiosity
provides upfront investment; it does not provide deferred-payoff
willingness.

### Habitual usage (week 2–4)

**Less likely but possible.** Engineer keeps using `manthan plan`
because the structured output is useful even without continuity.
Doesn't run `brain review` because nothing prompts them to. Queue
fills. Engineer accepts the queue as a constant background cost
("I'll get to it later"). Trust layer stops growing in usefulness.

**Why this fails:** habit forms around the command with immediate
output (the plan), not around the command with deferred output
(the review). The plan command's habit becomes self-sustaining
without the review command's habit forming alongside. The
mechanism mechanically requires both; behavior naturally produces
only one.

### Workflow dependency (week 4+)

**Least likely.** Engineer integrates `manthan plan` into a
regular workflow. Possibly maintains a small trusted layer of
manually-promoted facts from week 1. Then real work pressure
increases. Plan invocations continue; review sessions become
rarer. Trust layer freezes around early-week facts.

**Why this fails:** workflow dependency forms around the part
that produces visible value (the plan output). The review loop,
being deferred-value labor, is the first to be dropped under
load. The trust layer's currency decays even though the
mechanism is technically being used.

### Aggregate prediction

Across the three modes: the realistic distribution is heavily
skewed toward curiosity (~70%), some habitual (~25%), almost no
workflow dependency (~5%). The constitution's product-success
threshold (§3.2) is set at workflow-dependency-equivalent — ≥4
weeks sustained + ≥0.3 promotions/workflow + unprompted
continuation. The bar will not be cleared by curiosity users; will
not be cleared by habitual users either, because habitual users
don't maintain the queue.

Real-user failure is more likely than not. The constitution
should plan around this rather than assume away.

---

## 6. Mechanism-creep pressure points

Where the strongest temptation for new mechanism work will emerge.
Each is named so it can be refused.

- **First-session zero-value problem.** When a real user reports
  "the first session feels useless," the temptation will be to
  build a bootstrap-from-existing-docs feature. *Forbidden.*
- **Queue-initiation problem.** When users don't open `brain
  review`, the temptation will be to build an editor plugin,
  notification system, or automatic-promotion heuristic.
  *Forbidden.*
- **Cross-task-class generalization gap.** When CpT works on bug-
  fix but not on refactor, the temptation will be "task-class-
  aware shaping." *Forbidden.*
- **Random-facts counter-condition variance.** When random-facts
  produce high-variance outputs, the temptation will be
  "semantic-relevance filter for trusted facts." *Forbidden.*
- **UUID complaints.** Real users will hate `fact_a902ae61-…`.
  Temptation: slug-based handles. *Forbidden — feature work.*
- **Bundle-size friction.** When the bundle is too large for one
  model, temptation: smarter shaping. *Forbidden — shaping is
  frozen.*
- **Phase 1.7 reproduces only with specific fact compositions.**
  Temptation: a "trust-fact recommender." *Forbidden — this is
  auto-promotion in disguise.*
- **Audit schema seems to need new event types.** Temptation:
  extend the schema. *Forbidden unless behavior-blocking bug.*
- **Long-horizon re-run shows interesting patterns.** Temptation:
  more long-horizon variants. *Forbidden — §5.3 permits one re-run.*
- **The constitution itself feels too restrictive.** Temptation:
  write an addendum that loosens §6. *Forbidden — addenda are for
  evidence-backed deviations, not for relieving constitutional
  pressure.*

The constitutional discipline cannot be saved by the constitution.
It is saved or lost by the author's response to each of these
pressure points in real time.

---

## 7. "False positive" scenarios

Phase A appears successful while the underlying question fails:

a) **Effect detectable but small, on a single task class.** Author
   reports "continuity helps on architectural-continuity tasks!"
   The reported claim is narrower than the project's positioning
   claim. False match between phase result and project thesis.
b) **Real-user subjective endorsement without behavioral signal.**
   User says "I'd use this again." Trust-queue maintenance rate
   is 0.05 promotions/workflow. Subjective endorsement is
   uncorrelated with measurable usage. The constitution requires
   *both* a continuation statement *and* behavioral metrics; under
   pressure, only one might be present and the result still gets
   framed as success.
c) **Effect comes from bundle structure, not trust gate.** Random
   facts and trusted facts both beat empty. Trusted-vs-random
   shows small effect. The mechanism does not specifically
   require trust gating; any structured prior context suffices.
   This is a real result, but it's a different result than the
   project's positioning claim.
d) **CpT positive at one budget but negative at others.** Author
   finds the sweet spot. Generalization fails outside it.
e) **Effect is real but model-specific.** Result holds for Claude
   Sonnet. Doesn't transfer to other Sonnet snapshots. The product
   claim implicitly requires generalization.
f) **n=1 user is unusually disciplined.** Process-discipline
   enthusiast maintains queue for 4 weeks. Doesn't represent
   typical engineers.
g) **Operational success without research success.** The phase
   runs on schedule, captures artifacts cleanly, externally
   reviewed — but produces a null result. The constitution treats
   this as legitimate. Under pressure, the operational artifacts
   may be cited as evidence of "what Phase A produced," softening
   the null.

---

## 8. "False negative" scenarios

Phase A appears to fail while the idea has value:

a) **Wrong task class.** Phase A's three task classes don't include
   the one where continuity actually helps (long-arc migration
   planning, multi-week refactor coordination). Result is null;
   idea is undervalued.
b) **Briefs not sufficiently dependent on prior context.** If
   briefs are too independent, no continuity is needed; mechanism
   has nothing to do.
c) **Rubric measures the wrong thing.** Continuity affects
   architectural consistency; rubric measures code correctness.
   The signal exists but the instrument doesn't see it.
d) **Recruited user outside target audience.** Junior engineer or
   AI-tools newcomer doesn't have the mental model the mechanism
   supports.
e) **Low-N substrate bug.** Step 1 fixed three; more may exist.
   A bug surfacing during execution masks the effect.
f) **Distribution shift in the test codebase.** Codebase's
   semantic distribution differs significantly from codebases
   where continuity helps. The mechanism is real; the test
   conditions are wrong.
g) **Trust-queue maintenance fails for non-mechanism reasons.**
   Recruited engineer's workflow demands; substrate would have
   worked if maintained.
h) **External review rejects design as still tautological** even
   though the corpus is genuinely independent. Appearance of
   tautology is enough for rejection in a hostile review.

The asymmetry to note: false-negative scenarios are not
distinguishable from real-negative scenarios using only Phase A's
data. A null result *should* be treated as a real negative; the
project should not console itself with false-negative possibilities
unless an external party (not the author) independently identifies
the false-negative explanation.

---

## 9. What would actually convince a skeptical external reviewer

A genuinely skeptical outsider — a senior researcher in HCI or
AI-assisted programming, no investment in ManthanOS — would require
some combination of:

1. **Independent replication.** Another team runs the experiment
   on different corpus + different briefs + different model.
   Directionally-consistent effect.
2. **Pre-registered analysis followed without deviation.**
   OSF-style pre-registration before data collection. No
   exploratory analyses that conveniently produce favorable
   results.
3. **Counter-condition shows null.** Random facts ≈ empty. This
   is what makes "trusted facts work" a non-trivial finding.
4. **Real-user evidence with N > 5 sustained over months,** not
   weeks. Behavior, not subjective endorsement.
5. **Cross-task-class generalization.** Effect appears on
   multiple task classes, not just architectural-continuity-style.
6. **Cross-model demonstration.** Effect transfers to at least one
   other provider with proper adapter quality.
7. **An articulated mechanism for HOW the effect occurs.** Not
   just "trusted facts help"; specifically what cognitive
   operation the trusted facts enable.
8. **Comparison against a trivial baseline.** "Inject the last
   plan's verbatim text into the next prompt" — does this work as
   well as the trust-tier system? If yes, the trust tier is not
   load-bearing.
9. **Real economic impact data.** Token cost vs developer-time
   saved. Hard to measure but possible with discipline.
10. **Open peer review.** Data and analysis are open; outside
    reviewers can re-analyze.

A reasonable skeptic would require at minimum items 2, 3, 4, and
8. Phase A budgets achieve only 2, 3, and partially 4. Items 1, 5,
6, 7, 9, 10 require additional phases or external resources Phase
A does not control.

**The honest read:** Phase A, even on its best day, will not
produce a result that fully satisfies a skeptical external
reviewer. The strongest plausible Phase A outcome is "evidence
strong enough to justify the next phase," not "evidence strong
enough to defend the claim."

This is not a criticism of Phase A. It is a calibration of
expectation. Phase A is the *cheapest* next move toward an
externally-defensible claim; it is not by itself that claim.

---

## 10. Early warning indicators

Signals Phase A is drifting before §4 fires:

- **Weekly check-in language softens.** "Still working on corpus
  selection" appearing in weeks 3, 4, 5 without specific
  progress markers.
- **"Just one more week" appearing in sub-phase planning.** Any
  request to extend without invoking §10 formally.
- **Recruitment fallback language.** "Even one engineer for a
  partial observation would help" — this is the moment the
  product-success bar starts to lower.
- **Rubric design shifts post-design.** Any rubric item added or
  modified after pre-registration. Should be flagged immediately.
- **"Exploratory analyses" appearing in writeups.** Especially:
  analyses computed after seeing partial data.
- **Sub-phase budget overruns ≥25%.** Without explicit §9
  reassessment trigger.
- **Hedging language in artifacts.** "Considerations,"
  "nuances," "qualifications" — these are negotiation language.
- **"Next phase" discussion before Phase A closes.** Premature
  forward-looking is avoidance.
- **Real-user feedback categorized as "edge case."** Data points
  re-classified as outliers post-collection.
- **The phrase "the mechanism really does work, the experiment
  just isn't showing it."** This sentence, in any artifact, is
  a hard stop.
- **Pre-registration documents being edited.** Any edit, even
  formatting. Edits to a pre-registration are deviations.
- **§6 prohibitions being rationalized.** "This isn't really
  mechanism work, it's just X" — X is mechanism work.
- **A new addendum to the constitution.** Addenda are
  occasionally legitimate; their frequency and timing predicts
  drift. More than one per month is suspicious.
- **Reduced weekly check-in frequency.** Missing a check-in
  means the check-in would have been uncomfortable. The
  uncomfortable check-in is the one the project most needs.

---

## 11. Hardening recommendations

Procedural only. No new mechanisms. No new architecture. No new
features. These are amendments to the constitution that should be
adopted before authorization.

1. **External corpus and brief sourcing.** Require an external
   party (not just an LLM) to sign off on the corpus and brief
   independence. A second engineer reads the briefs and the
   corpus's surface; if they can guess the engineered facts, the
   design fails. Add to §7.1 / §7.2.
2. **Pre-register on a public registry** (OSF, Aspredicted.org)
   before any data collection. Timestamped externally. Deviations
   visible. Add to §7.7.
3. **External blinded reviewer.** Not the author. Not anyone with
   project knowledge. Hire a freelancer at a defined hourly rate
   to score outputs. They get the rubric and labeled outputs; no
   context. Forbid author as reviewer in §7.3.
4. **Commit to open publication.** All Phase A data and analysis
   published once the phase closes, regardless of result
   direction. Removes publication-bias-shaped optimism. Add to
   §8.1.
5. **Mandatory red-team pass before authorization.** Run the
   redesigned Phase 3 design through a skeptical reviewer (e.g.,
   /octo:review with sharper adversarial prompt). Reviewer's job
   is to find tautology risks. If found, fix and re-review. Add
   as a prerequisite to §13 authorization.
6. **Hard stopping criterion for sub-phase 1.** If Phase 3
   redesign has not produced reviewer-approved design by week 3,
   terminate the phase entirely. Don't extend; don't push to
   week 4. Add to §10.
7. **Explicit gating between sub-phases.** Sub-phase 2 cannot
   begin until sub-phase 1's design is externally approved.
   Sub-phase 3 cannot begin until sub-phase 2's recruitment
   produces ≥1 signed-on user with written commitment. Add to
   §10.
8. **Weekly check-ins externally received.** Not for content
   review, just to ensure they're written. Missing check-ins
   trigger immediate §9 review. Add to §5.7.
9. **Pre-commit to the exit-condition transitions.** Reduce §11
   to a decision tree with locked numeric thresholds before
   the phase begins. No interpretation latitude at decision time.
10. **Forbidden language list.** "Promising," "interesting,"
    "suggests," "shows" — any non-quantified language about
    results is replaced with measurements. Add to §8.
11. **Mandatory mid-phase adversarial review at week 6.** A
    truth-checkpoint-style critique by an external reviewer
    different from sub-phase 1's reviewer. Checks for drift
    since start. Add to §9.
12. **Lock the CpT formula in pre-registration.** Numerator
    definition, denominator definition, aggregation method,
    treatment of outliers, exclusion criteria. Add to §7.5.
13. **Forbid the author from serving as reviewer in ANY capacity.**
    Even for the rubric instrument design, require external
    review. Add to §7.3.
14. **Two-track artifact lifecycle.** Phase A produces both a
    Phase A results document AND a pre-registration document.
    The pre-registration is timestamped before any data. The
    results document is timestamped after. Diffing them surfaces
    deviations.

These 14 amendments should be incorporated into PHASE_A_CONSTITUTION
before authorization, not after.

---

## 12. Final pre-mortem verdict

Given current evidence and constitutional structure, the most
likely Phase A outcome is **operational discipline holds, but
empirical evidence does not reach external-reviewer threshold.**
The phase produces another set of well-written stabilization-style
documents recording what was attempted, what failed, and what
remains unproven. The author's discipline is the limiting factor
in either direction: discipline strong enough to refuse exceptions
will produce a null or marginal result that the constitution
correctly classifies as exploratory; discipline weak enough to
accept exceptions will produce a flattering result that the
constitution correctly disallows from public use. In either case,
the project's epistemic position at the end of Phase A is similar
to its position at the start of Phase A — the methodology
improves, the substrate gains nothing new, the open question stays
open. The probability that Phase A produces an externally-defensible
positive answer to Q1 within the 12–16 week budget is approximately
**10–15%**, dominated by the difficulty of non-tautological
experimental design, the unlikelihood of recruiting and sustaining
real users, and the structural asymmetry between what the
constitution requires for evidence and what a skeptical external
reviewer would accept. Phase A is still the right next phase —
because it is the cheapest path toward an evidence-backed answer
in any direction — but its primary value is more likely to be
methodological than empirical. Authorize accordingly.

---

*End of pre-mortem. This document predates Phase A authorization
and is itself part of the authorization gate. If §11's hardening
recommendations are not adopted, the predicted failure path
becomes more likely, not less.*
