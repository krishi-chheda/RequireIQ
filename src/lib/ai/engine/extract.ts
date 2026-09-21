import type { Constraint, Priority, RequirementType } from "@/lib/types";
import { ACTOR_TERMS, classifyBindsOn, type BindsOn } from "./binds-on";
import { classifyPriority, classifyRequirement } from "./classify";
import {
  boundDirection,
  chunkDocument,
  extractQuantities,
  normaliseWhitespace,
  splitSentences,
  SPEAKER_TURN,
  type Chunk,
} from "./text";

/**
 * Requirement and constraint extraction.
 *
 * The extractor is an obligation detector, not a summariser. It never rewrites
 * source text into a requirement - it finds sentences that already express an
 * obligation and lifts them verbatim, keeping the character offsets so the
 * statement can always be traced back to the words someone actually said.
 *
 * That constraint is the whole hallucination-control story: a statement the
 * register shows is a statement that exists in a document.
 */

export interface ExtractionInput {
  documentId: string;
  /** Document body with any front matter already stripped. */
  content: string;
  /** Used to weight confidence: a signed spec is firmer evidence than a chat. */
  kind: string;
  /** Speaker/author name to stakeholder id. Keys are compared case-insensitively. */
  stakeholdersByName: Map<string, string>;
  /** Fallback attribution when a chunk has no speaker (e.g. an email author). */
  defaultStakeholderId: string | null;
}

export interface ExtractedEvidence {
  documentId: string;
  chunkOrdinal: number;
  locator: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  stakeholderId: string | null;
}

export interface ExtractedRequirement {
  statement: string;
  type: RequirementType;
  priority: Priority;
  confidence: number;
  rationale: string;
  classificationEvidence: string;
  ownerStakeholderId: string | null;
  evidence: ExtractedEvidence;
  /** Text the extractor believes states how the requirement is verified. */
  acceptanceCriteria: string | null;
  bindsOn: BindsOn;
  bindsOnEvidence: string;
}

export interface ExtractedConstraint {
  statement: string;
  category: Constraint["category"];
  value: number | null;
  unit: string | null;
  ownerStakeholderId: string | null;
  evidence: ExtractedEvidence;
}

export interface ExtractionResult {
  requirements: ExtractedRequirement[];
  constraints: ExtractedConstraint[];
  /** Sentences that looked obligation-like but were rejected, with the reason. */
  rejected: Array<{ sentence: string; reason: string }>;
}

/**
 * Modal patterns that mark an obligation, with how binding each one is.
 *
 * `guard` is an extra predicate for a pattern whose regex alone cannot be made
 * precise enough; a pattern without one is decided by its regex.
 */
const OBLIGATION_PATTERNS: Array<{
  re: RegExp;
  strength: number;
  label: string;
  guard?: (statement: string) => boolean;
}> = [
  { re: /\b(must not|shall not|may not)\b/i, strength: 1.0, label: "prohibitive modal" },
  { re: /\b(must|shall)\b/i, strength: 1.0, label: "binding modal" },
  { re: /\b(is required to|are required to|is mandated|requires a|requires an)\b/i, strength: 0.9, label: "requirement phrasing" },
  { re: /\b(has to|have to|needs to|need to)\b/i, strength: 0.7, label: "informal obligation" },
  { re: /\b(should|ought to)\b/i, strength: 0.6, label: "recommendation modal" },
  { re: /\b(will be able to|can be)\b/i, strength: 0.3, label: "capability phrasing" },
  // A buyer commits with "will", not "shall": "The City will provide test data
  // within ten working days of contract award" is a real obligation on the
  // acquiring party (ISO 29148 reads "will" as a statement of intent), and
  // without this the register captures only the obligations pointing at the
  // supplier. Anchored at the sentence subject on purpose - a bare /\bwill\b/
  // also swallows narrative consequence ("the two documents will appear to
  // disagree", "we will be running two origination systems"), which measured
  // as 2 extra non-obligations over the demo corpus.
  //
  // The anchor alone is close to vacuous, though: any subject of three words or
  // fewer satisfies it, which is most English prose. Measured over two real
  // RFPs it admitted narrative and as-is description ("A final budget will be
  // programmed based on the results of this RFP", "Demonstrations will be used
  // to evaluate the usability") alongside the genuine commitments. `guard`
  // narrows it to a subject that names an actor, reusing the binds-on
  // vocabulary rather than keeping a second copy of the same list.
  {
    re: /^[A-Z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}\s+will\s+(?:not\s+)?[a-z]/,
    strength: 0.5,
    label: "commitment modal",
    guard: hasActorSubject,
  },
];

