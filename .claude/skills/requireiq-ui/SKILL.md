---
name: requireiq-ui
description: The house UI rules for RequireIQ. Use before writing, editing or reviewing any file under src/app or src/components, before adding a colour, spacing or type value, and before adding any UI dependency. This register tool has an existing, deliberate design system - read it before changing it.
---

# RequireIQ UI

RequireIQ is a **requirements register for enterprise IT delivery**. Its readers are
business analysts, delivery leads and consultants who are accountable for what the
register says. The interface's only job is to let a person **check a claim** — see a
number, click it, land on the records behind it, and read the source sentence with
its character offsets.

Everything below follows from that. A decoration that makes a figure harder to
verify is a defect, not a style preference.

## 0. Before you change anything

1. Read `src/app/globals.css`. It is the whole token system, with the reasoning
   in comments. Do not skim it.
2. Read `src/components/ui.tsx`. It is the whole component kit — 25 exports.
3. Grep for the thing you are about to build. `Badge`, `Stat`, `Meter`,
   `EmptyState`, `Callout`, `SkeletonRows`, `TableFrame`/`Th`/`Td`,
   `ProvenanceTag`, `SeverityBadge`, `StatusBadge`, `Confidence`, `Ref`,
   `LinkButton`, `buttonClass` already exist.
4. Only then decide what to write.

If a change touches more than three files under `src/components`, stop and
describe the change before making it.

## 1. Design principles

1. **Every number is a link.** A figure a reader cannot click through to its
   records is a claim they cannot check. The dashboard already works this way;
   keep it that way.
2. **Provenance is the primary visual language.** `source` / `ai_analysis` /
   `ai_suggestion` / `human` must be legible on every record surface. Use
   `ProvenanceTag`. Never render an AI reading with the same weight as a quote.
3. **Colour means severity, nothing else.** The severity ramp
   (critical → high → medium → low) and the outcome colours are reserved. No
   decorative colour, no gradient washes, no accent-for-mood.
4. **Density is a feature.** This reader is comparing 82 rows. Do not add
   whitespace, do not convert tables to cards, do not raise the 14px base.
5. **Never paraphrase in the UI.** Quoted source text is rendered verbatim with
   its offsets. Do not truncate a quote without a visible affordance to see all
   of it.
6. **Absence is information.** "No owner", "no acceptance criteria",
   "insufficient evidence" are findings and must be rendered as findings, never
   as blank cells or hidden rows.
7. **Server-first.** A component becomes `"use client"` only because it needs
   browser state. Twelve of ~50 qualify today. Adding a thirteenth needs a
   one-line reason in a comment.
8. **State lives in the URL.** Filters, views and searches are query params so a
   filtered register is a link a consultant can paste into an email. See
   `src/components/filters.tsx`.

## 2. Visual language — use the tokens, never raw values

All tokens are Tailwind v4 `@theme` entries in `src/app/globals.css`, so they are
available as utility classes: `bg-surface`, `text-ink-muted`, `border-line`,
`text-critical`, `bg-brand-soft`, `rounded-sm`.

| Axis | Rule |
|---|---|
| Surfaces | `canvas` → `surface` → `raised` → `overlay` → `hover`. Five steps, in that order. Do not invent a sixth. |
| Hairlines | `line` by default, `edge` for emphasis. Never a shadow where a hairline will do. |
| Text | `ink` / `ink-muted` / `ink-faint`. All three clear WCAG AA against all five surfaces — verified. Do not add a fainter step. |
| Severity | `critical` / `high` / `medium` / `low` and their `-soft` backgrounds. Reserved for severity. |
| Provenance | `prov-source` / `prov-ai` / `prov-suggest` / `prov-human`. Reserved for provenance. |
| Brand | `brand`, `brand-strong`, `brand-soft`, `brand-ink`. Used for interaction and the active nav item only. |
| Radius | `xs 3px` / `sm 5px` / `md 8px` / `lg 12px`. Controls get `sm`, containers get `md`. Nothing is pill-shaped. |
| Type | One family (`--font-sans`) plus `--font-mono` for IDs, offsets and locators. Base 14px, line-height 1.55. |
| Numerals | Anything a reader compares column-wise carries `data-numeric` or lives in a `<table>` (both get `tabular-nums`). |

