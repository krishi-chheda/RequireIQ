# RFP Engine (P1 Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the analysis engine produce a trustworthy register from a real PDF RFP — specific locators, high obligation recall, clean statements — without degrading the demo corpus.

**Architecture:** Three layers, each behind an existing seam. PDF parsing goes behind `extractText()` in `src/lib/ingest.ts`, so nothing downstream learns the input was a PDF. Structure detection is a new pre-pass module that normalises plain text into the same shape `chunkDocument()` already understands. `bindsOn` is a new classifier that *replaces* the domain-noun rejection filter in `extract.ts` rather than extending it.

**Tech Stack:** TypeScript, Next.js 15, `node:sqlite`, Vitest. One new runtime dependency (a PDF text extractor, chosen in Task 1).

**Spec:** [`docs/superpowers/specs/2026-09-16-rfp-ingestion-p1-design.md`](../specs/2026-09-16-rfp-ingestion-p1-design.md)

**Scope:** This is Plan A of two. It covers spec pieces 1–3 (engine). Piece 4 — project creation, single-password access, durable deploy — is Plan B and does not block this work: the existing ingest endpoint accepts uploads into the seeded project, which is enough to measure the engine.

## Global Constraints

- **Node >= 22.13.0** (`package.json` `engines`). `node:sqlite` requires it.
- **No literal control characters in source files.** Build them at runtime (`String.fromCharCode(0)`) — the codebase has been bitten by this twice. See `NUL` in `src/lib/ingest.ts` and `stripControlCharacters` in `src/lib/validate.ts`.
- **All number formatting pins `en-US`.** A default locale renders `$2,00,000`.
- **Every detector gets a negative test** — the case where it must *not* fire.
- **The demo corpus output must not change:** 82 requirements, 6 constraints, 7 conflicts, health 30. `src/lib/queries.test.ts` and `src/lib/ai/engine/pipeline.test.ts` must pass untouched except where this plan says otherwise.
- **Statements stay verbatim.** Cleanup happens to the *document text before chunking*, never to an extracted statement. The offset-slicing assertion in `pipeline.test.ts` is the contract.
- Run `npx vitest run` after every task. Run `npx tsc --noEmit && npx eslint .` before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/ai/engine/structure.ts` | **New.** Pure functions: strip page furniture, normalise bullets, detect headings in plain text, decide whether a document is a transcript. |
| `src/lib/ai/engine/structure.test.ts` | **New.** Unit tests for the above. |
| `src/lib/ai/engine/binds-on.ts` | **New.** `classifyBindsOn(statement)` — who an obligation binds. |
| `src/lib/ai/engine/binds-on.test.ts` | **New.** Unit tests, including the `unknown` path. |
| `src/lib/ai/engine/text.ts` | Modify. `chunkDocument` consumes structure detection. |
| `src/lib/ai/engine/extract.ts` | Modify. Replace the domain-noun filter with `bindsOn`. |
| `src/lib/ingest.ts` | Modify. PDF branch in `extractText`; persist `binds_on`. |
| `src/lib/pdf.ts` | **New.** PDF text extraction, isolated so the parser choice is swappable. |
| `src/lib/db/schema.sql` + `migrations.ts` | Modify/new. `binds_on` column and the first ordered migration. |
| `src/lib/types.ts`, `queries.ts`, `db/seed.ts` | Modify. Carry `bindsOn` through. |
| `demo-data-rfp/synthetic-rfp.txt` | **New.** Committed RFP-shaped fixture. |
| `src/lib/ai/engine/rfp.test.ts` | **New.** The success-criteria assertions. |
| `scripts/probe-rfp.mjs` | **New.** Local metrics against the real gitignored PDFs. |

---

### Task 1: Choose and isolate a PDF text extractor

**Files:**
- Create: `src/lib/pdf.ts`
- Create: `src/lib/pdf.test.ts`
- Modify: `package.json` (one dependency)

**Interfaces:**
- Consumes: nothing
- Produces: `extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }>` and `class PdfExtractionError extends Error`

- [ ] **Step 1: Evaluate both candidates against the real samples**

This is a decision made with evidence, not asserted. Install both temporarily and measure.

```bash
npm install --no-save unpdf pdfjs-dist
```

Write `scratch-eval.mjs` at the repo root:

```js
import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("samples/rfp").filter((f) => f.endsWith(".pdf"));
const { extractText, getDocumentProxy } = await import("unpdf");

for (const f of files) {
  const bytes = new Uint8Array(readFileSync(`samples/rfp/${f}`));
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  console.log(f, "| pages:", totalPages, "| chars:", text.length,
    "| chars/page:", Math.round(text.length / totalPages),
    "| shall:", (text.match(/\bshall\b/gi) || []).length,
    "| replacement chars:", (text.match(/�/g) || []).length);
}
```

Run: `node scratch-eval.mjs`

Record chars/page and `shall` count. Compare against the `pdftotext` baseline in the spec (Mercer Island: 12,622 words, 86 `shall`; Santa Fe: 10,762 words, 45 `shall`). Pick the library whose counts are closest without replacement characters. Delete `scratch-eval.mjs` afterwards.

- [ ] **Step 2: Install the winner properly**

```bash
npm uninstall pdfjs-dist && npm install unpdf
```

(If the evaluation favoured `pdfjs-dist`, invert this and adjust the import in Step 4.)

- [ ] **Step 3: Write the failing test**

Create `src/lib/pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractPdfText, PdfExtractionError } from "./pdf";

