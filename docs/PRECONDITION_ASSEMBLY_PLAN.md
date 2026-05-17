# ManthanOS — Precondition Assembly Plan

> Bounded operational plan for the DELAY window between
> 2026-05-16 and 2026-06-13. Holding pattern only. Not a research
> phase. Not Phase A in disguise.
> Date: 2026-05-16. Window: 4 weeks. Hard deadline: 2026-06-13.

The DELAY verdict in `PHASE_A_AUTHORIZATION_DECISION.md` permits one
class of work: assembling the six preconditions that gate Phase A
authorization. This document governs that work. Any activity not
explicitly permitted under §2 is unauthorized regardless of intent.

---

## 1. Objective

Assemble or fail the six authorization preconditions from
`PHASE_A_AUTHORIZATION_DECISION.md` §7 before 2026-06-13.

---

## 2. Legal work during DELAY

The following classes of activity are permitted. Each is bounded;
each is named so it cannot be expanded by association.

### 2.1 Administrative

- Drafting the constitutional addendum that adds the 13 ADOPT
  hardening amendments to `PHASE_A_CONSTITUTION.md`.
- Drafting a single one-page precondition status tracker.
- Updating this document with weekly check-in notes.

### 2.2 Reviewer outreach

- Identifying candidates for the external red-team reviewer of
  the redesigned Phase 3 design.
- Drafting outreach messages (description of the review task,
  expected effort, compensation if any).
- Sending outreach messages.
- Negotiating and securing a written commitment.

### 2.3 Recruitment conversations

- Identifying candidates for the ≥1 prospective beta user.
- Conducting initial conversations describing the research-grade
  prototype, the participation ask, and the time commitment.
- Securing a written soft-commit from at least one candidate.

### 2.4 Budgeting

- Determining the budget for an external blinded reviewer
  (≥$500).
- Confirming the budget is allocable (not aspirational).
- Recording the allocation in writing.

### 2.5 Pre-registration account setup

- Creating an account on OSF (or equivalent public pre-registration
  platform).
- Posting a minimal placeholder draft that names ManthanOS and
  describes "Phase A — Q1 measurement, design TBD."
- Recording the account URL.

### 2.6 Corpus candidate identification

- Surveying public OSS projects that might serve as the
  Phase 3 corpus.
- Identifying candidates by URL + commit hash.
- Identifying potential non-author brief authors (other engineers,
  LLM-with-no-corpus-access pipelines).
- Documenting the candidate set in the precondition status tracker.

**The line:** identification is legal. Analysis is not. Looking at
a candidate corpus's README and structure is legal. Reading the
codebase to see "what facts could be extracted" is Phase A work
and forbidden under §3.

---

## 3. Illegal work during DELAY

Each of the following is explicitly forbidden. Performing any of
them voids the DELAY and triggers immediate REJECT per §7.

- **Phase 3 redesign execution.** Including: drafting the rubric
  instrument, formalizing hypotheses, selecting task classes,
  defining the CpT formula, designing the random-facts
  counter-condition. Each of these is permitted only after
  authorization.
- **Running experiments.** Including: running `manthan plan`
  against any candidate corpus for the purpose of seeing how it
  performs; running `cpt-probe`; running E6.1 even as a side-
  experiment. E6.1 is permitted under PHASE_A_CONSTITUTION §5.6
  only, and the constitution is in DELAY.
- **Writing briefs.** Any brief authored or co-authored by the
  document author against any candidate corpus.
- **Collecting data.** Any logged output, any captured workflow,
  any benchmark or metric collected against the substrate.
- **Scoring outputs.** Any rubric application, blinded or
  otherwise, to any output produced by the substrate.
- **Substrate changes.** Any code change to `packages/*` or
  `apps/cli/*` beyond minimal fixes for already-known bugs that
  block doctor/init/normal command operation. New mechanisms,
  new commands, new features, refactors — all forbidden.
- **Mechanism work.** Specifically: new hygiene primitives, new
  shaping rules, new audit-event types, new CLI command surface,
  new adapter beyond `adapter-openai` (which is frozen at its
  current state).
- **Side-analysis disguised as "preparation."** This includes:
  re-running the long-horizon simulator "to see what it does
  under corrected decay semantics," running stress tests on the
  shaping module, exploring queue-health behavior on test
  workspaces. These are research activities; they are forbidden
  in DELAY regardless of how they are framed.
- **E6.1 execution.** Bound under PHASE_A_CONSTITUTION §5.6;
  the constitution is in DELAY; therefore E6.1 is also in DELAY.
- **Recruiting beyond the precondition target.** ≥1 beta user is
  the §7.5 minimum; recruiting 5 is not "extra credit," it is
  scope expansion. Stop at one written soft-commit.
