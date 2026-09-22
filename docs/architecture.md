# Architecture

How the application is put together, and why. The analysis engine has its own
document: [`analysis-engine.md`](analysis-engine.md).

---

## Layers

```
                    ┌─────────────────────────────────────┐
  Browser  ────────►│  Server Components   (read)         │
                    │  Server Actions      (write)        │
                    │  Route Handlers      (upload,       │
                    │                       assistant,    │
                    │                       export)       │
                    └──────────────┬──────────────────────┘
                                   ▼
            ┌──────────────────────────────────────────────┐
            │  validate.ts        trust boundary           │
            ├──────────────────────────────────────────────┤
            │  queries.ts         read model               │
            │  actions.ts         write model              │
            │  ingest.ts          upload pipeline          │
            │  pdf.ts             PDF bytes → text         │
            │  reports.ts         deliverables             │
            ├──────────────────────────────────────────────┤
            │  ai/index.ts        provider resolution      │
            │  ai/local.ts        deterministic engine     │
            │  ai/anthropic.ts    optional hosted model    │
            │  ai/engine/structure.ts  furniture, headings,│
            │                          transcript decision │
            │  ai/engine/*        pure analysis functions  │
            ├──────────────────────────────────────────────┤
            │  db/connection.ts   node:sqlite              │
            │  db/migrations.ts   ordered, append-only     │
            │  db/seed.ts         demo engagement          │
            └──────────────────────────────────────────────┘
```

`pdf.ts` sits beside `ingest.ts` rather than under it: it holds no server
resource, so the probe script can import it from plain Node, and the parser
(`unpdf`) is swappable without touching the pipeline. It is the only module in
the codebase that knows a PDF exists.

Dependencies point downward only. `ai/engine/*` imports nothing from the data
layer, which is what makes it testable without a database and reusable on an
uploaded document.

---

## Rendering

**Server components by default.** Pages read SQLite directly and render on the
server. There is no API layer between a page and its data, and no client-side
data fetching, so there is no loading waterfall and no cache to invalidate.

Cost: 103 kB shared JS, per-page 134 B – 3.01 kB.

**Twelve client components**, each for a reason that cannot be met on the server:

| Component | Why |
|---|---|
| `nav.tsx` | Active-route highlighting, mobile drawer |
| `filters.tsx` | Debounced input, URL state |
| `forms.tsx` | `useActionState`, `useFormStatus` |
| `review.tsx` | Edit-mode toggle |
| `conflict-actions.tsx` | Form state |
| `assistant.tsx` | Conversation state |
| `graph.tsx` | Node focus, edge filtering |
| `tour.tsx` | Step state, sessionStorage |
| `upload.tsx` | Drag-and-drop, progress |
| `reset-demo.tsx` | Native confirm before a destructive action |
| `risk-actions.tsx` | Form state |
| `error.tsx` | Error boundaries must be client components |

**Register filter state lives in the URL, not in a component.** Every filtered
view is therefore linkable — *"here are the requirements with no owner"*
is a link a consultant can paste into an email — and the back button behaves.

---

## Writes

Every write follows the same path:

```
<form action={serverAction}>
     ↓
server-actions.ts    validate input  →  fails closed
     ↓
actions.ts           transaction {  mutate + audit  }
     ↓
revalidatePath(project subtree)
```

Two invariants hold across every write:

1. **Nothing the engine produced is mutated without an audit event** recording who
   changed it and what it said before.
2. **A human action moves provenance to `human`.** The register's authority comes
   from a person having looked at it, not from the model having been confident.

Revalidating the whole project subtree — rather than one path — is deliberate: the
register, the dashboard counts and the sidebar badges all read the same figures,
and they must never show three different versions of the same number.

Editing a requirement **re-derives every stored field that quotes the
statement** — type, priority, rationale, classification evidence, `bindsOn` and
its evidence — and re-runs quality analysis against the new wording, so a
genuine fix visibly clears its own findings. A field left behind does not merely
age: it quotes words that are no longer on the page, next to the text that
disproves it. Re-derivation moves counts the dashboard reads, so every derived
field that actually changed is named in the audit event. The original statement
is preserved so the scope-movement view can show the before and after.

