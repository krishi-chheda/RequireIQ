import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractText, IngestError, ingestDocument } from "./ingest";
import { cleanDocumentText } from "./ai/engine/structure";
import { classifyBindsOn } from "./ai/engine/binds-on";

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

  it("stores the cleaned text end to end, so a stored citation survives furniture removal", async () => {
    // Nothing else in the suite calls ingestDocument, and the demo corpus has
    // no furniture to strip - so this is the only test that would actually
    // fail if the documents INSERT, the extract() call or the chunkDocument()
    // call ever went back to storing/analysing `input.content` raw.
    const dir = mkdtempSync(join(tmpdir(), "requireiq-ingest-"));
    const previousDbPath = process.env.REQUIREIQ_DB_PATH;
    process.env.REQUIREIQ_DB_PATH = join(dir, "test.db");

    const { closeDb } = await import("./db");
    try {
      const queries = await import("./queries");

      const projectId = queries.listProjects()[0]!.id;

      const raw = [
        "CITY OF SOMEWHERE",
        "Page 1 of 9",
        "",
        "3.1 General Requirements",
        "",
        "The solution shall provide role-based access control for all staff users.",
        "",
        "CITY OF SOMEWHERE",
        "Page 2 of 9",
        "",
        "3.2 Capacity",
        "",
        "The solution shall support 500 concurrent users at peak load.",
        "",
        "CITY OF SOMEWHERE",
        "Page 3 of 9",
      ].join("\n");

      const result = ingestDocument({
        projectId,
        title: "Furniture-bearing RFP excerpt",
        filename: "furniture.txt",
        content: raw,
      });

      const stored = queries.getDocument(result.documentId)!;
      expect(stored.content).not.toMatch(/Page \d+ of \d+/);
      expect(stored.content).not.toContain("CITY OF SOMEWHERE");

      // The property that actually matters: a stored evidence quote must
      // slice back out of the *stored* document at its recorded offsets.
      // This is exactly what breaks if storage and analysis ever disagree
      // on which text - raw or cleaned - they are each working from.
      const evidence = queries.listEvidenceForDocument(result.documentId);
      expect(evidence.length).toBeGreaterThan(0);
      for (const item of evidence) {
        const slice = stored.content.slice(item.startOffset, item.endOffset);
        expect(slice.replace(/\s+/g, " ")).toContain(item.quote.slice(0, 40).replace(/\s+/g, " "));
      }
    } finally {
      // Windows keeps a lock on an open SQLite file, so the handle must close
      // before the temp directory can be removed - even when an assertion
      // above threw.
      closeDb();
      rmSync(dir, { recursive: true, force: true });
      if (previousDbPath === undefined) delete process.env.REQUIREIQ_DB_PATH;
      else process.env.REQUIREIQ_DB_PATH = previousDbPath;
    }
  });
});

describe("stored bindsOn", () => {
  it("stores the classified bindsOn end to end, not the column default", async () => {
    // `binds_on` is NOT NULL DEFAULT 'unknown', so dropping it from the
    // requirements INSERT would silently store 'unknown' everywhere and no
    // other test would notice. Asserting a *non*-unknown value is the point.
    const dir = mkdtempSync(join(tmpdir(), "requireiq-bindson-"));
    const previousDbPath = process.env.REQUIREIQ_DB_PATH;
    process.env.REQUIREIQ_DB_PATH = join(dir, "test.db");

    const { closeDb } = await import("./db");
    try {
      const queries = await import("./queries");
      const projectId = queries.listProjects()[0]!.id;

      const supplier = "The Contractor shall provide onsite training within thirty days of award.";
      const system = "The solution shall support 500 concurrent users at peak load.";
      expect(classifyBindsOn(supplier).bindsOn).toBe("supplier");

      const result = ingestDocument({
        projectId,
        title: "Binding obligations excerpt",
        filename: "binding.txt",
        content: ["3.1 Obligations", "", supplier, "", system].join("\n"),
      });
      expect(result.requirements).toBeGreaterThan(0);

      const stored = queries.listRequirements(projectId);
      const row = stored.find((r) => r.statement.includes("onsite training"));
      expect(row).toBeDefined();
      expect(row!.bindsOn).toBe(classifyBindsOn(row!.statement).bindsOn);
      expect(row!.bindsOn).not.toBe("unknown");
      expect(row!.bindsOn).toBe("supplier");
    } finally {
      closeDb();
      rmSync(dir, { recursive: true, force: true });
      if (previousDbPath === undefined) delete process.env.REQUIREIQ_DB_PATH;
      else process.env.REQUIREIQ_DB_PATH = previousDbPath;
    }
  });
});
