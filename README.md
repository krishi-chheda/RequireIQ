# RequireIQ

**Requirements intelligence for enterprise IT delivery.** Turns scattered discovery
material — workshop transcripts, meeting notes, email threads, specifications,
policy extracts — into a structured, traceable requirements register, and puts
the statements that contradict each other on the same page while changing them
still costs a conversation rather than a quarter.

Ships with a complete worked engagement. Runs fully offline with no API key.

```bash
npm install && npm run dev   # http://localhost:3000
```

---

## The problem

IT projects fail at requirements, not at development. The single most-cited
cause across industry analyses is poor requirements gathering, and the mechanism
is almost always the same:

> A bank's discovery phase runs twelve stakeholder workshops and produces
> hundreds of pages of notes, email and transcripts. A business analyst reads
> them over three weeks and extracts requirements by hand.
>
> In July, a platform engineering lead says in Workshop 07: *"The platform must
> support 10,000 concurrent users during the Monday morning peak."*
>
> In June, a finance business partner wrote in an email: *"Infrastructure spend
> must not exceed $200,000 in the first twelve months of operation."*
>
> Both are reasonable. Neither author saw the other. Nobody ever read the two
> sentences on the same page. The contradiction surfaces three months into
> build, when the architecture is already committed.

No keyword search connects those two sentences. They share no vocabulary, they
live in different documents, and they were written by people in different
functions eleven weeks apart. Catching them requires comparing *quantities*
across the whole corpus — which is what this product does.

## What it actually does

| | |
|---|---|
| **Extraction** | Finds obligation sentences and lifts them **verbatim**, keeping character offsets. It never rewrites source text into a requirement. |
| **Classification** | Nine requirement types and MoSCoW priority, read from the modal verb, with the matched terms shown as evidence. |
| **Quality analysis** | 37 vague-term patterns, unquantified thresholds, missing acceptance criteria, undefined actors, compound requirements, unverified assumptions, reported speech. Each names the exact span and proposes a measurable rewrite. |
| **Conflict detection** | Five detectors comparing every record against every other, **across documents**. Each shows its arithmetic and states what a human must validate. |
| **Coverage gaps** | What nobody wrote down, by checklist against comparable regulated delivery. Never generated, so a gap is a real absence. |
| **Traceability** | Requirement → source sentence → document → position → stakeholder → decision, with character offsets throughout. |
| **Human review** | Approve, reject, ask for clarification, edit wording, assign an owner, record acceptance criteria. Every action audited. |
| **Reports** | Six consulting deliverables in CSV and JSON, each carrying its provenance columns. |

### The five conflict detectors

1. **Capacity versus budget** — sizes a stated capacity target against a stated
   spend cap using a published heuristic, showing every input.
2. **Opposing obligations** — retention and deletion rules over the same class of
   data with materially different periods.
3. **Availability versus recovery** — converts an availability percentage into its
   monthly downtime budget and compares it with the stated recovery time.
4. **Fixed date versus preceding duration** — a committed date against periods that
   must elapse before it can be met.
5. **Topical overlap with divergent quantity** — statements clearly about the same
   characteristic that give it different values.

None of them declares anything impossible. Every finding carries a
`validationQuestion` — the thing a person has to go and check.

---

## Hallucination control

This is the part that matters most in a requirements tool, and it is enforced
structurally rather than by prompt.

**Every record is labelled with how it came to exist**, and the label is rendered
on screen and exported in every report:

| Provenance | Meaning |
|---|---|
| `source` | Verbatim text present in an ingested document. |
| `ai_analysis` | A machine reading of source text. Traceable to evidence, not authoritative. |
| `ai_suggestion` | A proposal. Nothing is applied without a human action. |
| `human` | Entered or confirmed by a named person. |

**The extractor cannot invent a requirement** because it has no generative step.
It detects obligation sentences and copies them, recording the character range.
The test suite asserts, for every requirement on every run, that the stored quote
slices back out of the stored source document at the recorded offsets.

**The assistant cannot invent project facts** because it has no generative step
either: every sentence it returns is a template filled with counted records, or
text quoted from a document. When nothing matches above the relevance floor it
says *"Insufficient evidence"* and returns no citations.

**Acceptance criteria are never fabricated.** Where a source statement contains no
measurable clause, the absence is reported as a finding rather than filled in.

**Document summaries are extractive**, never generated — the document's own
highest-centrality sentences in their original order. A paraphrase in a
requirements tool is a quiet rewrite of the client's words.

---

## Architecture