/** Smallest valid PDF that contains no extractable text. */
function emptyPdfBytes(): Uint8Array {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

describe("extractPdfText", () => {
  it("rejects a PDF with no extractable text, naming OCR", async () => {
    await expect(extractPdfText(emptyPdfBytes())).rejects.toThrow(PdfExtractionError);
    await expect(extractPdfText(emptyPdfBytes())).rejects.toThrow(/OCR/i);
  });

  it("rejects bytes that are not a PDF at all", async () => {
    const notPdf = new TextEncoder().encode("this is plainly not a pdf document");
    await expect(extractPdfText(notPdf)).rejects.toThrow(PdfExtractionError);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf.test.ts`
Expected: FAIL — `Failed to resolve import "./pdf"`

- [ ] **Step 5: Implement**

Create `src/lib/pdf.ts`:

```ts
import "server-only";

/**
 * PDF text extraction.
 *
 * Isolated in its own module so the parser is swappable without touching the
 * ingestion pipeline. Everything downstream takes a string; this is the only
 * place that knows a PDF exists.
 */

/** Below this, a page is almost certainly an image rather than text. */
const MIN_CHARS_PER_PAGE = 120;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<{ text: string; pageCount: number }> {
  let text: string;
  let pageCount: number;

  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = String(result.text);
    pageCount = Math.max(1, result.totalPages);
  } catch (cause) {
    throw new PdfExtractionError(
      "This file could not be read as a PDF. It may be corrupt or password protected.",
    );
  }

  // A scanned PDF parses fine and yields almost nothing. Emitting requirements
  // from that would be worse than refusing: the register would look populated
  // and be meaningless.
  if (text.trim().length / pageCount < MIN_CHARS_PER_PAGE) {
    throw new PdfExtractionError(
      `This PDF has little or no selectable text (${Math.round(text.trim().length / pageCount)} characters per page). ` +
        "It is probably scanned images, which needs OCR - a capability this build does not have.",
    );
  }

  return { text: text.replace(/\r\n/g, "\n"), pageCount };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Verify against the real samples**

Run:

```bash
node --experimental-strip-types -e "import('./src/lib/pdf.ts').then(async(m)=>{const fs=await import('node:fs');for(const f of fs.readdirSync('samples/rfp').filter(x=>x.endsWith('.pdf'))){const r=await m.extractPdfText(new Uint8Array(fs.readFileSync('samples/rfp/'+f)));console.log(f,r.pageCount,'pages',r.text.length,'chars');}})"
```

Expected: both files extract, chars/page well above 120. If `server-only` blocks this, run it through a temporary vitest file instead.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdf.ts src/lib/pdf.test.ts package.json package-lock.json
git commit -m "Add PDF text extraction behind its own module

Isolated so the parser choice stays swappable. Rejects scanned PDFs by
characters-per-page rather than parsing them into meaningless requirements."
```

---

### Task 2: Wire PDF into the ingestion seam

**Files:**
- Modify: `src/lib/ingest.ts:31-40` (extension sets), `:77-101` (`extractText`)
- Modify: `src/app/api/projects/[projectId]/ingest/route.ts` (await the now-async call)
- Modify: `src/components/upload.tsx` (accept attribute, copy)
- Test: `src/lib/ingest.test.ts` (new)

**Interfaces:**
- Consumes: `extractPdfText`, `PdfExtractionError` from Task 1
- Produces: `extractText(filename: string, bytes: Uint8Array): Promise<string>` — **note this becomes async**, which is the breaking change callers must follow

- [ ] **Step 1: Write the failing test**

Create `src/lib/ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractText, IngestError } from "./ingest";

const encode = (s: string) => new TextEncoder().encode(s);

describe("extractText", () => {
  it("still reads plain text formats", async () => {
    const text = "The system must retain audit records for seven years from closure.";
    await expect(extractText("notes.md", encode(text))).resolves.toContain("must retain");
  });

  it("no longer refuses PDFs as an unsupported format", async () => {
    // A malformed PDF must fail for being unreadable, not for being a PDF.
    await expect(extractText("rfp.pdf", encode("%PDF-1.4 truncated"))).rejects.toThrow(
      /could not be read|selectable text/i,
    );
  });

  it("still refuses DOCX with a clear message", async () => {
    await expect(extractText("brief.docx", encode("PK"))).rejects.toThrow(IngestError);
  });

  it("rejects binary content wearing a text extension", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, ...encode("x".repeat(80))]);
    await expect(extractText("fake.txt", bytes)).rejects.toThrow(/binary content/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ingest.test.ts`
Expected: FAIL — the PDF case throws the "needs a parser" message, and `extractText` is not a promise.

- [ ] **Step 3: Implement**

In `src/lib/ingest.ts`, remove the `pdf` entry from `BINARY_EXTENSIONS` (keep `docx`, `doc`, `msg`), then change `extractText` to:

```ts
export async function extractText(filename: string, bytes: Uint8Array): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    const { extractPdfText, PdfExtractionError } = await import("./pdf");
    try {
      const { text } = await extractPdfText(bytes);
      return text;
    } catch (error) {
      if (error instanceof PdfExtractionError) throw new IngestError(error.message);
      throw error;
    }
  }

  const unsupported = BINARY_EXTENSIONS[extension];
  if (unsupported) throw new IngestError(unsupported, true);

  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new IngestError(
      `"${extension || "no extension"}" is not a format this build reads. Supported: ${[...TEXT_EXTENSIONS, "pdf"].sort().join(", ")}.`,
      true,
    );
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  // A NUL byte in the first kilobyte means this is binary content wearing a
  // text extension. Feeding that to the analyser produces garbage requirements.
  if (text.slice(0, 1024).includes(NUL)) {
    throw new IngestError("This file looks like binary content with a text extension.");
  }
  if (text.trim().length < 40) {
    throw new IngestError("There is not enough text in this file to analyse.");
  }
  return text.replace(/\r\n/g, "\n");
}
```

In `src/app/api/projects/[projectId]/ingest/route.ts`, change the call site to await it:

```ts
const content = await extractText(filename, new Uint8Array(await file.arrayBuffer()));
```

In `src/components/upload.tsx`, add `.pdf` to the file input's `accept` attribute and update the two copy strings that list supported formats and that describe PDF as unsupported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all suites including the 97 existing tests.

- [ ] **Step 5: Verify end to end against a real RFP**

```bash
npm run dev
```

In a second terminal:

```bash
curl -s -X POST "http://localhost:3000/api/projects/prj_meridian_onboarding/ingest" -F "file=@samples/rfp/santa-fe-county-meeting-software-rfp.pdf" | head -40
```

Expected: HTTP 201 with a JSON summary showing a non-zero `requirements` count. The quality will still be poor — locators are the next task. Afterwards, reset: stop the server and delete `data/requireiq.db*`.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add -A
git commit -m "Accept PDF uploads through the existing ingestion seam

extractText becomes async, which is the only change callers see. PDF-specific
handling stays in src/lib/pdf.ts; nothing downstream knows the format."
```

---

### Task 3: Strip page furniture and normalise bullets

**Files:**
- Create: `src/lib/ai/engine/structure.ts`
- Create: `src/lib/ai/engine/structure.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `cleanDocumentText(text: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/engine/structure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanDocumentText } from "./structure";

describe("cleanDocumentText", () => {
  it("removes a running footer that repeats across pages", () => {
    // Three pages, same footer. The probe found this fused into statements:
    // "Page 8 of 34 Respondents shall not contact other City staff."
    const text = [
      "Page 1 of 3",
      "Respondents shall submit a single proposal.",
      "Page 2 of 3",
      "The solution shall support records retention.",
      "Page 3 of 3",
      "Contractor shall provide evidence of insurance.",
    ].join("\n");

    const cleaned = cleanDocumentText(text);
    expect(cleaned).not.toMatch(/Page \d+ of \d+/);
    expect(cleaned).toContain("Respondents shall submit a single proposal.");
    expect(cleaned).toContain("Contractor shall provide evidence of insurance.");
  });

  it("removes a repeated header line even without a page-number pattern", () => {
    const text = Array.from({ length: 4 }, (_, i) =>
      ["CITY OF SOMEWHERE RFP 2026-01", `Clause ${i}: the system shall do a thing.`].join("\n"),
    ).join("\n");

    const cleaned = cleanDocumentText(text);
    expect(cleaned.match(/CITY OF SOMEWHERE RFP 2026-01/g)).toBeNull();
    expect(cleaned).toContain("the system shall do a thing.");
  });

  it("normalises mangled and unicode bullet glyphs to a hyphen", () => {
    const text = "� Vendors shall respond.\n• Vendors shall provide references.";
    const cleaned = cleanDocumentText(text);
    expect(cleaned).not.toMatch(/[�•]/);
    expect(cleaned).toMatch(/- Vendors shall respond\./);
  });

  it("leaves a document with no furniture untouched apart from trailing space", () => {
    // Negative case: cleanup must not damage the demo corpus.
    const text = "# Workshop 07\n\nKENJI MORI (Lead): The platform must support 10,000 users.";
    expect(cleanDocumentText(text).trim()).toBe(text.trim());
  });

  it("does not remove a line that merely appears twice in a long document", () => {
    // Two occurrences is coincidence; furniture repeats on most pages.
    const body = Array.from({ length: 20 }, (_, i) => `Clause ${i} shall apply.`).join("\n");
    const text = `Shared sentence here.\n${body}\nShared sentence here.`;
    expect(cleanDocumentText(text)).toContain("Shared sentence here.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/engine/structure.test.ts`
Expected: FAIL — `Failed to resolve import "./structure"`

- [ ] **Step 3: Implement**

Create `src/lib/ai/engine/structure.ts`:

```ts
/**
 * Structure recovery for plain text.
 *
 * PDF-derived text has no Markdown, so the chunker falls through to paragraph
 * splitting and every citation collapses to the document default. These
 * functions put the structure back before chunking runs.
 *
 * Cleanup happens to the document, never to an extracted statement: the
 * register's contract is that a statement exists verbatim in the stored text at
 * the offsets recorded against it.
 */

/** Page-number furniture, e.g. "Page 8 of 34", "- 12 -", a bare numeral. */
const PAGE_NUMBER = /^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-|\d{1,4})\s*$/i;

/** Bullet glyphs, including the replacement character PDF extraction produces. */
const BULLET = /^(\s*)[�•‣▪●◦·⁃∙*]\s+/;

/**
 * A line repeated at least this many times, in a document long enough for the
 * repetition to be meaningful, is running header or footer text.
 */
const FURNITURE_MIN_OCCURRENCES = 3;
const FURNITURE_MIN_LINES = 30;
const FURNITURE_MAX_LENGTH = 120;

export function cleanDocumentText(text: string): string {
  const lines = text.split("\n");

  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (!key || key.length > FURNITURE_MAX_LENGTH) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const furniture = new Set<string>();
  if (lines.length >= FURNITURE_MIN_LINES) {
    for (const [line, count] of counts) {
      if (count >= FURNITURE_MIN_OCCURRENCES) furniture.add(line);
    }
  }

  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (PAGE_NUMBER.test(trimmed)) continue;
    if (furniture.has(trimmed)) continue;
    kept.push(line.replace(BULLET, "$1- "));
  }

  // Collapse the runs of blank lines that removal leaves behind, otherwise the
  // chunker sees spurious paragraph breaks where a footer used to be.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/engine/structure.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add src/lib/ai/engine/structure.ts src/lib/ai/engine/structure.test.ts
git commit -m "Strip page furniture and normalise bullets before chunking

Running headers and footers were being fused into requirement statements.
Detected by repetition across the document rather than by pattern, so it
catches furniture that carries no page number."
```

---

### Task 4: Detect headings in plain text

**Files:**
- Modify: `src/lib/ai/engine/structure.ts`
- Modify: `src/lib/ai/engine/structure.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `detectHeading(line: string): string | null`, `isTranscript(lines: string[]): boolean`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ai/engine/structure.test.ts`:

```ts
import { detectHeading, isTranscript } from "./structure";

describe("detectHeading", () => {
  it.each([
    ["3.2.1 Capacity and Throughput", "3.2.1 Capacity and Throughput"],
    ["  4.2 Scope of Work", "4.2 Scope of Work"],
    ["C. SCOPE OF WORK", "C. SCOPE OF WORK"],
    ["EQUAL EMPLOYMENT OPPORTUNITY", "EQUAL EMPLOYMENT OPPORTUNITY"],
    ["Partnerships:", "Partnerships"],
  ])("reads %s as a heading", (line, expected) => {
    expect(detectHeading(line)).toBe(expected);
  });

  it.each([
    "The system shall support records retention and disposal scheduling.",
    "Respondents shall submit a single proposal in response to this RFP.",
    "",
    "   ",
    "3.2.1",
    "This sentence ends with a colon and is far too long to be a heading of any kind:",
  ])("does not read %j as a heading", (line) => {
    expect(detectHeading(line)).toBeNull();
  });
});

describe("isTranscript", () => {
  it("recognises a real transcript by repeated named speakers", () => {
    const lines = [
      "KENJI MORI (Platform Lead): The platform must support 10,000 users.",
      "TOM DEVLIN (Architect): Where did that number come from?",
      "KENJI MORI: Product modelled it.",
      "TOM DEVLIN: Noted.",
    ];
    expect(isTranscript(lines)).toBe(true);
  });

  it("does not mistake RFP form labels for speakers", () => {
    // The probe invented speakers called EQUAL EMPLOYMENT OPPORTUNITY, FIRM,
    // REPRESENTED BY, TITLE, E-MAIL - each appearing exactly once.
    const lines = [
      "EQUAL EMPLOYMENT OPPORTUNITY:",
      "FIRM:",
      "REPRESENTED BY:",
      "TITLE:",
      "E-MAIL:",
      "ADDRESS:",
    ];
    expect(isTranscript(lines)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/engine/structure.test.ts`
Expected: FAIL — `detectHeading is not a function`

- [ ] **Step 3: Implement**

Append to `src/lib/ai/engine/structure.ts`:

```ts
/** "3.2.1 Capacity and Throughput" - the dominant RFP clause form. */
const NUMBERED_CLAUSE = /^\s*(\d+(?:\.\d+)*)\s+(\S.{0,90})$/;
/** "C. SCOPE OF WORK" */
const LETTERED_CLAUSE = /^\s*([A-Z])\.\s+(\S.{0,90})$/;
/** A line that is entirely upper case and stands alone. */
const CAPS_HEADING = /^\s*([A-Z][A-Z0-9 &/,'()-]{3,80})\s*$/;
/** "Partnerships:" - title-ish, short, ends in a colon. */
const COLON_HEADING = /^\s*([A-Z][A-Za-z0-9 &/,'()-]{2,60}):\s*$/;

/**
 * Reads a heading from one line, or null.
 *
 * Deliberately conservative on length: an obligation sentence ending in a colon
 * is not a heading, and treating it as one would silently drop a requirement.
 */
export function detectHeading(line: string): string | null {
  if (!line.trim()) return null;

  const numbered = NUMBERED_CLAUSE.exec(line);
  if (numbered && !/[.!?]$/.test(line.trim())) {
    return `${numbered[1]} ${numbered[2]!.trim()}`;
  }

  const lettered = LETTERED_CLAUSE.exec(line);
  if (lettered && !/[.!?]$/.test(line.trim())) {
    return `${lettered[1]}. ${lettered[2]!.trim()}`;
  }

  const caps = CAPS_HEADING.exec(line);
  if (caps) return caps[1]!.trim();

  const colon = COLON_HEADING.exec(line);
  if (colon) return colon[1]!.trim();

  return null;
}

/** A candidate speaker label: "NAME:" or "NAME (Role):" at the line start. */
const SPEAKER_CANDIDATE = /^([A-Z][A-Z .'-]{2,40}?)\s*(?:\([^)]{2,80}\))?\s*:\s*\S/;

/** Distinct speakers, each speaking more than once, before a document counts. */
const TRANSCRIPT_MIN_SPEAKERS = 2;
const TRANSCRIPT_MIN_TURNS = 2;

/**
 * Whether a document is a transcript, decided for the document as a whole.
 *
 * The per-line pattern alone invents speakers out of RFP form labels, because
 * "E-MAIL:" looks exactly like "KENJI MORI:". The distinguishing fact is
 * repetition: a form label appears once, a person in a workshop speaks
 * repeatedly.
 */
export function isTranscript(lines: string[]): boolean {
  const turns = new Map<string, number>();
  for (const line of lines) {
    const match = SPEAKER_CANDIDATE.exec(line);
    if (!match?.[1]) continue;
    const name = match[1].trim();
    turns.set(name, (turns.get(name) ?? 0) + 1);
  }
  const repeated = [...turns.values()].filter((n) => n >= TRANSCRIPT_MIN_TURNS);
  return repeated.length >= TRANSCRIPT_MIN_SPEAKERS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/engine/structure.test.ts`
Expected: PASS (all tests, including the 5 from Task 3)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add src/lib/ai/engine/structure.ts src/lib/ai/engine/structure.test.ts
git commit -m "Detect headings in plain text and transcripts by speaker repetition

Whether a document is a transcript is now decided for the document as a whole.
Per-line speaker matching invented people named E-MAIL and FIRM out of RFP
form labels."
```

---

### Task 5: Feed structure detection into the chunker

**Files:**
- Modify: `src/lib/ai/engine/text.ts:109-200` (`chunkDocument` and its constants)
- Modify: `src/lib/ai/engine/text.test.ts`

**Interfaces:**
- Consumes: `cleanDocumentText`, `detectHeading`, `isTranscript` from Tasks 3–4
- Produces: `chunkDocument` unchanged in signature; locators become specific

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ai/engine/text.test.ts`:

```ts
describe("chunkDocument on plain text without Markdown", () => {
  const rfp = [
    "CITY OF SOMEWHERE",
    "Page 1 of 2",
    "",
    "3.1 General Requirements",
    "",
    "The solution shall provide role-based access control for all staff users.",
    "",
    "3.2 Capacity",
    "",
    "The solution shall support 500 concurrent users at peak load.",
    "",
    "CITY OF SOMEWHERE",
    "Page 2 of 2",
    "",
    "C. SUBMISSION REQUIREMENTS",
    "",
    "Respondents shall submit one electronic copy of the proposal.",
  ].join("\n");

  it("gives clauses their own locators rather than one document default", () => {
    const locators = new Set(chunkDocument(rfp).map((c) => c.locator));
    expect(locators.has("3.1 General Requirements")).toBe(true);
    expect(locators.has("3.2 Capacity")).toBe(true);
    expect(locators.has("C. SUBMISSION REQUIREMENTS")).toBe(true);
    expect(locators.size).toBeGreaterThanOrEqual(3);
  });

  it("attributes no speakers in a document that is not a transcript", () => {
    expect(chunkDocument(rfp).every((c) => c.speaker === null)).toBe(true);
  });

  it("still slices offsets back to the chunk text", () => {
    for (const chunk of chunkDocument(rfp)) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.end - chunk.start).toBe(chunk.text.length);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/engine/text.test.ts`
Expected: FAIL — every locator is "Preamble", and `C. SUBMISSION REQUIREMENTS` is read as a speaker.

- [ ] **Step 3: Implement**

> **Offsets matter here.** `cleanDocumentText` removes lines, so offsets into the cleaned text no longer address the original. The chunker must therefore operate on cleaned text *and* the caller must store that same cleaned text as the document content. Task 6 handles the storage side; do not skip it.

In `src/lib/ai/engine/text.ts`, add the import at the top:

```ts
import { cleanDocumentText, detectHeading, isTranscript } from "./structure";
```

Then in `chunkDocument`, replace the opening lines and the per-line heading branch:

```ts
export function chunkDocument(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const cleaned = cleanDocumentText(content);
  const lines = cleaned.split("\n");

  // Speaker attribution is a document-level decision. Applying the per-line
  // pattern to an RFP invents speakers out of form labels.
  const transcript = isTranscript(lines);

  let currentHeading = "Preamble";
  let buffer: string[] = [];
  let bufferStart = 0;
  let offset = 0;
  let speaker: string | null = null;
  const turnCounts = new Map<string, number>();
  let inHeaderBlock = false;
```

Inside the loop, replace the Markdown-only heading branch with:

```ts
    const markdownHeading = HEADING.exec(line);
    const plainHeading = markdownHeading ? null : detectHeading(line);
    if (markdownHeading || plainHeading) {
      flush();
      currentHeading =
        (markdownHeading ? (markdownHeading[2] ?? "").trim() : plainHeading!) || currentHeading;
      inHeaderBlock = false;
      bufferStart = offset;
      continue;
    }
```

And guard the speaker branch:

```ts
    const turn = transcript ? SPEAKER_TURN.exec(line) : null;
    if (turn && turn[1]) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS. **If `pipeline.test.ts` or `queries.test.ts` now fail, stop.** The demo corpus is the regression guard. The most likely cause is `detectHeading` matching a line in a transcript that is not a heading — tighten `detectHeading`, do not loosen the demo assertions.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add src/lib/ai/engine/text.ts src/lib/ai/engine/text.test.ts
git commit -m "Recover document structure before chunking

Plain-text headings now produce real locators, so a citation reads
'3.2 Capacity' instead of 'Preamble'. Speaker detection is gated on the
document actually being a transcript."
```

---

### Task 6: Store the cleaned text so offsets stay truthful

**Files:**
- Modify: `src/lib/ingest.ts` (`ingestDocument`), `src/lib/db/seed.ts`
- Test: `src/lib/ingest.test.ts`

**Interfaces:**
- Consumes: `cleanDocumentText`
- Produces: nothing new — this closes the offset contract opened in Task 5

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ingest.test.ts`:

```ts
import { cleanDocumentText } from "./ai/engine/structure";

describe("stored content and offsets", () => {
  it("cleaning is idempotent, so storing cleaned text keeps offsets valid", () => {
    // The chunker cleans before computing offsets. If the stored document is
    // the raw text, every citation is off by the number of removed characters.
    const raw = [
      "Page 1 of 2",
      "3.1 Scope",
      "The solution shall retain records for seven years.",
      "Page 2 of 2",
      "3.2 Capacity",
      "The solution shall support 500 concurrent users.",
    ].join("\n");

    const once = cleanDocumentText(raw);
    expect(cleanDocumentText(once)).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `npx vitest run src/lib/ingest.test.ts`
Expected: PASS if Task 3 was implemented correctly. If it FAILS, `cleanDocumentText` is not idempotent — fix that first, because the whole offset contract depends on it.

- [ ] **Step 3: Implement**

In `src/lib/ingest.ts`, import the cleaner and normalise once at the top of `ingestDocument`:

```ts
import { chunkDocument } from "./ai/engine/text";
import { cleanDocumentText } from "./ai/engine/structure";
```

Immediately after the `getProject` guard:

```ts
  // Store what the analyser actually read. The chunker cleans before computing
  // offsets, so persisting the raw text would leave every citation pointing a
  // few hundred characters off. Cleaning is idempotent, so the chunker's own
  // second pass is a no-op.
  const content = cleanDocumentText(input.content);
```

Then replace every subsequent use of `input.content` inside `ingestDocument` with `content` — the `wordCount` calculations, the `localProvider.extract` call, the `documents` INSERT and the `chunkDocument` call.

Apply the same change in `src/lib/db/seed.ts`: clean each corpus document once before inserting it and before extracting from it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, including `queries.test.ts`'s assertion that every stored quote slices back out of the stored document.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add -A
git commit -m "Store the cleaned document text so citation offsets stay truthful

The chunker cleans before computing offsets, so persisting raw text would put
every citation a few hundred characters out."
```

---

### Task 7: Classify who an obligation binds

**Files:**
- Create: `src/lib/ai/engine/binds-on.ts`
- Create: `src/lib/ai/engine/binds-on.test.ts`
- Modify: `src/lib/types.ts` (after line 191)

**Interfaces:**
- Consumes: nothing
- Produces: `type BindsOn = "system" | "supplier" | "bidder" | "buyer" | "unknown"`, `classifyBindsOn(statement: string): { bindsOn: BindsOn; evidence: string }`, `BINDS_ON_LABEL: Record<BindsOn, string>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/engine/binds-on.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyBindsOn } from "./binds-on";

describe("classifyBindsOn", () => {
  it.each([
    ["The solution shall support records management and retention.", "system"],
    ["The platform must achieve 99.99% availability measured monthly.", "system"],
    ["The system must encrypt all personal data at rest and in transit.", "system"],
    ["Proposals shall be submitted by 2:00PM on Friday 7 August.", "bidder"],
    ["Respondents shall not contact other City staff with any questions.", "bidder"],
    ["The offeror must be registered to do business in the State of New Mexico.", "bidder"],
    ["Contractor shall submit evidence of insurance as is required herein.", "supplier"],
    ["The successful Offeror shall provide implementation and training services.", "supplier"],
    ["The City will provide test data within ten working days of contract award.", "buyer"],
    ["The County shall evaluate proposals against the published criteria.", "buyer"],
  ])("reads %j as binding the %s", (statement, expected) => {
    expect(classifyBindsOn(statement).bindsOn).toBe(expected);
  });

  it("returns unknown rather than guessing when no actor is identifiable", () => {
    // Honest outcome, not a fallback: this surfaces for review instead of
    // silently discarding a real obligation, which is what the old
    // domain-noun filter did to 132 of them.
    const result = classifyBindsOn("It shall be completed in a timely manner.");
    expect(result.bindsOn).toBe("unknown");
  });

  it("always explains itself, so a reviewer can disagree with the label", () => {
    const result = classifyBindsOn("The solution shall support single sign-on.");
    expect(result.evidence.length).toBeGreaterThan(10);
    expect(result.evidence.toLowerCase()).toContain("solution");
  });

  it("prefers the grammatical subject over a noun mentioned later", () => {
    // The sentence binds the supplier even though it mentions the system.
    const result = classifyBindsOn("The Contractor shall configure the system before go-live.");
    expect(result.bindsOn).toBe("supplier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/engine/binds-on.test.ts`
Expected: FAIL — `Failed to resolve import "./binds-on"`

- [ ] **Step 3: Implement**

Create `src/lib/ai/engine/binds-on.ts`:

```ts
/**
 * Who an obligation binds.
 *
 * A dimension orthogonal to requirement type, not an extension of it: a
 * security obligation on the supplier and one on the system are both security.
 *
 * This replaces the domain-noun rejection filter. That filter asked "does this
 * sentence contain a word I recognise?", which is a vocabulary list that will
 * never be complete - it rejected 132 genuine obligations from two RFPs, every
 * one for the same reason. The question here is "can I identify who this
 * binds?", and `unknown` is a designed answer that surfaces for review.
 */

export type BindsOn = "system" | "supplier" | "bidder" | "buyer" | "unknown";

export const BINDS_ON_LABEL: Record<BindsOn, string> = {
  system: "The system",
  supplier: "The supplier",
  bidder: "The bidder",
  buyer: "The buyer",
  unknown: "Unidentified actor",
};

/** Ordered: the first group whose cue appears earliest in the sentence wins. */
const CUES: Array<{ bindsOn: BindsOn; terms: string[] }> = [
  {
    bindsOn: "supplier",
    terms: [
      "successful offeror", "selected respondent", "successful respondent",
      "awarded vendor", "successful proposer", "contractor", "the supplier",
      "the vendor", "service provider", "the awarded",
    ],
  },
  {
    bindsOn: "bidder",
    terms: [
      "respondent", "offeror", "proposer", "bidder", "tenderer", "proposal",
      "proposals", "submission", "the bid", "bids", "applicant firm",
    ],
  },
  {
    bindsOn: "buyer",
    terms: [
      "the city", "the county", "the authority", "the agency", "the department",
      "the purchaser", "the client", "the bank", "the buyer", "the state",
    ],
  },
  {
    bindsOn: "system",
    terms: [
      "the system", "the platform", "the solution", "the service",
      "the application", "the software", "the product", "the interface",
      "the onboarding journey", "the portal",
    ],
  },
];

export function classifyBindsOn(statement: string): { bindsOn: BindsOn; evidence: string } {
  const lower = statement.toLowerCase();

  // Earliest cue wins, because the grammatical subject comes first: "The
  // Contractor shall configure the system" binds the supplier, not the system.
  let best: { bindsOn: BindsOn; term: string; index: number } | null = null;

  for (const group of CUES) {
    for (const term of group.terms) {
      const index = lower.indexOf(term);
      if (index === -1) continue;
      if (!best || index < best.index) best = { bindsOn: group.bindsOn, term, index };
    }
  }

  if (!best) {
    return {
      bindsOn: "unknown",
      evidence:
        "No actor could be identified from the statement. It carries an obligation but does not say who is bound by it.",
    };
  }

  return {
    bindsOn: best.bindsOn,
    evidence: `Matched "${best.term}" as the earliest actor in the statement.`,
  };
}
```

Add to `src/lib/types.ts`, immediately after the `Requirement` interface's `qualityScore` field (line 191):

```ts
  /** Who the obligation binds. Orthogonal to `type`. */
  bindsOn: BindsOn;
```

and re-export the type near the other unions:

```ts
export type { BindsOn } from "./ai/engine/binds-on";
export { BINDS_ON_LABEL } from "./ai/engine/binds-on";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/engine/binds-on.test.ts`
Expected: PASS (13 assertions across 4 tests). TypeScript will now report errors everywhere a `Requirement` is constructed — Task 8 fixes those.

- [ ] **Step 5: Commit**

```bash
npx eslint src/lib/ai/engine/binds-on.ts
git add src/lib/ai/engine/binds-on.ts src/lib/ai/engine/binds-on.test.ts src/lib/types.ts
git commit -m "Add bindsOn: who an obligation binds

Orthogonal to requirement type. Replaces the domain-noun vocabulary filter,
which rejected 132 genuine obligations from two RFPs for the same reason."
```

---

### Task 8: Replace the domain-noun filter, and migrate the schema

**Files:**
- Modify: `src/lib/ai/engine/extract.ts:91-98` (remove `DOMAIN_NOUNS`), `:163-166` (the rejection), `:47-58` (`ExtractedRequirement`)
- Modify: `src/lib/db/schema.sql`, run `node scripts/sync-schema.mjs`
- Create: `src/lib/db/migrations.ts`
- Modify: `src/lib/db/connection.ts`, `src/lib/queries.ts`, `src/lib/db/seed.ts`, `src/lib/ingest.ts`
- Test: `src/lib/ai/engine/pipeline.test.ts`, `src/lib/db/migrations.test.ts` (new)

**Interfaces:**
- Consumes: `classifyBindsOn`, `BindsOn` from Task 7
- Produces: `ExtractedRequirement.bindsOn: BindsOn`; `runMigrations(db: DatabaseSync): void`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ai/engine/pipeline.test.ts`:

```ts
describe("obligations that the old vocabulary filter discarded", () => {
  it.each([
    "All proposals submitted shall be valid for ninety (90) days.",
    "The offeror must be registered and licensed to do business in the State.",
    "Contractor shall submit evidence of insurance as is required herein.",
    "It shall be the Respondent's sole risk to assure submission by the time.",
  ])("now extracts %j", (sentence) => {
    const result = extractFromDocument({
      documentId: "d1",
      content: `3.1 Submission\n\n${sentence}`,
      kind: "specification",
      stakeholdersByName: new Map(),
      defaultStakeholderId: null,
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]!.bindsOn).not.toBe("unknown");
  });

  it("still rejects an obligation with no identifiable actor, giving that reason", () => {
    const result = extractFromDocument({
      documentId: "d1",
      content: "3.1 General\n\nIt shall be done properly and in a timely manner.",
      kind: "specification",
      stakeholdersByName: new Map(),
      defaultStakeholderId: null,
    });
    expect(result.requirements).toHaveLength(0);
    expect(result.rejected[0]!.reason).toMatch(/who it binds|actor/i);
  });
});
```

Create `src/lib/db/migrations.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
let queries: typeof import("../queries");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "requireiq-migrate-"));
  process.env.REQUIREIQ_DB_PATH = join(dir, "m.db");
  queries = await import("../queries");
});

afterAll(async () => {
  const { closeDb } = await import("./index");
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("gives every seeded requirement a bindsOn value", () => {
    const projectId = queries.listProjects()[0]!.id;
    const requirements = queries.listRequirements(projectId);
    expect(requirements.length).toBeGreaterThan(40);
    for (const requirement of requirements) {
      expect(requirement.bindsOn).toBeTruthy();
    }
  });

  it("classifies the demo corpus predominantly as system obligations", () => {
    const projectId = queries.listProjects()[0]!.id;
    const system = queries.listRequirements(projectId).filter((r) => r.bindsOn === "system");
    expect(system.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/engine/pipeline.test.ts src/lib/db/migrations.test.ts`
Expected: FAIL — sentences rejected for "No domain subject"; `bindsOn` undefined.

- [ ] **Step 3: Implement the extractor change**

In `src/lib/ai/engine/extract.ts`:

1. Add the import: `import { classifyBindsOn, type BindsOn } from "./binds-on";`
2. Delete the entire `DOMAIN_NOUNS` array (lines 91–98) and its doc comment.
3. Add `bindsOn: BindsOn;` and `bindsOnEvidence: string;` to `ExtractedRequirement`.
4. Replace the rejection block:

```ts
      const binding = classifyBindsOn(statement);
      if (binding.bindsOn === "unknown") {
        rejected.push({
          sentence: statement,
          reason: "Cannot determine who it binds - no identifiable actor in the statement.",
        });
        continue;
      }
```

5. In `buildRequirement`, accept the classification and return it. Change the signature to take `binding: { bindsOn: BindsOn; evidence: string }` and include `bindsOn: binding.bindsOn, bindsOnEvidence: binding.evidence` in the returned object. Update the single call site to pass `binding`.

- [ ] **Step 4: Implement the migration**

Add to `src/lib/db/schema.sql` in the `requirements` table, after `quality_score`:

```sql
  binds_on                TEXT NOT NULL DEFAULT 'unknown',
```

Then: `node scripts/sync-schema.mjs`

Create `src/lib/db/migrations.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";

/**
 * Ordered schema migrations.
 *
 * The schema is applied with CREATE TABLE IF NOT EXISTS, which cannot add a
 * column to a table that already exists. This is the mechanism for that, and it
 * arrives with the first schema change rather than after it.
 *
 * Append only. Never edit or renumber an existing entry: the version recorded
 * in an existing database refers to a position in this list.
 */
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 2,
    sql: "ALTER TABLE requirements ADD COLUMN binds_on TEXT NOT NULL DEFAULT 'unknown'",
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  1,
);

export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number(row.value) : 1;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    try {
      db.exec(migration.sql);
    } catch (error) {
      // A fresh database already has the column from schema.sql. Adding it
      // again is the expected no-op, not a failure.
      if (!String(error).includes("duplicate column name")) throw error;
    }
  }

  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(LATEST_SCHEMA_VERSION));
}
```

In `src/lib/db/connection.ts`, call it immediately after `db.exec(SCHEMA_SQL);`:

```ts
  runMigrations(db);
```

with `import { runMigrations } from "./migrations";` at the top.

- [ ] **Step 5: Carry the column through**

- `src/lib/queries.ts`: add `bindsOn: str(row.binds_on) as BindsOn,` to `mapRequirement`, and import the type.
- `src/lib/db/seed.ts` and `src/lib/ingest.ts`: add `binds_on` to both `INSERT INTO requirements` column lists and bind `extracted.bindsOn` in the matching position.
- `src/lib/db/seed.ts`: change `setMeta("schema_version", "1")` to use `LATEST_SCHEMA_VERSION`.

- [ ] **Step 6: Run the full suite**

Run: `rm -f data/requireiq.db* && npx vitest run`
Expected: PASS. The demo corpus counts must be unchanged at 82 requirements and 7 conflicts. **If the requirement count moved, stop and investigate** — removing the domain-noun filter should only ever *add* requirements the filter wrongly rejected, and the demo corpus was written to pass it.

If the count did rise, that is a real finding: check the new statements are genuine obligations, then update the counts in `queries.test.ts`, `migrations.test.ts` and the README together, in one commit, with the new number stated in the message.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add -A
git commit -m "Replace the domain-noun filter with bindsOn classification

The filter asked whether a sentence contained a recognised word - a vocabulary
list that rejected 132 genuine obligations from two RFPs, every one for the
same reason. The test is now whether the actor can be identified, with unknown
as a reportable outcome rather than a silent discard.

Adds the first ordered schema migration, since CREATE TABLE IF NOT EXISTS
cannot add a column to an existing table."
```

---

### Task 9: Surface bindsOn in the register

**Files:**
- Modify: `src/app/app/projects/[projectId]/requirements/page.tsx`
- Modify: `src/app/app/projects/[projectId]/requirements/[requirementId]/page.tsx`
- Modify: `src/lib/queries.ts` (`RequirementFilters`)
- Modify: `src/lib/reports.ts` (register and traceability exports)

**Interfaces:**
- Consumes: `BindsOn`, `BINDS_ON_LABEL` from Task 7
- Produces: `RequirementFilters.bindsOn?: BindsOn`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/queries.test.ts`:

```ts
describe("bindsOn filtering", () => {
  it("filters the register by who the obligation binds", () => {
    const system = queries.listRequirements(projectId, { bindsOn: "system" });
    expect(system.length).toBeGreaterThan(0);
    expect(system.every((r) => r.bindsOn === "system")).toBe(true);
  });

  it("exports bindsOn in the register report, so a client can see the split", () => {
    const csv = reports.buildReport(projectId, "register")!.csv;
    expect(csv).toContain("Binds on");
  });
});
```

Add `let reports: typeof import("./reports");` to the file's declarations and `reports = await import("./reports");` to its `beforeAll`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/queries.test.ts`
Expected: FAIL — `bindsOn` is not a recognised filter; the CSV has no such column.

- [ ] **Step 3: Implement**

In `src/lib/queries.ts`, add to `RequirementFilters`:

```ts
  /** Only obligations binding this actor. */
  bindsOn?: BindsOn;
```

and in `listRequirements`, alongside the other optional clauses:

```ts
  if (filters.bindsOn) {
    clauses.push("r.binds_on = ?");
    params.push(filters.bindsOn);
  }
```

In `src/lib/reports.ts`, add `bindsOn: BINDS_ON_LABEL[requirement.bindsOn],` to the register row object, `"Binds on"` to its header array, and `r.bindsOn` in the matching position of the row mapping. Do the same for the traceability report.

In the register page, add a filter group after the existing `type` group:

```ts
    {
      param: "bindsOn",
      label: "Binds on",
      options: (["system", "supplier", "bidder", "buyer", "unknown"] as const)
        .filter((value) => all.some((r) => r.bindsOn === value))
        .map((value) => ({
          value,
          label: BINDS_ON_LABEL[value],
          count: all.filter((r) => r.bindsOn === value).length,
        })),
    },
```

and read it into the filters:

```ts
  const bindsOn = z.optionalOneOf(query.bindsOn, [
    "system", "supplier", "bidder", "buyer", "unknown",
  ] as const) as BindsOn | undefined;
```

passing `bindsOn` into the `filters` object.

On the requirement detail page, render the value as a badge beside the type badge, with `bindsOnEvidence` shown in the "How it was read" panel next to the classification evidence.

> **Do not default the register to `system`.** The spec proposed it; it is wrong for the demo corpus, where nearly everything binds the system and a silent default would hide records for no benefit. Ship the filter visible and unset, and revisit once real RFP data shows the split is noisy.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Verify in the browser**

Run `npm run dev`, open `http://localhost:3000/app/projects/prj_meridian_onboarding/requirements`, confirm the "Binds on" filter group appears with counts and that selecting one narrows the table and updates the URL.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit && npx eslint .
git add -A
git commit -m "Surface bindsOn in the register, detail view and exports"
```

---

### Task 10: The synthetic RFP fixture and the success criteria

**Files:**
- Create: `demo-data-rfp/synthetic-rfp.txt`
- Create: `src/lib/ai/engine/rfp.test.ts`
- Create: `scripts/probe-rfp.mjs`
- Modify: `package.json` (add `probe:rfp` script)

**Interfaces:**
- Consumes: everything above
- Produces: the regression guard for RFP handling

- [ ] **Step 1: Write the fixture**

Create `demo-data-rfp/synthetic-rfp.txt`. This is committed, unlike the real PDFs, and is written to exhibit every structural feature the probe found:

```
CITY OF NORTHAM
Request for Proposals 2026-014
Page 1 of 3

1. INTRODUCTION

The City of Northam seeks proposals for a permit management platform.

2. SUBMISSION REQUIREMENTS

2.1 Timing

All proposals must be submitted by 2:00PM on Friday 12 June 2026.

It shall be the Respondent's sole risk to assure submission by the designated time.

2.2 Eligibility

The offeror must be registered and licensed to do business in the State.

CITY OF NORTHAM
Request for Proposals 2026-014
Page 2 of 3

3. SOLUTION REQUIREMENTS

3.1 Functional

� The solution shall allow an applicant to submit a permit application online.

� The solution shall provide role-based access control for all staff users.

3.2 Performance

The solution shall support 2,000 concurrent users at peak load.

The system must return 95% of page responses within 800 milliseconds.

3.3 Availability

The platform shall achieve 99.9% availability measured monthly.

The recovery time objective must be under 8 hours for full service restoration.

CITY OF NORTHAM
Request for Proposals 2026-014
Page 3 of 3

4. CONTRACT REQUIREMENTS

Contractor shall submit evidence of insurance as is required herein.

The successful Offeror shall provide training for up to forty staff users.

5. CITY OBLIGATIONS

The City will provide test data within ten working days of contract award.

6. BUDGET

Total contract value must not exceed $150,000 over the initial term.
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/ai/engine/rfp.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkDocument } from "./text";
import { extractFromDocument } from "./extract";
import { detectConflicts, type ConflictSubject } from "./conflict";

/**
 * The success criteria from the P1 spec, as assertions.
 *
 * The real RFPs are gitignored third-party documents, so this fixture carries
 * the same structural features: numbered and lettered clauses, ALL-CAPS
 * headings, running page furniture, mangled bullets, and obligations binding
 * each of the four actors.
 */
const CONTENT = readFileSync("demo-data-rfp/synthetic-rfp.txt", "utf8");

const result = extractFromDocument({
  documentId: "synthetic-rfp",
  content: CONTENT,
  kind: "specification",
  stakeholdersByName: new Map(),
  defaultStakeholderId: null,
});

describe("RFP success criteria", () => {
  it("gives most requirements a specific locator, not a document default", () => {
    const specific = result.requirements.filter(
      (r) => r.evidence.locator !== "Preamble" && r.evidence.locator.length > 0,
    );
    const ratio = specific.length / result.requirements.length;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  });

  it("recalls at least three quarters of the obligations", () => {
    const obligations = (CONTENT.match(/\b(shall|must)\b/gi) ?? []).length;
    const captured = result.requirements.length + result.constraints.length;
    expect(captured / obligations).toBeGreaterThanOrEqual(0.75);
  });

  it("invents no speakers in a document that is not a transcript", () => {
    expect(chunkDocument(CONTENT).every((c) => c.speaker === null)).toBe(true);
  });

  it("leaves no page furniture or replacement characters in any statement", () => {
    for (const requirement of result.requirements) {
      expect(requirement.statement).not.toMatch(/Page \d+ of \d+/);
      expect(requirement.statement).not.toMatch(/[�]/);
      expect(requirement.statement).not.toMatch(/CITY OF NORTHAM/);
    }
  });

  it("finds the budget constraint", () => {
    expect(result.constraints.length).toBeGreaterThanOrEqual(1);
    expect(result.constraints.some((c) => c.value === 150_000)).toBe(true);
  });

  it("identifies all four kinds of actor", () => {
    const kinds = new Set(result.requirements.map((r) => r.bindsOn));
    for (const kind of ["system", "supplier", "bidder", "buyer"]) {
      expect(kinds.has(kind as never), `expected a ${kind} obligation`).toBe(true);
    }
  });

  it("still detects availability against recovery time inside one document", () => {
    const subjects: ConflictSubject[] = result.requirements.map((r, i) => ({
      id: `R${i}`, ref: `REQ-${i}`, type: "requirement", statement: r.statement, team: null,
    }));
    const conflict = detectConflicts(subjects).find((c) =>
      c.detector.includes("Availability-to-downtime"),
    );
    expect(conflict).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails or passes**

Run: `npx vitest run src/lib/ai/engine/rfp.test.ts`
Expected: Most should now PASS given Tasks 1–8. Any failure is a real gap — fix the engine, not the threshold. The two most likely: the bullet-prefixed lines in 3.1 (check `cleanDocumentText` runs before chunking) and the `$150,000` constraint (check `CONSTRAINT_NOUNS` in `extract.ts` includes a cue matching "Total contract value must not exceed").

- [ ] **Step 4: Add the local probe script**

Create `scripts/probe-rfp.mjs`:

```js
// Prints the P1 success metrics against whatever real PDFs are in samples/rfp/.
// Not part of CI - those documents are gitignored. This is the thing you run
// when a real document behaves oddly.
import { readdirSync, readFileSync, existsSync } from "node:fs";

if (!existsSync("samples/rfp")) {
  console.error("No samples/rfp directory. See samples/rfp/README.md.");
  process.exit(1);
}

const { extractPdfText } = await import("../src/lib/pdf.ts");
const { chunkDocument } = await import("../src/lib/ai/engine/text.ts");
const { extractFromDocument } = await import("../src/lib/ai/engine/extract.ts");

for (const file of readdirSync("samples/rfp").filter((f) => f.endsWith(".pdf"))) {
  const { text, pageCount } = await extractPdfText(new Uint8Array(readFileSync(`samples/rfp/${file}`)));
  const chunks = chunkDocument(text);
  const result = extractFromDocument({
    documentId: file, content: text, kind: "specification",
    stakeholdersByName: new Map(), defaultStakeholderId: null,
  });

  const locators = new Set(chunks.map((c) => c.locator));
  const specific = result.requirements.filter((r) => r.evidence.locator !== "Preamble");
  const obligations = (text.match(/\b(shall|must)\b/gi) ?? []).length;
  const byActor = {};
  for (const r of result.requirements) byActor[r.bindsOn] = (byActor[r.bindsOn] ?? 0) + 1;

  console.log(`\n===== ${file}  (${pageCount} pages)`);
  console.log(`chunks ${chunks.length} | distinct locators ${locators.size}`);
  console.log(`requirements ${result.requirements.length} | constraints ${result.constraints.length} | rejected ${result.rejected.length}`);
  console.log(`specific locators ${(100 * specific.length / Math.max(1, result.requirements.length)).toFixed(0)}%  (target >= 80%)`);
  console.log(`recall ${(100 * (result.requirements.length + result.constraints.length) / Math.max(1, obligations)).toFixed(0)}%  (target >= 75%)`);
  console.log(`speakers invented ${chunks.filter((c) => c.speaker).length}  (target 0)`);
  console.log(`binds on:`, byActor);
}
```

Add to `package.json` scripts:

```json
"probe:rfp": "node --experimental-strip-types scripts/probe-rfp.mjs"
```

- [ ] **Step 5: Run the probe against the real documents**

Run: `npm run probe:rfp`

Compare against the spec's baseline — Mercer Island was 487 chunks, 1 locator, 36 requirements, 65 rejected. Record the new numbers in the commit message. **If the targets are not met on the real PDFs, that is the finding P2 exists to act on, not a reason to weaken this plan's tests.**

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
git add -A
git commit -m "Add the RFP fixture, success-criteria tests and local probe

The real RFPs are gitignored, so the committed fixture carries the same
structural features. npm run probe:rfp measures the real documents locally."
```

---

### Task 11: Update the documentation to match

**Files:**
- Modify: `README.md`, `docs/analysis-engine.md`, `docs/architecture.md`

- [ ] **Step 1: Update the README**

- Formats: PDF moves from *Known limitations* into the supported list; DOCX stays limited.
- *What it actually does*: add `bindsOn` to the classification row.
- Testing: update the suite and test counts to the real numbers from `npx vitest run`.
- *Known limitations*: replace the PDF entry with the honest remaining one — that the engine is now tested against two US local-government RFPs and structure varies by jurisdiction.

- [ ] **Step 2: Update `docs/analysis-engine.md`**

Add a section after *Chunking* covering structure recovery: page-furniture removal by repetition, heading detection order, and the document-level transcript decision with the reason it is not per-line. Add a `bindsOn` section after *Classification*, stating that it replaces the domain-noun filter and why a vocabulary list was the wrong shape.

- [ ] **Step 3: Update `docs/architecture.md`**

Add `migrations.ts` to the persistence section, describing the append-only list and why entries must never be renumbered. Add `pdf.ts` and `structure.ts` to the layer diagram.

- [ ] **Step 4: Verify every claim**

Run `npx vitest run` and check that the test count in the README matches. Run `npm run probe:rfp` and check the numbers quoted in the docs match its output. A document that misstates a checkable number undermines every other claim in it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Update documentation for PDF ingestion, structure recovery and bindsOn"
```

---

## Self-review notes

Checked against the spec:

- **Piece 1 (PDF)** → Tasks 1–2. **Piece 2 (structure)** → Tasks 3–6. **Piece 3 (`bindsOn`)** → Tasks 7–9. **Testing** → Task 10. **Docs** → Task 11. Piece 4 is Plan B by the scope check at the top.
- **Two deviations from the spec, both deliberate and flagged in place:**
  1. The spec said the register should default to `bindsOn=system`. Task 9 ships the filter unset, because on the demo corpus nearly everything binds the system and a silent default would hide records for no benefit.
  2. The spec did not anticipate that cleaning text invalidates offsets. Task 6 exists to close that, and is the reason cleaning must be idempotent.
- **Type consistency:** `BindsOn` is defined once in `binds-on.ts` and re-exported from `types.ts`; `classifyBindsOn` returns `{ bindsOn, evidence }` in Task 7 and is consumed with those exact names in Task 8; `extractPdfText` returns `{ text, pageCount }` in Task 1 and is destructured as such in Tasks 2 and 10.
- **Every new detector has a negative test:** `cleanDocumentText` (leaves a clean document alone; ignores a line repeated only twice), `detectHeading` (six non-headings), `isTranscript` (RFP form labels), `classifyBindsOn` (`unknown`), and the extractor (rejects with the new reason).
