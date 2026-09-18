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

describe("extractPdfText", () => {
  it("rejects a PDF with no extractable text, naming OCR", async () => {
    await expect(extractPdfText(emptyPdfBytes())).rejects.toThrow(PdfExtractionError);
    await expect(extractPdfText(emptyPdfBytes())).rejects.toThrow(/OCR/i);
  });

  it("rejects bytes that are not a PDF at all", async () => {
    const notPdf = new TextEncoder().encode("this is plainly not a pdf document");
    await expect(extractPdfText(notPdf)).rejects.toThrow(PdfExtractionError);
  });

  // Negative case for the characters-per-page guard: a real, text-dense PDF
  // must NOT be mistaken for a scan. Skipped where the gitignored sample
  // corpus (samples/rfp/) isn't present, e.g. in CI.
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