```
Browser
  │  Server Components (read)          Server Actions (write)     Route handlers
  ▼                                                               (upload / assistant / export)
┌──────────────────────────────────────────────────────────────────────────────┐
│ src/lib/queries.ts          read model, snake_case → domain types            │
│ src/lib/actions.ts          write model, transactional + audited             │
│ src/lib/server-actions.ts   trust boundary: validate → write → revalidate    │
│ src/lib/validate.ts         input validation, fails closed                   │
│ src/lib/ingest.ts           upload pipeline + conflict refresh               │
│ src/lib/reports.ts          six consulting deliverables                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ src/lib/ai/index.ts         provider resolution                              │
│ src/lib/ai/provider.ts      AIProvider interface                             │
│ src/lib/ai/local.ts         deterministic engine + grounded assistant        │
│ src/lib/ai/anthropic.ts     optional hosted model, assistant only            │
│ src/lib/ai/engine/          text · classify · extract · ambiguity ·          │
│                             similarity · conflict · coverage                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ src/lib/db/                 node:sqlite — connection · schema · seed          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key decisions

**Next.js App Router, server-component-first.** Pages read SQLite directly and
render on the server; mutations go through server actions. The result is 103 kB
of shared JavaScript and per-page bundles of 180 B – 2.7 kB. Twelve of the
fifty-odd components are client components, each because it genuinely needs
browser state; everything else renders on the server.

**`node:sqlite`, the Node 22+ builtin.** No native module to compile, no database
server, no ORM. The whole persistence story is one file, so the product is
demo-able from a clean clone. Moving to Postgres means reimplementing
`src/lib/db/connection.ts`; nothing reaches past the query and action modules.

**The schema is normalised on purpose.** `evidence`, `audit_events`,
`relationships` and `reviews` are separate tables so provenance and traceability
can be *queried*, not just displayed.

**No separate Python/FastAPI service.** It would add a second runtime, a second
deployment and a network hop, in exchange for nothing the analysis needs.

**Deterministic analysis, optional hosted assistant.** See below.

### AI architecture

```
AIProvider  (src/lib/ai/provider.ts)
├── extract            ─┐
├── analyseQuality      │  always the local deterministic engine
├── detectConflicts     │  (reproducible, offset-traceable, auditable)
├── detectGaps          │
├── summariseDocument  ─┘
└── answer             ─── local by default; Claude when configured
```

Extraction, classification, quality analysis and conflict detection run on a
local rule-and-statistics engine. The same corpus produces byte-identical output
on every run.

This is a deliberate architectural choice, not a limitation dressed up as one. A
requirements tool must cite exact character offsets in a client document and
produce an audit trail that holds up months later. A sampled model is a poor fit
for both, and the planted-conflict tests in this repository would be
approximate rather than meaningful assertions.

Free-form question answering is the opposite case: it benefits from a model, and
every answer is rendered next to the records it drew on. Setting
`REQUIREIQ_AI_PROVIDER=anthropic` with a key routes **only** the assistant to
Claude; citations stay machine-derived, so a hallucinated reference produces no
link rather than a broken promise of evidence. If the call fails for any reason
the local answer is returned — an expired key degrades the assistant rather than
breaking the page.

---

## Setup

Requires **Node 22+** (for `node:sqlite`). Built and tested on Node 24.

```bash
npm install
npm run dev        # http://localhost:3000
```

The database is created and seeded on first request. No further setup.

### Environment variables

Every value is optional. Copy `.env.example` to `.env.local` to change any.

| Variable | Default | Purpose |
|---|---|---|
| `REQUIREIQ_AI_PROVIDER` | `local` | `local` (deterministic, offline) or `anthropic`. |
| `ANTHROPIC_API_KEY` | — | Server-only. Required only for the `anthropic` provider. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Model used when that provider is enabled. |
| `REQUIREIQ_DB_PATH` | `data/requireiq.db` | SQLite file location. |
| `REQUIREIQ_MAX_UPLOAD_BYTES` | `5242880` | Upload size limit. |

Selecting `anthropic` without a key degrades to `local` and shows a
**Provider degraded** badge in the app rather than failing.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server. |
| `npm run build` | Production build. **Stop the dev server first** — both write to `.next`. |
| `npm start` | Serve the production build. |
| `npm test` | Vitest suite. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run verify` | typecheck → lint → test → build. |
| `node scripts/sync-demo-data.mjs` | Regenerate the corpus module after editing `demo-data/`. |
| `node scripts/sync-schema.mjs` | Regenerate the schema module after editing `schema.sql`. |