**One field is deliberately excluded.** `acceptance_criteria` has no per-field
provenance column, and `deriveAcceptanceCriteria` only ever returns the
statement verbatim or null — so a value equal to the *old* statement is a
derived one and is refreshed, and anything else was typed by a reviewer and is
left alone. A reviewer's acceptance criteria therefore survive an edit, at the
cost of not being refreshed when they were the thing that went stale.

Resolving a conflict **cascades to the risk it generated**, so the conflict queue
and the risk register cannot drift apart.

---

## Persistence

`node:sqlite`, the Node 22.13+ builtin. No native module, no database server, no
ORM, no migration tool. The entire persistence story is one file on disk, which
is what makes the product demo-able from a clean clone.

**Migrations (`db/migrations.ts`).** The schema is applied with
`CREATE TABLE IF NOT EXISTS`, which cannot add a column to a table that already
exists — so schema changes go through an ordered list, and it arrived with the
first one rather than after it. `meta.schema_version` records how far a database
has got.

The list is **append only. An existing entry is never edited or renumbered**,
because the version stamped in somebody's database refers to a position in it;
renumbering silently re-runs or skips migrations on every database in the world
that is not this one. Each entry carries a `skipIf` predicate — "does this
column already exist?" — rather than matching an error string, so a fresh
database that the schema already satisfies skips the statement while any real
error still rolls the whole batch back. Pending migrations and the version stamp
apply as one transaction, opened directly rather than through `transaction()`:
`runMigrations` runs from inside `openDb()`, before the module handle is
assigned, so the helper would recurse into a second connection on the same file.

WAL mode plus a 5-second busy timeout: Next.js may run several server workers,
and WAL lets them read concurrently while one writes rather than surfacing
`SQLITE_BUSY` to a request handler.

**Schema is normalised on purpose.** `evidence`, `audit_events`, `relationships`
and `reviews` are separate tables so provenance and traceability can be queried,
not just displayed. Dumping everything into a JSON blob would make
*"which requirements came from the finance team?"* a full scan and a parse.

**Migration path.** Moving to Postgres means reimplementing
`src/lib/db/connection.ts` and adjusting a handful of SQL dialect details. Every
caller goes through `queries.ts` or `actions.ts`; nothing reaches past them.

---

## Generated modules

Two files are generated from an authored source, both for the same reason: the
content must be **bundled with the server code** rather than read from disk at
runtime, so the app works from any working directory and in a standalone build.

| Source | Generated | Script |
|---|---|---|
| `src/lib/db/schema.sql` | `src/lib/db/schema.ts` | `scripts/sync-schema.mjs` |
| `demo-data/*` | `src/lib/demo/corpus.ts` | `scripts/sync-demo-data.mjs` |

Edit the source, run the script. The `.sql` file stays readable and usable with
ordinary database tooling; the `demo-data/` files stay readable in the repository
and re-uploadable through the ingestion UI.

---

## The seed

`src/lib/db/seed.ts` does **not** insert a hand-written register. It ingests the
fifteen documents and runs the real pipeline over them — chunk, extract, classify,
analyse quality, detect conflicts, detect gaps, infer relationships, derive risks.

Everything the product displays was derived from source text by the same code
that runs on a document you upload. That is what makes the planted-problem tests
meaningful: if a detector regresses, the demo visibly loses findings.

Seed timestamps are anchored to the engagement timeline (15 August 2026), not to
`Date.now()`. Stamping them "now" would place seeded AI events *after* later human
ones in the audit trail. Audit queries also order by `created_at, rowid` so
insertion order breaks ties regardless of clock skew.

---

## Provider abstraction

```ts
interface AIProvider {
  extract(context): ExtractionResult
  analyseQuality(statement): AmbiguityFinding[]
  detectConflicts(subjects): DetectedConflict[]
  detectGaps(statements): DetectedGap[]
  summariseDocument(content): string
  answer(context, question): Promise<AssistantAnswer>
}
```

