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
