import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Data-layer integration test.
 *
 * Seeds a throwaway database by running the real pipeline over the real demo
 * corpus, then reads it back through the same query functions the screens use.
 * This is the test that would catch a broken migration, a bad join or a mapper
 * that silently drops a column.
 */

let queries: typeof import("./queries");
let actions: typeof import("./actions");
let reports: typeof import("./reports");
let dir: string;
let projectId: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "requireiq-test-"));
  process.env.REQUIREIQ_DB_PATH = join(dir, "test.db");
  queries = await import("./queries");
  actions = await import("./actions");
  reports = await import("./reports");
  const projects = queries.listProjects();
  projectId = projects[0]!.id;
});

afterAll(async () => {
  // Windows holds a lock on an open SQLite file, so the handle must go first.
  const { closeDb } = await import("./db");
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("seed", () => {
  it("creates exactly one demo project", () => {
    const projects = queries.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.client).toBe("Meridian Bank plc");
    expect(projects[0]!.baselineDate).toBe("2026-07-24");
  });

  it("ingests every document in the corpus with its chunks", () => {
    const documents = queries.listDocuments(projectId);
    expect(documents).toHaveLength(15);
    for (const document of documents) {
      expect(document.status).toBe("analysed");
      expect(document.wordCount).toBeGreaterThan(20);
    }
    const transcript = documents.find((d) => d.kind === "transcript")!;
    expect(queries.listChunks(transcript.id).length).toBeGreaterThan(3);
  });

  it("loads the stakeholder register", () => {
    const stakeholders = queries.listStakeholders(projectId);
    expect(stakeholders).toHaveLength(12);
    expect(stakeholders.map((s) => s.name)).toContain("Kenji Mori");
    expect(stakeholders.every((s) => s.email.includes("@"))).toBe(true);
  });
});

describe("register", () => {
  it("stores requirements with full provenance", () => {
    const requirements = queries.listRequirements(projectId);
    expect(requirements.length).toBeGreaterThan(40);

    for (const requirement of requirements) {
      expect(requirement.provenance).toBe("ai_analysis");
      expect(requirement.status).toBe("proposed");
      expect(requirement.confidence).toBeGreaterThan(0);
      expect(requirement.rationale.length).toBeGreaterThan(10);
    }
  });

  it("links every requirement to a verbatim quote in a real document", () => {
    for (const requirement of queries.listRequirements(projectId)) {
      const evidence = queries.listEvidence("requirement", requirement.id);
      expect(evidence.length, `${requirement.ref} evidence`).toBeGreaterThan(0);

      const document = queries.getDocument(evidence[0]!.documentId);
      expect(document).not.toBeNull();
      // The recorded offsets must still slice out the quoted text.
      const slice = document!.content.slice(evidence[0]!.startOffset, evidence[0]!.endOffset);
      expect(slice.replace(/\s+/g, " ")).toContain(evidence[0]!.quote.slice(0, 40).replace(/\s+/g, " "));
    }
  });

  it("supports the register filters the UI exposes", () => {
    const performance = queries.listRequirements(projectId, { type: "performance" });
    expect(performance.length).toBeGreaterThan(0);
    expect(performance.every((r) => r.type === "performance")).toBe(true);

    const unowned = queries.listRequirements(projectId, { unowned: true });
    expect(unowned.every((r) => r.ownerStakeholderId === null)).toBe(true);

    const search = queries.listRequirements(projectId, { search: "concurrent" });
    expect(search.length).toBeGreaterThan(0);
    expect(search.every((r) => r.statement.toLowerCase().includes("concurrent"))).toBe(true);

    const postBaseline = queries.listRequirements(projectId, { postBaseline: true });
    expect(postBaseline.length).toBeGreaterThan(0);
    expect(postBaseline.every((r) => r.postBaseline)).toBe(true);
  });

  it("extracts the budget envelope as a constraint with a parsed value", () => {
    const budget = queries.listConstraints(projectId).find((c) => c.category === "budget");
    expect(budget).toBeDefined();
    expect(budget!.value).toBe(200_000);
  });
});

describe("findings", () => {
  it("records conflicts with both sides resolvable", () => {
    const conflicts = queries.listConflicts(projectId);
    expect(conflicts.length).toBeGreaterThanOrEqual(3);

    for (const conflict of conflicts) {
      expect(queries.getConflictSide(conflict.leftType, conflict.leftId)).not.toBeNull();
      expect(queries.getConflictSide(conflict.rightType, conflict.rightId)).not.toBeNull();
      expect(conflict.validationQuestion.length).toBeGreaterThan(20);
      // Hedged language is a product requirement, not a style preference.
      expect(conflict.explanation.toLowerCase()).not.toContain("impossible");
    }
  });

  it("orders the conflict queue with open work first", () => {
    const conflicts = queries.listConflicts(projectId);
    const firstResolvedIndex = conflicts.findIndex((c) => c.status !== "open" && c.status !== "needs_clarification");
    if (firstResolvedIndex !== -1) {
      expect(conflicts.slice(firstResolvedIndex).every((c) => c.status !== "open")).toBe(true);
    }
  });

  it("records quality findings whose spans index into the statement", () => {
    const withFindings = queries.listRequirements(projectId, { hasFindings: true });
    expect(withFindings.length).toBeGreaterThan(5);

    for (const requirement of withFindings) {
      for (const finding of queries.listAmbiguities(requirement.id)) {
        expect(requirement.statement.slice(finding.spanStart, finding.spanEnd)).toBe(finding.span);
        expect(finding.suggestion.length).toBeGreaterThan(10);
      }
    }
  });

  it("derives every risk from a record that exists", () => {
    const risks = queries.listRisks(projectId);
    expect(risks.length).toBeGreaterThan(5);

    for (const risk of risks) {
      if (risk.requirementId) expect(queries.getRequirement(risk.requirementId)).not.toBeNull();
      if (risk.conflictId) expect(queries.getConflict(risk.conflictId)).not.toBeNull();
    }
  });

  it("reports coverage gaps", () => {
    expect(queries.listCoverageGaps(projectId).length).toBeGreaterThan(2);
  });
});

describe("project summary", () => {
  it("computes a health score that equals 100 minus its own deductions", () => {
    const summary = queries.getProjectSummary(projectId)!;
    const total = summary.health.deductions.reduce((sum, d) => sum + d.points, 0);
    expect(summary.health.score).toBe(Math.max(0, 100 - total));
    expect(summary.health.deductions.every((d) => d.detail.length > 10)).toBe(true);
  });

  it("reports a project that has not been reviewed yet as needing attention", () => {
    const summary = queries.getProjectSummary(projectId)!;
    expect(summary.approved).toBe(0);
    expect(summary.awaitingReview).toBe(summary.requirements);
    expect(summary.openConflicts).toBeGreaterThan(0);
    expect(["at_risk", "critical", "watch"]).toContain(summary.health.band);
  });
});

describe("traceability and graph", () => {
  it("traces every requirement back to a document and forward to its findings", () => {
    const rows = queries.getTraceability(projectId);
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.every((row) => row.evidence.length > 0)).toBe(true);
    expect(rows.some((row) => row.conflictRefs.length > 0)).toBe(true);
  });

  it("builds a graph with no dangling edges", () => {
    const { nodes, edges } = queries.getGraph(projectId);
    const ids = new Set(nodes.map((n) => n.id));
    expect(nodes.length).toBeGreaterThan(5);
    expect(edges.length).toBeGreaterThan(5);
    for (const edge of edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("separates baseline scope from post-baseline additions", () => {
    const scope = queries.getScopeChanges(projectId);
    expect(scope.baselineDate).toBe("2026-07-24");
    expect(scope.added.length).toBeGreaterThan(0);
    expect(scope.added.every((c) => c.requirement.postBaseline)).toBe(true);
    expect(scope.added.some((c) => c.requirement.statement.toLowerCase().includes("broker"))).toBe(true);
  });
});

describe("human-in-the-loop review", () => {
  it("moves a requirement to approved and writes an audit event", () => {
    const requirement = queries.listRequirements(projectId)[0]!;
    expect(requirement.status).toBe("proposed");

    actions.recordReview(requirement.id, "approved", "Confirmed with the business owner.", "Test Reviewer");

    const after = queries.getRequirement(requirement.id)!;
    expect(after.status).toBe("approved");
    expect(after.provenance).toBe("human");

    const audit = queries.listAuditTrail("requirement", requirement.id);
    expect(audit.at(-1)!.action).toBe("approved");
    expect(audit.at(-1)!.actorKind).toBe("human");
    expect(audit[0]!.actorKind).toBe("ai");
  });

  it("keeps the original statement when a human edits the wording", () => {
    const requirement = queries.listRequirements(projectId)[1]!;
    const original = requirement.statement;

    actions.editRequirement(requirement.id, `${original} Verified by load test LT-04.`, "Test Reviewer");

    const after = queries.getRequirement(requirement.id)!;
    expect(after.originalStatement).toBe(original);
    expect(after.statement).not.toBe(original);
    expect(queries.getScopeChanges(projectId).changed.some((c) => c.requirement.id === requirement.id)).toBe(true);
  });

  it("re-runs quality analysis on an edited statement", () => {
    const vague = queries
      .listRequirements(projectId, { hasFindings: true })
      .find((r) => r.statement.toLowerCase().includes("fast response time"))!;
    expect(queries.listAmbiguities(vague.id).some((a) => a.span.toLowerCase() === "fast")).toBe(true);

    actions.editRequirement(
      vague.id,
      "The application must return 95% of page responses within 500 milliseconds under normal operating load.",
      "Test Reviewer",
    );

    const findings = queries.listAmbiguities(vague.id).filter((a) => !a.resolved);
    expect(findings.some((a) => a.span.toLowerCase() === "fast")).toBe(false);
  });

  it("re-derives every statement-quoting field when the actor changes", () => {
    // The failure this pins: a field that keeps quoting the old wording is not
    // stale, it is a sentence disproved by the statement printed next to it.
    const requirement = queries
      .listRequirements(projectId)
      .find((r) => r.bindsOn !== "supplier" && r.type !== "security")!;
    expect(requirement.bindsOnEvidence).toBeTruthy();

    const rewritten =
      "The Contractor shall encrypt every stored customer credential at rest and rotate the encryption key every 90 days.";
    actions.editRequirement(requirement.id, rewritten, "Test Reviewer");

    const after = queries.getRequirement(requirement.id)!;
    expect(after.statement).toBe(rewritten);
    expect(after.bindsOn).toBe("supplier");
    expect(after.bindsOnEvidence).toContain("contractor");
    expect(after.bindsOnEvidence).not.toBe(requirement.bindsOnEvidence);
    expect(after.type).toBe("security");
    expect(after.classificationEvidence).toContain("encrypt");
    expect(after.classificationEvidence).not.toBe(requirement.classificationEvidence);
    expect(after.priority).toBe("must");
    expect(after.rationale).toContain("90 days");

    // Nothing that quotes a matched term may quote a word the statement no
    // longer contains. (`rationale` also carries fixed rule labels such as
    // 'Binding modal ("must"/"shall")', which name the rule rather than
    // claiming a match, so it is asserted field by field above.)
    const lower = rewritten.toLowerCase();
    for (const field of [after.bindsOnEvidence ?? "", after.classificationEvidence]) {
      for (const [, quoted] of field.matchAll(/"([a-z0-9][a-z0-9 -]*)"/gi)) {
        expect(lower).toContain(quoted!.toLowerCase());
      }
    }
  });

  it("resolves a conflict and records the resolution note", () => {
    const conflict = queries.listConflicts(projectId).find((c) => c.status === "open")!;

    actions.resolveConflict(conflict.id, "accepted", "Accepted; taken to the capital committee.", "Test Reviewer");

    const after = queries.getConflict(conflict.id)!;
    expect(after.status).toBe("accepted");
    expect(after.resolutionNote).toContain("capital committee");
    expect(queries.listAuditTrail("conflict", conflict.id).at(-1)!.action).toBe("accepted");
  });

  it("improves the health score once findings are resolved", () => {
    const before = queries.getProjectSummary(projectId)!.health.score;

    for (const conflict of queries.listConflicts(projectId).filter((c) => c.status === "open")) {
      actions.resolveConflict(conflict.id, "resolved", "Closed during test.", "Test Reviewer");
    }

    expect(queries.getProjectSummary(projectId)!.health.score).toBeGreaterThan(before);
  });
});

describe("assistant grounding", () => {
  it("answers conflict questions from real records", async () => {
    const { localProvider } = await import("./ai/local");
    const context = queries.buildProjectContext(projectId)!;
    const answer = await localProvider.answer(context, "What conflicts are still unresolved?");

    expect(answer.grounded).toBe(true);
    expect(answer.method.length).toBeGreaterThan(10);
  });

  it("refuses to answer what the evidence does not support", async () => {
    const { localProvider } = await import("./ai/local");
    const context = queries.buildProjectContext(projectId)!;
    const answer = await localProvider.answer(context, "What is the chief executive's home address?");

    expect(answer.grounded).toBe(false);
    expect(answer.answer).toContain("Insufficient evidence");
    expect(answer.citations).toHaveLength(0);
  });

  it("explains a specific requirement using its own evidence", async () => {
    const { localProvider } = await import("./ai/local");
    const context = queries.buildProjectContext(projectId)!;
    const capacity = context.requirements.find((r) => r.statement.includes("10,000 concurrent users"))!;

    const answer = await localProvider.answer(context, `Why was ${capacity.ref} flagged?`);
    expect(answer.grounded).toBe(true);
    expect(answer.answer).toContain(capacity.ref);
    expect(answer.citations.some((c) => c.ref === capacity.ref)).toBe(true);
  });
});

describe("bindsOn filtering", () => {
  it("filters the register by who the obligation binds", () => {
    const system = queries.listRequirements(projectId, { bindsOn: "system" });
    expect(system.length).toBeGreaterThan(0);
    expect(system.every((r) => r.bindsOn === "system")).toBe(true);
  });

  it("exports bindsOn in the register report, so a client can see the split", () => {
    const csv = reports.buildReport(projectId, "register")!.csv;
    expect(csv).toContain("Binds on");
  });
});
