import "server-only";

import { DatabaseSync } from "node:sqlite";
import { closeDb, getMeta, isEphemeral, openDb, setMeta, transaction, truncateAll } from "./connection";
import { seedDatabase } from "./seed";

/**
 * Database entry point.
 *
 * Composes the connection layer with the demo seed. Every application module
 * imports from here; nothing else calls `openDb()` directly.
 */

let seeding = false;

/** Opens the database, seeding the demo engagement on first use. */
export function getDb(): DatabaseSync {
  const db = openDb();
  if (!seeding && !getMeta("seeded_at")) {
    seeding = true;
    try {
      seedDatabase();
    } finally {
      seeding = false;
    }
  }
  return db;
}

/** Empties every table and re-runs the demo seed. Backs the "Reset demo" action. */
export function resetDatabase(): void {
  openDb();
  truncateAll();
  seedDatabase();
}

export { closeDb, getMeta, isEphemeral, setMeta, transaction };