/** The subject of a commitment-modal sentence: everything before "will". */
const COMMITMENT_SUBJECT = /^(.*?)\s+will\s+(?:not\s+)?[a-z]/;

function hasActorSubject(statement: string): boolean {
  const subject = COMMITMENT_SUBJECT.exec(statement)?.[1]?.toLowerCase();
  return subject !== undefined && ACTOR_TERMS.some((term) => subject.includes(term));
}

/** The first obligation pattern the statement satisfies, guard included. */
function findObligation(statement: string) {
  return OBLIGATION_PATTERNS.find((p) => p.re.test(statement) && (!p.guard || p.guard(statement)));
}

/**
 * Domain nouns. At least one must appear, otherwise the sentence is
 * conversational filler ("It needs to feel instant") rather than a requirement
 * about a thing the team can build.
 */
const DOMAIN_NOUNS = [
  "system", "platform", "service", "application", "applicant", "customer",
  "user", "data", "journey", "interface", "supplier", "programme", "project",
  "staff", "broker", "account", "record", "document", "screening", "onboarding",
  "api", "session", "vendor", "dashboard", "report", "alert", "spend",
  "infrastructure", "licence", "budget", "team", "colleague", "analyst",
  "underwriter", "adviser", "channel", "test", "image", "token", "key",
  "offeror", "respondent", "proposer", "bidder", "tenderer", "contractor",
  // "contract" alone is the only domain noun in force majeure, severability,
  // governing-law, venue, standard-of-performance, audit-recovery and
  // contract-form boilerplate - 11 such clauses over the two sample RFPs, 0 in
  // the demo corpus. The narrower pair still admits the budget constraint
  // ("Total contract value must not exceed ...") without them, and
  // "contractor"/"subcontractor" remain entries in their own right.
  "proposal", "bid", "submission", "contract value", "total contract",
  "solicitation", "awardee", "subcontractor", "firm",
];

/**
 * "bid" and "firm" are short enough to appear inside unrelated words -
 * "confirm", "affirm", "firmware", "forbid", "bidirectional" - under plain
 * substring matching. Measured: switching the *whole* list to word-boundary
 * matching is more correct but is not free - it drops RFP yield (144 vs 146
 * over the two sample PDFs) because several entries rely on a mid-word hit
 * for an inflection substring matching also happens to allow. So only these
 * two get the stricter, whole-word check (singular or plural: "bid", "bids",
 * "firm", "firms"); everything else keeps plain substring matching, unchanged.
 * Longer entries such as "bidder" are separate DOMAIN_NOUNS entries and still
 * match by substring.
 */
const AMBIGUOUS_DOMAIN_NOUNS = new Set(["bid", "firm"]);
const AMBIGUOUS_DOMAIN_NOUN_RE = new RegExp(
  `\\b(?:${[...AMBIGUOUS_DOMAIN_NOUNS].map((noun) => `${noun}s?`).join("|")})\\b`,
  "i",
);

function hasDomainNoun(statement: string, lower: string): boolean {
  const plain = DOMAIN_NOUNS.some(
    (noun) => !AMBIGUOUS_DOMAIN_NOUNS.has(noun) && lower.includes(noun),
  );
  return plain || AMBIGUOUS_DOMAIN_NOUN_RE.test(statement);
}

/**
 * A colon-terminated list stem: "The selected firm shall provide the following
 * services:", "... four sections, as further described below: 1.".
 *
 * It carries a modal but no checkable obligation - the obligation is in the
 * items it introduces, which are separate chunks and are extracted in their own
 * right, so rejecting the stem loses nothing.
 *
 * The trailing colon alone is not enough. "Notice ... must be in writing and
 * delivered in person, by courier service or by U.S. mail to:" ends in one but
 * states a real, checkable obligation before it; the colon there introduces an
 * address, not a list of obligations. So a stem also has to announce the list.
 */
const LIST_STEM = /\b(?:the following|as follows|below)\b[^:]*:\s*(?:\d+[.)])?\s*$/i;
const LIST_STEM_REJECTION = "List stem - the obligation is in the items it introduces, not here.";

/**
 * The one rejection reason that is a vocabulary judgement rather than a reading
 * of the sentence. The P1 success criterion is stated against it: a shall/must
 * sentence must be extracted, or rejected for some reason *other* than this.
 */
const VOCABULARY_REJECTION = "No domain subject - conversational rather than buildable.";

