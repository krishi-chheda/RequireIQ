// Prints the P1 success metrics against whatever real PDFs are in samples/rfp/.
// Not part of CI - those documents are gitignored. This is the thing you run
// when a real document behaves oddly.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (!existsSync("samples/rfp")) {
  console.error("No samples/rfp directory. See samples/rfp/README.md.");
  process.exit(1);
}

// The application source is TypeScript compiled by bundlers that resolve
// extensionless relative imports; plain Node does not. Node's own type
// stripping handles the syntax, so the only gap is resolution: append ".ts"
// when a relative specifier has no extension. A few lines of stdlib rather
// than a transpiler dependency for one local script.
//
// Scoped to importers under src/ on purpose. From Node 22.15 these hooks also
// apply to require(), so an unscoped rewrite would rename every extensionless
// relative specifier in node_modules too - and would turn a directory import
// ("./foo") into "./foo.ts" rather than "./foo/index.ts".
const SRC = pathToFileURL(resolve("src")).href;

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      !/\.[cm]?[jt]s$/.test(specifier) &&
      context.parentURL?.startsWith(SRC)
    ) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { extractPdfText } = await import("../src/lib/pdf.ts");
const { chunkDocument } = await import("../src/lib/ai/engine/text.ts");
const { extractFromDocument, obligationCoverage } = await import("../src/lib/ai/engine/extract.ts");

for (const file of readdirSync("samples/rfp").filter((f) => f.endsWith(".pdf"))) {
  const { text, pageCount } = await extractPdfText(new Uint8Array(readFileSync(`samples/rfp/${file}`)));
  const chunks = chunkDocument(text);
  const result = extractFromDocument({
    documentId: file, content: text, kind: "specification",
    stakeholdersByName: new Map(), defaultStakeholderId: null,
  });

  const locators = new Set(chunks.map((c) => c.locator));
  const specific = result.requirements.filter((r) => r.evidence.locator !== "Preamble");
  // Per-sentence coverage, not a count ratio: every shall/must sentence has to
  // be extracted or rejected for a reason other than vocabulary.
  const coverage = obligationCoverage(text, result);
  const byActor = {};
  for (const r of result.requirements) byActor[r.bindsOn] = (byActor[r.bindsOn] ?? 0) + 1;

  console.log(`\n===== ${file}  (${pageCount} pages)`);
  console.log(`chunks ${chunks.length} | distinct locators ${locators.size}`);
  console.log(`requirements ${result.requirements.length} | constraints ${result.constraints.length} | rejected ${result.rejected.length}`);
  console.log(`specific locators ${(100 * specific.length / Math.max(1, result.requirements.length)).toFixed(0)}%  (target >= 80%)`);
  console.log(`shall/must sentence coverage ${(100 * coverage.covered / Math.max(1, coverage.total)).toFixed(0)}%  (${coverage.covered}/${coverage.total}, target >= 75%)`);
  console.log(`speakers invented ${chunks.filter((c) => c.speaker).length}  (target 0)`);
  console.log(`binds on:`, byActor);
  for (const sentence of coverage.missed.slice(0, 10)) {
    console.log(`  missed: ${sentence.slice(0, 110)}`);
  }
  if (coverage.missed.length > 10) console.log(`  ... and ${coverage.missed.length - 10} more`);
}
