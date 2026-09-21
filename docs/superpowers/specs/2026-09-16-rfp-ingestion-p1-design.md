# P1 — Work on one real RFP end to end

**Date:** 2026-09-16
**Status:** approved design, pending implementation plan
**Sub-project:** P1 of five (see *Decomposition* below)

---

## Why this exists

RequireIQ was built and tuned against a corpus written for its own demo. The
next goal is real use: a single user, running it against public-sector RFPs —
real documents, no confidentiality risk, obligation-dense, and structurally
nothing like the demo corpus.

Before designing anything, the current engine was run against two real RFPs
(`samples/rfp/`). It does not survive the contact.

### Measured failures

| Failure | Evidence |
|---|---|
| Traceability collapses | Mercer Island: 487 chunks, **1 distinct locator**. Every citation reads "Preamble". |
| Phantom speakers | Santa Fe: 9 chunks attributed to speakers named `EQUAL EMPLOYMENT OPPORTUNITY`, `FIRM`, `E-MAIL`. |
| Recall is poor | **132 obligations rejected, 59 kept.** *Every* rejection was "no domain subject". |
| Dirty statements | `"Page 8 of 34 Respondents shall not contact other City staff..."`; `�` bullet glyphs mid-statement. |
| No constraints | Zero extracted from two documents full of deadlines and budgets. |

Throughput is not a problem: conflict detection ran in **12 ms** over 59
subjects.

### The finding that shaped the design

Most obligations in an RFP are not requirements on the thing being built:

- *"Proposals shall be submitted by 2:00PM on Friday"* — binds the **bidder**
- *"The solution shall support records management and retention"* — binds the **system**
- *"Contractor shall submit evidence of insurance"* — binds the **winning supplier**
- *"The City will provide test data"* — binds the **buyer**

All four are real, checkable obligations. Only the second kind - the one that
binds the system - belongs in a requirements register by default. The engine currently has no way to tell them
apart, so it either loses them or files them together.

---

## Goal and success criteria

**Goal:** one real RFP goes in, a trustworthy register comes out.

Measurable, asserted in tests:

| Criterion | Today | Target |
|---|---|---|
| Requirements citing a specific locator | ~0% | ≥ 80% |
| `shall`/`must` sentences either extracted or rejected for a reason other than vocabulary | 31% | ≥ 75% |
| Phantom speakers on non-transcript documents | 9 | 0 |
| Statements containing page furniture or replacement characters | ≥ 2 | 0 |
| Constraints found per RFP | 0 | ≥ 1 |
| **Demo corpus output** | 82 reqs, 7 conflicts | **unchanged** |

The last row is the regression guard. P1 must not improve RFP handling by
degrading the case that already works.

---

## Design

Four pieces. Each is independently testable.

**Sequencing note.** Pieces 1-3 can be validated before piece 4 exists: the
ingest endpoint already accepts uploads, so a real RFP can be pushed into the
seeded project to measure the engine. That is semantically wrong and fine for
measurement. It means the implementation plan can front-load the engine work and
treat project creation as the step that makes the result usable rather than the
step that unblocks it.

### 1. PDF text extraction

One branch behind the existing `extractText()` seam in `src/lib/ingest.ts`.
The probe confirms the seam holds — nothing downstream needs to know the input
was a PDF.

- **Library:** evaluate `unpdf` and `pdfjs-dist` against both sample RFPs,
  choosing on extraction fidelity measured by the criteria above. Default to
  `unpdf` — it is built for serverless and avoids the `canvas` native dependency
  that plain `pdfjs-dist` pulls in. This is a decision to make with evidence
  during implementation, not to assert now.
- **Scanned PDFs:** reject when mean extracted characters per page fall below a
  threshold calibrated against the two samples (both sit well above it; an
  image-only PDF yields near zero). Fail with a message naming OCR as the
  missing capability - emitting garbage requirements from an image-only PDF
  would be worse than refusing.
- **Page boundaries are retained** as structural signal for piece 2, then
  discarded from statement text.

### 2. Structure detection and cleanup

The heart of the fix. PDF-derived text has no Markdown, so `chunkDocument()`
falls through to paragraph splitting and every locator becomes the document
default.

**Heading detection**, in priority order, applied to plain text:

1. Numbered clause — `3.2.1 Scope of Work`
2. Lettered clause — `C. SCOPE OF WORK`
3. ALL-CAPS line standing alone
4. Title-case line ending in a colon — `Partnerships:`

The resulting locator is the clause number and title, so a citation reads
`3.2.1 Scope of Work` rather than `Preamble`.

**Page furniture removal**, before extraction:

- Lines matching a page-number pattern
- Headers and footers detected by *repetition across pages* rather than by
  pattern — this is what catches `Page 8 of 34` fused into a statement
- Bullet glyph normalisation, including the `�` that PDF extraction produces