/** Sentences containing these are explicitly not requirements. */
const META_MARKERS = [
  "not testable", "no decision taken", "carried as an open question",
  "i will capture that", "i would rather not", "still open",
  "under review", "refer queries", "to be confirmed", "action:",
  "i will take it to", "i will note", "i am recording", "i will record",
  "i would want to see", "i think it is optimistic", "i will come back",
  "i would come back", "distribution:", "next steps",
];

/**
 * Hedges that reduce confidence because the speaker is not committing.
 *
 * "or so" is the one entry short enough to land inside an unrelated phrase -
 * "an account for someone" contains it, and measured over the demo corpus that
 * was docking a firmly-stated requirement 0.15 of confidence for a hedge
 * nobody made. It is matched as whole words; the rest are unambiguous.
 */
const HEDGES = ["i think", "probably", "possibly", "maybe", "roughly", "i would say", "something like"];
const OR_SO = /\bor so\b/i;

const CONSTRAINT_NOUNS = [
  "budget", "spend", "envelope", "threshold", "cap", "not exceed", "no more than",
  "go live on", "must be delivered on", "must not require", "deadline",
  "existing tenancy", "private cloud tenancy", "cost centre", "capital",
];

/** Documents whose statements carry more weight as evidence. */
const KIND_WEIGHT: Record<string, number> = {
  specification: 0.1,
  policy: 0.1,
  email: 0.04,
  meeting_notes: 0.0,
  transcript: 0.0,
  csv: 0.0,
  other: 0.0,
};

const ACCEPTANCE_CUES = [
  "measured", "verified by", "evidenced by", "tested by", "acceptance",
  "within", "at least", "no more than", "percentile", "excluding",
];

/** A sentence of the document, as the extractor sees it. */
interface Candidate {
  chunk: Chunk;
  /** Sentence text with any list marker removed and whitespace collapsed. */
  statement: string;
  /**
   * Offsets of `statement` within the *cleaned* document. They start after the
   * list marker, not at it: the marker is normalised out of the stored
   * statement, so an offset pointing at it would break the register's contract
   * that the recorded range quotes the statement back verbatim.
   */
  start: number;
  end: number;
}

/**
 * Every sentence the extractor considers, in document order.
 *
 * Shared with `obligationCoverage` so the success metric is measured over
 * exactly the sentences extraction saw, not a second, differently-segmented
 * reading of the same document.
 */
function* candidateStatements(content: string): Generator<Candidate> {
  for (const chunk of chunkDocument(content)) {
    const body = stripSpeakerPrefix(chunk.text);
    const bodyOffset = chunk.start + (chunk.text.length - body.length);

    for (const sentence of splitSentences(body, bodyOffset)) {
      const stripped = stripListMarker(sentence.text);
      yield {
        chunk,
        statement: normaliseWhitespace(stripped),
        start: sentence.start + (sentence.text.length - stripped.length),
        end: sentence.end,
      };
    }
  }
}

