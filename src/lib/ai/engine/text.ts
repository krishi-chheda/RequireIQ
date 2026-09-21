/**
 * Text primitives shared by every analyser: segmentation, tokenisation and
 * quantity parsing.
 *
 * Everything here is pure and offset-preserving. Offsets matter more than they
 * look: every citation in the product points back to a character range in the
 * original document, which is what lets the UI quote a source rather than
 * paraphrase it.
 */

import { cleanDocumentText, detectHeading, isTranscript } from "./structure";

export interface Sentence {
  text: string;
  /** Offset of the first character of `text` within the document. */
  start: number;
  /** Offset one past the last character of `text` within the document. */
  end: number;
}

export interface Chunk {
  ordinal: number;
  /** Human-readable position, e.g. "Section 4.2" or "KENJI MORI, turn 4". */
  locator: string;
  text: string;
  start: number;
  end: number;
  /** Speaker name where the chunk came from a transcript turn. */
  speaker: string | null;
}

/** Abbreviations after which a full stop does not end a sentence. */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "no", "vs", "etc", "eg",
  "ie", "approx", "dept", "inc", "ltd", "plc", "co", "fig", "al",
  // "Sec. 5" is a cross-reference, not a sentence end. It appears nowhere in
  // the sample RFPs, the fixture or the demo corpus, so this costs nothing
  // there; it is here because `detectHeading` now asks this splitter whether a
  // clause title is one sentence, and "2. Sec. 5 Compliance" is one.
  "sec",
]);

/**
 * Splits text into sentences, preserving absolute offsets.
 *
 * Deliberately conservative: a full stop only ends a sentence when followed by
 * whitespace and an uppercase letter, digit or quote. That keeps "99.99%",
 * "$200,000" and "MB-DG-011" intact, which naive splitters destroy - and a
 * destroyed number is a missed conflict.
 */
export function splitSentences(text: string, baseOffset = 0): Sentence[] {
  const sentences: Sentence[] = [];
  let cursor = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "\n") continue;

    if (ch === "\n") {
      // A blank line is a hard break even without terminal punctuation, which
      // is how bullet lists and note-form documents behave.
      if (text[i + 1] !== "\n") continue;
    } else {
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue;
      // Decimal point inside a number: "99.99" -> not a boundary.
      if (ch === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 2] ?? "")) continue;
      const word = lastWord(text, i);
      if (ch === "." && ABBREVIATIONS.has(word.toLowerCase())) continue;
      // Single initial, e.g. "J. Smith".
      if (ch === "." && word.length === 1 && /[A-Za-z]/.test(word)) continue;
      const after = text.slice(i + 1).match(/^\s*(\S)/);
      if (after && after[1] && !/[A-Z0-9"'\-*#]/.test(after[1])) continue;
    }

    const raw = text.slice(cursor, i + 1);
    pushSentence(sentences, raw, cursor, baseOffset);
    cursor = i + 1;
  }

  if (cursor < text.length) {
    pushSentence(sentences, text.slice(cursor), cursor, baseOffset);
  }
  return sentences;
}

function pushSentence(out: Sentence[], raw: string, cursor: number, baseOffset: number): void {
  const leading = raw.length - raw.trimStart().length;
  const body = raw.trim();
  if (body.length < 2) return;
  out.push({
    text: body,
    start: baseOffset + cursor + leading,
    end: baseOffset + cursor + leading + body.length,
  });
}

function lastWord(text: string, index: number): string {
  let start = index - 1;
  while (start >= 0 && /[A-Za-z]/.test(text[start] ?? "")) start -= 1;
  return text.slice(start + 1, index);
}

/**
 * A transcript speaker turn.
 *
 * Two forms, because real transcripts use both: the first time someone speaks
 * they are introduced with their role, and afterwards only their name appears.
 * Missing the second form is not cosmetic - it leaves "AISHA BELL:" glued to
 * the front of a requirement statement and loses the attribution for every
 * continuation turn, which is most of them.
 *
 * The all-caps name requirement is what keeps this off email headers ("From:",
 * "Subject:") and ordinary prose.
 */
