# PUBLIC_INTERNAL_SPLIT

> **Status:** Design memo. No file moves performed.
> **Date:** 2026-05-17.
> **Predecessor:** `docs/POSITIONING_CORRECTION.md`.
> **Purpose:** Reduce first-time cognitive overload on the public repo
> without deleting documents, rewriting history, or hiding evidence.

The project's docs directory has grown to 31 markdown files. A handful
of them are working memos that document process, narrative corrections,
phase reviews, and stabilization debate. They are valuable for
intellectual honesty but they overwhelm a first-time visitor whose
question is just "does this tool help me?" This memo proposes a
minimum-friction separation.

---

## TL;DR

- **Do not move files. Do not delete files.** Curate what the README
  links to, and add a single `docs/NOTES.md` index that lists internal
  working artifacts behind one link.
- **Reduce the README's doc-link surface** from 10 links (5 of which
  are internal process artifacts) to 6 product-facing links + 1
  pointer to internal notes.
- **Update the README Status block** to stop pointing at
  `TRUTH_CHECKPOINT.md` and `POSITIONING_CORRECTION.md` above the
  fold; replace with a single link to substrate evidence
  (`ARCHITECTURE.md` or `PHASE3_CPT.md`).
- **Defer GitHub Wiki, Discussions, and Projects** until first 5
  users land.

Estimated work: under one hour. One README edit, one new index file,
no folder reorganization.

---

## 1. Recommended public docs

Public means: linked from the README, named in user-facing language,
intended for someone evaluating, installing, or extending the tool.
These already exist and need no rewriting.

### Core 6 (the README's Documentation section should not exceed this)

| Doc | Purpose for a new user |
|---|---|
| `docs/ARCHITECTURE.md` | How the substrate is built. |
| `docs/SAFETY_MODEL.md` | Threat model and honest disclaimers. |
| `docs/CONTINUITY_THEORY.md` | Why "trust ladder + audit chain" is the design. |
| `docs/MVP_ROADMAP.md` | What is next. |
| `docs/LICENSING_STRATEGY.md` | Why BSL. |
| `docs/PHASE3_CPT.md` | The measurement design (the live "is this thing measured" link). |

### Extender set (link from `docs/ARCHITECTURE.md`, not from README)

For anyone writing a new adapter or workflow. They will not arrive
from the README; they will arrive from `ARCHITECTURE.md`.

- `docs/ADAPTER_SPEC.md`
- `docs/WORKFLOWS_SPEC.md`
- `docs/PLATFORM_LAYER.md`
- `docs/BOOTSTRAP_PROTOCOL.md`
- `docs/CRASH_CONSISTENCY.md`
- `docs/FACT_HYGIENE.md`
- `docs/OBSERVABILITY.md`
- `docs/TRUST_OPERATIONS.md`

### Reference (link from `docs/PHASE3_CPT.md`, not from README)

- `docs/phase3_briefs/` (test brief fixtures)
- `docs/EVAL_SPEC.md`

**Total public surface: 6 README-linked + 8 extender + 2 reference = 16 docs.**

---

## 2. Recommended internal / archive docs

Internal means: process artifacts, strategic memos, phase-review
documents, founder operational notes. These remain in `docs/` exactly
where they are. Only the *path of discovery* changes: instead of being
linked from the README, they are linked from a single
`docs/NOTES.md` index.

### Strategic / process

- `docs/POSITIONING.md` — Borderline; keep public but move from the
  README's main doc list to a secondary location (or leave linked
  via `POSITIONING_CORRECTION.md` only).
- `docs/POSITIONING_CORRECTION.md` — Internal narrative correction.
- `docs/TRUTH_CHECKPOINT.md` — Internal epistemic ledger.
- `docs/STABILIZATION.md`
- `docs/STABILIZATION_LESSONS.md`
- `docs/STABILIZATION_VERDICT.md`
- `docs/PHASE_SELECTION_MEMO.md`
- `docs/PHASE_A_AUTHORIZATION_DECISION.md`
- `docs/PHASE_A_CONSTITUTION.md`
- `docs/PHASE_A_PREMORTEM.md`
- `docs/PRECONDITION_ASSEMBLY_PLAN.md`
- `docs/PHASE2_THEORY.md`
- `docs/DEBATE_PROTOCOL.md`
- `docs/FUTURE_COMMAND_CENTER.md`
- `docs/PUBLIC_INTERNAL_SPLIT.md` (this memo)

### Founder ops (not for public consumption but kept transparent)

- `docs/FIRST_5_TRACKER.md`
- `docs/FOUNDER_RULES_FIRST_14_DAYS.md`

