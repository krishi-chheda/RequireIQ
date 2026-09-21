import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkDocument } from "./text";
import { extractFromDocument, obligationCoverage } from "./extract";
import { detectHeading } from "./structure";
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

  it("accounts for at least three quarters of the shall/must sentences", () => {
    // The spec's criterion is per sentence: each shall/must sentence is either
    // extracted or rejected for a reason other than vocabulary. A ratio of
    // captured items to occurrences of "shall"/"must" is not the same question
    // - nothing in it checks that the items captured *are* those sentences, and
    // it measured above 100% on this very fixture.
    const coverage = obligationCoverage(CONTENT, result);
    expect(coverage.total).toBeGreaterThan(0);
    expect(coverage.covered / coverage.total).toBeGreaterThanOrEqual(0.75);
  });

  it("reads a wrapped numbered clause as body text, not as a heading", () => {
    // PDF extraction wraps a long clause across lines, and the first line then
    // looks exactly like a numbered heading: it is numbered and, because the
    // sentence continues overleaf, it carries no terminal punctuation. Treating
    // it as a heading swallows the first line of the clause, which is how three
    // "Contractor shall ..." obligations went missing from a real RFP.
    expect(detectHeading("4. CONTRACT REQUIREMENTS")).toBe("4 CONTRACT REQUIREMENTS");
    // Length is not the discriminator: a nine-word heading is still a heading,
    // and demoting it cited its whole section to the previous section number.
    expect(detectHeading("5.19 Compliance with Federal, State, County, and Local Laws")).toBe(
      "5.19 Compliance with Federal, State, County, and Local Laws",
    );
    expect(detectHeading("B. Termination for Convenience. The County may terminate this")).toBeNull();
    expect(
      detectHeading("1. General Conditions. Contractor shall procure and maintain a comprehensive"),
    ).toBeNull();
    expect(
      result.requirements.some((r) => r.statement.includes("Contractor shall procure and maintain")),
    ).toBe(true);
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
