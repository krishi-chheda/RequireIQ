import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPdfText, PdfExtractionError } from "./pdf";

const samplePdfPath = "samples/rfp/mercer-island-software-implementation-rfp.pdf";

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

/**
 * Self-contained, single-page PDF whose content stream carries enough real
 * text to clear MIN_CHARS_PER_PAGE on its own — no gitignored sample fixture
 * required. Lines are placed with explicit Td/T* moves because a single very
 * long Tj string does not reliably round-trip through extraction.
 */
function textDensePdfBytes(): Uint8Array {
  const lines = [
    "This synthetic PDF page exists purely to exceed the",
    "minimum extractable text threshold used by the scanned",
    "document detection guard, so this negative test case does",
    "not depend on any external sample file at all and is",
    "fully self contained within the test suite itself here.",
  ];
  const ops = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    "14 TL",
    ...lines.flatMap((line, i) => (i === 0 ? [`(${line}) Tj`] : ["T*", `(${line}) Tj`])),
    "ET",
  ];
  const content = ops.join("\n");
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj",
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    `5 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
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

  // Negative case for the characters-per-page guard: a synthetic but
  // text-dense PDF must NOT be mistaken for a scan. Unconditional and
  // self-contained, unlike the sample-based check below.
  it("does not flag a synthetic text-dense PDF as scanned", async () => {
    const result = await extractPdfText(textDensePdfBytes());
    expect(result.pageCount).toBe(1);
    expect(result.text.length / result.pageCount).toBeGreaterThan(120);
  });

  // Same guard, exercised against a real RFP for extra confidence. Skipped
  // where the gitignored sample corpus (samples/rfp/) isn't present, e.g. in
  // CI — the synthetic test above is what actually enforces the guard.
  it.skipIf(!existsSync(samplePdfPath))(
    "does not flag a real text-dense RFP as scanned",
    async () => {
      const bytes = new Uint8Array(readFileSync(samplePdfPath));
      const result = await extractPdfText(bytes);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.text.length / result.pageCount).toBeGreaterThan(120);
    },
  );
});
