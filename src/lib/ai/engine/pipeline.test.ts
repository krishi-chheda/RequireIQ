import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_CORPUS } from "@/lib/demo/corpus";
import { extractFromDocument, type ExtractedConstraint, type ExtractedRequirement } from "./extract";
import { analyseAmbiguity } from "./ambiguity";
import { detectConflicts, estimateAnnualInfrastructureCost, type ConflictSubject } from "./conflict";
import { detectCoverageGaps } from "./coverage";

/**
 * End-to-end assertions against the demo corpus.
 *
 * The corpus in demo-data/ contains seven problems planted on purpose. This
 * suite is the contract that the engine finds them: if a detector regresses,
 * the demo silently loses its point, and these tests are what catches that.
 */

interface Subject extends ConflictSubject {
  source: string;
}

let requirements: Array<ExtractedRequirement & { ref: string; source: string }>;
let constraints: Array<ExtractedConstraint & { ref: string; source: string }>;
let subjects: Subject[];

/** Finds a record whose statement contains every one of `terms`. */
function findByTerms<T extends { statement: string }>(items: T[], ...terms: string[]): T | undefined {
  return items.find((item) => terms.every((term) => item.statement.toLowerCase().includes(term.toLowerCase())));
}

beforeAll(() => {
  requirements = [];
  constraints = [];
  let reqSeq = 1000;
  let conSeq = 0;

  const stakeholdersByName = new Map<string, string>([
    ["kenji mori", "stk_kenji"],
    ["aisha bell", "stk_aisha"],
    ["daniel okafor", "stk_daniel"],
    ["grace adeyemi", "stk_grace"],
    ["sofia lindqvist", "stk_sofia"],
    ["marcus tran", "stk_marcus"],
    ["priya raghavan", "stk_priya"],
    ["tom devlin", "stk_tom"],
  ]);

  for (const doc of DEMO_CORPUS) {
    if (doc.kind === "csv") continue;
    const result = extractFromDocument({
      documentId: doc.filename,
      content: doc.content,
      kind: doc.kind,
      stakeholdersByName,
      defaultStakeholderId: null,
    });
    for (const requirement of result.requirements) {
      reqSeq += 1;
      requirements.push({ ...requirement, ref: `REQ-${reqSeq}`, source: doc.title });
    }
    for (const constraint of result.constraints) {
      conSeq += 1;
      constraints.push({ ...constraint, ref: `CON-${String(conSeq).padStart(2, "0")}`, source: doc.title });
    }
  }

  subjects = [
    ...requirements.map((r) => ({
      id: r.ref,
      ref: r.ref,
      type: "requirement" as const,
      statement: r.statement,
      team: null,
      source: r.source,
    })),
    ...constraints.map((c) => ({
      id: c.ref,
      ref: c.ref,
      type: "constraint" as const,
      statement: c.statement,
      team: null,
      source: c.source,
    })),
  ];
});

