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

  const pending = MIGRATIONS.filter((migration) => migration.version > current);
  if (pending.length === 0) return;

  // Applies every pending migration and the version stamp as one unit. This
  // cannot reuse connection.ts's `transaction()` helper: that calls
  // `openDb()`, and `runMigrations` runs from inside `openDb()` itself,
  // before the module-level handle is assigned, so it would recurse into a
  // second connection on the same file. Today's one migration (an idempotent
  // ALTER TABLE) doesn't need atomicity to be safe on retry, but the next
  // migration might be an UPDATE or a backfill, and a crash between "ALTER
  // TABLE succeeded" and "schema_version written" must not be able to apply
  // that kind of migration twice.
  db.exec("BEGIN");
  try {
    for (const migration of pending) {
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

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
