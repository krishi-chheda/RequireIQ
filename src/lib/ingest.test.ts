import { describe, expect, it } from "vitest";
import { extractText, IngestError } from "./ingest";
import { cleanDocumentText } from "./ai/engine/structure";

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