describe("extraction over the demo corpus", () => {
  it("extracts a substantial register without drowning in noise", () => {
    expect(requirements.length).toBeGreaterThan(40);
    expect(requirements.length).toBeLessThan(120);
  });

  it("lifts statements verbatim from the source document", () => {
    for (const requirement of requirements) {
      const doc = DEMO_CORPUS.find((d) => d.title === requirement.source);
      expect(doc, `source document for ${requirement.ref}`).toBeDefined();
      // The whole hallucination-control story: a statement in the register is a
      // statement that exists in a document, at the offsets recorded for it.
      const slice = doc!.content.slice(
        requirement.evidence.startOffset,
        requirement.evidence.endOffset,
      );
      expect(slice.replace(/\s+/g, " ").trim()).toContain(
        requirement.statement.slice(0, 40).replace(/\s+/g, " ").trim(),
      );
    }
  });

  it("records every requirement against a chunk locator", () => {
    for (const requirement of requirements) {
      expect(requirement.evidence.locator.length).toBeGreaterThan(0);
    }
  });

  it("rejects questions and facilitation notes rather than registering them", () => {
    const statements = requirements.map((r) => r.statement);
    expect(statements.some((s) => s.includes("?"))).toBe(false);
    expect(statements.some((s) => s.startsWith("I will capture"))).toBe(false);
  });

  it("attributes transcript statements to the speaker who made them", () => {
    const capacity = findByTerms(requirements, "10,000 concurrent users");
    expect(capacity?.ownerStakeholderId).toBe("stk_kenji");
  });

  it("strips the speaker prefix from continuation turns", () => {
    // Real transcripts introduce a speaker once with their role and then use
    // the bare name. Missing the second form leaves "AISHA BELL:" glued to the
    // front of a register entry and loses attribution for most turns.
    for (const requirement of requirements) {
      expect(requirement.statement, requirement.ref).not.toMatch(/^[A-Z][A-Z .'-]{2,40}\s*:/);
    }
  });

  it("attributes a continuation turn to the same speaker as the introduced turn", () => {
    const vague = findByTerms(requirements, "fast response time");
    expect(vague, "the fast-response-time requirement").toBeDefined();
    // Aisha introduces herself with her role earlier in the transcript; this
    // statement is on a later bare-name turn.
    expect(vague!.statement.startsWith("The application must")).toBe(true);
    expect(vague!.ownerStakeholderId).toBe("stk_aisha");
  });

  it("classifies the load target as a performance requirement", () => {
    const capacity = findByTerms(requirements, "10,000 concurrent users");
    expect(capacity?.type).toBe("performance");
    expect(capacity?.priority).toBe("must");
    expect(capacity?.confidence).toBeGreaterThan(0.75);
  });

  it("classifies the sanctions screening rule as compliance", () => {
    const screening = findByTerms(requirements, "watchlist", "before an account is activated");
    expect(screening?.type).toBe("compliance");
  });

  it("separates the budget envelope into a constraint rather than a requirement", () => {
    const budget = findByTerms(constraints, "$200,000");
    expect(budget).toBeDefined();
    expect(budget!.category).toBe("budget");
    expect(budget!.value).toBe(200_000);
  });
});

describe("planted problem 1 - capacity target against infrastructure budget", () => {
  it("reports the conflict the reference scenario is built around", () => {
    const conflicts = detectConflicts(subjects);
    const conflict = conflicts.find(
      (c) => c.kind === "quantitative" && c.detector.includes("Capacity-versus-budget"),
    );

    expect(conflict, "capacity-versus-budget conflict").toBeDefined();
    expect(["high", "critical"]).toContain(conflict!.severity);
    expect(conflict!.explanation).toContain("10,000");
    expect(conflict!.explanation).toContain("$200,000");
  });

  it("hedges rather than asserting impossibility", () => {
    const conflict = detectConflicts(subjects).find((c) => c.detector.includes("Capacity-versus-budget"))!;
    expect(conflict.explanation.toLowerCase()).toContain("heuristic");
    expect(conflict.explanation.toLowerCase()).not.toContain("impossible");
    expect(conflict.validationQuestion.length).toBeGreaterThan(20);
  });

  it("shows arithmetic a platform engineer can check line by line", () => {
    const estimate = estimateAnnualInfrastructureCost(10_000, true);
    expect(estimate.instancesAtPeak).toBe(40);
    expect(estimate.instancesWithHeadroom).toBe(52);
    expect(estimate.annualTotalCost).toBeGreaterThan(200_000);
    expect(estimate.workings).toHaveLength(5);
    // Every line names its inputs, so the estimate can be disagreed with.
    expect(estimate.workings[0]).toContain("10,000");
    expect(estimate.workings.at(-1)).toContain("$");
  });

  it("does not fire when the capacity target fits inside the budget", () => {
    const estimate = estimateAnnualInfrastructureCost(500, false);
    expect(estimate.annualTotalCost).toBeLessThan(200_000);

    const modest: ConflictSubject[] = [
      { id: "R1", ref: "REQ-1", type: "requirement", statement: "The platform must support 500 concurrent users at peak.", team: null },
      { id: "C1", ref: "CON-1", type: "constraint", statement: "Infrastructure spend must not exceed $200,000 in the first year.", team: null },
    ];
    expect(detectConflicts(modest).filter((c) => c.detector.includes("Capacity-versus-budget"))).toHaveLength(0);
  });
});

describe("planted problem 2 - vague response time", () => {
  it("flags 'fast response time' as unverifiable and proposes a measurable rewrite", () => {
    const requirement = findByTerms(requirements, "fast response time");
    expect(requirement, "the fast-response-time requirement").toBeDefined();

    const findings = analyseAmbiguity(requirement!.statement);
    const vague = findings.find((f) => f.kind === "vague_term" && f.span.toLowerCase() === "fast");
    expect(vague).toBeDefined();
    expect(vague!.severity).toBe("high");
    expect(vague!.suggestion).toMatch(/\d/);
    // The span must point at the real characters, not a paraphrase.
    expect(requirement!.statement.slice(vague!.spanStart, vague!.spanEnd).toLowerCase()).toBe("fast");
  });

  it("flags 'easy to use' with a measurable usability alternative", () => {
    const requirement = findByTerms(requirements, "easy to use");
    const findings = analyseAmbiguity(requirement!.statement);
    expect(findings.some((f) => f.span.toLowerCase() === "easy to use")).toBe(true);
  });
});

describe("planted problem 3 - security requirement with no acceptance criteria", () => {
  it("flags 'The platform must be secure' on both vagueness and testability", () => {
    const requirement = findByTerms(requirements, "must be secure");
    expect(requirement, "the platform-must-be-secure requirement").toBeDefined();
    expect(requirement!.acceptanceCriteria).toBeNull();

    const kinds = analyseAmbiguity(requirement!.statement).map((f) => f.kind);
    expect(kinds).toContain("vague_term");
    expect(kinds).toContain("missing_acceptance_criteria");
  });

  it("flags 'industry standard encryption' as an unnamed standard", () => {
    const requirement = findByTerms(requirements, "industry standard");
    const finding = analyseAmbiguity(requirement!.statement).find((f) => f.span.toLowerCase() === "industry standard");
    expect(finding).toBeDefined();
    expect(finding!.suggestion).toContain("NIST");
  });
});

describe("planted problem 4 - compliance rule that only exists in meeting notes", () => {
  it("captures the AML screening obligation from the notes document", () => {
    const requirement = findByTerms(requirements, "watchlist", "before an account is activated");
    expect(requirement).toBeDefined();
    expect(requirement!.source).toContain("Risk, KYC");
    expect(requirement!.type).toBe("compliance");
  });

  it("captures the KYC audit trail obligation from the same notes", () => {
    expect(findByTerms(requirements, "audit trail of every kyc decision")).toBeDefined();
  });
});

describe("planted problem 5 - contradictory retention obligations", () => {
  it("detects seven-year retention against thirty-day deletion", () => {
    const conflict = detectConflicts(subjects).find((c) => c.kind === "contradiction");

    expect(conflict, "retention contradiction").toBeDefined();
    expect(conflict!.explanation).toMatch(/seven years/i);
    expect(conflict!.explanation).toMatch(/30 days/i);
    // It must name the possibility that the scopes are actually disjoint.
    expect(conflict!.explanation.toLowerCase()).toContain("disjoint");
  });
});

describe("planted problem 6 - scope introduced after the baseline", () => {
  it("captures the broker channel requirements from the post-baseline email", () => {
    const broker = requirements.filter((r) => r.statement.toLowerCase().includes("broker"));
    expect(broker.length).toBeGreaterThanOrEqual(2);
    for (const requirement of broker) {
      expect(requirement.source).toContain("Broker");
    }
  });

  it("reports broker capacity targets as a coverage gap", () => {
    const gaps = detectCoverageGaps(subjects.map((s) => s.statement));
    expect(gaps.some((g) => g.area.includes("broker channel"))).toBe(true);
  });
});

describe("planted problem 7 - requirement with no identifiable owner", () => {
  it("leaves the unattributed wrap-up items without an owner", () => {
    const override = findByTerms(requirements, "manual override for relationship managers");
    expect(override, "the manual override requirement").toBeDefined();
    expect(override!.ownerStakeholderId).toBeNull();
    expect(override!.source).toContain("Discovery Wrap-up");
  });
});

describe("further detectors", () => {
  it("detects the availability target against the recovery time objective", () => {
    const conflict = detectConflicts(subjects).find(
      (c) => c.detector.includes("Availability-to-downtime"),
    );
    expect(conflict).toBeDefined();
    expect(conflict!.explanation).toContain("99.99%");
    expect(conflict!.explanation).toMatch(/4 hours/);
  });

  it("detects the go-live date against the twelve week observation period", () => {
    const conflict = detectConflicts(subjects).find((c) => c.kind === "temporal");
    expect(conflict).toBeDefined();
    expect(conflict!.explanation).toContain("2 March 2027");
  });

  it("reports failure behaviour of external dependencies as a gap", () => {
    const gaps = detectCoverageGaps(subjects.map((s) => s.statement));
    expect(gaps.some((g) => g.area.includes("Failure behaviour"))).toBe(true);
  });

  it("produces at most one conflict per pair of records", () => {
    const conflicts = detectConflicts(subjects);
    const keys = conflicts.map((c) => [c.leftId, c.rightId].sort().join("::"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("orders conflicts by severity so the worst is first", () => {
    const rank = { low: 0, medium: 1, high: 2, critical: 3 };
    const severities = detectConflicts(subjects).map((c) => rank[c.severity]);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
  });
});

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

  it("extracts an obligation with no identifiable actor, surfacing bindsOn as unknown rather than discarding it", () => {
    const result = extractFromDocument({
      documentId: "d1",
      content: "3.1 General\n\nThe team must document the process within five days.",
      kind: "specification",
      stakeholdersByName: new Map(),
      defaultStakeholderId: null,
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]!.bindsOn).toBe("unknown");
  });
});
