import { describe, expect, it } from "vitest";
import {
  boundDirection,
  chunkDocument,
  extractQuantities,
  splitSentences,
  tokenize,
} from "./text";

describe("splitSentences", () => {
  it("keeps decimals and currency intact", () => {
    const text = "The platform must achieve 99.99% availability. Spend must not exceed $200,000 in year one.";
    const sentences = splitSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]!.text).toContain("99.99%");
    expect(sentences[1]!.text).toContain("$200,000");
  });

  it("preserves absolute offsets into the source", () => {
    const text = "Intro line. The system must log every access.";
    const sentences = splitSentences(text);
    const second = sentences[1]!;
    expect(text.slice(second.start, second.end)).toBe(second.text);
  });

  it("does not split on abbreviations or initials", () => {
    expect(splitSentences("Approx. 40 staff use it daily.")).toHaveLength(1);
  });

  it("treats a blank line as a boundary even without punctuation", () => {
    const sentences = splitSentences("- First bullet item\n\n- Second bullet item");
    expect(sentences.length).toBeGreaterThanOrEqual(2);
  });
});

describe("chunkDocument", () => {
  it("splits transcripts on speaker turns and records the speaker", () => {
    const doc = [
      "# Workshop 07",
      "",
      "KENJI MORI (Platform Engineering Lead, Meridian Bank): The platform must support 10,000 concurrent users.",
      "",
      "TOM DEVLIN (Solution Architect, Northgate Advisory): Where did that number come from?",
    ].join("\n");
    const chunks = chunkDocument(doc);
    const speakers = chunks.map((c) => c.speaker).filter(Boolean);
    expect(speakers).toEqual(["KENJI MORI", "TOM DEVLIN"]);
    expect(chunks.find((c) => c.speaker === "KENJI MORI")!.locator).toBe("KENJI MORI, turn 1");
  });

  it("uses headings as locators for specifications", () => {
    const doc = "## 4.2 Capacity\n\nThe service must sustain 10,000 concurrent sessions at peak.";
    const chunks = chunkDocument(doc);
    expect(chunks.some((c) => c.locator === "4.2 Capacity")).toBe(true);
  });

  it("produces offsets that slice back to the chunk text", () => {
    const doc = "# Title\n\nFirst paragraph here.\n\nSecond paragraph here.";
    for (const chunk of chunkDocument(doc)) {
      expect(doc.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });
});

describe("extractQuantities", () => {
  it("parses currency with separators", () => {
    const [q] = extractQuantities("Infrastructure spend must not exceed $200,000 in the first year.");
    expect(q!.dimension).toBe("money");
    expect(q!.value).toBe(200_000);
  });

  it("parses a bare count with its subject noun", () => {
    const quantities = extractQuantities("The platform must support 10,000 concurrent users at peak.");
    const count = quantities.find((q) => q.dimension === "count");
    expect(count!.value).toBe(10_000);
    expect(count!.subject).toContain("concurrent users");
  });

  it("normalises durations to seconds, including written numbers", () => {
    const ms = extractQuantities("Return 95% of responses within 500 milliseconds.").find(
      (q) => q.dimension === "duration",
    );
    expect(ms!.value).toBeCloseTo(0.5);

    const years = extractQuantities("Records must be retained for seven years from closure.").find(
      (q) => q.dimension === "duration",
    );
    expect(years!.value).toBe(7 * 31_536_000);

    const days = extractQuantities("Data must be deleted within 30 days.").find(
      (q) => q.dimension === "duration",
    );
    expect(days!.value).toBe(30 * 86_400);
  });

  it("parses percentages and dates", () => {
    expect(extractQuantities("must achieve 99.99% availability")[0]!.value).toBe(99.99);
    const date = extractQuantities("The platform must go live on 2 March 2027.")[0]!;
    expect(date.dimension).toBe("date");
    expect(new Date(date.value).toISOString().slice(0, 10)).toBe("2027-03-02");
  });

  it("does not double-count a number already claimed by a typed match", () => {
    const quantities = extractQuantities("Spend must not exceed $200,000 this year.");
    expect(quantities.filter((q) => q.value === 200_000)).toHaveLength(1);
  });
});

describe("boundDirection", () => {
  const cases: Array<[string, string, "minimum" | "maximum" | "exact"]> = [
    ["Infrastructure spend must not exceed $200,000.", "$200,000", "maximum"],
    ["The platform must support 10,000 concurrent users.", "10,000", "minimum"],
    ["The system must process at least 2,000 activations per hour.", "2,000", "minimum"],
    ["Submission must complete within 90 seconds.", "90 seconds", "maximum"],
    ["The recovery time objective must be under 4 hours.", "4 hours", "maximum"],
  ];

  it.each(cases)("reads %s as %s", (sentence, needle, expected) => {
    expect(boundDirection(sentence, sentence.indexOf(needle))).toBe(expected);
  });
});

describe("tokenize", () => {
  it("drops stopwords and aligns simple inflections", () => {
    expect(tokenize("The system must retain screening records")).not.toContain("the");
    expect(tokenize("screening outcomes")[0]).toBe(tokenize("screened outcome")[0]);
  });
});
