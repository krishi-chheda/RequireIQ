import type { DatabaseSync } from "node:sqlite";

/**
 * Ordered schema migrations.
 *
 * The schema is applied with CREATE TABLE IF NOT EXISTS, which cannot add a
 * column to a table that already exists. This is the mechanism for that, and it
 * arrives with the first schema change rather than after it.
 *
 * Append only. Never edit or renumber an existing entry: the version recorded
 * in an existing database refers to a position in this list.
 */
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 2,
    sql: "ALTER TABLE requirements ADD COLUMN binds_on TEXT NOT NULL DEFAULT 'unknown'",
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  1,
);

export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number(row.value) : 1;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    try {
      db.exec(migration.sql);
    } catch (error) {
      // A fresh database already has the column from schema.sql. Adding it
      // again is the expected no-op, not a failure.
      if (!String(error).includes("duplicate column name")) throw error;
    }
  }

  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(LATEST_SCHEMA_VERSION));
}
