# ManthanOS — Licensing & IP Strategy

> Recommendation, rationale, and concrete actions for protecting
> ManthanOS while building an open-source community. Status: design
> lock — pre-implementation.

---

## 1. Goals

The licensing posture must serve four goals, in order:

1. **Protect the ManthanOS vision** from companies repackaging the
   core as a competing hosted product.
2. **Enable open-core / commercial optionality.** This is the chosen
   business model (per the project brief): free for individuals,
   commercial license for companies that need additional terms or
   features.
3. **Encourage community adoption** by solo engineers and power
   users — the primary audience.
4. **Keep relicensing optionality open** for at least the first
   three years. The cost of locking in early is unrecoverable; the
   cost of staying flexible is small.

Anything that sacrifices (1) for short-term (3) is wrong. Anything
that achieves (1) at the cost of zero adoption is also wrong.

---

## 2. Recommendation

**Primary license: Business Source License 1.1 (BSL).**
**Future grant: Apache 2.0 after a 4-year change date per release.**
**Plus: a registered "ManthanOS" trademark policy.**
**Plus: a real Contributor License Agreement (CLA).**

This is the same legal stack used (in variations) by HashiCorp,
CockroachDB, Sentry, MariaDB, and others. It is the proven pattern
for the open-core + commercial model.

### 2.1 BSL parameters

The BSL is parameterized; we set the parameters as:

- **Licensor:** ManthanOS, Inc. (or the founder personally until the
  entity exists; transfer at incorporation).
- **Licensed Work:** "ManthanOS Core" (covers `packages/core`,
  `packages/adapters-sdk`, `packages/platform`, `packages/memory`,
  `packages/safety`, `apps/cli`, first-party adapters).
- **Additional Use Grant:**

  > You may make production use of the Licensed Work, provided you
  > do not offer the Licensed Work (or a substantially-similar
  > derivative) to third parties as a hosted or managed service
  > whose value proposition substantially overlaps with the
  > Licensed Work. Internal use within a single organization is
  > permitted without limit. Personal, non-commercial, and academic
  > use is permitted without limit.

- **Change Date:** 4 years from the date of each release.
- **Change License:** Apache License, Version 2.0.

This means: anyone can read, run, modify, contribute, and use
ManthanOS — including companies, internally — at no cost. The only
prohibited use is offering ManthanOS itself as a third-party hosted
service. After four years, each version automatically becomes
Apache 2.0.

### 2.2 Why this set of parameters

- **4-year change date** (not 2, not 6) — long enough that the
  commercial layer has real value during the window; short enough
  that the community is not skeptical of "perpetual lockup." This
  matches CockroachDB's and Sentry's later choices.
- **"Substantially-similar derivative"** language captures the
  rename-and-rebrand attack. Trademark covers the name; the BSL
  clause covers the substance.
- **Internal use without limit** removes the enterprise allergy that
  killed AGPL/SSPL adoption for many companies.

### 2.3 Why not alternatives

| License | Why not (for this project) |
|---|---|
| **MIT / Apache 2.0** (only) | Anyone can clone, rebrand, and sell. Violates Goal 1 directly. |
| **AGPLv3** | AWS/Google/MS will fork rather than comply (Elasticsearch precedent). Enterprises auto-block AGPL in policy. Worst of both worlds for our model. |
| **SSPL** | Not OSI-approved → many distros refuse. "Service source code" clause is legally murky (untested at scale). Marketing perception is poor. |
| **Elastic License v2** | Simpler than BSL and reasonable. No future-grant though — community wariness over permanent source-available status. |
| **Pure commercial / source-available custom** | Maximum protection, minimum adoption. Wrong trade-off for a developer tool that lives or dies by community. |
| **Dual AGPL + commercial** | Requires sales motion we don't have yet, and a CLA so airtight that contributor onboarding suffers. Possible later as part of "open-core + commercial." |

BSL with future grant is the **median pragmatic choice** that
serves all four goals.

---

## 3. Trademark strategy

License protects the **code**. Trademark protects the **name**.
The combination is what makes a fork *exist* but not *be ManthanOS*.

### 3.1 Registrations to pursue

- "ManthanOS" word mark in priority jurisdictions: US (USPTO), EU
  (EUIPO), India (IP India), UK (UKIPO). Class 9 (software) at
  minimum; consider Class 42 (SaaS) and Class 41 (training/docs).
- Logo mark (once a logo exists) — separate filing.
- Budget: ~$1.5k–$3k per jurisdiction including attorney fees.
  Stagger if cash-flow is a constraint; US + EU + India first is
  the recommended priority order.
- Timing: file **before public launch**. A pending application
  ("™" usage) is sufficient to assert rights; registration
  ("®") strengthens enforcement.

### 3.2 Trademark policy (published in `TRADEMARKS.md`)

A clear, plain-language policy that says:

- The name "ManthanOS" and the logo are trademarks of ManthanOS,
  Inc.