- **Drafting Phase A artifacts in advance.** Including: writing
  the rubric instrument, drafting the pre-registration content,
  writing the Phase A results-document template, drafting brief
  candidates. All of these are Phase A work; all forbidden in
  DELAY.

---

## 4. Six precondition tracks

One subsection per precondition. Format: objective / owner /
concrete deliverable / success test / failure test / estimated
effort / dependencies.

### Track 1 — Constitutional addendum

- **Objective:** Append the 13 ADOPT hardening amendments to
  `PHASE_A_CONSTITUTION.md` as a single signed addendum at the
  bottom of the document.
- **Owner:** Document author.
- **Concrete deliverable:** A new section "## Addenda" containing
  one entry titled "Addendum 1 — Pre-Mortem Hardening (2026-05-…)"
  followed by the 13 amendments verbatim and the six precondition
  gates from PHASE_A_AUTHORIZATION_DECISION §7. Signed with date
  and name.
- **Success test:** The addendum exists in the file. The
  constitution's body now references the addendum where relevant.
- **Failure test:** Cannot fail. This is a single document edit.
- **Estimated effort:** ≤2 hours.
- **Dependencies:** None.

### Track 2 — External red-team reviewer

- **Objective:** Identify one named external person who will
  perform the red-team review of the redesigned Phase 3 design
  once it exists.
- **Owner:** Document author.
- **Concrete deliverable:** A short written agreement (email
  acceptance is sufficient) from a named individual stating:
  (a) they understand the task (red-team a research-grade
  experimental design for tautology), (b) their expected
  availability window, (c) compensation if any.
- **Success test:** Written acceptance exists in writing.
- **Failure test:** After 10 outreach attempts across the four
  weeks, no acceptance.
- **Estimated effort:** 3–8 hours of outreach + drafting.
- **Dependencies:** Track 1 (the addendum names the reviewer
  role).

### Track 3 — Public pre-registration account

- **Objective:** Create an account on OSF (or equivalent public
  pre-registration platform) and post a minimal placeholder.
- **Owner:** Document author.
- **Concrete deliverable:** An OSF project URL + a placeholder
  draft titled "Phase A — Q1 measurement, design TBD" that
  declares the platform will hold the future pre-registration
  if Phase A is authorized.
- **Success test:** URL exists; placeholder is accessible.
- **Failure test:** Cannot create account (rare, but possible);
  no equivalent platform identified.
- **Estimated effort:** ≤1 hour.
- **Dependencies:** None.

### Track 4 — Budget allocation

- **Objective:** Allocate ≥$500 for an external blinded reviewer
  to score Phase A outputs once Phase A produces them.
- **Owner:** Document author.
- **Concrete deliverable:** A note in writing stating the budget
  amount and the funding source (personal funds, grant, etc.).
  The funds do not need to be transferred during DELAY; they
  need to be committed and ready to disburse.
- **Success test:** Written allocation exists with named source.
- **Failure test:** The amount cannot be committed from any
  source.
- **Estimated effort:** ≤1 hour.
- **Dependencies:** None.

### Track 5 — Beta user soft-commit

- **Objective:** Secure written willingness from one prospective
  beta user.
- **Owner:** Document author.
- **Concrete deliverable:** A written statement (email, message,
  doc) from a named individual stating they would be willing to
  participate in a ~4-week research-grade trial of the tool. The
  statement is not a legal contract; it is recorded intent.
- **Success test:** Written soft-commit exists from a named
  individual matching the target audience (a working software
  engineer using AI on real work).
- **Failure test:** After 10 outreach attempts across the four
  weeks, no soft-commit.
- **Estimated effort:** 5–15 hours of outreach + conversations.
- **Dependencies:** None.

### Track 6 — Corpus + brief sourcing candidates

- **Objective:** Identify (without analyzing) at least one
  candidate corpus + one candidate brief-authoring path.
- **Owner:** Document author.
- **Concrete deliverable:** A short document naming:
  (a) one public OSS project + commit hash, with one-line
  justification of why it might be suitable;
  (b) one identified non-author brief writer (a person, an LLM
  process, or a third-party brief curator) and the mechanism by
  which they would author briefs without seeing the corpus's
  internal facts.
- **Success test:** The document exists; corpus URL is resolvable;
  brief-authoring path is operationally feasible on inspection.
- **Failure test:** No public OSS project surveyed meets the
  independence criterion; no brief author can be identified.
- **Estimated effort:** 3–6 hours of survey + identification. **No
  reading of the corpus's internal code is permitted in this
  track.** Reading the README, structure, and high-level
  description is permitted; reading the codebase for
  fact-extraction is Phase A work.
- **Dependencies:** None.

---

## 5. Weekly execution cadence

A bounded plan with checkpoint triggers. Each week ends with a
written check-in.

### Week 1 (2026-05-16 → 2026-05-22) — Foundation

