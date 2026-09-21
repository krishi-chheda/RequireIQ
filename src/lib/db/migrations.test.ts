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

  it("rolls back and leaves schema_version alone when a migration fails", async () => {
    const { openDb } = await import("./connection");
    const { runMigrations } = await import("./migrations");
    const db = openDb();
    const before = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };

    expect(() =>
      runMigrations(db, [
        { version: 998, sql: "CREATE TABLE migration_probe (id TEXT)" },
        { version: 999, sql: "THIS IS NOT SQL" },
      ]),
    ).toThrow();

    const after = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
      value: string;
    };
    expect(after.value).toBe(before.value);
    // The earlier statement in the same run is gone too, not just the stamp.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'migration_probe'").get(),
    ).toBeUndefined();
  });
});