/** Dedupe/identity key for a statement: letters and digits only. */
function statementKey(statement: string): string {
  return statement.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractFromDocument(input: ExtractionInput): ExtractionResult {
  const requirements: ExtractedRequirement[] = [];
  const constraints: ExtractedConstraint[] = [];
  const rejected: Array<{ sentence: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const candidate of candidateStatements(input.content)) {
    const { chunk, statement } = candidate;
    const speakerId = resolveStakeholder(chunk, input);
    if (statement.length < 20 || statement.length > 400) continue;

    const obligation = findObligation(statement);
    if (!obligation) continue;

    const lower = statement.toLowerCase();
    if (statement.includes("?")) {
      rejected.push({ sentence: statement, reason: "Interrogative - a question, not an obligation." });
      continue;
    }
    const meta = META_MARKERS.find((marker) => lower.includes(marker));
    if (meta) {
      rejected.push({ sentence: statement, reason: `Facilitation or process note (matched "${meta}").` });
      continue;
    }
    if (LIST_STEM.test(statement)) {
      rejected.push({ sentence: statement, reason: LIST_STEM_REJECTION });
      continue;
    }
    if (!hasDomainNoun(statement, lower)) {
      rejected.push({ sentence: statement, reason: VOCABULARY_REJECTION });
      continue;
    }

    const dedupeKey = statementKey(statement);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const evidence: ExtractedEvidence = {
      documentId: input.documentId,
      chunkOrdinal: chunk.ordinal,
      locator: chunk.locator,
      quote: statement,
      startOffset: candidate.start,
      endOffset: candidate.end,
      stakeholderId: speakerId,
    };

    if (looksLikeConstraint(statement)) {
      constraints.push(buildConstraint(statement, evidence, speakerId));
      continue;
    }

    // classifyBindsOn (inside describeStatement) never gates extraction -
    // `unknown` is an honest outcome that surfaces for review, not a reason
    // to discard a real obligation (see
    // docs/superpowers/specs/2026-09-16-rfp-ingestion-p1-design.md).
    requirements.push(buildRequirement(statement, evidence, speakerId, input.kind));
  }

  return { requirements, constraints, rejected };
}

/** Sentences carrying the two binding modals the P1 criterion is stated over. */
const SHALL_MUST = /\b(?:shall|must)\b/i;

export interface ObligationCoverage {
  /** Distinct shall/must sentences in the document. */
  total: number;
  /** Of those, how many were extracted or rejected for a non-vocabulary reason. */
  covered: number;
  /** The rest, verbatim, so a probe can print what the extractor walked past. */
  missed: string[];
}

/**
 * The P1 success criterion, measured per sentence.
 *
 * The spec asks that every shall/must sentence is either extracted or rejected
 * for a reason other than vocabulary. That is a coverage question about a set of
 * sentences, not a ratio of two counts: dividing "things captured" by "times
 * 'shall' appears" says nothing about whether the things captured are the
 * shall/must sentences, and measured over real documents it exceeded 100%.
 */
export function obligationCoverage(content: string, result: ExtractionResult): ObligationCoverage {
  const accounted = new Set<string>();
  for (const requirement of result.requirements) accounted.add(statementKey(requirement.statement));
  for (const constraint of result.constraints) accounted.add(statementKey(constraint.statement));
  for (const { sentence, reason } of result.rejected) {
    if (reason !== VOCABULARY_REJECTION) accounted.add(statementKey(sentence));
  }

  const seen = new Set<string>();
  const missed: string[] = [];
  let total = 0;
  for (const { statement } of candidateStatements(content)) {
    if (!SHALL_MUST.test(statement)) continue;
    const key = statementKey(statement);
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;
    if (!accounted.has(key)) missed.push(statement);
  }

  return { total, covered: total - missed.length, missed };
}

/**
 * Everything a requirement row stores that is read out of the statement text.
 *
 * Both writers of a requirement go through here - the extractor at ingest, and
 * `editRequirement` after a human rewrite - so no stored field can go on
 * quoting words the current statement no longer contains. Adding a derived
 * field here is what makes it survive an edit; adding it at a call site is not.
 */
export interface StatementDescription {
  type: RequirementType;
  priority: Priority;
  rationale: string;
  classificationEvidence: string;
  bindsOn: BindsOn;
  bindsOnEvidence: string;
  acceptanceCriteria: string | null;
  /** Reading-confidence inputs. Only the extractor scores them, at ingest. */
  obligationStrength: number;
  classificationMargin: number;
  quantityCount: number;
  hedged: boolean;
}

export function describeStatement(statement: string): StatementDescription {
  const lower = statement.toLowerCase();
  const obligation = findObligation(statement);
  const classification = classifyRequirement(statement);
  const { priority, evidence: priorityEvidence } = classifyPriority(statement);
  const quantities = extractQuantities(statement);
  const binding = classifyBindsOn(statement);
  // A human can rewrite a statement into one with no modal at all; the
  // extractor never reaches here without one.
  const hedge = HEDGES.find((h) => lower.includes(h)) ?? (OR_SO.test(statement) ? "or so" : undefined);

  const reasons = [
    obligation
      ? `Statement carries a ${obligation.label}`
      : "No obligation modal found in the statement",
    priorityEvidence,
    quantities.length
      ? `Carries ${quantities.length} measurable quantity value${quantities.length === 1 ? "" : "s"} (${quantities
          .map((q) => q.raw)
          .slice(0, 3)
          .join(", ")})`
      : "No measurable quantity found in the statement",
    hedge ? `Confidence reduced: speaker hedged with "${hedge}"` : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    type: classification.type,
    priority,
    // Some reasons (priority evidence) already end in a full stop, so strip it
    // before joining rather than emitting "...priority.. Carries...".
    rationale: `${reasons.map((reason) => reason.replace(/\.+$/, "")).join(". ")}.`,
    classificationEvidence: classification.evidence,
    bindsOn: binding.bindsOn,
    bindsOnEvidence: binding.evidence,
    acceptanceCriteria: deriveAcceptanceCriteria(statement, quantities.length > 0),
    obligationStrength: obligation?.strength ?? 0,
    classificationMargin: classification.margin,
    quantityCount: quantities.length,
    hedged: Boolean(hedge),
  };
}

function buildRequirement(
  statement: string,
  evidence: ExtractedEvidence,
  ownerStakeholderId: string | null,
  kind: string,
): ExtractedRequirement {
  const described = describeStatement(statement);

  // Confidence is a reading confidence: how sure the extractor is that this
  // sentence is a requirement and was read correctly. It is NOT a claim about
  // whether the requirement is a good idea.
  let confidence = 0.5 + described.obligationStrength * 0.25;
  if (described.quantityCount > 0) confidence += 0.08;
  if (ownerStakeholderId) confidence += 0.06;
  confidence += KIND_WEIGHT[kind] ?? 0;
  confidence += described.classificationMargin * 0.08;
  if (described.hedged) confidence -= 0.15;
  if (statement.length > 240) confidence -= 0.05;
  confidence = Math.max(0.35, Math.min(0.98, confidence));

  return {
    statement,
    type: described.type,
    priority: described.priority,
    confidence: Number(confidence.toFixed(2)),
    rationale: described.rationale,
    classificationEvidence: described.classificationEvidence,
    ownerStakeholderId,
    evidence,
    acceptanceCriteria: described.acceptanceCriteria,
    bindsOn: described.bindsOn,
    bindsOnEvidence: described.bindsOnEvidence,
  };
}

/**
 * Acceptance criteria are only reported when the source statement genuinely
 * contains a measurable clause. Inventing one would be exactly the failure mode
 * this product exists to prevent, so the absence is surfaced as a gap instead.
 */
function deriveAcceptanceCriteria(statement: string, hasQuantity: boolean): string | null {
  if (!hasQuantity) return null;
  const lower = statement.toLowerCase();
  if (!ACCEPTANCE_CUES.some((cue) => lower.includes(cue))) return null;
  return statement;
}

function buildConstraint(
  statement: string,
  evidence: ExtractedEvidence,
  ownerStakeholderId: string | null,
): ExtractedConstraint {
  const quantities = extractQuantities(statement);
  const money = quantities.find((q) => q.dimension === "money");
  const date = quantities.find((q) => q.dimension === "date");
  const duration = quantities.find((q) => q.dimension === "duration");
  const lower = statement.toLowerCase();

  let category: Constraint["category"] = "organisational";
  let value: number | null = null;
  let unit: string | null = null;

  if (money) {
    category = "budget";
    value = money.value;
    unit = "currency";
  } else if (date || /\bgo live\b|\bdeadline\b|\bby the end of\b/.test(lower)) {
    category = "timeline";
    value = date?.value ?? duration?.value ?? null;
    unit = date ? "epoch-ms" : duration ? "seconds" : null;
  } else if (/\btenancy\b|\bcore banking\b|\bintegration contract\b|\bplatform\b|\bcloud\b/.test(lower)) {
    category = "technical";
  } else if (/\bregulat|\bstatutory|\bmoney laundering|\bmandat/.test(lower)) {
    category = "regulatory";
  }

  return { statement, category, value, unit, ownerStakeholderId, evidence };
}

function looksLikeConstraint(statement: string): boolean {
  const lower = statement.toLowerCase();
  if (!CONSTRAINT_NOUNS.some((noun) => lower.includes(noun))) return false;

  const quantities = extractQuantities(statement);
  const money = quantities.find((q) => q.dimension === "money");
  if (money && boundDirection(statement, money.start) === "maximum") return true;
  if (/\bmust (?:not exceed|go live on|be delivered on|not require)\b/.test(lower)) return true;
  return /\bbudget\b|\benvelope\b|\bcapital request\b/.test(lower) && quantities.length > 0;
}

function stripListMarker(text: string): string {
  return text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
}

/**
 * Removes a leading "NAME:" or "NAME (Role):" from a transcript turn.
 *
 * The speaker is already captured as the chunk's attribution, so leaving the
 * prefix in would put "AISHA BELL: The application must ..." into a
 * client-facing register. Uses the chunker's own pattern so the two cannot
 * drift apart.
 */
function stripSpeakerPrefix(text: string): string {
  return text.replace(SPEAKER_TURN, "");
}

function resolveStakeholder(chunk: Chunk, input: ExtractionInput): string | null {
  if (chunk.speaker) {
    const id = input.stakeholdersByName.get(chunk.speaker.toLowerCase().trim());
    if (id) return id;
  }
  return input.defaultStakeholderId;
}
