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

/**
 * "3.2.1 Capacity and Throughput" - the dominant RFP clause form. The trailing
 * dot is optional because top-level clauses are usually written "4. CONTRACT
 * REQUIREMENTS" while their children are written "4.1 Insurance"; without it
 * every top-level heading fell through and its whole section inherited the
 * previous sibling's locator.
 */
const NUMBERED_CLAUSE = /^\s*(\d+(?:\.\d+)*)\.?\s+(\S.{0,90})$/;
/** "C. SCOPE OF WORK" */
const LETTERED_CLAUSE = /^\s*([A-Z])\.\s+(\S.{0,90})$/;
/** A line that is entirely upper case and stands alone. */
const CAPS_HEADING = /^\s*([A-Z][A-Z0-9 &/,'()-]{3,80})\s*$/;
/** "Partnerships:" - title-ish, short, ends in a colon. */
const COLON_HEADING = /^\s*([A-Z][A-Za-z0-9 &/,'()-]{2,60}):\s*$/;
/**
 * A heading is a label; an obligation clause wrapped across lines by PDF
 * extraction ("1. General Conditions. Contractor shall procure and maintain a
 * comprehensive") looks like one, because the sentence continues overleaf and
 * so the first line carries no terminal punctuation either.
 *
 * Word count is the wrong discriminator. Measured over two real RFPs and the
 * demo corpus, a cap of six demoted 45 genuine headings ("5.19 Compliance with
 * Federal, State, County, and Local Laws", "12. PUBLICATION, REPRODUCTION, AND
 * USE OF MATERIAL; COPYRIGHT") to body, which merged whole sections into their
 * predecessor and cited their obligations to the *previous* section number - a
 * wrong citation, worse than a generic one. Raising the cap to nine rescues
 * those but readmits the wrapped clauses, which are nine words too.
 *
 * The two cases differ structurally, not by length: a wrapped clause carries an
 * internal sentence boundary, an obligation modal, or both; a heading carries
 * neither. Measured, that rule rescues all 45 and still rejects every wrapped
 * clause. All four heading forms share it.
 */
const SENTENCE_BOUNDARY = /[.!?]\s+\S/;
const OBLIGATION_MODAL = /\b(?:shall|must|should|may|will)\b/i;

function isLabel(body: string): boolean {
  return !SENTENCE_BOUNDARY.test(body) && !OBLIGATION_MODAL.test(body);
}

/**
 * ALL-CAPS lines keep a length cap on top of `isLabel`, and only they do.
 *
 * A caps clause wraps like any other, but its continuation lines ("EVALUATION
 * BY THE PROCUREMENT MANAGER OR DESIGNEE NO", "NOT THEY, THEIR FAMILY MEMBER,
 * OR THEIR REPRESENTATIVE HAS MADE ANY") carry the modal and the sentence
 * boundary in the *first* line, not in themselves - there is no case signal
 * left to read, so length is all that is left. Measured, the cap costs nothing
 * here: every caps line it demotes is such a continuation, and the one caps
 * heading long enough to need rescuing ("12. PUBLICATION, REPRODUCTION, AND USE
 * OF MATERIAL; COPYRIGHT") is numbered, so NUMBERED_CLAUSE reads it first.
 */
const CAPS_HEADING_MAX_WORDS = 6;

/**
 * Reads a heading from one line, or null.
 *
 * Deliberately conservative: an obligation sentence that happens to be
 * numbered, lettered, capitalised or colon-terminated is not a heading, and
 * treating it as one silently swallows a requirement into a section label.
 */
export function detectHeading(line: string): string | null {
  if (!line.trim()) return null;

  const numbered = NUMBERED_CLAUSE.exec(line);
  if (numbered && !/[.!?]$/.test(line.trim())) {
    const body = numbered[2]!.trim();
    if (isLabel(body)) return `${numbered[1]} ${body}`;
  }

  const lettered = LETTERED_CLAUSE.exec(line);
  if (lettered && !/[.!?]$/.test(line.trim())) {
    const body = lettered[2]!.trim();
    if (isLabel(body)) return `${lettered[1]}. ${body}`;
  }

  const caps = CAPS_HEADING.exec(line);
  if (caps) {
    const body = caps[1]!.trim();
    if (isLabel(body) && body.split(/\s+/).length <= CAPS_HEADING_MAX_WORDS) return body;
  }

  const colon = COLON_HEADING.exec(line);
  if (colon && isLabel(colon[1]!.trim())) return colon[1]!.trim();

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