export const SPEAKER_TURN = /^([A-Z][A-Z .'-]{2,40}?)\s*(?:\(([^)]{2,80})\))?\s*:\s*/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const EMAIL_HEADER = /^(From|To|Cc|Date|Subject):\s*(.*)$/i;

/**
 * Splits a document into retrieval/citation units.
 *
 * Structure-aware rather than fixed-width: transcripts break on speaker turns,
 * specifications on headings, emails on the header block then paragraphs. The
 * locator that comes out of this is what a consultant reads in a citation, so
 * "Section 4.2" beats "chunk 17".
 */
export function chunkDocument(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const cleaned = cleanDocumentText(content);
  const lines = cleaned.split("\n");

  // Speaker attribution is a document-level decision. Applying the per-line
  // pattern to an RFP invents speakers out of form labels.
  const transcript = isTranscript(lines);

  let currentHeading = "Preamble";
  let buffer: string[] = [];
  let bufferStart = 0;
  let offset = 0;
  let speaker: string | null = null;
  const turnCounts = new Map<string, number>();
  let inHeaderBlock = false;

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    if (text.length >= 3) {
      const leading = buffer.join("\n").length - buffer.join("\n").trimStart().length;
      const start = bufferStart + leading;
      chunks.push({
        ordinal: chunks.length,
        locator: speaker ? `${speaker}, turn ${turnCounts.get(speaker) ?? 1}` : currentHeading,
        text,
        start,
        end: start + text.length,
        speaker,
      });
    }
    buffer = [];
    speaker = null;
  };

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;

    const markdownHeading = HEADING.exec(line);
    const plainHeading = markdownHeading ? null : detectHeading(line);
    if (markdownHeading || plainHeading) {
      flush();
      currentHeading =
        (markdownHeading ? (markdownHeading[2] ?? "").trim() : plainHeading!) || currentHeading;
      inHeaderBlock = false;
      bufferStart = offset;
      continue;
    }

    const turn = transcript ? SPEAKER_TURN.exec(line) : null;
    if (turn && turn[1]) {
      flush();
      const name = turn[1].trim();
      turnCounts.set(name, (turnCounts.get(name) ?? 0) + 1);
      speaker = name;
      bufferStart = lineStart;
      buffer.push(line);
      continue;
    }

    if (EMAIL_HEADER.test(line)) {
      if (!inHeaderBlock) {
        flush();
        inHeaderBlock = true;
        currentHeading = "Email header";
        bufferStart = lineStart;
      }
      buffer.push(line);
      continue;
    }
    if (inHeaderBlock && line.trim() === "") {
      flush();
      inHeaderBlock = false;
      currentHeading = "Email body";
      bufferStart = offset;
      continue;
    }

    if (line.trim() === "" && buffer.length > 0 && !speaker) {
      flush();
      bufferStart = offset;
      continue;
    }

    if (buffer.length === 0) bufferStart = lineStart;
    buffer.push(line);
  }
  flush();

  return chunks.map((chunk, index) => ({ ...chunk, ordinal: index }));
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this",
  "these", "those", "of", "to", "in", "on", "for", "with", "at", "by", "from",
  "as", "is", "are", "was", "were", "be", "been", "being", "it", "its", "we",
  "our", "us", "they", "them", "their", "i", "you", "your", "he", "she", "his",
  "her", "not", "no", "so", "do", "does", "did", "have", "has", "had", "will",
  "would", "there", "here", "what", "which", "who", "when", "where", "how",
  "all", "any", "each", "more", "most", "other", "some", "such", "only", "own",
  "same", "very", "can", "just", "also", "into", "over", "up", "out", "about",
  "during", "while", "under", "across", "between", "after", "before", "per",
  "within", "through", "against", "per-", "every", "both", "either",
]);

