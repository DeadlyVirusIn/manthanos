# Branding

> Visual identity reference. Read this before using a ManthanOS logo in
> a README, badge, social avatar, blog post, slide, or terminal.

This document covers usage. The actual brand assets live under
[`docs/assets/brand/`](./assets/brand/). The locked-in canonical
master reference is
[`docs/assets/brand/mockups/brand-sheet.png`](./assets/brand/mockups/brand-sheet.png).

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

### 3.1 Monochrome — Dark Themes

- File: [`icons/icon-monochrome-black.png`](./assets/brand/icons/icon-monochrome-black.png)
- Black background, white M outline + circuit motif.
- Use when: dark UI themes, terminal banners with a dark prompt theme,
  badges where the background is solid black.

### 3.2 Monochrome — Print / Light Themes / Badges

- File: [`icons/icon-monochrome-white.png`](./assets/brand/icons/icon-monochrome-white.png)
- White background, black M outline + circuit motif.
- Use when: printed materials, light-mode rendering surfaces, GitHub
  badges, paper presentations, anywhere a colored gradient would not
  reproduce.

### 3.3 Flat icon (no glow)

- File: [`icons/icon-flat.png`](./assets/brand/icons/icon-flat.png)
- Gradient M with circuit ring, flat treatment without the glow effect
  of the primary mark.
- Use when: a smaller, less assertive variant fits better than the
  primary — small inline icons, compact UI surfaces, footer marks.

### 3.4 Color logo (vector master)

- File: [`icons/logo-vector-color.png`](./assets/brand/icons/logo-vector-color.png)
- The canonical brand sheet's "logo.svg" reference rendering —
  gradient badge with circle outline highlighted on right/top.
- Use when: mid-size docs/cards where a slightly different lighting
  from the primary is desirable.

### 3.5 Hero (presentation only)

- File: [`mockups/hero-presentation.png`](./assets/brand/mockups/hero-presentation.png)
- Chrome / metallic 3D treatment from the HERO VARIANT (PRESENTATION)
  panel.
- **Do not use** in the README or CLI. Reserved for slides, social
  cards, and anywhere "polish" is a feature rather than a liability.

### 3.6 Restrained glow (presentation only)

- File: [`mockups/restrained-glow.png`](./assets/brand/mockups/restrained-glow.png)
- Chrome pedestal variant with a subtle green glow. Even more decorative
  than the Hero — reserved strictly for presentation.

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
| 512×512 | [`icons/favicon-512.png`](./assets/brand/icons/favicon-512.png) |

At 16px the M is barely legible; the circular silhouette is the
primary recognition cue. At 32px+ the M is readable. **Don't use
the primary mark below 32px** — substitute a favicon size or a
monochrome variant.

---

## 6. README usage

The README uses **a small, centered primary mark above the title**.
The text title is preserved. The image must:

