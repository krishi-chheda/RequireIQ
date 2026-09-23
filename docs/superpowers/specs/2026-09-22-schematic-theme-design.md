# Technical schematic theme — light and dark

**Date:** 2026-09-22
**Status:** implemented — landing page and workspace pass complete
**Scope:** whole app, delivered landing page first

---

## Why this exists

The current interface is a single dark, low-chroma surface stack: near-black
canvas, one saturated blue, a red-to-yellow severity ramp. It is internally
consistent and every text token clears WCAG AA, but it reads as flat and
undifferentiated, and it offers no light mode for readers who want one.

The replacement is a **technical schematic**: a drafting/CAD aesthetic in two
modes, grounded in what the product is — an instrument that plots statements
against each other and marks where they disagree.

Two constraints carry over unchanged and are not up for negotiation:

- Density stays. The register compares 82 rows; whitespace is a cost.
- Colour still means severity and provenance. No decorative colour.

---

## What makes this tractable

All ~1,200 colour usages in `src/` are **semantic** — `bg-surface`,
`text-ink-muted`, `border-line` — not raw values. A palette change is therefore
a token-layer change, not 1,200 edits.

Measured usage:

| Family | Usages | Family | Usages |
|---|---|---|---|
| `ink` / `ink-muted` / `ink-faint` | 616 | `line` / `edge` | 151 |
| `brand*` | 155 | surfaces | 98 |
| severity | 98 | provenance | 29 |

### The opacity-modifier question, resolved

62 usages carry an opacity modifier (`border-critical/25`, `bg-canvas/85`).
Tailwind v4 compiles each of these **twice**:

```css
.border-critical\/25{border-color:#f2555a40}                                   /* baked */
@supports (color:color-mix(in lab,red,red)){
  .border-critical\/25{border-color:color-mix(in oklab,var(--color-critical) 25%,transparent)}
}
```

The `@supports` block wins on every browser that supports `color-mix`
(baseline since 2023), and it resolves `var(--color-critical)` **at runtime**.
So opacity modifiers follow a live theme switch. The baked hex is a legacy
fallback only.

**Consequence for the design:** dark is declared as the `@theme` default, so
the legacy fallback matches the default mode. A pre-2023 browser in light mode
would get dark-tinted borders — degraded, not broken.

---

## Mechanics

Tokens are re-declared per mode under selectors; component code is untouched.

```
@theme                      -> dark values (also the legacy fallback)
:root[data-theme="light"]   -> light values, unlayered so it beats @layer theme
```

**As built, there is no `prefers-color-scheme` media block.** The inline head
script resolves the stored choice *or* the system preference to an explicit
`data-theme` before first paint, so the light values live in exactly one place.
The cost is that a reader with JavaScript disabled always gets dark - a
degradation to the default rather than to anything broken. Duplicating the
whole light ramp into a media query to cover that case was not judged worth it.

`color-scheme` is set per mode so form controls and scrollbars follow.

**Rejected:** `light-dark()` (interacts awkwardly with Tailwind's two-pass
emit for no gain) and Tailwind `dark:` variants (~1,200 call-site edits).

---

## Palette

### Surfaces and ink — derived, then checked

Every text token clears WCAG AA (4.5:1) against **all five** surfaces in its
own mode. Figures below are the minimum across the five.

**Dark (CAD)**

| Token | Hex | | Token | Hex | Min ratio |
|---|---|---|---|---|---|
| canvas | `#080d13` | | ink | `#e9eef5` | 11.07 |
| surface | `#0e1621` | | ink-muted | `#a6b6c9` | 6.24 |
| raised | `#152030` | | ink-faint | `#8a9db4` | 4.65 |
| overlay | `#1b2938` | | | | |
| hover | `#223345` | | | | |

**Light (drafting paper)**

| Token | Hex | | Token | Hex | Min ratio |
|---|---|---|---|---|---|
| canvas | `#f5f7fa` | | ink | `#0d1720` | 14.62 |
| surface | `#ffffff` | | ink-muted | `#3c4f63` | 6.81 |
| raised | `#f1f5f9` | | ink-faint | `#4e6479` | 4.96 |
| overlay | `#e9eff5` | | | | |
| hover | `#e0e8f0` | | | | |

The light surface ramp is deliberately shallow. A first attempt ran `hover` to
`#d8e3ed` and eight tokens failed against it; keeping the darkest light surface
near paper is what makes one ink ramp work across all five.

**Incidental fix:** white-on-primary-fill is 4.55 today — the tightest pair in
the system, with no headroom. The new brand steps put it near 7:1 in both
modes.

### Severity is a status palette, not a categorical one