---

## The demo engagement

**Meridian Bank — Customer Onboarding Platform.** Fifteen source documents in
`demo-data/`: five workshop transcripts and meeting notes, four email threads, a
product specification extract, a records retention policy extract, and a
stakeholder register.

Everything in the database is **derived from that text at seed time by the same
code that runs on a document you upload.** No register is hand-written into the
seed. If the engine regresses, the demo visibly loses findings — which is why the
tests below are meaningful.

### The planted problems

Seven, embedded in the source text on purpose, each with a test asserting the
engine finds it:

| # | Problem | Where it lives |
|---|---|---|
| 1 | Capacity target vs infrastructure budget | Workshop 07 transcript vs Week-2 finance email |
| 2 | "Fast response time", "easy to use" | Workshop 05 transcript |
| 3 | "The platform must be secure" — no acceptance criteria | Security review notes |
| 4 | AML screening rule that exists only in meeting notes | Workshop 03 notes |
| 5 | Seven-year retention vs 30-day deletion | Retention policy vs DPO email |
| 6 | Broker channel added after the scope baseline | Week-10 distribution email |
| 7 | "Manual override" requirement with no identifiable owner | Discovery wrap-up notes |

Plus a go-live date against a mandatory 12-week regulatory observation period,
and a 99.99% availability target against a 4-hour recovery time objective.

### What the seed produces

82 requirements · 6 constraints · 7 conflicts · 95 quality findings · 35 risks ·
6 coverage gaps · 60 relationship edges · requirements health **30/100, critical**.

### Guided walkthrough (~3 minutes)

Click **Guided walkthrough** in the workspace. Nine steps, each deep-linking to a
real screen — there is no scripted playback, you are driving the product:

1. Requirements health, and the four deductions that produced it
2. What went in — fifteen documents
3. What came out — 82 candidate requirements, all AI-proposed
4. Quality findings — "fast" flagged with a measurable rewrite
5. The conflict nobody caught — capacity vs budget
6. Investigating it — both sources, the arithmetic, the validation question
7. Tracing it — character offsets back to the transcript
8. Coverage gaps — what nobody wrote down
9. Resolving it — and watching the health figure move

**The payoff to demo:** open CFL-02, write a resolution note, click *Mark
resolved*. The linked risk auto-mitigates, open conflicts drop 7 → 6, and
requirements health moves 30 (critical) → 35 (at risk), with the breakdown
showing exactly which deduction shrank.

**Reset demo data** on the workspace page discards every review decision and
re-analyses the corpus from source.

---

## Data model

Twelve tables plus a `meta` row-store. Full DDL in
[`src/lib/db/schema.sql`](src/lib/db/schema.sql).

```
projects ──┬── stakeholders
           ├── documents ──── document_chunks
           ├── requirements ──┬── ambiguities
           │                  ├── reviews
           │                  └── risks
           ├── constraints_tbl
           ├── conflicts ───── risks
           ├── evidence          (subject → document + chunk + char range)
           ├── relationships     (source ↔ target, typed, with rationale)
           ├── decisions
           ├── coverage_gaps
           └── audit_events      (append-only)
```

`evidence` is the spine: it ties any requirement, constraint, conflict,
ambiguity or risk to a document, a chunk, a quote and a character range.
`audit_events` is append-only — nothing in it is ever updated or deleted.

---

## Testing

```bash
npm test
```

**97 tests across six suites.** Not smoke tests — the interesting ones assert
properties that would otherwise quietly rot:

- **`text.test.ts`** — sentence splitting that survives `99.99%` and `$200,000`,
  structure-aware chunking, quantity parsing across five dimensions, bound
  direction (`at least` vs `must not exceed`).
- **`pipeline.test.ts`** — the seven planted problems, each asserted individually.
  Also: every extracted statement slices back out of its source document at the
  recorded offsets; conflicts hedge and never say "impossible"; the sizing
  arithmetic is checkable line by line; the detector does *not* fire when a
  capacity target fits inside the budget.
- **`queries.test.ts`** — seeds a throwaway database by running the real pipeline
  over the real corpus, then reads it back through the same functions the screens
  use. Covers the review workflow, re-analysis on edit, conflict resolution, and
  that health improves once findings are resolved.
- **`reports.test.ts`** — CSV formula injection is neutralised, quotes escaped,
  rows stay aligned, the provenance disclaimer is present in every report.
- **`validate.test.ts`** — identifier and text validation fails closed on SQL
  fragments, path traversal, control characters and oversized input.

