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
export interface Migration {
  version: number;
  sql: string;
  /** Skips the statement when it has already been applied (fresh databases). */
  skipIf?: (db: DatabaseSync) => boolean;
}

/** Whether `table` already has `column`. */
export function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((info) => info.name === column);
}

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    sql: "ALTER TABLE requirements ADD COLUMN binds_on TEXT NOT NULL DEFAULT 'unknown'",
    skipIf: (db) => hasColumn(db, "requirements", "binds_on"),
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  1,
);

export function runMigrations(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): void {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  const parsed = row ? Number(row.value) : 1;
  // A stored value that is not a number would make every comparison below
  // false and silently skip every migration. Treat it as an unmigrated
  // database instead: the migrations are guarded and safe to re-run.
  const current = Number.isFinite(parsed) ? parsed : 1;

  const pending = migrations.filter((migration) => migration.version > current);
  if (pending.length === 0) return;
  const target = pending.reduce((max, migration) => Math.max(max, migration.version), current);

  // Applies every pending migration and the version stamp as one unit. This
  // cannot reuse connection.ts's `transaction()` helper: that calls
  // `openDb()`, and `runMigrations` runs from inside `openDb()` itself,
  // before the module-level handle is assigned, so it would recurse into a
  // second connection on the same file. A migration that is already applied is
  // skipped by its own `skipIf` predicate rather than by matching an error
  // string, so every error that does reach here rolls the whole thing back:
  // nothing can stamp schema_version over a half-applied migration.
  db.exec("BEGIN");
  try {
    for (const migration of pending) {
      if (migration.skipIf?.(db)) continue;
      db.exec(migration.sql);
    }

    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(target));

    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