- Use the colored primary mark on dark backgrounds (GitHub default).
- Be set to roughly 96–128 px height — not larger.
- Stay inside the existing `<div align="center">` block.
- Include alt-text describing the badge ("ManthanOS logo — circular
  badge with stylized M, circuit motif") so screen readers and image-off
  contexts degrade gracefully.

Markdown convention used:

```markdown
<div align="center">

<img src="./docs/assets/brand/icons/primary-logo.png"
     alt="ManthanOS logo"
     width="120" />

# ManthanOS
```

**Do not:**

- Add multiple logos to the README header.
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
  [`mockups/brand-sheet.png`](./assets/brand/mockups/brand-sheet.png).
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
  [`icons/icon-flat.png`](./assets/brand/icons/icon-flat.png) or
  [`icons/icon-monochrome-black.png`](./assets/brand/icons/icon-monochrome-black.png).
- Source #5 does not provide a separate square app-icon set;
  a future vector pass would add tinted treatments.

### Twitter / X / LinkedIn

Same primary mark, white background for LinkedIn (`icon-monochrome-white.png`),
dark background elsewhere (`primary-logo.png`).

---

## 9. Dark / light usage matrix

| Background | Use |
|---|---|
| Dark (#04091A, near-black) | Primary mark (`primary-logo.png`) or `icon-monochrome-black.png` (the dark-themes variant — black bg / white M). |
| Light (white, paper, #F2F2F2) | `icon-monochrome-white.png` (the print/badges variant — white bg / black M). |
| Mid-tone (slate, gray) | Primary mark works; if the gradient fights the background, fall back to `icon-monochrome-white.png` or `icon-monochrome-black.png` per contrast. |
| Colored / brand-conflicting | Always monochrome. Never overlay the gradient mark on a chromatic background. |

---

## 10. Spacing guidance

- **Minimum clear space around the badge:** equal to the height of the
  M (so if the badge is 120px tall, leave at least 60px of breathing
  room on every side).
- **Minimum spacing between badge and wordmark when paired:** 24px.
- **Do not crop the circular outline.** If you need to fit the mark
  into a tight space, scale it down or substitute a favicon size.

---

## 11. Color palette

Source: OFFICIAL COLOR PALETTE declared on the locked-in canonical
brand sheet (`mockups/brand-sheet.png`). Use these hex values when
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
brand sheet** (`mockups/brand-sheet.png`). Nothing in the kit comes
from any earlier brand-sheet iteration.

### `docs/assets/brand/icons/`

| File | Use |
|---|---|
| `primary-logo.png` | Primary mark, docs/CLI (PRIMARY LOGO panel) |
| `icon-monochrome-black.png` | Dark themes (black bg / white M) |
| `icon-monochrome-white.png` | Print/badges (white bg / black M) |
| `icon-flat.png` | Flat gradient variant, no glow (FLAT icon from vector master row) |
| `logo-vector-color.png` | Color glow variant (logo.svg from vector master row) |
| `favicon-{16,32,64,128,256,512}.png` | Browser / package icon sizes, downscaled from `primary-logo.png` |

### `docs/assets/brand/wordmark/`

| File | Use |
|---|---|
| `wordmark-color.png` | The "ManthanOS" wordmark from the PRIMARY LOGO panel |

### `docs/assets/brand/mockups/`

| File | Use |
|---|---|
| `brand-sheet.png` | **Locked-in canonical master reference.** If any guidance in this document conflicts with this image, this image wins. |
| `hero-presentation.png` | 3D chrome HERO VARIANT — presentation only, not for docs/CLI |
| `restrained-glow.png` | Chrome pedestal RESTRAINED GLOW — presentation only |
| `monochrome-pair.png` | The two monochromes shown side-by-side as reference |
| `color-palette.png` | The OFFICIAL COLOR PALETTE swatches in isolation (6 colors) |
| `favicon-stress.png` | The FAVICON STRESS TEST panel showing 10/60/128/256px renderings |
| `cli-example.png` | CLI prompt mockup as composed on the canonical sheet |
| `meaning.png` | The MEANING (REFINED DESCRIPTIONS) panel |

---

## 14. Tagline note

The canonical brand sheet carries the tagline:
**"CONTINUITY INFRASTRUCTURE / for MULTI-MODEL AI ENGINEERING"**.

This is close to but not identical to the README's H3:
**"Continuity infrastructure for multi-model engineering workflows."**

The README's wording is the operational source of truth. For composed
assets (social cards, slide decks), either tagline is acceptable.
Avoid any variant that mentions "multi-tenant" — multi-tenant is on
the deferred-list per `POSITIONING_CORRECTION.md` §3 and `README.md` §4.

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
[`docs/assets/brand/mockups/brand-sheet.png`](./assets/brand/mockups/brand-sheet.png).

If any guidance in this document conflicts with that image, the image
wins. The sheet labels each variant with its intended use
("PRIMARY LOGO (DOCS/CLI)", "HERO VARIANT (PRESENTATION)",
"ULTRA-MINIMAL MONOCHROME VARIANT", "VECTOR MASTER ASSETS",
"OFFICIAL COLOR PALETTE", "MEANING (REFINED DESCRIPTIONS)",
"FAVICON STRESS TEST") and embeds the official tagline.

Prior iterations of the brand sheet are not preserved in-repo
(they were intermediate; this version is locked in).
