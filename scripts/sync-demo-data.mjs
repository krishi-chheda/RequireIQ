// Regenerates src/lib/demo/corpus.ts from the files in demo-data/.
//
// demo-data/ is the authored source of truth: the files are readable in the
// repo, they can be re-uploaded through the ingestion UI, and they are what the
// planted-conflict tests assert against. The generated module exists so the
// corpus is bundled with the server code rather than read from disk at runtime,
// which keeps the app working from any working directory and in a standalone
// build.
//
// Run: node scripts/sync-demo-data.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIR = "demo-data";
const OUT_FILE = "src/lib/demo/corpus.ts";

/** Parses the leading `---` front matter block. Returns [meta, body]. */
function parseFrontMatter(raw) {
  if (!raw.startsWith("---")) return [{}, raw];
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return [{}, raw];

  const meta = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  const bodyStart = raw.indexOf("\n", end + 1);
  return [meta, raw.slice(bodyStart + 1).replace(/^\n+/, "")];
}

const files = readdirSync(SOURCE_DIR).filter((f) => /\.(md|txt|csv)$/i.test(f)).sort();
const documents = [];

for (const filename of files) {
  const raw = readFileSync(join(SOURCE_DIR, filename), "utf8").replace(/\r\n/g, "\n");

  if (filename.endsWith(".csv")) {
    // The stakeholder register is structured data, not prose. It is carried in
    // the corpus so the ingestion screen can show it, but it is parsed
    // separately by the seed.
    documents.push({
      title: "Stakeholder Register",
      kind: "csv",
      filename,
      author: "Northgate Advisory",
      capturedAt: "2026-06-08",
      content: raw,
    });
    continue;
  }

  const [meta, body] = parseFrontMatter(raw);
  if (!meta.title) throw new Error(`${filename}: missing "title" in front matter`);
  documents.push({
    title: meta.title,
    kind: meta.kind ?? "other",
    filename,
    author: meta.author ?? null,
    capturedAt: meta.capturedAt,
    content: body,
  });
}

mkdirSync("src/lib/demo", { recursive: true });
writeFileSync(
  OUT_FILE,
  `// AUTO-GENERATED from demo-data/. Edit the source files, then run:
//   node scripts/sync-demo-data.mjs
//
// The Meridian Bank engagement corpus. Every requirement, conflict, ambiguity
// and risk the product shows is derived from the text below at seed time -
// nothing in the demo is hand-written into the database.

export interface DemoDocument {
  title: string;
  kind: string;
  filename: string;
  author: string | null;
  capturedAt: string;
  content: string;
}

export const DEMO_CORPUS: DemoDocument[] = ${JSON.stringify(documents, null, 2)};
`,
);

const words = documents.reduce((n, d) => n + d.content.split(/\s+/).length, 0);
console.log(`corpus.ts regenerated: ${documents.length} documents, ${words.toLocaleString()} words`);
