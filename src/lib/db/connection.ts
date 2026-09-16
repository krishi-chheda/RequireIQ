import "server-only";

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { SCHEMA_SQL } from "./schema";

/**
 * Low-level database access: open the file, apply the schema, run transactions.
 *
 * `node:sqlite` is a Node 22+ builtin, so the entire persistence story is one
 * file on disk with no native module to compile and no server to run. That is
 * deliberate - the product has to be demo-able from a clean clone. Moving to
 * Postgres later means reimplementing this module; every caller goes through
 * `openDb()` or the helpers in `src/lib/queries.ts`, nothing reaches past them.
 *
 * This module knows nothing about seeding. `src/lib/db/index.ts` composes the
 * two so the seed can import from here without a cycle.
 */

let handle: DatabaseSync | null = null;

/**
 * True on a serverless host, where the deployment bundle is read-only and only
 * `/tmp` is writable. Vercel and AWS Lambda both set these.
 */
export const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

function resolveDbPath(): string {
  const configured = process.env.REQUIREIQ_DB_PATH?.trim();
  if (configured) return isAbsolute(configured) ? configured : join(process.cwd(), configured);

  // On a serverless host the bundle directory cannot be written to, so the
  // database lives in the instance's own /tmp. That storage is ephemeral and
  // per-instance: the demo reads correctly because every instance re-seeds
  // itself from the bundled corpus, but a review decision only survives on the
  // instance that recorded it. `isEphemeral()` below drives the banner that
  // tells the user so, and the README says what production needs instead.
  return IS_SERVERLESS ? "/tmp/requireiq.db" : join(process.cwd(), "data/requireiq.db");
}

/** Whether writes are durable. False on serverless /tmp storage. */
export function isEphemeral(): boolean {
  return IS_SERVERLESS && !process.env.REQUIREIQ_DB_PATH?.trim();
}

export function openDb(): DatabaseSync {
  if (handle) return handle;

  const file = resolveDbPath();
  mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  // WAL lets the several server workers Next.js may spin up read concurrently
  // while one writes; busy_timeout absorbs the brief write contention that
  // remains instead of surfacing SQLITE_BUSY to a request handler.
  //
  // A serverless instance owns its database outright, so WAL buys nothing there
  // and its side files are extra work on /tmp.
  if (!IS_SERVERLESS) db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);

  handle = db;
  return db;
}

export function getMeta(key: string): string | null {
  const row = openDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  openDb()
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

/** Runs `fn` inside a transaction. Rolls back and rethrows on any error. */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = openDb();
  db.exec("BEGIN");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Order matters: children before parents, so foreign keys stay satisfiable. */
const TABLES_CHILD_FIRST = [
  "reviews",
  "audit_events",
  "decisions",
  "relationships",
  "risks",
  "ambiguities",
  "conflicts",
  "evidence",
  "constraints_tbl",
  "requirements",
  "document_chunks",
  "documents",
  "stakeholders",
  "coverage_gaps",
  "projects",
  "meta",
];

/**
 * Closes the handle. Only needed where the file itself must be removed -
 * Windows keeps a lock on an open SQLite file, so tests that delete their
 * temporary database call this first.
 */
export function closeDb(): void {
  handle?.close();
  handle = null;
}

/** Empties every table. Callers are responsible for re-seeding afterwards. */
export function truncateAll(): void {
  const db = openDb();
  transaction(() => {
    for (const table of TABLES_CHILD_FIRST) db.exec(`DELETE FROM ${table};`);
  });
}