/** Crude but stable suffix stripping - enough to align "screening"/"screened". */
function stem(token: string): string {
  if (token.length <= 4) return token;
  for (const suffix of ["ations", "ation", "ingly", "ing", "edly", "ed", "es", "s", "ly"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/** Lower-cased, stop-worded, lightly stemmed content tokens. */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? [];
  return raw.filter((token) => token.length > 2 && !STOPWORDS.has(token)).map(stem);
}

export type Dimension = "money" | "duration" | "percent" | "count" | "date";

export interface Quantity {
  /** Value normalised to the dimension's canonical unit. */
  value: number;
  dimension: Dimension;
  /** Canonical unit: usd | seconds | percent | items | epoch-ms. */
  unit: string;
  /** The exact text that produced this quantity. */
  raw: string;
  /** Noun the quantity attaches to, where one was found ("concurrent users"). */
  subject: string | null;
  start: number;
  end: number;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, sixty: 60,
};

const DURATION_SECONDS: Record<string, number> = {
  millisecond: 0.001, ms: 0.001,
  second: 1, sec: 1, s: 1,
  minute: 60, min: 60,
  hour: 3600, hr: 3600, h: 3600,
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
  year: 31_536_000,
};

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
};

const MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, bn: 1e9, b: 1e9 };

function parseNumeric(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  const match = /^(\d+(?:\.\d+)?)\s*(k|m|bn|b)?$/i.exec(cleaned);
  if (match && match[1]) {
    const base = Number(match[1]);
    const suffix = match[2]?.toLowerCase();
    return suffix ? base * (MULTIPLIERS[suffix] ?? 1) : base;
  }
  const word = WORD_NUMBERS[cleaned.toLowerCase()];
  return word ?? null;
}

/** Noun phrase immediately following a quantity, e.g. "concurrent users". */
function subjectAfter(text: string, index: number): string | null {
  const tail = text.slice(index, index + 60);
  const match = /^\s*(?:of\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})/.exec(tail);
  if (!match || !match[1]) return null;
  const words = match[1].split(/\s+/).filter((w) => !STOPWORDS.has(w));
  return words.length ? words.join(" ") : null;
}

/**
 * Pulls every measurable quantity out of a sentence.
 *
 * This is what makes quantitative conflict detection possible at all: two
 * requirements can only be compared arithmetically once their numbers are in a
 * shared canonical unit.
 */
