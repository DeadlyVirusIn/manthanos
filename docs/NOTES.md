# Public docs index

A table of contents for the public documentation that ships with
ManthanOS. The [README](../README.md) covers product overview,
installation, quickstart, and the canonical positioning. Everything
below is reference material.

If a doc is not listed here, it is intentionally not part of the
public surface — internal strategy, founder notes, competitor
analysis, prioritization memos, and pre-field-study hypothesis
work live in a separate private location and are not part of the
public repo.

---

## Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md) — How the substrate is
  built. Read this first if you want to understand or extend the
  internals.
- [CONTINUITY_THEORY.md](./CONTINUITY_THEORY.md) — Why the
  substrate is shaped the way it is. The trust-ladder + audit-chain
  + decay design rationale.
- [BOOTSTRAP_PROTOCOL.md](./BOOTSTRAP_PROTOCOL.md) — Workspace
  initialization protocol; what `manthan init` actually does and
  what facts the bootstrap pass extracts.
- [PLATFORM_LAYER.md](./PLATFORM_LAYER.md) — Cross-platform PAL
  seam. The conventions every OS-touching call must follow.

## Safety

- [SAFETY_MODEL.md](./SAFETY_MODEL.md) — Threat model, audit-chain
  scope (and honest disclaimers), shell denylist, redaction rules,
  approval-gate design intent, and an implementation-status table
  per section. Read this if you want to understand what is
  enforced today vs what is specced for later.
- [CRASH_CONSISTENCY.md](./CRASH_CONSISTENCY.md) — Crash-recovery
  invariants for the audit chain and SQLite layer.

## Specs (for contributors and reproducibility)

- [ADAPTER_SPEC.md](./ADAPTER_SPEC.md) — Provider-adapter interface.
- [WORKFLOWS_SPEC.md](./WORKFLOWS_SPEC.md) — Workflow shape; the
  current workflow is `plan`.
- [FACT_HYGIENE.md](./FACT_HYGIENE.md) — Dedup, decay, and shaping
  rules; the mechanics behind the brain's quality controls.
- [TRUST_OPERATIONS.md](./TRUST_OPERATIONS.md) — Promote / demote
  / undo semantics; the trust-ladder transition rules.
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Runtime metrics and
  diagnostics surfaces.

## Validation (epistemic discipline)

- [TRUTH_CHECKPOINT.md](./TRUTH_CHECKPOINT.md) — Validated vs
  invalidated vs unproven claims. The single most important doc
  if you want to know which substrate properties are evidence-
  backed and which are still being measured.
- [STABILIZATION.md](./STABILIZATION.md) — The Phase 1 → Phase 2
  narrowing decision: what was cut, what was kept, why.
- [STABILIZATION_LESSONS.md](./STABILIZATION_LESSONS.md) — Lessons
  drawn from the stabilization pass.
- [STABILIZATION_VERDICT.md](./STABILIZATION_VERDICT.md) — The
  verdict on the narrowing decision (Option A — narrow
  single-provider thesis).
- [PHASE3_CPT.md](./PHASE3_CPT.md) — Phase 3 continuity-per-token
  measurement design. The next live measurement on deck.
- [EVAL_SPEC.md](./EVAL_SPEC.md) — Internal evaluation framework
  for substrate claims.

## Project meta

- [BRANDING.md](./BRANDING.md) — Visual identity guide; logo and
  wordmark usage, color palette, lockup variant.
- [LICENSING_STRATEGY.md](./LICENSING_STRATEGY.md) — Why BSL 1.1,
  and what the four-year Apache 2.0 conversion means in practice.

---

## What is intentionally not here

Internal research, strategy memos, competitor comparisons,
prioritization analysis, contributor workflow notes, founder
operational documents, and pre-field-study hypothesis work are
kept private. The boundary the project applies:

**Public docs are for**

- Substrate operation (how to install, run, use the CLI).
- Architecture (how the system is built).
- Safety (what is and is not protected).
- Specs (what contributors need to implement adapters / workflows / migrations).
- Validation (which claims are evidence-backed; honest disclosure of limitations).

**Private notes are for**

- Strategic positioning rationale and competitor analysis.
- Prioritization / enhancement-leverage analysis.
- Pre-field-study hypotheses (so they can't be retroactively softened).
- Tester recruitment, founder operational guardrails, GTM materials.
- Internal phase-selection / governance memos.
- Future-direction speculation that has not graduated to substrate.

Strategic / philosophical / internal research material belongs in
the private notes location *unless it directly supports substrate
operation, reproducibility, validation, or safety*. The rule is
intended to keep the public surface product-focused and
operationally honest while keeping strategic thinking where it
belongs.