**Permitted work:**
- Track 1 (addendum): write and sign.
- Track 3 (OSF account): create and place placeholder.
- Track 4 (budget): allocate.
- Track 6 (corpus candidates): begin survey.

**End-of-week check-in:** Track 1, 3, 4 should be DONE. Track 6
should be IN PROGRESS with at least one candidate identified.

**Reassessment trigger:** if Tracks 1 or 3 or 4 are not DONE by
end of Week 1, the DELAY is operationally unhealthy. Reassess
whether the rest is feasible.

### Week 2 (2026-05-23 → 2026-05-29) — Outreach

**Permitted work:**
- Track 2 (red-team reviewer): begin outreach.
- Track 5 (beta user): begin outreach.
- Track 6 (corpus candidates): narrow to one candidate corpus
  and identify the brief-authoring mechanism.

**End-of-week check-in:** Track 2 and Track 5 should each have
≥3 outreach attempts logged. Track 6 should be CLOSE-TO-DONE.

**Reassessment trigger:** if Track 2 or Track 5 has zero replies
of any kind (including declines) by end of Week 2, the project's
external pull may be insufficient. Continue but log.

### Week 3 (2026-05-30 → 2026-06-05) — Closing

**Permitted work:**
- Close Track 6 (corpus + brief path identified).
- Continue Track 2 outreach.
- Continue Track 5 outreach.

**Mid-week check-in (Wednesday):** evaluate Track 2 and Track 5
progress.

**End-of-week check-in:** ≥4 of 6 tracks should be DONE. The
remaining tracks should have a credible path to closing in Week
4.

**Reassessment trigger:** if fewer than 4 tracks are DONE by end
of Week 3, the DELAY is at high risk of failure. The author must
decide by Friday whether to (a) intensify Week 4 outreach, (b)
convert to REJECT a week early, or (c) request a constitutional
amendment to revise the precondition set (note: this
amendment-request itself triggers a new authorization-decision
revision).

### Week 4 (2026-06-06 → 2026-06-12) — Finalization or termination

**Permitted work:**
- Close any remaining outreach (Tracks 2 and 5).
- Update the precondition status tracker to MET/UNMET per track.

**Mid-week check-in (Tuesday or Wednesday):** are all six
preconditions closable by Friday?

**End-of-week check-in (Friday 2026-06-12):**
- **All six tracks DONE:** assemble the re-evaluation package
  (§8) and trigger a return to PHASE_A_AUTHORIZATION_DECISION
  for re-evaluation. The DELAY is closed pending the new
  verdict.
- **Any track UNMET:** the DELAY converts automatically to
  REJECT on 2026-06-13 per PHASE_A_AUTHORIZATION_DECISION §12.

**Escalation condition:** if at any point during Week 4 the
author finds themselves performing forbidden work under §3,
this is grounds for immediate REJECT without waiting for the
Friday deadline.

---

## 6. Failure interpretation rules

A failed precondition is not just a missing checkbox; it is
evidence of a specific operational reality. The five failure
classes have distinct implications.

### 6.1 Logistical failure

*Example:* the red-team reviewer accepts but cannot commit
availability within the 4-week window because of unrelated
calendar conflicts.

**Interpretation:** timing issue, not feasibility issue. May
warrant a one-time DELAY extension of ≤2 weeks if all other
preconditions are MET. Single-precondition logistical failure
does not by itself imply Phase A is infeasible. Multiple
simultaneous logistical failures (≥3) cross into REJECT
territory.

### 6.2 Financial failure

*Example:* the ≥$500 budget cannot be committed from any
source.

**Interpretation:** the project lacks the resources required for
its own honest execution. **This is a REJECT-level signal.**
Phase A's external-reviewer requirement is load-bearing; if it
cannot be funded, Phase A cannot produce defensible results.
Convert to REJECT immediately upon confirmed financial failure.

### 6.3 Interest failure

*Example:* ten reviewer-outreach attempts produce no acceptance;
ten beta-user-outreach attempts produce no soft-commit.

**Interpretation:** the project's external pull is insufficient
to assemble the participation Phase A requires. **This is a
REJECT-level signal.** A research-grade prototype that cannot
recruit one beta user from ten contacts is not at a stage where
behavioral measurement is meaningful. Convert to REJECT.

### 6.4 Reviewer-availability failure

*Example:* identifiable potential red-team reviewers exist in
the field but none can commit to the four-week review window for
calendar or workload reasons.

**Interpretation:** the academic/research-reviewer pool is not
operationally available to this project. Distinct from interest
failure (no one is interested) — this is "interested people
exist but cannot be scheduled." May warrant a one-time DELAY
extension of ≤4 weeks if all other preconditions are MET.
Repeated reviewer-availability failure across two outreach
cycles converts to REJECT.

