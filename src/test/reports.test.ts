import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Report generation.
 *
 * These reports leave the building - they are handed to a client. Two things
 * therefore need a test behind them rather than a comment: the CSV cannot
 * execute when opened in Excel, and the provenance disclaimer cannot be
 * accidentally dropped.
 */

let reports: typeof import("@/lib/reports");
let actions: typeof import("@/lib/actions");
let queries: typeof import("@/lib/queries");
let dir: string;
let projectId: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "requireiq-reports-"));
  process.env.REQUIREIQ_DB_PATH = join(dir, "reports.db");
  reports = await import("@/lib/reports");
  actions = await import("@/lib/actions");
  queries = await import("@/lib/queries");
  projectId = queries.listProjects()[0]!.id;
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db");
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("every report", () => {
  it("generates non-trivial CSV and JSON for each id", () => {
    for (const report of reports.REPORTS) {
      const payload = reports.buildReport(projectId, report.id)!;
      expect(payload, report.id).toBeDefined();
      expect(payload.csv.length, `${report.id} csv`).toBeGreaterThan(200);
      expect(payload.filename).toContain(report.id);
      expect(() => JSON.stringify(payload.json)).not.toThrow();
    }
  });

  it("returns null for a project that does not exist", () => {
    expect(reports.buildReport("prj_missing", "register")).toBeNull();
  });

  it("carries the provenance disclaimer in every JSON report", () => {
    for (const report of reports.REPORTS) {
      const json = reports.buildReport(projectId, report.id)!.json as { project: { disclaimer: string } };
      expect(json.project.disclaimer, report.id).toContain("machine readings");
      expect(json.project.disclaimer).toContain("not agreed requirements");
    }
  });

  it("uses the same top-level key for reports and the full export", () => {
    const register = reports.buildReport(projectId, "register")!.json as Record<string, unknown>;
    const full = reports.buildFullExport(projectId) as Record<string, unknown>;
    expect(Object.keys(register)).toContain("project");
    expect(Object.keys(full)).toContain("project");
  });
});

describe("CSV safety", () => {
  it("neutralises a statement that would otherwise execute as a formula", () => {
    // Excel treats a leading =, +, - or @ as a formula. A reviewer can put any
    // of those at the front of a requirement, so the export must defuse it.
    const requirement = queries.listRequirements(projectId)[0]!;
    actions.editRequirement(
      requirement.id,
      "=HYPERLINK(\"http://example.invalid\",\"click\") the system must export safely",
      "Test Reviewer",
    );

    const csv = reports.buildReport(projectId, "register")!.csv;
    expect(csv).toContain("\"'=HYPERLINK");
    // The raw formula must never appear at the start of a cell.
    expect(csv).not.toMatch(/,"=HYPERLINK/);
  });

  it("escapes embedded quotes and flattens newlines so rows stay aligned", () => {
    const requirement = queries.listRequirements(projectId)[1]!;
    actions.editRequirement(
      requirement.id,
      'The system must support the "premium" tier\nacross two lines.',
      "Test Reviewer",
    );

    const csv = reports.buildReport(projectId, "register")!.csv;
    expect(csv).toContain('""premium""');
    const dataLines = csv.split("\r\n").filter((line) => line.startsWith('"REQ-'));
    expect(dataLines.length).toBe(queries.listRequirements(projectId).length);
  });

  it("starts with a byte order mark so Excel reads UTF-8 correctly", () => {
    expect(reports.buildReport(projectId, "register")!.csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("register contents", () => {
  it("marks unowned requirements and missing acceptance criteria explicitly", () => {
    const csv = reports.buildReport(projectId, "register")!.csv;
    expect(csv).toContain("UNASSIGNED");
    expect(csv).toContain("NOT DEFINED");
  });

  it("includes the source quote and location for traceability", () => {
    const json = reports.buildReport(projectId, "traceability")!.json as {
      traceability: Array<{ sourceQuote: string; offsets: string }>;
    };
    expect(json.traceability.every((row) => row.sourceQuote.length > 0)).toBe(true);
    expect(json.traceability.every((row) => /^\d+-\d+$/.test(row.offsets))).toBe(true);
  });
});