export function extractQuantities(text: string): Quantity[] {
  const found: Quantity[] = [];
  const seen = new Set<number>();

  const push = (q: Quantity): void => {
    if (seen.has(q.start)) return;
    seen.add(q.start);
    found.push(q);
  };

  // Money: $200,000 / £1.2m / USD 200k / 200,000 dollars
  const money = /([$£€])\s?([\d,]+(?:\.\d+)?)\s*(k|m|bn|b)?\b|\b([\d,]+(?:\.\d+)?)\s*(k|m|bn)?\s*(dollars|pounds|euros)\b/gi;
  for (const m of text.matchAll(money)) {
    const numText = `${m[2] ?? m[4] ?? ""}${m[3] ?? m[5] ?? ""}`;
    const value = parseNumeric(numText);
    if (value === null) continue;
    push({
      value,
      dimension: "money",
      unit: "currency",
      raw: m[0].trim(),
      subject: subjectAfter(text, (m.index ?? 0) + m[0].length),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  // Percentages: 99.99% / 95 per cent
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(%|per ?cents?\b|percents?\b)/gi)) {
    const value = parseNumeric(m[1] ?? "");
    if (value === null) continue;
    push({
      value,
      dimension: "percent",
      unit: "percent",
      raw: m[0].trim(),
      subject: subjectAfter(text, (m.index ?? 0) + m[0].length),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  // Durations: 500 milliseconds / seven years / 12-week / 15 minutes
  const durationWords = Object.keys(DURATION_SECONDS).join("|");
  const duration = new RegExp(
    `\\b([\\d,]+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join("|")})[\\s-]*(${durationWords})s?\\b`,
    "gi",
  );
  for (const m of text.matchAll(duration)) {
    const value = parseNumeric(m[1] ?? "");
    const perUnit = DURATION_SECONDS[(m[2] ?? "").toLowerCase()];
    if (value === null || perUnit === undefined) continue;
    push({
      value: value * perUnit,
      dimension: "duration",
      unit: "seconds",
      raw: m[0].trim(),
      subject: subjectAfter(text, (m.index ?? 0) + m[0].length),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  // Dates: 2 March 2027 / 24 July 2026
  const dateRe = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})\\s+(\\d{4})\\b`, "gi");
  for (const m of text.matchAll(dateRe)) {
    const day = Number(m[1]);
    const month = MONTHS[(m[2] ?? "").toLowerCase()];
    const year = Number(m[3]);
    if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) continue;
    push({
      value: Date.UTC(year, month, day),
      dimension: "date",
      unit: "epoch-ms",
      raw: m[0].trim(),
      subject: null,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }

  // Bare counts with a following noun: 10,000 concurrent users / 2,000 activations
  for (const m of text.matchAll(/\b([\d,]{2,})\s+((?:[a-z-]+\s+){0,2}[a-z-]+)\b/g)) {
    const start = m.index ?? 0;
    if (found.some((q) => start >= q.start && start < q.end)) continue;
    const value = parseNumeric(m[1] ?? "");
    if (value === null || value < 10) continue;
    // Trim trailing function words the greedy noun match swept up, so
    // "10,000 concurrent users during" becomes "concurrent users".
    const subject = (m[2] ?? "")
      .trim()
      .split(/\s+/)
      .filter((word) => !STOPWORDS.has(word))
      .join(" ");
    if (!subject) continue;
    if (DURATION_SECONDS[subject.split(/\s+/).at(-1) ?? ""] !== undefined) continue;
    push({
      value,
      dimension: "count",
      unit: "items",
      // Rebuilt from the cleaned subject so the phrase reads properly when a
      // conflict explanation quotes it back to the reader.
      raw: `${(m[1] ?? "").trim()} ${subject}`,
      subject,
      start,
      end: start + m[0].length,
    });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Direction of a bound: "at least 10,000" vs "must not exceed $200,000". */
export type BoundDirection = "minimum" | "maximum" | "exact";

const MAXIMUM_CUES = [
  "must not exceed", "not exceed", "no more than", "at most", "under", "below",
  "less than", "within", "maximum", "cap", "capped", "up to", "must not be more",
  "shorter than", "fewer than",
];
const MINIMUM_CUES = [
  "at least", "no less than", "not less than", "minimum", "more than",
  "greater than", "over", "exceeding", "must support", "must sustain",
  "must handle", "must process",
];

/** Reads the comparison direction that governs a quantity in its sentence. */
export function boundDirection(sentence: string, quantityStart: number): BoundDirection {
  const before = sentence.slice(Math.max(0, quantityStart - 60), quantityStart).toLowerCase();
  const maxHit = MAXIMUM_CUES.filter((cue) => before.includes(cue)).sort(byCueEnd(before)).at(-1);
  const minHit = MINIMUM_CUES.filter((cue) => before.includes(cue)).sort(byCueEnd(before)).at(-1);
  if (maxHit && minHit) return before.lastIndexOf(maxHit) > before.lastIndexOf(minHit) ? "maximum" : "minimum";
  if (maxHit) return "maximum";
  if (minHit) return "minimum";
  return "exact";
}

function byCueEnd(haystack: string) {
  return (a: string, b: string): number => haystack.lastIndexOf(a) - haystack.lastIndexOf(b);
}

/** Collapses whitespace so quotes render cleanly in one line of UI. */
export function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