Two implementations. `local` is deterministic and offline and implements all six.
`anthropic` overrides exactly one — `answer` — and delegates the rest.

The asymmetry is the point. Extraction and conflict detection must cite exact
character offsets and produce the same register on every run for the same corpus;
a sampled model offers neither. Question answering is the opposite case.

`getProvider()` falls back to `local` when `anthropic` is selected without a key
and surfaces a **Provider degraded** badge. An unavailable credential should
degrade the assistant, not take the product down.

`ProjectContext` is the assistant's entire visible world: the structured records
for one project, never raw document bodies, never another engagement. That is
also what bounds a prompt-injection attempt hidden in an ingested document — it
arrives as one requirement statement among hundreds, inside a tagged block the
system prompt instructs the model to treat as data, and any reference the model
invents resolves to no link because citations are matched against real records.

---

## Ingestion

```
upload → size check → extension allowlist → decode (PDF: unpdf) → binary sniff
       → clean (furniture, headings) → store the cleaned text
       → chunk → extract → classify → bindsOn → analyse
       → refreshConflicts(whole project)
       → refreshRelationships(whole project)
```

`extractText()` is the **format seam**: everything downstream takes a string, so
PDF support is one branch in it and nothing else — no screen, query or detector
changed. DOCX would be the same shape. A PDF with no selectable text is refused
rather than analysed: a scanned document parses fine and yields almost nothing,
and a register that looks populated and means nothing is worse than a refusal.

**The stored document is the cleaned one.** `cleanDocumentText` runs before the
chunker computes offsets, so persisting the raw upload would leave every
citation pointing hundreds of characters off. Cleaning is idempotent, which is
what lets the chunker run it again without moving anything.

Conflict refresh runs across the **whole project**, not the new document, because
the conflicts worth finding are precisely the ones between a new document and an
old one. Existing conflicts keep their id, status and resolution note — a
reviewer's decision must survive an ingest.

---

## Design system

Tokens in `src/app/globals.css` via Tailwind v4 `@theme`. One dark low-chroma
surface stack, one saturated brand blue, one strictly ordered severity ramp.

The restraint is functional. In a tool whose job is to make a reviewer notice one
red number on a page of grey ones, colour has to *mean* something — so nothing
decorative is allowed to use it, and the severity ramp is never borrowed for
emphasis.

**Provenance has its own four-colour language**, because telling a fact from a
machine reading from a proposal is the product's most important visual job.

All three text tokens clear WCAG AA against every surface in the stack. The faint
step is the binding constraint: it carries citations, locators and timestamps —
exactly the text a reader has to be able to check — so it is not allowed to be
decorative grey.

---

## Testing strategy

| Suite | What it protects |
|---|---|
| `text.test.ts` | Segmentation and quantity parsing — a destroyed number is a missed conflict |
| `pipeline.test.ts` | The seven planted problems, and that statements stay verbatim at their offsets |
| `queries.test.ts` | The data layer and the full review workflow, against a real seeded database |
| `structure.test.ts` | Furniture removal, the four heading forms, and the document-level transcript decision |
| `binds-on.test.ts` | Who each obligation binds, and `unknown` as a designed answer |
| `classify.test.ts` | The cue vocabulary and the word collisions it used to trip over |
| `rfp.test.ts` | The P1 success criteria, against a synthetic fixture carrying the real documents' structure |
| `pdf.test.ts` | A scanned or corrupt PDF is refused with a readable reason |
| `ingest.test.ts` | The format seam: PDF in, DOCX out with an explanation |
| `migrations.test.ts` | Migrations apply once, re-run safely, and roll back as a unit |
| `reports.test.ts` | CSV safety and the provenance disclaimer — these files leave the building |
| `validate.test.ts` | The trust boundary fails closed |
| `serverless.test.ts` | The read-only-filesystem path used on Vercel |

The suite that matters most is `pipeline.test.ts`. It asserts each planted
problem individually **and** asserts the negative case for the headline detector —
that capacity/budget does *not* fire when the target fits inside the cap. A
detector without a negative test becomes a detector that fires on everything.
