import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
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

  it("gives every seeded requirement the cue behind its bindsOn value", () => {
    // The seed INSERT is a hand-maintained list of 20 positional placeholders,
    // and binds_on_evidence is nullable, so dropping it from that list is
    // silent: the demo corpus - the thing a viewer actually looks at - would
    // lose "Who this binds" on all 82 detail pages with the suite still green.
    const projectId = queries.listProjects()[0]!.id;
    const requirements = queries.listRequirements(projectId);
    expect(requirements.length).toBeGreaterThan(40);
    expect(requirements.every((r) => r.bindsOnEvidence)).toBe(true);
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

  it("adds the binds_on columns to a database built from the pre-migration schema", async () => {
    // Every other test here runs on a fresh database, where schema.sql already
    // carries both columns and both `skipIf` predicates short-circuit - so the
    // real ALTER TABLE statements never execute. This is the applying path.
    const { SCHEMA_SQL } = await import("./schema");
    const { runMigrations, LATEST_SCHEMA_VERSION, hasColumn } = await import("./migrations");

    const old = SCHEMA_SQL.split(/\r?\n/)
      .filter((line) => !/^\s*binds_on(_evidence)?\s/.test(line))
      .join("\n");
    // If this fails, schema.sql gained another line mentioning binds_on (an
    // index, a constraint): extend the strip filter above, do not delete this.
    expect(old).not.toContain("binds_on");

    const db = new DatabaseSync(join(dir, "old-schema.db"));
    db.exec(old);
    db.exec(
      `INSERT INTO projects (id, key, name, client, description, phase, baseline_date, created_at)
       VALUES ('p1', 'P1', 'Legacy', 'Client', 'd', 'discovery', '2026-01-01', '2026-01-01')`,
    );
    db.exec(
      `INSERT INTO requirements (id, project_id, ref, statement, original_statement, type, priority, status,
         provenance, confidence, rationale, classification_evidence, created_at, updated_at)
       VALUES ('r1', 'p1', 'REQ-1', 'The system must log in.', 'The system must log in.', 'functional',
         'must', 'proposed', 'ai_analysis', 0.8, 'why', 'cues', '2026-01-01', '2026-01-01')`,
    );

    runMigrations(db);

    expect(hasColumn(db, "requirements", "binds_on")).toBe(true);
    expect(hasColumn(db, "requirements", "binds_on_evidence")).toBe(true);
    const row = db
      .prepare("SELECT statement, binds_on, binds_on_evidence FROM requirements WHERE id = 'r1'")
      .get() as { statement: string; binds_on: string; binds_on_evidence: string | null };
    expect(row.statement).toBe("The system must log in.");
    // Not 'unknown': the columns arrive with a DEFAULT, and a row that predates
    // them has to be classified, not left reading "Unidentified actor".
    expect(row.binds_on).toBe("system");
    expect(row.binds_on_evidence).toContain("system");
    const stamp = () =>
      (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value;
    expect(stamp()).toBe(String(LATEST_SCHEMA_VERSION));

    // Re-running is a no-op rather than a duplicate-column error.
    expect(() => runMigrations(db)).not.toThrow();
    expect(stamp()).toBe(String(LATEST_SCHEMA_VERSION));
    db.close();
  });

  it("classifies the rows a pre-branch database already holds", async () => {
    // The upgrade path a real install takes: rows written by a build that had
    // no binds_on at all. Without a backfill every one of them reads
    // "Unidentified actor" in the register, the filter and both CSV exports,
    // and no amount of restarting fixes it - the seed only runs when
    // meta.seeded_at is absent, and it is not.
    const { SCHEMA_SQL } = await import("./schema");
    const { runMigrations } = await import("./migrations");

    const old = SCHEMA_SQL.split(/\r?\n/)
      .filter((line) => !/^\s*binds_on(_evidence)?\s/.test(line))
      .join("\n");

    const db = new DatabaseSync(join(dir, "pre-branch.db"));
    db.exec(old);
    db.exec(
      `INSERT INTO projects (id, key, name, client, description, phase, baseline_date, created_at)
       VALUES ('p2', 'P2', 'Legacy', 'Client', 'd', 'discovery', '2026-01-01', '2026-01-01')`,
    );
    const rows: Array<[string, string, string]> = [
      ["a", "The Contractor shall submit evidence of insurance as is required herein.", "supplier"],
      ["b", "Proposals shall be submitted by 2:00PM on Friday 7 August.", "bidder"],
      ["c", "The City will provide test data within ten working days of contract award.", "buyer"],
      ["d", "The platform must achieve 99.99% availability measured monthly.", "system"],
      ["e", "It shall be completed in a timely manner.", "unknown"],
    ];
    const insert = db.prepare(
      `INSERT INTO requirements (id, project_id, ref, statement, original_statement, type, priority, status,
         provenance, confidence, rationale, classification_evidence, created_at, updated_at)
       VALUES (?, 'p2', ?, ?, ?, 'functional', 'must', 'proposed', 'ai_analysis', 0.8, 'why', 'cues',
         '2026-01-01', '2026-01-01')`,
    );
    for (const [id, statement] of rows) insert.run(id, `REQ-${id}`, statement, statement);

    runMigrations(db);

    const read = db.prepare("SELECT binds_on, binds_on_evidence FROM requirements WHERE id = ?");
    for (const [id, , expected] of rows) {
      const row = read.get(id) as { binds_on: string; binds_on_evidence: string | null };
      expect([id, row.binds_on]).toEqual([id, expected]);
      // Every row gets a cue, including the honest unknown - a NULL here is
      // what the backfill keys on, so leaving one behind would re-run forever.
      expect(row.binds_on_evidence).toBeTruthy();
    }

    // A reviewer's own answer is not overwritten by a later re-run.
    db.prepare("UPDATE requirements SET binds_on = 'buyer' WHERE id = 'd'").run();
    runMigrations(db);
    expect(
      (db.prepare("SELECT binds_on FROM requirements WHERE id = 'd'").get() as { binds_on: string })
        .binds_on,
    ).toBe("buyer");
    db.close();
  });
});
