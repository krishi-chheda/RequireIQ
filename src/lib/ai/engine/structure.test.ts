import { describe, expect, it } from "vitest";
import { cleanDocumentText, detectHeading, isTranscript } from "./structure";

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

  it.each([5, 17, 47])(
    "keeps repeated bulleted content, and stays idempotent, with %i filler lines",
    (fillerCount) => {
      // Running headers and footers are never bulleted, so a bullet-prefixed
      // line must never be a furniture candidate, however many times its
      // normalised text repeats. Three distinct raw bullets prefixing
      // identical text used to converge to one string after normalisation
      // and get read as furniture - on the second call before round 1's fix,
      // on the first call after it (same data loss, just sooner). Checked at
      // several lengths above FURNITURE_MIN_LINES because a single short
      // fixture can pass by missing the threshold entirely rather than by
      // the exclusion actually working.
      const bulletLines = [
        "• Vendors shall respond.",
        "· Vendors shall respond.",
        "‣ Vendors shall respond.",
      ];
      const filler = Array.from({ length: fillerCount }, (_, i) => `Clause ${i} shall apply.`);
      const text = [...bulletLines, ...filler].join("\n");
      expect(text.split("\n").length).toBeGreaterThanOrEqual(8);

      const once = cleanDocumentText(text);
      expect(once.match(/- Vendors shall respond\./g)).toHaveLength(3);

      const twice = cleanDocumentText(once);
      expect(twice).toBe(once);
    },
  );

  it.each([0, 12, 42])(
    "still strips a repeated unbulleted header, with %i extra filler lines",
    (fillerCount) => {
      // The property the LIST_ITEM exclusion must not break: an unbulleted
      // repeated header is still furniture and still gets removed, at
      // several document lengths above the threshold.
      const base = Array.from({ length: 4 }, (_, i) =>
        ["CITY OF SOMEWHERE RFP 2026-01", `Clause ${i}: the system shall do a thing.`].join("\n"),
      ).join("\n");
      const filler = Array.from(
        { length: fillerCount },
        (_, i) => `Filler clause ${i} shall apply.`,
      ).join("\n");
      const text = filler ? `${base}\n${filler}` : base;
      expect(text.split("\n").length).toBeGreaterThanOrEqual(8);

      const cleaned = cleanDocumentText(text);
      expect(cleaned.match(/CITY OF SOMEWHERE RFP 2026-01/g)).toBeNull();
      expect(cleaned).toContain("the system shall do a thing.");
    },
  );
});

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

  it("does not read a short obligation sentence ending in a colon as a heading", () => {
    // Under the char-length cap (59 chars) but a full sentence, not a label -
    // the case the char cap alone lets through.
    expect(
      detectHeading("The solution shall support records management and retention:"),
    ).toBeNull();
  });

  it("does not read an unpunctuated all-caps obligation sentence as a heading", () => {
    // 77 chars, inside CAPS_HEADING's 80-char cap, and no terminal [.!?] to
    // trip the punctuation guard used elsewhere - the char cap alone lets it
    // through, same gap as the colon case above.
    expect(
      detectHeading(
        "THE CONTRACTOR SHALL MAINTAIN COMPLETE RECORDS OF ALL TRANSACTIONS AND AUDITS",
      ),
    ).toBeNull();
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

  it("does not read a repeated two-contact signature block as a transcript", () => {
    // "NAME" and "TITLE" each repeat twice here, reaching TRANSCRIPT_MIN_TURNS
    // on repetition alone - the gap the single-occurrence form-label test
    // above doesn't cover. A field label is one word; a speaker is a name.
    const lines = ["NAME: Jane Roe", "TITLE: Director", "NAME: John Doe", "TITLE: Manager"];
    expect(isTranscript(lines)).toBe(false);
  });
});