### Review artifacts (hidden by `.` prefix, already nearly invisible)

- `docs/.review-codex-2026-05-15.md`
- `docs/.review-gemini-2026-05-15.md`
- `docs/.hardening-codex-2026-05-15.md`
- `docs/.hardening-gemini-2026-05-15.md`

These already start with `.` and are not linked from anywhere
prominent. No change required.

---

## 3. Per-doc verdict: move / archive / collapse / link

The user-requested four verbs map onto this codebase as follows:

- **MOVE** = relocate the file to `docs/internal/` (rejected — see §4).
- **ARCHIVE** = leave file in place; remove all incoming links from
  the README; add it to `docs/NOTES.md` index.
- **COLLAPSE** = merge with a sibling doc.
- **LINK** = keep linked from README's Documentation section.

| Doc | Verdict | Notes |
|---|---|---|
| `ARCHITECTURE.md` | LINK | Core 6. |
| `SAFETY_MODEL.md` | LINK | Core 6. |
| `CONTINUITY_THEORY.md` | LINK | Core 6. |
| `MVP_ROADMAP.md` | LINK | Core 6. |
| `LICENSING_STRATEGY.md` | LINK | Core 6. |
| `PHASE3_CPT.md` | LINK | Core 6 — the measurement page. |
| `ADAPTER_SPEC.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `WORKFLOWS_SPEC.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `PLATFORM_LAYER.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `BOOTSTRAP_PROTOCOL.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `CRASH_CONSISTENCY.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `FACT_HYGIENE.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `OBSERVABILITY.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `TRUST_OPERATIONS.md` | ARCHIVE-but-keep-discoverable | Link from ARCHITECTURE. |
| `EVAL_SPEC.md` | ARCHIVE-but-keep-discoverable | Link from PHASE3_CPT. |
| `POSITIONING.md` | ARCHIVE → NOTES index | Keep file; remove from README's main doc list. |
| `POSITIONING_CORRECTION.md` | ARCHIVE → NOTES index | Remove from README Status block. |
| `TRUTH_CHECKPOINT.md` | ARCHIVE → NOTES index | Remove from README Status block; replace with substrate evidence link. |
| `STABILIZATION.md` | ARCHIVE → NOTES index | Process trio. |
| `STABILIZATION_LESSONS.md` | ARCHIVE → NOTES index | Process trio. |
| `STABILIZATION_VERDICT.md` | ARCHIVE → NOTES index | Process trio. |
| `PHASE_SELECTION_MEMO.md` | ARCHIVE → NOTES index | Process. |
| `PHASE_A_*.md` (4 files) | ARCHIVE → NOTES index | Phase governance. |
| `PRECONDITION_ASSEMBLY_PLAN.md` | ARCHIVE → NOTES index | Phase governance. |
| `PHASE2_THEORY.md` | ARCHIVE → NOTES index | Internal phasing language. |
| `DEBATE_PROTOCOL.md` | ARCHIVE → NOTES index | Internal protocol. |
| `FUTURE_COMMAND_CENTER.md` | ARCHIVE → NOTES index | Speculative. |
| `FIRST_5_TRACKER.md` | ARCHIVE → NOTES index | Founder ops. |
| `FOUNDER_RULES_FIRST_14_DAYS.md` | ARCHIVE → NOTES index | Founder ops. |
| `PUBLIC_INTERNAL_SPLIT.md` | ARCHIVE → NOTES index | This memo. |
| `.review-*.md`, `.hardening-*.md` | leave as-is | Already invisible (dot-prefix). |
| `phase3_briefs/` | LINK from PHASE3_CPT | Fixtures. |

**Net effect:** README's Documentation section drops from 10 links to
6 core + 1 "internal notes" pointer.

No `COLLAPSE` verdicts are recommended. Each doc has a distinct
audience or epoch; merging them would lose provenance.

No `MOVE` verdicts are recommended in this pass. See §4.

---

## 4. Proposed folder structure

Two viable approaches. The recommendation is Option A.

### Option A (recommended) — keep flat, curate links

```
docs/
  ARCHITECTURE.md
  CONTINUITY_THEORY.md
  LICENSING_STRATEGY.md
  MVP_ROADMAP.md
  PHASE3_CPT.md
  SAFETY_MODEL.md
  ADAPTER_SPEC.md
  WORKFLOWS_SPEC.md
  PLATFORM_LAYER.md
  BOOTSTRAP_PROTOCOL.md
  CRASH_CONSISTENCY.md
  FACT_HYGIENE.md
  OBSERVABILITY.md
  TRUST_OPERATIONS.md
  EVAL_SPEC.md
  POSITIONING.md
  POSITIONING_CORRECTION.md
  TRUTH_CHECKPOINT.md
  STABILIZATION.md
  STABILIZATION_LESSONS.md
  STABILIZATION_VERDICT.md
  PHASE_SELECTION_MEMO.md
  PHASE_A_AUTHORIZATION_DECISION.md
  PHASE_A_CONSTITUTION.md
  PHASE_A_PREMORTEM.md
  PHASE_2_THEORY.md
  PRECONDITION_ASSEMBLY_PLAN.md
  DEBATE_PROTOCOL.md
  FUTURE_COMMAND_CENTER.md
  FIRST_5_TRACKER.md
  FOUNDER_RULES_FIRST_14_DAYS.md
  PUBLIC_INTERNAL_SPLIT.md
  NOTES.md                       ← NEW: single-page index of internal docs
  phase3_briefs/
    *.brief