| Graph classes | `--color-class-*`, one per requirement class plus `unknown`. A categorical palette, separate from severity and provenance even where a value coincides — a class is not a severity. |
| Graph edges | `--color-rel-*`, except `contradicts`, which uses `--color-critical` because it is the only edge that means a problem. |

**Raw hex, raw px and raw rgba are not allowed anywhere under `src/` except
`globals.css`.** This is enforced, not requested: `src/test/design-tokens.test.ts`
fails the build on a raw six-digit hex in any `.ts`/`.tsx` file and names the
file and line. There is exactly one exemption, `src/app/layout.tsx`, because
`<meta name="theme-color">` is read before any stylesheet is parsed and cannot
reference a custom property — and that literal is itself asserted equal to
`--color-canvas`.

The same test asserts every text token clears AA on all five surfaces, that the
soft-background pairs clear AA, that white-on-brand stays above 4.5, and that
every `--color-class-*` and `--color-rel-*` clears 3:1 on `surface`. Add a
colour and you add it to `globals.css` or the build stops.

Dark only, on purpose (`color-scheme: dark`). Do not add a light theme unless
asked; if asked, it is a token-layer change in `globals.css`, not per-component
conditionals.

## 3. Component rules

**Reuse first.** Create a new component only when all three hold: it appears on
two or more routes, it carries behaviour rather than markup, and no existing
export can take a prop instead. Otherwise inline it in the page.

| Surface | Rule |
|---|---|
| Buttons | `buttonClass()` / `LinkButton` / `BUTTON_VARIANTS`. One primary action per view. Labels are the verb that happens: "Approve", not "Submit". |
| Inputs | `INPUT_CLASS` + `Field` from `forms.tsx`. Every input has a `<label htmlFor>`. |
| Forms | `ActionForm` + `useActionState`. Never a client-side `fetch` to a route handler for a mutation. Pending state comes from `useFormStatus`, never a local boolean. |
| Cards | `Card` + `CardHeader`. A card groups records; it is not a decoration. No shadow, no gradient. |
| Tables | `TableFrame` with an explicit `minWidth` = sum of fixed columns + real room for the content column. Under it the container scrolls horizontally; the table never reflows to cards. The first column is pinned via `.table-sticky-first`, which assumes the table sits on `bg-surface` — keep tables inside a `Card`. `Th` carries `scope`. |
| Navigation | `ProjectNav`. Active item via `aria-current="page"`. Counts render only when > 0 and turn `critical` only when the count means something is wrong. |
| Alerts | `Callout`. States what happened and what to do. Never apologises, never vague. |
| Badges | `Badge` / `SeverityBadge` / `StatusBadge` / `ProvenanceTag`. `Dot` where a badge would crowd a row. |
| Charts | Inline SVG from tokens, deterministic layout, no chart library, no animation loop. See `graph.tsx` and its header comment for why. |
| Modals | Native `<dialog>`. The backdrop style is already in `globals.css`. |

## 4. The three states, every time

A view is not finished until all three exist.

- **Loading** — `loading.tsx` at the segment, `SkeletonRows` inside it. The
  skeleton must have the same column count and row height as the real table, or
  the page jumps.
- **Empty** — `EmptyState` with a sentence saying *why* it is empty and the one
  action that changes it. "No conflicts found" and "No documents ingested yet"
  are different screens.
- **Error** — an `error.tsx` at the route segment, not just the app root, so a
  failing register keeps the nav shell and the reader keeps their place. The
  project segment has one; a new top-level segment needs its own.

Filtered-to-zero is an empty state, never a blank table body. `RegisterFilters`
already renders the "shown of total" count and a "Clear filters" control, so a
new filtered view gets both by using it rather than rolling its own.

## 5. Accessibility — the floor, not a phase

- Contrast is already AA across the token matrix. If you add a colour pair,
  compute the ratio before committing it. White on `--color-brand` is 4.55 — the
  tightest pair in the system; do not make it smaller text.
- The focus ring in `globals.css` applies everywhere. Never `outline: none`
  without a replacement of equal visibility.
