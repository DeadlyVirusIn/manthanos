# Internal working notes

This file indexes the project's internal artifacts: process memos,
narrative corrections, phase governance, founder operational
documents, and review/hardening artifacts. They are kept in the public
repo for transparency and honest evidence, not because a first-time
user needs them.

If you are evaluating the tool, you don't need anything below this
line. Start with the [README](../README.md) and the docs it links.

If you are auditing the project's epistemic discipline, narrative
history, or evidence trail, this is the index.

---

## Narrative + positioning

- [POSITIONING.md](./POSITIONING.md) — current positioning.
- [POSITIONING_CORRECTION.md](./POSITIONING_CORRECTION.md) —
  why the framing changed and how it is bounded.
- [PUBLIC_INTERNAL_SPLIT.md](./PUBLIC_INTERNAL_SPLIT.md) — this
  doc layout decision.

## Evidence ledger

- [TRUTH_CHECKPOINT.md](./TRUTH_CHECKPOINT.md) — what is validated,
  invalidated, unproven. The single most load-bearing internal doc.

## Stabilization (Phase 1 → Phase 2 transition)

- [STABILIZATION.md](./STABILIZATION.md)
- [STABILIZATION_LESSONS.md](./STABILIZATION_LESSONS.md)
- [STABILIZATION_VERDICT.md](./STABILIZATION_VERDICT.md) — Option A
  (narrow single-provider thesis) was selected; see also the §6.4
  footnote in TRUTH_CHECKPOINT.md.

## Phase governance

- [PHASE_SELECTION_MEMO.md](./PHASE_SELECTION_MEMO.md)
- [PHASE_A_CONSTITUTION.md](./PHASE_A_CONSTITUTION.md)
- [PRECONDITION_ASSEMBLY_PLAN.md](./PRECONDITION_ASSEMBLY_PLAN.md)
- [PHASE2_THEORY.md](./PHASE2_THEORY.md)

## Speculative / future

- [FUTURE_COMMAND_CENTER.md](./FUTURE_COMMAND_CENTER.md) —
  speculative; not on the roadmap.
- [DEBATE_PROTOCOL.md](./DEBATE_PROTOCOL.md) — internal protocol
  for multi-model debate; not wired into the current product.

## Founder operations (kept private)

The maintainer's recruit messaging, candidate tracking sheet, founder
operational guardrails, and Phase A go/no-go documentation
(pre-mortem + authorization decision) are intentionally kept outside
the public repo. They are operational playbooks, not architecture
artifacts. Available privately on request for collaborators.

## Multi-model review + hardening artifacts

Dot-prefixed so they don't dominate the directory listing. Kept for
audit transparency — these are inputs that drove substrate fixes.

- `docs/.review-codex-2026-05-15.md`
- `docs/.review-gemini-2026-05-15.md`
- `docs/.hardening-codex-2026-05-15.md`
- `docs/.hardening-gemini-2026-05-15.md`

---

## What lives here vs. what lives in the README

| Lives in the README | Lives here |
|---|---|
| Workflow pain, current capabilities, install path, demo, deferred-list, validation boundary. | Process narrative, stabilization debate, phase governance, narrative corrections, founder ops, review/hardening artifacts. |

The split is presentation-layer only. Nothing here is hidden from
search, browsing, or git history. The path of discovery from the
README is one step longer; the artifacts themselves are equally
accessible.

See [PUBLIC_INTERNAL_SPLIT.md](./PUBLIC_INTERNAL_SPLIT.md) for the
design memo that produced this layout.
