import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
let queries: typeof import("../queries");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "requireiq-migrate-"));
  process.env.REQUIREIQ_DB_PATH = join(dir, "m.db");
  queries = await import("../queries");
});

afterAll(async () => {
  const { closeDb } = await import("./index");
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("gives every seeded requirement a bindsOn value", () => {
    const projectId = queries.listProjects()[0]!.id;
    const requirements = queries.listRequirements(projectId);
    expect(requirements.length).toBeGreaterThan(40);
    for (const requirement of requirements) {
      expect(requirement.bindsOn).toBeTruthy();
    }
  });

  it("classifies the demo corpus predominantly as system obligations", () => {
    const projectId = queries.listProjects()[0]!.id;
    const system = queries.listRequirements(projectId).filter((r) => r.bindsOn === "system");
    expect(system.length).toBeGreaterThan(10);
  });
});