- Every input: a real `<label htmlFor>`. `Field` wires the hint to the control
  with `aria-describedby` itself, deriving the id from `htmlFor` and cloning the
  child — so keep passing `htmlFor` matching the control's `id` and it is
  handled. Do not wire it again at the call site.
- Action results announce: `role="status"`/`aria-live="polite"` for success,
  `role="alert"`/`aria-live="assertive"` for failure. `ActionMessage` does this;
  keep it.
- A control whose only effect is to change how many rows a table has must
  announce the new count. `RegisterFilters` has `aria-live` on its count line
  for exactly this.
- **The graph SVG is `aria-hidden`, and `RelationshipList` under it is the
  accessible path.** A radial layout is not navigable by keyboard, so do not put
  `role="img"`, `tabIndex` or `role="button"` back on it — `role="img"` in
  particular hides focusable descendants and produces tab stops that announce
  nothing. Any data added to the picture goes into the list too.
- Tables: `scope` on every header, caption or a heading immediately above.
- `prefers-reduced-motion` is handled globally. Do not add an animation that
  cannot be removed by it.

## 6. Responsive

Breakpoint is Tailwind `lg` (1024px). Two layouts, not four.

- **≥ lg** — persistent 240px sidebar, full-width content.
- **< lg** — sidebar becomes a drawer, content is full-bleed, register tables
  scroll horizontally inside `TableFrame`.

Do not collapse a register table into stacked cards on a phone. The reader is
comparing rows; a card stack destroys the comparison. Horizontal scroll with a
sticky first column is the correct answer.

## 7. Motion

Motion shows what changed, or it does not exist.

- Allowed: the `.enter` route transition (220ms), `transition-colors` on
  interactive elements (150ms), a pending indicator during a server action.
- Not allowed: scroll-triggered reveals, staggered card entrances, hover lift on
  every card, animated counters, a force-directed graph simulation.
- Duration ceiling 250ms. Anything slower is in the reader's way.

## 8. How to review your own work

Before you say a UI change is done:

1. `npm run verify` (typecheck, lint, test, build) passes.
2. Open the changed route in the browser pane. Screenshot it at desktop and at
   375px.
3. Tab through it. Every interactive element is reachable and visibly focused,
   in a sensible order.
4. Check the three states exist (force the empty one with a filter that matches
   nothing).
5. The token gate in `src/test/design-tokens.test.ts` runs inside step 1. If it
   names a file, fix the file — do not add an exemption. The one existing
   exemption has a reason written next to it; a second one needs the same.
6. Confirm the per-page JS bundle did not grow. This app ships 103 kB shared and
   134 B – 3.01 kB per page. A new client component that pushes a page past
   ~5 kB needs a reason.
7. Say in the summary what you changed, what you did not, and anything that
   needs a human decision.

## 9. Anti-slop — what "generic AI UI" looks like here

Do not produce any of these in this repo:

- A four-equal-stat-card row where the content is not four peer figures.
- A hero section, a marketing gradient, or a purple/violet accent.
- Rounded-2xl cards with a soft grey shadow on everything.
- An emoji or an icon standing in for a label.
- A toast where an inline `ActionMessage` already exists.
- A chart library added for one bar chart.
- Light-mode-by-default anything.
- Copy that sells. This product's voice is flat, specific and quantified —
  "82 candidate requirements. None is authoritative until a person approves it."

## 10. Dependencies

The runtime dependency list is `next`, `react`, `react-dom`, `server-only`,
`unpdf`. Five. Adding a sixth for UI needs an explicit argument that the
capability cannot be built in under ~150 lines from Tailwind + native platform
features. `<dialog>`, `<details>`, `popover`, CSS anchor positioning, container
queries and View Transitions cover almost everything a UI library would be
imported for.

## 11. Known conflict

The repository root `CLAUDE.md` currently contains an **Apple Design Skill**
(light backgrounds `#FFFFFF`/`#F5F5F7`, 48–80px hero type, 100px section gaps,
980px content width, pill buttons, marketing copywriting patterns). That is the
design language of a product page. It contradicts this file on every axis.

**This file wins for anything under `src/`.** If you are asked to apply the
Apple skill to RequireIQ's application UI, say that the two conflict and ask
which one governs before writing code.
