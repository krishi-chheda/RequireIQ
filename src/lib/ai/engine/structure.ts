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

import { splitSentences } from "./text";

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
 * so the first line carries no terminal punctuation either. Reading one as a
 * heading is not a cosmetic error: `chunkDocument` drops a heading line from
 * the body it chunks, so the text disappears from the document the extractor
 * sees, and the orphaned continuation is then cited to a sentence fragment.
 *
 * `isLabel` is the whole discriminator and ALL FOUR heading forms share it,
 * every clause of it. That uniformity is the rule, not an accident: the same
 * words must be read the same way whether or not a clause number precedes
 * them, and a per-form exception is how "12. PUBLICATION, REPRODUCTION AND USE
 * OF MATERIAL COPYRIGHT" came to be a heading while the identical line without
 * its number was body. `detectHeading`'s form ordering is pinned by test.
 *
 * Three clauses, each measured against two real RFPs, the fixture and the demo
 * corpus:
 *
 *  - No internal sentence boundary. Asked of `splitSentences`, the splitter the
 *    rest of the engine reads sentences with, rather than a private `[.!?]\s`
 *    regex: that regex called "2 Population Served Approx. 26,000" and "15 U.S.
 *    Bank Bank portal" two sentences apiece and demoted both to body.
 *  - No mid-clause modal. A section title may name a modal ("7. Documents
 *    Bidders Must Submit"), so the test is narrowed to a modal with two or more
 *    words after it, which is a clause and not a title's trailing verb. Still
 *    load-bearing at the cap below: without it "The selected firm shall provide
 *    the following services:", "The evaluation process will follow the steps
 *    listed below:" and "ALL OFFEROR PROPOSALS MUST BE RECEIVED FOR REVIEW AND"
 *    are all promoted to headings and their text is deleted.
 *  - At most ten words. Structure alone is not enough, because wrapped
 *    *narrative* carries neither a boundary nor a modal - "1099 creation is
 *    outsourced to a third-party vendor due to" is a mid-sentence fragment by
 *    any reading. Measured over both PDFs, mid-sentence headings by cap (real
 *    headings rescued in brackets): 6 -> 7 (0/6), 9 -> 9 (6/6), 10 -> 9 (6/6),
 *    11 -> 12, 12 -> 15, 14 -> 19, uncapped -> 23. Ten is the largest cap that
 *    costs nothing; the longest genuine heading in either document ("2.2
 *    Alternate Proposals, Partnerships and Proposers of Subsets of
 *    Functionality") is nine words.
 *  - Title-cased first word. A heading names its section; it does not open
 *    mid-sentence. This is what tells "1099 creation is outsourced to a
 *    third-party vendor due to" (nine words, no boundary, no modal - a wrapped
 *    narrative line whose deletion orphaned its continuation into a chunk
 *    located at the deleted sentence) from a real clause title. Measured, it
 *    demotes that line and no other in either PDF, the fixture or the demo
 *    corpus; CAPS_HEADING and COLON_HEADING already required it in their own
 *    patterns, so this only extends the same demand to the clause forms.
 *  - No dangling function word at the end. The mirror of the clause above, and
 *    what lets the cap stay uniform: an ALL-CAPS clause wraps like any other
 *    but its continuation lines carry no case signal to read, which is why
 *    CAPS_HEADING used to hold a tighter cap of its own - the very
 *    form-specific exception this rule exists to remove. A title does not end
 *    on "OR", "AND" or "NO". Measured, it demotes exactly four lines across
 *    both PDFs and the fixture, every one of them a fragment: "EVALUATION BY
 *    THE PROCUREMENT MANAGER OR DESIGNEE NO", "BETWEEN SANTA FE COUNTY AND",
 *    "The City estimates that:", "The Contractor represents that:". Two words
 *    or fewer are exempt, because "APPENDIX A" is a heading and its "A" is a
 *    label, not an article.
 */
const OBLIGATION_MODAL = /(?<![\w-])(?:shall|must|should|may|will)(?![\w-])(?:\s+\S+){2,}/i;
const HEADING_MAX_WORDS = 10;
const TITLE_START = /^[A-Z0-9"'(]/;
const DANGLING_END =
  /\b(?:a|an|the|and|or|but|nor|of|to|in|on|for|with|at|by|from|as|is|are|was|were|be|been|that|which|who|no|not|if|than|then|will|shall|may|must|its|their|his|her|our|your|any|all|each|such|upon|into|under|over|per|so|when|where|while|about|between|through|against|before|after|during|including|has|have|had|this|these|those|it|they|we|you|he|she)\W*$/i;

function isLabel(body: string): boolean {
  const words = body.split(/\s+/);
  return (
    TITLE_START.test(body) &&
    words.length <= HEADING_MAX_WORDS &&
    (words.length <= 2 || !DANGLING_END.test(body)) &&
    splitSentences(body).length <= 1 &&
    !OBLIGATION_MODAL.test(body)
  );
}

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
  if (caps && isLabel(caps[1]!.trim())) return caps[1]!.trim();

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