Earlier analysis ran the *categorical* six-check validator against the severity
ramp and reported a failure. That was the wrong gate. A status palette is a
fixed, reserved scale whose accessibility channel is **icon + label**, not hue
distance; red/orange/amber sit close together by design in every such palette.

The design change that follows:

> **The severity word renders in `ink`. The severity colour appears only as the
> dot and the track.**

The colour is then a graphical object needing 3:1, not text needing 4.5:1 —
which is what allows **one mode-invariant status set** to work on both `#ffffff`
and `#080d13`. Meaning always travels on the word.

This supersedes nothing in behaviour: severity was already never stacked as
adjacent fills, and that rule stands.

### Plotting accents

Cyan `brand` for interaction, amber as the second plotting accent. The
categorical `--color-class-*` set is re-derived per mode and gated by the
palette validator's six checks in **both** modes before it ships.

---

## Schematic treatment

- A faint plotted grid on `canvas`, built from CSS gradients. No images.
- Hairline rules at `line` / `edge`; borders do the work shadows would.
- Mono-accented small labels: identifiers, offsets, units.
- Marks read as plotted rather than drawn.

---

## Landing page

Keeps the live conflict calculator and the existing visuals. Adds:

- **The theme toggle.**
- **A requirement-type explorer.** The bars are buttons; selecting one shows
  three real statements of that class, verbatim with their references, in a
  live region. Samples are sliced on the server so a click cannot spin. The
  bars keep one hue - selection is shown by weight and fill strength, never by
  giving each class its own colour.
- **Timeline/quote pairing.** Each mark on the axis and the quote it refers to
  share a `data-mark`, and one `:has()` rule per pair lights both whichever the
  pointer is over. No JavaScript, no state, and nothing focusable inside the
  aria-hidden SVG.

The pairing is hover-only by design, and that is a deliberate limit rather than
an oversight: both statements are fully readable below the diagram without it,
so it adds a relationship, not information. A keyboard user loses nothing.

Two implementation notes worth keeping:

- The quote highlight had to be **unlayered**. The quotes carry a `bg-raised`
  utility, and `@layer utilities` beats `@layer components` regardless of
  specificity, so the rule silently did nothing until it was moved out of the
  components layer.
- A first version set the hover background to `raised` - the colour the quotes
  already were. It matched, applied, and changed nothing visible.

---

## Verification

`src/test/design-tokens.test.ts` is extended to assert the contrast matrix in
**both** modes, so a regression in either ramp fails the build. It also enforces no raw hex outside
`tokens.css`, and asserts the severity marks are never redeclared per mode.

Then a rendered-contrast audit over every route in both modes - see below.

---

## Delivery order

1. Token layer, both ramps, split into `tokens.css`.
2. Theme toggle + no-flash script.
3. Landing page, including the new interactions.
4. **Sign-off on the look.**
5. Workspace migration, page by page. **Done** - see the audit note below.
6. Extended tests and the full visual pass. **Done.**

## Workspace pass, as executed

Rather than eyeball 30 screen-states, every route was audited with a rendered
contrast script: it walks each text node, composites the effective background
through transparent ancestors, and compares against the WCAG threshold for that
node's size and weight. Run over 11 workspace routes plus three detail pages,
in both modes.

**One caveat worth recording.** The first run reported ~40 failures on `/app`,
including impossible 1.00 ratios. They were artefacts: elements carrying
`transition-colors` were measured mid-transition after the theme attribute
flipped. Disabling transitions before measuring cleared all of them. Any future
run of this audit must inject a transition-killing stylesheet first.

Real defects found and fixed:

| Defect | Where | Measured |
|---|---|---|
| `text-white` on the cyan brand fill | exports page download button | 3.09:1 in dark |
| `color: white` on the brand fill | `.skip-link` | 3.09:1 in dark |
| Hardcoded dark scrollbar thumb | `globals.css` | wrong colour in light |
| Hardcoded dark modal scrim | `globals.css` | now `--color-scrim`, per mode |

Landing page first is deliberate: it is one screen, it exercises every token
family, and getting agreement there prevents applying a wrong direction to all
15 pages at once.

---

## Risks

| Risk | Mitigation |
|---|---|
| Light mode makes dense tables harsh for long reading | Dark stays the default; light is opt-in. Revisit after the workspace pass. |
| `globals.css` doubles in size | Split the ramps into `tokens.css`. |
| The workspace surfaces problems the landing page did not | Landing-first sign-off, then migrate page by page rather than in one sweep. |
| Legacy browsers freeze opacity-modified colours to dark | Accepted. Degrades to dark-tinted borders in light mode on pre-2023 browsers. |
