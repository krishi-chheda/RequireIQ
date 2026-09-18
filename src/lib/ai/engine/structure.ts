/**
 * Structure recovery for plain text.
 *
 * PDF-derived text has no Markdown, so the chunker falls through to paragraph
 * splitting and every citation collapses to the document default. These
 * functions put the structure back before chunking runs.
 *
 * Cleanup happens to the document, never to an extracted statement: the
 * register's contract is that a statement exists verbatim in the stored text at
 * the offsets recorded against it.
 */

/** Page-number furniture, e.g. "Page 8 of 34", "- 12 -", a bare numeral. */
const PAGE_NUMBER = /^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-|\d{1,4})\s*$/i;

/** Bullet glyphs, including the replacement character PDF extraction produces. */
const BULLET = /^(\s*)[�•‣▪●◦·⁃∙*]\s+/;

/**
 * A line repeated at least this many times, in a document long enough for the
 * repetition to be meaningful, is running header or footer text.
 */
const FURNITURE_MIN_OCCURRENCES = 3;
const FURNITURE_MIN_LINES = 8;
const FURNITURE_MAX_LENGTH = 120;

export function cleanDocumentText(text: string): string {
  const lines = text.split("\n");

  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (!key || key.length > FURNITURE_MAX_LENGTH) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const furniture = new Set<string>();
  if (lines.length >= FURNITURE_MIN_LINES) {
    for (const [line, count] of counts) {
      if (count >= FURNITURE_MIN_OCCURRENCES) furniture.add(line);
    }
  }

  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (PAGE_NUMBER.test(trimmed)) continue;
    if (furniture.has(trimmed)) continue;
    kept.push(line.replace(BULLET, "$1- "));
  }

  // Collapse the runs of blank lines that removal leaves behind, otherwise the
  // chunker sees spurious paragraph breaks where a footer used to be.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}