- The license grants no trademark rights.
- Forks may use the source code subject to the BSL, but **must
  rename** before public distribution. Suggested naming pattern:
  `Open<Word>` or a wholly distinct name.
- Press, articles, and educational use of the name in reference is
  permitted under nominative-fair-use principles. (Spell out the
  details: "compatible with ManthanOS" OK; "ManthanOS Pro" not OK.)
- Plugins must not use "ManthanOS" in their npm name except for
  first-party plugins under `@manthanos/*` scope. Third-party
  plugins can describe themselves as "for ManthanOS" but cannot
  prefix their package name.

### 3.3 Domain & namespace reservations

Reserve immediately:

- `manthanos.com` (primary)
- `manthanos.dev` (developer-facing)
- `manthanos.io`, `manthanos.org`, `manthanos.ai` (defensive)
- npm scope `@manthanos`
- GitHub org `manthanos` (or `manthanos-dev` if taken; the
  trademark is what matters legally, the org name is convenience)
- Binary name `manthan` and `manthanos` on PyPI/Cargo as defensive
  reservations even though primary distribution is npm
- PowerShell Gallery / winget package name `ManthanOS.CLI`

---

## 4. Contributor License Agreement (CLA)

A real CLA — not just DCO sign-off — is **required**. Without it,
the project cannot ever relicense, and contributor liability
boundaries are unclear.

### 4.1 Why a real CLA, not DCO-only

- DCO only certifies "I have the right to contribute." It does
  **not** grant the project the right to relicense or sublicense.
- BSL → Apache transition is automatic per-release, so that
  specific transition works without contributor permission. But
  any *other* relicensing (e.g., adding a commercial license
  variant, partnering with another OSS project, settling a
  trademark dispute) requires CLA-granted rights.

### 4.2 Recommended CLA

Use the Apache Software Foundation Individual CLA (ICLA) template
as a starting point. Slight modifications:

- Replace ASF with ManthanOS, Inc. (or the founder pre-incorporation).
- Add explicit clause permitting future relicensing to any OSI-
  approved license (this is the key "optionality" clause).
- Keep the patent grant and "no warranties" language intact.

Implementation: CLA Assistant on GitHub. PRs without a signed CLA
auto-fail a check. No code review until signed.

### 4.3 Corporate CCLA

Also publish a Corporate CLA (Apache CCLA template) for
contributions made on behalf of an employer. Signed by an
authorized representative. Lists employees authorized to
contribute.

### 4.4 What contributors actually feel

Friction: one click, one form, once per contributor. Not a
material blocker for serious contributors. The signal of "this
project is serious" generally exceeds the friction.

---

## 5. Anti-repackaging measures

Beyond license and trademark, several smaller measures add
friction to repackaging.

- **Branding strings in the binary.** The `manthan --version`
  output includes "ManthanOS by Vendor, BSL-1.1 / Apache 2.0 (after
  change date)". Removing it requires editing source and is a
  trademark violation.
- **Telemetry-free by default.** No phone-home in core. (This is a
  feature, not just a defensive measure — it removes a common
  reason to fork.)
- **Plugin namespace.** `@manthanos/*` is reserved on npm and
  publishable only by trusted maintainers; this prevents a
  malicious actor from publishing `@manthanos/adapter-evil`.
- **Release signing.** Releases are signed (cosign / sigstore).
  Unsigned binaries claiming to be "ManthanOS" are easier to call
  out as illegitimate.
- **Public ENFORCEMENT.md.** A short doc describing how to report
  trademark issues and what we will do. Signals seriousness
  without being aggressive.

These are **not** technical DRM. They are normal hygiene that makes
brand impersonation visible and the legal posture credible.

---

## 6. Repository legal layout

The repository root contains the following files. All are
required for the legal posture to function.

```
LICENSE                  # BSL 1.1 with parameters filled in
LICENSE.future-grant     # Apache 2.0 text + change-date table
NOTICE                   # third-party attributions
TRADEMARKS.md            # plain-language trademark policy
CONTRIBUTING.md          # how to contribute, links to CLA
CLA.md                   # the actual ICLA + CCLA text
GOVERNANCE.md            # decision-making, even if BDFL today
SECURITY.md              # responsible disclosure
ENFORCEMENT.md           # trademark/IP enforcement contact
CODE_OF_CONDUCT.md       # Contributor Covenant 2.1, modified minimally
```

Per-package `package.json` files include:

```json
{
  "license": "SEE LICENSE IN ../../LICENSE",
  "manthanos": {
    "license": "BSL-1.1",
    "futureGrant": "Apache-2.0",
    "changeDateNotice": "See LICENSE.future-grant"
  }
}
```

Per-file headers: a short SPDX-style header on every source file.

```ts
// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 ManthanOS, Inc.
```

Removing this header is a license violation; CI checks every file
has one.

---

## 7. Comparison table

For quick reference when discussing the choice with contributors or
counsel:

| Concern | MIT/Apache | AGPLv3 | SSPL | Elastic v2 | **BSL+Apache (chosen)** |
|---|---|---|---|---|---|
| Anyone can use freely | ✓ | ✓ | ✓ | mostly | mostly |
| Anti-SaaS-cloning | ✗ | weak | strong | strong | strong |
| Enterprise-friendly | ✓ | ✗ | ✗ | mixed | ✓ |
| OSI-approved | ✓ | ✓ | ✗ | ✗ | ✗ (but BSL→Apache future-grant) |
| Future fully-open | ✓ | ✓ | ✓ | ✗ | ✓ (per change date) |
| Allows commercial dual-license | hard | hard | hard | yes | yes |
| Community perception | best | mixed | poor | mixed | improving — proven precedents |
| Relicensing optionality preserved | needs CLA | needs CLA | needs CLA | needs CLA | needs CLA (✓ we will have one) |

BSL+Apache-future-grant is not the most popular option, but for the
open-core + commercial model with anti-SaaS-cloning needs, it is
the best fit. The trade-off (initial perception friction) is
offset by the future-grant promise.

---

## 8. Action plan & timeline

### Immediate (Week 0–1, before any code lands publicly)

- [ ] Decide on entity formation timing. Pre-incorporation, the
  founder is the licensor and copyright holder; transfer at
  incorporation.
- [ ] Reserve domains and npm/winget/PyPI/Cargo names.
- [ ] Reserve GitHub org `manthanos` (or alternatives).
- [ ] Engage trademark counsel; file US application first.
- [ ] Draft `LICENSE` (BSL with parameters), `LICENSE.future-grant`,
  `TRADEMARKS.md`, `CONTRIBUTING.md`, `CLA.md`, `NOTICE`,
  `GOVERNANCE.md`, `SECURITY.md`, `ENFORCEMENT.md`,
  `CODE_OF_CONDUCT.md`.
- [ ] Set up CLA Assistant on the GitHub org (waiting on org).
- [ ] Configure repo CI to enforce SPDX headers and CLA signature.

### Before first public release (within Phase 4)

- [ ] EU trademark filing.
- [ ] India trademark filing.
- [ ] Trademark policy reviewed by counsel.
- [ ] Sigstore/cosign release signing in CI.
- [ ] Public ENFORCEMENT contact (mail alias) live.

### Ongoing

- [ ] Annual review of trademark portfolio and policy.
- [ ] Quarterly review of contributor base — convert frequent
  contributors to maintainers as governance matures.
- [ ] On every release, generate a fresh row in
  `LICENSE.future-grant`'s change-date table for that version.

---

## 9. Things explicitly **not** done

- **No telemetry.** No "anonymous usage reporting." If it's added
  later, it is opt-in and visible, period.
- **No selling user data.** Not now, not as part of a future
  hosted product.
- **No fee-walled extensions hidden in the core.** Open-core
  features that exist live in the core; commercial features live
  in clearly-separate packages with their own licenses.
- **No CLA that grants assignment.** Contributors retain copyright;
  the CLA grants a license, not assignment. This is the
  contributor-friendlier choice and matches Apache, CNCF, and
  others.
- **No "you must use our cloud" lock-in.** Local-first is
  inviolable. A hosted layer, if it ever exists, is a value-add
  not a requirement.

---

## 10. Open questions

- **Entity formation timing and jurisdiction.** Delaware C-corp,
  LLC, or non-US? Depends on long-term funding plans (see project
  brief: open-core + commercial, not necessarily VC-backed). Defer
  decision but bias toward Delaware C-corp if any external funding
  is anticipated within 18 months.
- **Whether to publish a "commercial license" template now or
  later.** Likely later — first prove demand. The BSL is permissive
  enough for most internal use; commercial licensing kicks in only
  for the hosted-resale case.
- **Whether to join an existing foundation** (Linux Foundation,
  Apache, CNCF) later. Probably not in the first two years —
  foundation membership typically requires permissive licensing
  the BSL conflicts with, and our model wants the trademark and
  commercial optionality in our hands.
- **Trademark policy edge cases** — e.g., conference talk titles,
  YouTube tutorials, "ManthanOS user group" meetups. Pre-write a
  short FAQ in `TRADEMARKS.md` to avoid case-by-case adjudication.

---

## 11. One-paragraph summary

ManthanOS will be licensed under the Business Source License 1.1
with a 4-year automatic conversion to Apache 2.0 per release. The
BSL's Additional Use Grant permits all use except offering
ManthanOS itself as a competing hosted service. The "ManthanOS"
name and logo will be registered trademarks; forks are welcome
under the BSL but must rename before public distribution.
Contributors sign an Apache-derived ICLA/CCLA (via CLA Assistant)
that grants ManthanOS the right to relicense in the future. SPDX
headers, NOTICE attributions, and signed releases complete the
hygiene. This stack maximizes adoption while preserving the
commercial and brand integrity needed for the open-core + commercial
business model — and keeps all relicensing optionality open for at
least the first three years.
