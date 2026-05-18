# Branding

> Visual identity reference. Read this before using a ManthanOS logo in
> a README, badge, social avatar, blog post, slide, or terminal.

This document covers usage. The actual brand assets live under
[`docs/assets/brand/`](./assets/brand/). The locked-in canonical
master reference is
[`docs/assets/brand/mockups/section-1-full.png`](./assets/brand/mockups/section-1-full.png).

This is not a marketing document. It is operational guidance so the
logo gets used consistently without slowing anyone down.

---

## 1. What the brand is trying to communicate

Three ideas, taken verbatim from the canonical brand sheet's MEANING
(REFINED DESCRIPTIONS) panel:

1. **Separating Signal** — cutting through noise to surface what
   matters. The circular badge geometry frames the M as something
   filtered out and held up.
2. **Spine of Truth & Continuity** — a persistent backbone that
   preserves context and intent. The circuit motif reads as
   infrastructure, not decoration.
3. **Collaborative Intelligence** — humans and models working
   together with continuity. The blue→purple→magenta gradient
   suggests range converging on one record, without saying so in copy.

What the brand is **not** trying to say (intentionally):

- "AI is exciting." (Anti-hype is part of the product's discipline.)
- "We are a startup." (No badges, no taglines beyond the official one.)
- "We are autonomous." (The motif suggests circuit-level plumbing, not
  agents.)

The wordmark "ManthanOS" carries the gradient on the `OS` suffix only —
a deliberate restraint so the wordmark works monochrome when needed.

---

## 2. Primary mark

**Use this for docs, CLI splash, GitHub README, package metadata.**
Explicitly labeled "ENGINEERING-SAFE" on the canonical brand sheet.

- File: [`icons/primary-logo.png`](./assets/brand/icons/primary-logo.png)
- 510×530 px, raster
- Dark navy background, blue→purple→magenta gradient M, circuit-motif circular badge.

Use when:

- README header (sized small, see §6 README usage).
- CLI splash output (`manthan version` or future `manthan banner`).
- Documentation hero blocks where a colored asset reads cleanly.
- GitHub social preview image.

Avoid when:

- Backgrounds are bright (the dark navy background fights light themes —
  use the monochrome variant instead).
- Sizes below 64px (use favicon variants instead).

---

## 3. Secondary marks

### 3.1 Icon variations grid (4 cells, section 2 of the brand sheet)

The brand sheet's ICON VARIATIONS GRID provides four labeled treatments:

| Variant | File | Use |
|---|---|---|
| FULL COLOR | [`icons/icon-full-color.png`](./assets/brand/icons/icon-full-color.png) | Gradient M without glow. Use for compact reproduction where the primary's heavier glow would feel oversized. |
| NEON GLOW | [`icons/icon-neon-glow.png`](./assets/brand/icons/icon-neon-glow.png) | Same gradient M with stronger neon glow. Use sparingly — visually loud. |
| SINGLE COLOR | [`icons/icon-single-color.png`](./assets/brand/icons/icon-single-color.png) | Solid teal/cyan M (not white — "single color" means single-hue here). Use on backgrounds where the gradient fights the surface. |
| WHITE | [`icons/icon-white.png`](./assets/brand/icons/icon-white.png) | Solid white M. Use on dark backgrounds where you need maximum contrast and no chromatic interference. |

### 3.2 App icons (section 3)

Three square app-icon variants for avatars and tiles:

| File | Use |
|---|---|
| [`icons/app-icon-1.png`](./assets/brand/icons/app-icon-1.png) | First in the section 3 stack — gradient/dark treatment (M on dark with circuit ring) |
| [`icons/app-icon-2.png`](./assets/brand/icons/app-icon-2.png) | Second — white-background variant (cyan M on white) |
| [`icons/app-icon-3.png`](./assets/brand/icons/app-icon-3.png) | Third — blue gradient variant (white M on blue gradient) |

(Names are positional because the brand sheet does not label the
three app icons by color or theme. Use the `mockups/app-icons-stack.png`
visual reference to pick the right one for a given context.)

### 3.3 Hero (presentation only)

- File: [`mockups/hero-presentation.png`](./assets/brand/mockups/hero-presentation.png)
- Chrome / metallic 3D treatment from the HERO VARIANT panel.
- **Do not use** in the README or CLI. Reserved for slides, social
  cards, and anywhere "polish" is a feature rather than a liability.

---

## 4. Wordmark

One canonical variant, extracted from the PRIMARY LOGO (DOCS/CLI)
panel of the locked-in brand sheet:

- [`wordmark/wordmark-color.png`](./assets/brand/wordmark/wordmark-color.png)
  — "ManthanOS" with the white "Manthan" + gradient (blue→purple) "OS".

Pair the wordmark with the primary logo (badge to the left, wordmark
to the right) only when both elements have at least 24px of breathing
room between them. If they crowd, drop one — either the badge alone
or the wordmark alone.

---

## 5. Icon usage at small sizes (favicons / stress test)

Pre-rendered sizes for browser tabs, package icons, and small-format
embeds.

| Size | File |
|---|---|
| 16×16 | [`icons/favicon-16.png`](./assets/brand/icons/favicon-16.png) |
| 32×32 | [`icons/favicon-32.png`](./assets/brand/icons/favicon-32.png) |
| 64×64 | [`icons/favicon-64.png`](./assets/brand/icons/favicon-64.png) |
| 128×128 | [`icons/favicon-128.png`](./assets/brand/icons/favicon-128.png) |
| 256×256 | [`icons/favicon-256.png`](./assets/brand/icons/favicon-256.png) |

At 16px the M is barely legible; the circular silhouette is the
primary recognition cue. At 32px+ the M is readable. **Don't use
the primary mark below 32px** — substitute a favicon size or a
monochrome variant.

---

## 6. README usage

The README uses **the lockup variant as a single header image**,
replacing the previous small-badge + text-title pattern.

- File: [`lockup/manthanos-lockup.png`](./assets/brand/lockup/manthanos-lockup.png)
- Width: 560 px in the README.
- Composition: badge + "ManthanOS" wordmark + tagline
  ("CONTINUITY INFRASTRUCTURE for MULTI-MODEL AI ENGINEERING") in one
  cohesive lockup, on dark navy background.
- Alt text is **load-bearing** because the H1 and H3 are no longer
  rendered as text — screen readers, image-off contexts, and search
  crawlers see only the alt string. Use:
  `"ManthanOS — continuity infrastructure for multi-model AI engineering"`.

Markdown convention:

```markdown
<div align="center">

<img src="./docs/assets/brand/lockup/manthanos-lockup.png"
     alt="ManthanOS — continuity infrastructure for multi-model AI engineering"
     width="560" />

A short descriptive paragraph below the lockup, in plain markdown.

</div>
```

**Do not:**

- Add a separate small badge above or beside the lockup.
- Add an H1 `# ManthanOS` heading below the lockup (the lockup
  contains the wordmark; an H1 is redundant).
- Replace the text title with an image.
- Embed the brand sheet ("hero variant") in the README.
- Add a banner image stretched across the README width.

---

## 7. Terminal-safe variant

Terminal output cannot render images. When ManthanOS prints a banner
to the CLI, it uses a 1-line wordmark:

```
ManthanOS  ·  continuity infrastructure
```

Avoid ASCII-art logos. They look fragile under different terminal
widths and color schemes, and they distract from runtime output.

If a future CLI command does need a small visual marker, use a
single Unicode character with restraint — `⌬` or `◉` — never an
ASCII drawing.

---

## 8. GitHub / social usage

### GitHub repo social preview

- Use the canonical brand sheet:
  [`mockups/section-1-full.png`](./assets/brand/mockups/section-1-full.png).
- Or compose a custom 1280×640 image using `primary-logo.png` + wordmark
  on the dark-navy background color (`#04091A`).

### GitHub README badges

- The repo intentionally does **not** carry rows of shields.io badges
  (build / coverage / license / etc). Adding badges runs counter to
  the README's anti-hype discipline.
- If a single badge is justified later (e.g., release version once
  releases exist), use the white-background monochrome variant of the
  icon so the badge reads correctly against shields.io's colored
  backgrounds.

### Avatars (org / contributor / Discord)

- 256×256 or 512×512 favicon variant for circular crops.
- For square avatars where a flatter treatment fits, use
  [`icons/icon-full-color.png`](./assets/brand/icons/icon-full-color.png) or
  [`icons/icon-white.png`](./assets/brand/icons/icon-white.png).
- Source #5 does not provide a separate square app-icon set;
  a future vector pass would add tinted treatments.

### Twitter / X / LinkedIn

Same primary mark, white background for LinkedIn (`icon-single-color.png`),
dark background elsewhere (`primary-logo.png`).

---

## 9. Dark / light usage matrix

| Background | Use |
|---|---|
| Dark (#04091A, near-black) | Primary mark (`primary-logo.png`) or `icon-white.png` (the dark-themes variant — black bg / white M). |
| Light (white, paper, #F2F2F2) | `icon-single-color.png` (the print/badges variant — white bg / black M). |
| Mid-tone (slate, gray) | Primary mark works; if the gradient fights the background, fall back to `icon-single-color.png` or `icon-white.png` per contrast. |
| Colored / brand-conflicting | Always monochrome. Never overlay the gradient mark on a chromatic background. |

---

## 10. Spacing + usage rules

The canonical brand sheet's §9 (USAGE GUIDELINES & VARIATIONS) declares
three rules verbatim. They are the source of truth here:

1. **Use on dark backgrounds to maximize impact and signal visibility.**
2. **Ensure clear space and maintain horizontal alignment for consistency.**
3. **Do not rotate, stretch, or alter the color palette of any asset.**

Practical interpretations of those rules:

- **Minimum clear space around the badge:** equal to the height of the
  M (so if the badge is 120px tall, leave at least 60px of breathing
  room on every side). This is the "clear space" the §9 rule demands.
- **Minimum spacing between badge and wordmark when paired:** 24px.
  When pairing, keep badge and wordmark on the same baseline — that's
  the "horizontal alignment" of §9.
- **Do not crop the circular outline.** If you need to fit the mark
  into a tight space, scale it down or substitute a favicon size.
- **Do not recolor.** The §9 rule "do not alter the color palette"
  means: do not retint the gradient, do not swap the M's color for a
  brand color other than those in §11, do not invert. Use the
  monochrome variants when a color version is wrong for the surface.

---

## 11. Color palette

Source: OFFICIAL COLOR PALETTE declared on the locked-in canonical
brand sheet (`mockups/section-1-full.png`). Use these hex values when
producing any new asset (e.g., a social card composed in another tool).

| Role | Name | Hex |
|---|---|---|
| Primary Blue | the cool end of the gradient | `#00A6FF` |
| Electric Cyan | brightest highlight, used sparingly | `#00E1FF` |
| Magenta Accent | the warm end of the gradient | `#FF3DF9` |
| Dark Navy | brand background | `#04091A` |
| Soft White | text on dark, light-theme backgrounds | `#F2F2F2` |
| Engineering Teal | semantic-success / "validated" callouts | `#00BF91` |

The gradient runs Primary Blue → Magenta Accent, with Electric Cyan
used only as a thin highlight on the M's left edge in the primary mark.
Engineering Teal is reserved for "validated / proven / safe" semantic
cues — analogous to how `git status` uses green for "clean."

A reference swatch panel is at
[`mockups/color-palette.png`](./assets/brand/mockups/color-palette.png).

---

## 12. Typography

The wordmark "ManthanOS" appears to be set in a wide-sans, geometric
typeface with slightly elongated proportions — closest open-source
analogue is **Inter** or **Geist Sans** with `font-weight: 500` and
slight letter-spacing. The gradient is applied **only to the `OS`
suffix**.

For body text in any future surface (slide deck, landing page,
external doc), prefer:

- **Sans-serif:** Inter, Geist Sans, or system-ui default.
- **Monospace (for code / CLI references):** JetBrains Mono, Geist Mono,
  or system monospace default.

Do not introduce a third typeface family. Two is the ceiling.

---

## 13. Asset inventory (current)

Listed by folder. All assets are raster (PNG) for now; SVG masters
are TODO (see §15).

All assets in this inventory are derived from the **locked-in canonical
brand sheet** (`mockups/section-1-full.png`). Nothing in the kit comes
from any earlier brand-sheet iteration.

### `docs/assets/brand/icons/`

| File | Use |
|---|---|
| `primary-logo.png` | Primary mark, docs/CLI — from the PRIMARY LOGO (DOCS/CLI) panel of section 1 |
| `icon-full-color.png` | Full gradient M without glow — section 2 ICON VARIATIONS GRID, first cell |
| `icon-neon-glow.png` | Same gradient M with neon glow — section 2, second cell |
| `icon-single-color.png` | Solid teal/cyan M (single-color treatment) — section 2, third cell |
| `icon-white.png` | Solid white M — section 2, fourth cell |
| `app-icon-{top,middle,bottom}.png` | Square app icon variants from section 3 (positional names because the brand sheet doesn't label them by color) |
| `favicon-{16,32,64,128,256,512}.png` | Browser / package icon sizes, downscaled from `primary-logo.png` |

### `docs/assets/brand/wordmark/`

| File | Use |
|---|---|
| `wordmark-color.png` | The "ManthanOS" wordmark from the PRIMARY LOGO panel — small inline use |
| `wordmark-large.png` | The large "ManthanOS" master file from section 5 — for headers, social cards |

### `docs/assets/brand/lockup/`

| File | Use |
|---|---|
| `manthanos-lockup.png` | Badge + wordmark + tagline composed together. **The README header.** Also use as-is on GitHub social preview cards and slide titles. |

### `docs/assets/brand/mockups/`

All cropped from the brand sheet's labeled sections.

| File | Section | Use |
|---|---|---|
| `brand-sheet.png` | (whole sheet) | **Locked-in canonical master reference.** If any guidance in this document conflicts with this image, this image wins. |
| `hero-presentation.png` | §1 HERO | 3D chrome variant — presentation only |
| `icon-variations-grid.png` | §2 | The four icon variations shown together as reference |
| `app-icons-stack.png` | §3 | The three app icons stacked as reference |
| `meaning.png` | §4 BRAND SYMBOLISM (English Descriptions) | The three meaning concepts panel |
| `master-files.png` | §5 MASTER FILES (.SVG) | Large wordmark + icon/wordmark/logo svg references |
| `color-palette.png` | §6 OFFICIAL COLOR PALETTE | The 6 colors with hex values |
| `favicon-stress.png` | §7 FAVICON STRESS TEST | Multi-size favicon renderings |
| `cli-example.png` | §8 TERMINAL INTEGRATION MOCKUP | `manthan plan` CLI prompt visualization |
| `usage-guidelines.png` | §9 USAGE GUIDELINES & VARIATIONS | The three usage rules + RESTRAINED variant |

---

## 14. Tagline

The operational tagline (as rendered on the README via the lockup) is:

> **CONTINUITY INFRASTRUCTURE for MULTI-MODEL AI ENGINEERING**

This is the version baked into the lockup image. Use this exact
wording on any composed asset (social cards, slide titles, etc.).

A slightly different earlier wording — "Continuity infrastructure
for multi-model engineering workflows" — has appeared in
narrative prose. Either phrasing is acceptable in prose; the
lockup-tagline is the canonical public one.

Avoid any variant that mentions "multi-tenant" — multi-tenant is
on the deferred-list per `README.md` §4.

---

## 15. What's still TODO

Honest list, not a roadmap:

- **True SVG masters.** Current assets are all PNG. The brand sheets
  illustrate `icon.svg`, `wordmark.svg`, `logo.svg` as targets, but
  those files don't exist. A vector pass would produce sharper assets
  at every size and replace several of the PNG variants.
- **Transparent backgrounds on icons.** Current monochrome variants
  have solid backgrounds (black and white squares). Versions with
  alpha channels around the badge would be more reusable.
- **Reproducible color sourcing.** The hex values in §11 are taken from
  the canonical brand sheet's palette swatches and from visual sampling;
  if those values are ever disputed, the brand sheet is the source of
  truth.
- **One-line ANSI wordmark for CLI banner.** §7 says "use the 1-line
  wordmark" but no command currently prints one. Future work.

None of these block current usage.

---

## 16. Locked-in canonical reference

The single source of truth is
[`docs/assets/brand/mockups/section-1-full.png`](./assets/brand/mockups/section-1-full.png).

If any guidance in this document conflicts with that image, the image
wins. The sheet labels each variant with its intended use
("PRIMARY LOGO (DOCS/CLI)", "HERO VARIANT (PRESENTATION)",
"ULTRA-MINIMAL MONOCHROME VARIANT", "VECTOR MASTER ASSETS",
"OFFICIAL COLOR PALETTE", "MEANING (REFINED DESCRIPTIONS)",
"FAVICON STRESS TEST") and embeds the official tagline.

Prior iterations of the brand sheet are not preserved in-repo
(they were intermediate; this version is locked in).