```

Pros:

- Zero file moves. Zero broken internal links.
- A single new file (`NOTES.md`) plus one README edit is the whole job.
- Anti-overengineering aligned.
- Easy to reverse if it turns out to be wrong.

Cons:

- `docs/` directory listing is still long (32 files visible if a user
  opens the directory rather than the README). Mitigated by the fact
  that most users will never open `docs/` directly.

### Option B — physical separation into `docs/internal/`

```
docs/
  ARCHITECTURE.md
  CONTINUITY_THEORY.md
  ...
  internal/
    POSITIONING_CORRECTION.md
    TRUTH_CHECKPOINT.md
    STABILIZATION*.md
    PHASE_*.md
    NOTES.md   ← index
```

Pros:

- Directory listing reflects audience separation visually.
- New contributors see a clearer hierarchy when browsing.

Cons:

- Breaks every internal cross-link between moved docs.
- Requires a one-time link-update pass (probably 30–60 edits).
- The work is reversible but tedious.
- Risk that some link is missed and an internal doc becomes a 404
  from another internal doc.

### Recommendation

Start with Option A. If the internal doc pile grows past ~25 files
or contributors start landing in `docs/` directly and getting confused,
revisit Option B. The cost of moving from A → B later is a single
mechanical pass; the cost of doing B prematurely is the friction it
adds now.

---

## 5. README cleanup recommendations

### Status block (current)

The new README's Status block currently reads:

> See `docs/TRUTH_CHECKPOINT.md` for the substrate's evidence trail
> and `docs/POSITIONING_CORRECTION.md` for why this README is framed
> the way it is.

This is the second visible link surface in the entire README, and it
points at two internal process artifacts. A first-time user clicking
either is in heavy water immediately.

### Status block (recommended)

> See `docs/ARCHITECTURE.md` for how the substrate is built and
> `docs/PHASE3_CPT.md` for the measurement design. Internal working
> notes are indexed in `docs/NOTES.md`.

This points at two substrate-quality docs above the fold, while
preserving a single pointer to internal material for the curious.

### Documentation section (current)

Currently lists 10 docs, 5 of which are internal process artifacts:
POSITIONING.md, POSITIONING_CORRECTION.md, TRUTH_CHECKPOINT.md,
STABILIZATION.md, STABILIZATION_VERDICT.md.

### Documentation section (recommended)

Reduce to:

```markdown
## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — how the substrate is built.
- [docs/SAFETY_MODEL.md](./docs/SAFETY_MODEL.md) — threat model and honest disclaimers.
- [docs/CONTINUITY_THEORY.md](./docs/CONTINUITY_THEORY.md) — why trust ladder + audit chain.
- [docs/PHASE3_CPT.md](./docs/PHASE3_CPT.md) — the measurement design.
- [docs/MVP_ROADMAP.md](./docs/MVP_ROADMAP.md) — what is next.
- [docs/LICENSING_STRATEGY.md](./docs/LICENSING_STRATEGY.md) — why BSL.

Internal working notes (positioning history, stabilization process,
phase governance, founder ops) are indexed in
[`docs/NOTES.md`](./docs/NOTES.md).
```

That replaces 10 links with 6 + 1.

### NOTES.md (new file, proposed structure)

```markdown
# Internal working notes

This file indexes the project's internal artifacts: process memos,
narrative corrections, phase governance, and founder operational
documents. They are kept in the public repo for transparency and
honest evidence, not because a first-time user needs them.

If you are evaluating the tool, you don't need anything below this
line. Start with the README and the docs it links.

## Narrative + positioning

- POSITIONING.md — current positioning.
- POSITIONING_CORRECTION.md — why the framing changed and how it is bounded.
- PUBLIC_INTERNAL_SPLIT.md — this layout decision.

