# RequireIQ

Requirements intelligence for enterprise IT delivery. Read `README.md` for what
the product does and `docs/architecture.md` for how it is put together.

## Before touching the UI

**Read `.claude/skills/requireiq-ui/SKILL.md` first.** It governs everything
under `src/app` and `src/components`: the token system, the component kit, the
loading/empty/error contract, the accessibility floor, and what not to build.
The design system is deliberate and documented — read it before changing it.

## Stack

Next.js 15 App Router (server-component-first), React 19, TypeScript, Tailwind
v4 (`@theme` in `src/app/globals.css`, no config file), `node:sqlite`, Vitest.

**Five runtime dependencies: `next`, `react`, `react-dom`, `server-only`,
`unpdf`.** Adding a sixth needs an explicit argument. No UI library, no chart
library, no icon library, no animation library — that is a product decision, not
an omission.

## Ground rules

- **Nothing is generated.** The extractor copies source sentences verbatim with
  character offsets; the assistant fills templates from counted records. If a
  change would let the product invent a project fact, it is wrong.
- **Provenance is rendered everywhere.** `source` / `ai_analysis` /
  `ai_suggestion` / `human`. Never show a machine reading with the weight of a
  quote.
- **Writes go through `src/lib/server-actions.ts`** — validate, write, revalidate.
  Never a client `fetch` to a route handler for a mutation.
- `npm run verify` (typecheck, lint, test, build) must pass before any change is
  called done.

## Other skills in this repo

- `.claude/skills/requireiq-ui/` — the application design system. **Governs `src/`.**
- `.claude/skills/apple-design/` — Apple-style marketing pages. Opt-in only,
  for a future marketing site. Contradicts `requireiq-ui`; never apply it to the
  application UI.