Verified manually in the browser: every route returns 200, all six exports
download, ingestion succeeds and rejects PDF/binary/empty files with the right
status codes, the review workflow persists and audits, the assistant answers and
refuses correctly, the demo reset restores pristine state, and the layout has no
horizontal overflow at 375 px.

---

## Security

Treated as an enterprise product; the gaps are named rather than hidden.

**What is implemented**

- **Input validation at every trust boundary** (`src/lib/validate.ts`).
  Identifiers are constrained to a safe character class; free text is
  length-bounded and stripped of control characters; enums fail closed.
- **Every SQL query is parameterised.** No string interpolation of user input.
- **Upload safety.** Declared size checked before the body is read, actual size
  checked after, extension allowlist, binary-content sniffing, basename-only
  filenames. Nothing is written to disk — the text goes into the database, so
  there is no upload directory to traverse into or serve from.
- **CSV injection defence.** Cells beginning `=`, `+`, `-` or `@` are prefixed
  with an apostrophe. A requirements tool that exports a spreadsheet which
  executes on open is not one anybody should use. Tested.
- **Prompt-injection containment.** The assistant sees only the structured
  records for one project — never raw document bodies, never another engagement.
  When a hosted model is enabled, records are wrapped in a tagged block and the
  system prompt instructs the model to treat them as data. Citations are resolved
  against real records, so a hallucinated reference produces no link.