## Evidence ledger

- TRUTH_CHECKPOINT.md — what is validated, invalidated, unproven.

## Stabilization (Phase 1→2 transition)

- STABILIZATION.md
- STABILIZATION_LESSONS.md
- STABILIZATION_VERDICT.md

## Phase governance

- PHASE_SELECTION_MEMO.md
- PHASE_A_CONSTITUTION.md
- PHASE_A_PREMORTEM.md
- PHASE_A_AUTHORIZATION_DECISION.md
- PRECONDITION_ASSEMBLY_PLAN.md
- PHASE2_THEORY.md

## Speculative / future

- FUTURE_COMMAND_CENTER.md
- DEBATE_PROTOCOL.md

## Founder operations

- FIRST_5_TRACKER.md
- FOUNDER_RULES_FIRST_14_DAYS.md
```

One file, one screen, no rewrites.

---

## 6. What first-time users should see in under 2 minutes

A new visitor to the repo opens the README. In two minutes they should
absorb (in this order):

1. **The one-line positioning** ("Continuity infrastructure for
   multi-model engineering workflows").
2. **The Status block** (research-grade, what's measured, license).
3. **§1 The workflow this exists for** (the four named recurring costs).
4. **§7 Quickstart** (skim, see the install path is concrete).
5. **The Demo asciinema** (90 seconds, visible result).

They should NOT have to read:

- Any positioning debate.
- Any stabilization narrative.
- Any phase governance.
- Any epistemic categorization.

The Core 6 docs are reachable in two clicks (README → Documentation
section → doc) but are not required for the two-minute scan.

The proposed Status-block edit (§5 above) keeps the above-the-fold
links pointed at substrate evidence rather than process narrative.

---

## 7. What contributors should see

A contributor who has decided to write code arrives at the README,
clicks `docs/ARCHITECTURE.md`, and from there finds:

- The eight Extender-set docs (linked from ARCHITECTURE).
- The repo's package structure.
- The audit-chain invariants.
- The PAL seam.

They do not need to see process artifacts to write code. If they
become invested enough to wonder about the project's strategic
history, the `NOTES.md` pointer is in the README.

Recommended addition to `docs/ARCHITECTURE.md` (one paragraph near
the top, not a full rewrite):

> ## For contributors
>
> If you are writing code in this repo, the docs you'll want are:
> [ADAPTER_SPEC.md], [WORKFLOWS_SPEC.md], [PLATFORM_LAYER.md],
> [BOOTSTRAP_PROTOCOL.md], [CRASH_CONSISTENCY.md], [FACT_HYGIENE.md],
> [OBSERVABILITY.md], [TRUST_OPERATIONS.md]. Each is scoped to a
> single concern.

---

## 8. What researchers should still be able to access

Researchers, reviewers, hostile auditors, and anyone studying the
project's epistemic discipline must continue to be able to reach:

- `TRUTH_CHECKPOINT.md` (validated / invalidated / unproven)
- `POSITIONING_CORRECTION.md` (narrative-correction record)
- `STABILIZATION*.md` (the narrowing decision and its scope)
- `PHASE_A_*.md` (authorization governance)
- All review and hardening artifacts in `docs/.review-*` and
  `docs/.hardening-*`

Two changes preserve this:

1. **None of these files are moved or deleted.** They remain in
   `docs/` at their current paths. Every link from another internal
   doc continues to work.
2. **The `docs/NOTES.md` index makes them discoverable in one click
   from the README.** A researcher landing on the repo can navigate
   from README → NOTES → any internal artifact in two steps.

The path is one step longer than today. The artifacts are equally
accessible. The repo is no less transparent.

---

## 9. How to preserve transparency without overwhelming people

The single most important transparency lever is **keeping
"what's-not-measured" content in the README itself**, not behind
links. The README's §3 (Validated vs unvalidated) and §4 (Intentionally
deferred) already do this:

- §3 names the load-bearing sentence: *What we record and present is
  real; what that does to the next model's output is being measured.*
- §4 names every deferred thing in a public table.

Those two sections alone do most of the work that the internal
artifacts would do if read end-to-end. A reader who absorbs only the
README and never opens a single docs/ file still gets:

- An honest evidence boundary.
- An explicit list of what the project does not claim.
- A pointer to where the evidence lives for anyone who wants more.

That is enough transparency for a research-grade prototype. Adding
more above-the-fold pointers to internal process material does not
add transparency; it adds friction.

---

## 10. Whether GitHub Wiki / Discussions / Projects should be used later

### Wiki

**Defer.** Wikis become useful when (a) multiple contributors edit
them and (b) the content is reference material that ought to be
searchable independent of the code. Neither applies yet. A solo
maintainer's docs belong in `docs/` where they version with the code.

### Discussions

**Defer until first 5 users land.** Then a "Show & Tell" + "Q&A"
pair is the minimal useful surface — the equivalent of an
issue tracker for non-bug conversations. Premature today; would
sit empty and look abandoned, which is worse than not having it.

### Projects

**Defer indefinitely for now.** A solo project with a `MVP_ROADMAP.md`
and a task system does not need a Projects board. Projects become
useful when there are 3+ contributors and work needs to be
explicitly claimed.

### What to enable today

- **Issues** (already on by default). Honest single channel for
  bug reports and questions.
- **Releases** (eventually). Use them once there is a first tagged
  release worth marking.
- **Code review settings.** Branch protection on `main` once anyone
  other than the maintainer has commit access.

---

## 11. Which docs are actively hurting onboarding today

In observed-effect order, worst first:

1. **`TRUTH_CHECKPOINT.md`** linked above the fold in the README
   Status block. The doc is 740 lines of epistemic categorization
   (validated / invalidated / unproven, thesis-map, strategic-drift
   analysis). It is excellent internal work and overwhelming for
   a first-time visitor. **Fix:** remove from Status block; move
   to NOTES index.

2. **`POSITIONING_CORRECTION.md`** linked above the fold in the
   README Status block. 485 lines explaining why the README was
   re-edited. A new user has no context for this conversation.
   **Fix:** same as above.

3. **`STABILIZATION.md` + `STABILIZATION_VERDICT.md`** linked from
   the README's Documentation section. They reference Phase 1.6,
   Phase 1.7, Run A vs Run B — none of which a first-time visitor
   has any way to interpret. **Fix:** remove from Documentation
   section; move to NOTES index.

4. **`POSITIONING.md`** linked from the README's Documentation
   section. Borderline: it explains what the product is, which is
   useful, but the README §1–§2 already do that with less process
   baggage. **Fix:** remove from Documentation section; reachable
   via `POSITIONING_CORRECTION.md` in NOTES.

5. **`docs/` directory listing length.** 32 entries. If a user
   bypasses the README and clicks into `docs/`, the visual
   density is high. **Mitigation:** the NOTES index is a single
   file at the same level; a user who clicks `NOTES.md` is told
   in two lines that this is internal-only.

No other docs are doing measurable damage to first-impression
experience.

---

## 12. Exact minimal public-doc set for current stage

Six files. This is what the README links from its Documentation
section. Everything else is reachable transitively or via the
NOTES index.

```
README.md
LICENSE
NOTICE
TRADEMARKS.md
docs/ARCHITECTURE.md
docs/SAFETY_MODEL.md
docs/CONTINUITY_THEORY.md
docs/MVP_ROADMAP.md
docs/LICENSING_STRATEGY.md
docs/PHASE3_CPT.md
```

That is 4 root-level docs (README + 3 legal) + 6 docs in `docs/`.
A first-time user who reads only those 10 files has everything they
need to evaluate the tool, install it, and understand its honest
boundaries.

Anything beyond this set is **available, indexed, transparent — but
not required**.

---

## Recommended execution order (when ready)

1. **Add `docs/NOTES.md`** with the structure in §5.
2. **Edit `README.md`** to:
   - Replace the Status block's two internal links with the
     substrate-quality replacement in §5.
   - Replace the Documentation section's 10-link list with the
     6-link list + NOTES pointer.
3. **Add the one-paragraph "For contributors" block to
   `docs/ARCHITECTURE.md`** linking the eight Extender-set docs.
4. **Commit and push.** Single small commit. Title: "docs: collapse
   internal process artifacts behind NOTES index."
5. **Optional, later:** if the internal pile grows past 25 files
   or contributors are landing in `docs/` and getting confused,
   evaluate Option B (physical move into `docs/internal/`).

Estimated time: 30–60 minutes of work, no risk to evidence trail,
no broken links, no deleted content.

---

## What this memo deliberately does not do

- It does not move any files.
- It does not delete any content.
- It does not propose a docs website.
- It does not propose a wiki, discussions, or projects board.
- It does not propose link-checking automation.
- It does not propose a frontmatter audience-tagging scheme.
- It does not propose CI checks for doc placement.
- It does not propose any renames.
- It does not propose any merges or collapses of distinct documents.

If any of those become necessary later, they become necessary because
of evidence (a contributor got confused, a researcher couldn't find
something, a doc fell out of date). Not from this memo.