### 6.5 Corpus-independence failure

*Example:* survey produces several candidate OSS projects but
none cleanly satisfies the independence criterion (e.g., each
either has been touched by the author or has no plausible
non-author brief-authoring path).

**Interpretation:** the design constraint itself is harder than
budgeted. **This is a REJECT-level signal.** The redesigned
Phase 3 design cannot exist if the corpus-independence
requirement cannot be met. Convert to REJECT.

### 6.6 Aggregate failure rules

- One precondition unmet at end of Week 4 → automatic REJECT per
  authorization-decision §12.
- Three or more preconditions UNMET at end of Week 3 → early
  REJECT (don't wait for Week 4).
- Any financial, interest, or corpus-independence failure
  confirmed at any time → immediate REJECT.
- Logistical or reviewer-availability single-failure with other
  preconditions MET → request one-time DELAY extension via a new
  authorization-decision amendment.

---

## 7. Early termination conditions

Conditions that convert DELAY to immediate REJECT before
2026-06-13:

1. **Forbidden-work occurrence.** The author performs any §3
   illegal activity. Self-reported or surfaced via check-in.
2. **Financial failure confirmed** (per §6.2).
3. **Interest failure confirmed** (per §6.3).
4. **Corpus-independence failure confirmed** (per §6.5).
5. **Substrate bug surfaces requiring stabilization work.** The
   substrate is assumed stable for DELAY; a discovery that the
   substrate has a behavior-blocking bug triggers a new
   stabilization cycle, which is incompatible with DELAY
   proceeding.
6. **The author requests modification to the precondition set.**
   Modification requests trigger an authorization-decision
   revision, which preempts DELAY's automatic conversion. If the
   modification request is itself an attempt to lower the bar to
   match what is assemblable, this is a REJECT-level signal.
7. **Drift symptom: any §3 work performed under self-rationalization.**
   "I was just looking at the corpus to see if it would be a
   candidate" is corpus-reading; it is forbidden. The behavior,
   not the intent, is the test.

---

## 8. Re-evaluation package

If all six preconditions reach MET status, the following must
exist before the authorization-decision document is re-opened:

1. **Status tracker.** A single document (≤1 page) showing each
   of the six preconditions and their MET evidence (URL,
   document path, written commitment screenshot or text).
2. **Constitutional addendum.** The signed Addendum 1 in
   `PHASE_A_CONSTITUTION.md` containing the 13 ADOPT hardening
   amendments and the six precondition gates.
3. **Reviewer commitment record.** Email, message, or written
   document from the named red-team reviewer.
4. **OSF account URL** with placeholder draft accessible.
5. **Budget allocation note** with named source.
6. **Beta user soft-commit record.** Email, message, or written
   statement from the named user.
7. **Corpus + brief sourcing document.** Naming the candidate
   corpus (URL + commit hash) and the non-author brief-authoring
   mechanism.
8. **Weekly check-in log.** Four written check-ins from the
   DELAY window. Each ≤200 words. Each addressing tracks status
   and any drift signals observed.

When all eight items exist, the author may re-open
`PHASE_A_AUTHORIZATION_DECISION.md` and add a §10 amendment
recording the precondition satisfaction and re-evaluating the
verdict against the new state.

The re-evaluation amendment does **not** automatically authorize
Phase A. It triggers a new pass through the same authorization
decision logic, against the updated evidence.

---

## 9. Governing rule

> During DELAY, the only legitimate work is precondition
> assembly per §4; any other activity — regardless of intent,
> framing, or apparent value — is unauthorized and voids the
> DELAY.

---

## 10. Status tracker

To be maintained inline. Update weekly.

| # | Precondition | Status | Evidence |
|---|---|---|---|
| 1 | Constitutional addendum (13 amendments + 6 gates) | NOT STARTED | — |
| 2 | External red-team reviewer (named commitment) | NOT STARTED | — |
| 3 | OSF account + placeholder | NOT STARTED | — |
| 4 | Budget ≥$500 allocated (named source) | NOT STARTED | — |
| 5 | Beta user soft-commit (named individual) | NOT STARTED | — |
| 6 | Corpus + brief-authoring candidate identified | NOT STARTED | — |

### Weekly check-ins (to be appended)

- **Week 1 (ending 2026-05-22):** *not yet recorded.*
- **Week 2 (ending 2026-05-29):** *not yet recorded.*
- **Week 3 (ending 2026-06-05):** *not yet recorded.*
- **Week 4 (ending 2026-06-12):** *not yet recorded.*

---

*End of assembly plan. This document is in force from 2026-05-16
to 2026-06-13. It is not a phase. It is a holding pattern with a
hard deadline. The verdict on 2026-06-13 is either re-evaluation
(if all six MET) or automatic REJECT (otherwise).*