- **Secrets are server-only.** `ANTHROPIC_API_KEY` is read exclusively in
  `src/lib/ai/anthropic.ts`, which is `import "server-only"`. No `NEXT_PUBLIC_`
  variable exists in this codebase.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` (see `next.config.ts`).
- **Error responses never leak internals.** Stack traces and raw messages are
  logged server-side; the client gets a digest reference.

**What is not implemented — deliberately, and blocking for production**

- **No authentication or authorisation.** Every visitor is
  `"Demo Reviewer (unauthenticated session)"`. This is the single largest gap.
  The reviewer identity is produced in exactly one place —
  the `REVIEWER` constant in `src/lib/server-actions.ts` — so adding auth means
  replacing that with a session lookup and adding a project-membership check to
  the query layer.
- **No rate limiting** on the ingest or assistant endpoints.
- **No encryption at rest.** The SQLite file is plaintext on disk.
- **No CSP header.** Next's inline bootstrap scripts need a nonce-based policy.

**Dependency audit.** `npm audit` reports two build-time-only advisories in
`postcss`, transitively inside Next.js 15, fixable only by upgrading to Next 16.
Neither is reachable at runtime by this application. The critical Next.js
advisory present at scaffold time was resolved by pinning 15.5.25.

---

## Accessibility

- **Contrast:** all three text tokens clear WCAG AA (4.5:1) against every surface
  in the stack — worst case 5.16:1. Verified by measuring computed styles against
  computed backgrounds in the running app, not by eye.
- **Keyboard:** skip link first in tab order, 198 interactive elements on the
  densest page with zero unreachable, 2px `:focus-visible` ring at 2px offset
  everywhere.
- **Semantics:** one `<h1>` per page, real landmarks, `<table>` with `<th scope>`,
  `<fieldset>`/`<legend>` for filter groups, every control labelled, `role="status"`
  on action results, `aria-live` on async regions.
- **Motion:** every animation collapses under `prefers-reduced-motion: reduce`.
- **No-JS:** every write is a real `<form>` posting to a server action.

## Responsive

Desktop-first, genuinely responsive rather than shrunk. Below `lg` the sidebar
becomes a drawer (the register tables need full width on a phone); grids collapse
to one column; tables scroll inside their own container so the page body never
scrolls horizontally. Verified at 375 px with zero overflow.

## Performance

- Server components by default: 103 kB shared JS, per-page 180 B – 2.7 kB.
- Twelve client components total, each with a reason (listed in `docs/architecture.md`).
- The graph uses a deterministic radial layout, not a force simulation — no
  animation frame loop, and the same register always draws the same picture.
- SQLite in WAL mode with a busy timeout; the document view uses one evidence
  query rather than one per record.
- Route-level `loading.tsx` with skeletons.

---

## Deployment

### Vercel

```bash
npx vercel          # preview
npx vercel --prod   # production
```

No environment variables are required — the app runs on the deterministic local
engine and seeds itself from the bundled corpus on first request.

**Read this before sharing a Vercel link.** Serverless functions get a read-only
filesystem with one writable directory, `/tmp`, which is ephemeral and
per-instance. The app detects this (`VERCEL` / `AWS_LAMBDA_FUNCTION_NAME`),
puts the database in `/tmp`, skips WAL, and shows a banner in the workspace
saying so. In practice:

| | Hosted on Vercel | Running locally |
|---|---|---|
| Reading the register, conflicts, traceability, graph, reports | Correct — every instance re-seeds from the bundled corpus | Correct |
| Review decisions, conflict resolution, uploads | Survive only on the instance that handled them | Durable |

That is fine for a demo and wrong for a product. Making writes durable means
attaching a real database — see the migration note under *Persistence* in
`docs/architecture.md` — and setting `REQUIREIQ_DB_PATH` (which also
suppresses the banner) or replacing `src/lib/db/connection.ts`.

**Node version.** `node:sqlite` needs Node 22.5+, declared in `engines`. Set
the project's Node version to 22.x or later in Vercel's project settings if it
does not pick it up.

### Anywhere with a writable disk

A container, a VM or any Node host works unchanged and gives durable writes:

```bash
npm ci && npm run build && npm start
```

This is the deployment target the architecture actually suits.

---

## Known limitations

1. **No authentication.** See Security. Blocking for any real deployment.
2. **PDF and DOCX are not parsed.** The pipeline is format-agnostic — it takes a
   string — so support is a single branch in `extractText()`
   (`src/lib/ingest.ts`) using `pdfjs-dist` or `mammoth`. Uploading one returns a
   clear 415 rather than analysing binary noise into plausible requirements.
3. **Similarity is lexical, not semantic.** TF-IDF matches vocabulary, not
   meaning: two requirements saying the same thing in different words score low.
   Chosen because the terms that produced a score can be shown to the reviewer.
   The conflict detectors compensate by combining it with quantity and polarity
   analysis rather than relying on it alone.
4. **The sizing heuristic is generic.** `SIZING_MODEL` in
   `src/lib/ai/engine/conflict.ts` uses order-of-magnitude private-cloud unit
   costs. It is exported, shown with every input, and labelled a heuristic — but
   a real engagement should replace the constants with its own tenancy pricing.
5. **English only**, and tuned for the register conventions of
   ISO/IEC/IEEE 29148 (`must`/`shall` binding, `should` advisory).
6. **Single-node SQLite.** Fine for one consultancy's engagements on a host with
   a writable disk; a multi-tenant deployment, or a serverless one with durable
   writes, needs Postgres. See *Deployment* above.
7. **Conflict detection is O(n²)** over the register. Comfortable to a few
   thousand requirements; beyond that it needs an inverted-index candidate filter.
8. **The classifier occasionally mislabels business requirements as functional**
   when they lack commercial vocabulary. It shows its matched terms, so a
   reviewer can see and correct it.

## Roadmap

If this became a real enterprise product, in order:

1. **Authentication, RBAC and multi-tenancy** — SSO, project membership, per-role
   permissions. Nothing else ships without this.
2. **Learned conflict detection on top of the rule layer** — keep the
   deterministic detectors as the auditable floor, add an embedding model to
   catch the semantic conflicts TF-IDF misses, and surface both with the same
   provenance labelling.
3. **PDF, DOCX and connector ingestion** — SharePoint, Confluence, Teams
   recordings, Outlook. The seam exists.
4. **Bidirectional JIRA and Azure DevOps sync** — push approved requirements as
   epics, pull implementation status back to close the traceability loop from
   requirement to shipped code.
5. **Baseline versioning and diff** — snapshot the register at each gate, diff
   between gates, generate the change-control pack automatically.
6. **Cross-engagement learning** — which conflict types actually cost money,
   measured across a consultancy's portfolio, to weight detector severity by
   evidence rather than by judgement.
7. **Real-time collaboration** on the review queue, with comment threads against
   requirements and conflicts.

---

## Repository layout

```
demo-data/          15 authored source documents (the corpus, re-uploadable)
docs/               architecture and analysis-engine notes
scripts/            corpus and schema code generation
src/app/            routes — landing, workspace, API handlers
src/components/     UI: primitives, evidence, review, graph, assistant, tour
src/lib/ai/         provider abstraction and the analysis engine
src/lib/db/         connection, schema, seed
src/lib/            queries, actions, ingest, reports, validation, types
src/test/           validation and report test suites
```

---

*Meridian Bank plc, Northgate Advisory and every person named in the demo
engagement are fictional. The source documents were written for this
demonstration.*
