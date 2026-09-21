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
