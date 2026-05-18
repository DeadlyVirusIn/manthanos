# Contributing

This file is intentionally short. It covers one thing: the rule for
what belongs in this public repo and what does not.

For broader context on the public docs structure, see
[`docs/NOTES.md`](./docs/NOTES.md).

---

## Public Documentation Boundary

This repo is the substrate. Strategy, internal positioning, and
research thinking live elsewhere.

### Public docs may include

- Installation / usage instructions.
- Architecture (how the system is built).
- Safety model (threat model + honest scope disclaimers).
- Specs that contributors need to implement adapters, workflows,
  or migrations.
- Validation status (what has been measured, what hasn't).
- Honest limitations (TRUTH_CHECKPOINT-style epistemic ledger).
- Branding and licensing.

### Public docs must NOT include

- Competitor comparison memos.
- Founder strategy or operating-stance documents.
- Tester recruitment, observation plans, or workflow psychology.
- Prioritization or enhancement-leverage analysis.
- Future-direction speculation that isn't already in the
  substrate.
- Internal positioning debates or rationale histories.
- Hostile-reviewer / adversarial-audit memos.
- Private research hypotheses or pre-field-study commitments.
- GTM / business-strategy material.
- "What we might do next" internal thinking that hasn't been
  scoped to a concrete substrate change.

The rule is product / substrate / safety / spec / honesty.
Strategy and internal research live in the maintainer's private
notes, not here.

---

## Pre-commit checklist for any doc under `docs/`

Before adding or modifying a doc, ask:

1. **Does this help a user operate the substrate?**
2. **Does this help a contributor implement safely?**
3. **Does this support reproducibility, validation, or safety?**
4. **Would we be comfortable with a competitor reading this?**
5. **Is this product documentation, or founder / internal
   thinking?**

If the honest answer to (5) is "founder / internal thinking,"
the doc does not belong in this repo. Move it to:

```
~/manthanos-private/docs/
```

That location is the project's private-notes home. Strategic
analysis, competitor comparisons, prioritization memos, and
pre-field-study research go there.

---

## Why this matters

The repo's credibility rests on it being a small, focused,
honest substrate. A public surface that mixes substrate
documentation with founder thinking blurs that line and gives
external readers a different (less defensible) impression of
what the project is.

The boundary is not paranoia; it is product hygiene. Drift in
the other direction — accidentally moving substrate docs out of
public — is also unwelcome. Honest limitations
(`TRUTH_CHECKPOINT.md`), narrowing decisions
(`STABILIZATION*.md`), validation design (`PHASE3_CPT.md`,
`EVAL_SPEC.md`), and theory (`CONTINUITY_THEORY.md`) belong
public, because they describe the substrate.

---

## When in doubt

When in doubt, default to private. A doc moved out of the public
repo can always be re-published if it turns out to belong there.
A doc accidentally committed publicly is harder to retract from
git history.

---

## What this file does not do

- It does not specify code style, formatting rules, or PR
  conventions (those are governed by `biome.json`, `tsconfig`,
  and the CI workflow in `.github/workflows/ci.yml`).
- It does not specify a roadmap for contributions or feature
  prioritization.
- It does not create a contribution process or maintainer
  hierarchy.

The single concern of this file is the public-documentation
boundary.
