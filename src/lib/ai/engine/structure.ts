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

/** A normalised list item ("- text"). Running headers and footers are never
 * bulleted, so a line carrying a list marker is never a furniture candidate,
 * no matter how many times identical bulleted text repeats. */
const LIST_ITEM = /^-\s+\S/;

/**
 * A line repeated at least this many times, in a document long enough for the
 * repetition to be meaningful, is running header or footer text.
 */
const FURNITURE_MIN_OCCURRENCES = 3;
const FURNITURE_MIN_LINES = 8;
const FURNITURE_MAX_LENGTH = 120;

export function cleanDocumentText(text: string): string {
  // Normalise bullets first, so both the LIST_ITEM exclusion below and the
  // furniture count itself see the same, stable strings on every call.
  const lines = text.split("\n").map((line) => line.replace(BULLET, "$1- "));

  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (!key || key.length > FURNITURE_MAX_LENGTH) continue;
    if (LIST_ITEM.test(key)) continue;
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
    kept.push(line);
  }

  // Collapse the runs of blank lines that removal leaves behind, otherwise the
  // chunker sees spurious paragraph breaks where a footer used to be.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** "3.2.1 Capacity and Throughput" - the dominant RFP clause form. */
const NUMBERED_CLAUSE = /^\s*(\d+(?:\.\d+)*)\s+(\S.{0,90})$/;
/** "C. SCOPE OF WORK" */
const LETTERED_CLAUSE = /^\s*([A-Z])\.\s+(\S.{0,90})$/;
/** A line that is entirely upper case and stands alone. */
const CAPS_HEADING = /^\s*([A-Z][A-Z0-9 &/,'()-]{3,80})\s*$/;
/** "Partnerships:" - title-ish, short, ends in a colon. */
const COLON_HEADING = /^\s*([A-Z][A-Za-z0-9 &/,'()-]{2,60}):\s*$/;
/**
 * A heading is a short label; an obligation sentence ("THE CONTRACTOR SHALL
 * MAINTAIN COMPLETE RECORDS...", "The solution shall support ... retention:")
 * is a full clause. Both CAPS_HEADING and COLON_HEADING can be short enough in
 * characters to pass their length caps while still reading as a sentence, so
 * both need this word-count guard too.
 */
const HEADING_MAX_WORDS = 6;

/**
 * Reads a heading from one line, or null.
 *
 * Deliberately conservative on length: an obligation sentence ending in a colon
 * is not a heading, and treating it as one would silently drop a requirement.
 */
export function detectHeading(line: string): string | null {
  if (!line.trim()) return null;

  const numbered = NUMBERED_CLAUSE.exec(line);
  if (numbered && !/[.!?]$/.test(line.trim())) {
    return `${numbered[1]} ${numbered[2]!.trim()}`;
  }

  const lettered = LETTERED_CLAUSE.exec(line);
  if (lettered && !/[.!?]$/.test(line.trim())) {
    return `${lettered[1]}. ${lettered[2]!.trim()}`;
  }

  const caps = CAPS_HEADING.exec(line);
  if (caps && caps[1]!.trim().split(/\s+/).length <= HEADING_MAX_WORDS) {
    return caps[1]!.trim();
  }

  const colon = COLON_HEADING.exec(line);
  if (colon && colon[1]!.trim().split(/\s+/).length <= HEADING_MAX_WORDS) {
    return colon[1]!.trim();
  }

  return null;
}

/** A candidate speaker label: "NAME:" or "NAME (Role):" at the line start. */
const SPEAKER_CANDIDATE = /^([A-Z][A-Z .'-]{2,40}?)\s*(?:\([^)]{2,80}\))?\s*:\s*\S/;

/** Distinct speakers, each speaking more than once, before a document counts. */
const TRANSCRIPT_MIN_SPEAKERS = 2;
const TRANSCRIPT_MIN_TURNS = 2;
/**
 * A repeated field label ("NAME:", "TITLE:") is one word; a person's name is
 * at least two ("KENJI MORI:"). A signature block that repeats "NAME:" /
 * "TITLE:" for each contact reaches TRANSCRIPT_MIN_TURNS on repetition alone,
 * so repetition by itself isn't enough to tell a form from a dialogue.
 */
const SPEAKER_MIN_WORDS = 2;

/**
 * Whether a document is a transcript, decided for the document as a whole.
 *
 * The per-line pattern alone invents speakers out of RFP form labels, because
 * "E-MAIL:" looks exactly like "KENJI MORI:". The distinguishing fact is
 * repetition: a form label appears once, a person in a workshop speaks
 * repeatedly. But a repeated multi-entry form (a two-contact signature block
 * repeating "NAME:" / "TITLE:") passes that test too, so a label also has to
 * look like a name - more than one word - before it counts as a speaker.
 */
export function isTranscript(lines: string[]): boolean {
  const turns = new Map<string, number>();
  for (const line of lines) {
    const match = SPEAKER_CANDIDATE.exec(line);
    if (!match?.[1]) continue;
    const name = match[1].trim();
    if (name.split(/\s+/).length < SPEAKER_MIN_WORDS) continue;
    turns.set(name, (turns.get(name) ?? 0) + 1);
  }
  const repeated = [...turns.values()].filter((n) => n >= TRANSCRIPT_MIN_TURNS);
  return repeated.length >= TRANSCRIPT_MIN_SPEAKERS;
}