**Speaker-turn tightening.** The current pattern fires per line, so any ALL-CAPS
heading looks like a speaker. The fix is a **document-level** decision: treat a
document as a transcript only when several distinct candidate speakers each
appear more than once. A form label appears once; a person in a workshop speaks
repeatedly. This removes the false positives without weakening real transcript
handling.

### 3. `bindsOn` — who the obligation binds

A new dimension **orthogonal to `type`**, not an extension of it. A security
obligation on the supplier and one on the system are both security; conflating
the two axes is how classification schemes rot.

```
bindsOn: "system" | "supplier" | "bidder" | "buyer" | "unknown"
```

Classified from the grammatical subject against cue lexicons: *offeror,
respondent, proposer, tenderer* → bidder; *contractor, vendor, successful
offeror* → supplier; *the City, the County, the Authority* → buyer; *system,
platform, solution, service* → system.

**This replaces the domain-noun rejection filter rather than extending it.**
Today a sentence is rejected when it contains no recognised noun — which is why
all 132 rejections shared one reason, and why the vocabulary will never be
complete. The new test is "can we identify who this binds?", with `unknown` as
an honest outcome that surfaces for review instead of silently discarding a real
obligation.

This is not RFP special-casing. The demo corpus has the same split — obligations
on Meridian, on Northgate, and on the platform — so the dimension earns its
place across both domains.

**UI:** the register filters to `system` by default, with the other values
available as filter chips, consistent with the existing URL-state filters.

### 4. Project creation and durable single-user deploy

Currently every screen assumes the seeded demo project. For real use:

- **Create a project** — name, client, description, baseline date, key. Then
  upload documents into it.
- **Stakeholders optional.** RFPs name few people; the register must work
  without a stakeholder list, which today it implicitly assumes.
- **Single-password access.** A shared secret compared with timing-safe
  equality, set from an environment variable, held in a signed cookie. This is
  deliberately *not* a user system — P4 does accounts, when a second person
  needs one.
- **A host with a persistent disk.** Not Vercel: the serverless work already
  landed established that `/tmp` is ephemeral, which is fine for a demo and
  wrong for real use.

---

## Data model changes

```sql
ALTER TABLE requirements ADD COLUMN binds_on TEXT NOT NULL DEFAULT 'unknown';
```

**This is the first real migration, and the pattern needs establishing.** The
schema is currently applied with `CREATE TABLE IF NOT EXISTS`, which cannot add
a column to an existing table. `meta.schema_version` already exists but is only
written, never read.

P1 adds a minimal ordered migration step: read `schema_version`, apply the
numbered migrations above it, write the new version. Small, but it must arrive
with the first schema change rather than after it.

---

## Testing

**The sample PDFs are gitignored** — they are third-party documents and
redistributing them from this repository is somebody else's licensing question.
Tests therefore cannot depend on them.

Resolution:

- **A synthetic RFP-shaped fixture, committed.** Written to exhibit the same
  structural features the probe found: numbered clauses, lettered sections,
  ALL-CAPS headings, repeated page furniture, mangled bullets, and obligations
  of all four `bindsOn` kinds. The success criteria become assertions against
  it, in the same style as the existing planted-problem tests.
- **`npm run probe:rfp`** — a local script that prints the same metrics against
  whatever real PDFs are in `samples/rfp/`. Not part of CI; the thing you run
  when a real document behaves oddly.
- **The demo corpus suite is the regression guard** and must pass unchanged.

Every new detector or classifier gets a negative test — the case where it must
*not* fire. The existing suite's most valuable assertion is that
capacity-versus-budget stays silent when the target fits inside the cap.

---

## Out of scope for P1

Named explicitly so they do not creep in:

- Table and schedule parsing (RFP requirement matrices)
- Addenda cross-referencing and RFP-versus-addendum conflicts — this is **P3**,
  and it is the domain's real multi-document story
- OCR for scanned PDFs (detected and refused, not handled)
- Embeddings or any LLM extraction path
- Accounts, tenancy, invitations — **P4**
- DOCX (the seam makes it cheap later; RFPs in hand are PDFs)

---

## Decomposition

| | Sub-project | Gate |
|---|---|---|
| **P1** | Work on one real RFP end to end | now |
| **P2** | Engine quality against RFP structure | after P1 shows what remains broken |
| **P3** | RFP versus addenda conflict detection | after P2 |
| **P4** | Accounts and tenancy | when a second person uses it |
| **P5** | Scale and performance | when a document actually hurts |

---

## Risks

**The engine may need more than cleanup.** P1 is deliberately a thin vertical
slice so that this is discovered with evidence rather than assumed. If locator
diversity stays low after piece 2, that is P2's mandate, not a P1 failure.

**`bindsOn` accuracy is unknown.** The lexicons are a first pass. `unknown` is a
designed outcome, not a fallback — and the proportion landing there is itself
the measurement that tells us whether the approach works.

**Two RFPs is a small sample.** Both are US local-government software
procurements. Structure varies considerably across jurisdictions, and passing on
these two is not evidence of passing generally.
