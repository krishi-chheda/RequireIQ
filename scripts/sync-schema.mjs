// Regenerates src/lib/db/schema.ts from src/lib/db/schema.sql.
// schema.sql stays the single source of truth; the .ts wrapper exists so the
// SQL is bundled with the server code instead of read from disk at runtime.
import { readFileSync, writeFileSync } from "node:fs";

const sql = readFileSync("src/lib/db/schema.sql", "utf8");
if (sql.includes("`") || sql.includes("${")) {
  throw new Error("schema.sql must not contain backticks or ${ sequences");
}
writeFileSync(
  "src/lib/db/schema.ts",
  "// AUTO-DERIVED from schema.sql at build-authoring time. Edit schema.sql, then run:\n" +
    "//   node scripts/sync-schema.mjs\n" +
    "// Kept as TypeScript so the SQL ships inside the server bundle with no fs read.\n\n" +
    "export const SCHEMA_SQL = `" + sql + "`;\n",
);
console.log("schema.ts regenerated from schema.sql");
