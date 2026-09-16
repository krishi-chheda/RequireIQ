import type { Constraint, Priority, RequirementType } from "@/lib/types";
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

/** Modal patterns that mark an obligation, with how binding each one is. */
const OBLIGATION_PATTERNS: Array<{ re: RegExp; strength: number; label: string }> = [
  { re: /\b(must not|shall not|may not)\b/i, strength: 1.0, label: "prohibitive modal" },
  { re: /\b(must|shall)\b/i, strength: 1.0, label: "binding modal" },
  { re: /\b(is required to|are required to|is mandated|requires a|requires an)\b/i, strength: 0.9, label: "requirement phrasing" },
  { re: /\b(has to|have to|needs to|need to)\b/i, strength: 0.7, label: "informal obligation" },
  { re: /\b(should|ought to)\b/i, strength: 0.6, label: "recommendation modal" },
  { re: /\b(will be able to|can be)\b/i, strength: 0.3, label: "capability phrasing" },
];

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
];

/** Sentences containing these are explicitly not requirements. */
const META_MARKERS = [
  "not testable", "no decision taken", "carried as an open question",
  "i will capture that", "i would rather not", "still open",
  "under review", "refer queries", "to be confirmed", "action:",
  "i will take it to", "i will note", "i am recording", "i will record",
  "i would want to see", "i think it is optimistic", "i will come back",
  "i would come back", "distribution:", "next steps",
];

/** Hedges that reduce confidence because the speaker is not committing. */
const HEDGES = ["i think", "probably", "possibly", "maybe", "roughly", "i would say", "something like", "or so"];

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

export function extractFromDocument(input: ExtractionInput): ExtractionResult {
  const requirements: ExtractedRequirement[] = [];
  const constraints: ExtractedConstraint[] = [];
  const rejected: Array<{ sentence: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const chunk of chunkDocument(input.content)) {
    const speakerId = resolveStakeholder(chunk, input);
    const body = stripSpeakerPrefix(chunk.text);
    const bodyOffset = chunk.start + (chunk.text.length - body.length);

    for (const sentence of splitSentences(body, bodyOffset)) {
      const statement = normaliseWhitespace(stripListMarker(sentence.text));
      if (statement.length < 20 || statement.length > 400) continue;

      const obligation = OBLIGATION_PATTERNS.find((p) => p.re.test(statement));
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
      if (!DOMAIN_NOUNS.some((noun) => lower.includes(noun))) {
        rejected.push({ sentence: statement, reason: "No domain subject - conversational rather than buildable." });
        continue;
      }

      const dedupeKey = lower.replace(/[^a-z0-9]/g, "");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const evidence: ExtractedEvidence = {
        documentId: input.documentId,
        chunkOrdinal: chunk.ordinal,
        locator: chunk.locator,
        quote: statement,
        startOffset: sentence.start,
        endOffset: sentence.end,
        stakeholderId: speakerId,
      };

      if (looksLikeConstraint(statement)) {
        constraints.push(buildConstraint(statement, evidence, speakerId));
        continue;
      }

      requirements.push(buildRequirement(statement, obligation, evidence, speakerId, input.kind));
    }
  }

  return { requirements, constraints, rejected };
}

function buildRequirement(
  statement: string,
  obligation: { strength: number; label: string },
  evidence: ExtractedEvidence,
  ownerStakeholderId: string | null,
  kind: string,
): ExtractedRequirement {
  const classification = classifyRequirement(statement);
  const { priority, evidence: priorityEvidence } = classifyPriority(statement);
  const quantities = extractQuantities(statement);
  const lower = statement.toLowerCase();

  // Confidence is a reading confidence: how sure the extractor is that this
  // sentence is a requirement and was read correctly. It is NOT a claim about
  // whether the requirement is a good idea.
  let confidence = 0.5 + obligation.strength * 0.25;
  if (quantities.length > 0) confidence += 0.08;
  if (ownerStakeholderId) confidence += 0.06;
  confidence += KIND_WEIGHT[kind] ?? 0;
  confidence += classification.margin * 0.08;
  const hedge = HEDGES.find((h) => lower.includes(h));
  if (hedge) confidence -= 0.15;
  if (statement.length > 240) confidence -= 0.05;
  confidence = Math.max(0.35, Math.min(0.98, confidence));

  const reasons = [
    `Detected ${obligation.label} in source sentence`,
    priorityEvidence,
    quantities.length
      ? `Carries ${quantities.length} measurable quantity value${quantities.length === 1 ? "" : "s"} (${quantities
          .map((q) => q.raw)
          .slice(0, 3)
          .join(", ")})`
      : "No measurable quantity found in the statement",
    hedge ? `Confidence reduced: speaker hedged with "${hedge}"` : null,
  ].filter(Boolean);

  return {
    statement,
    type: classification.type,
    priority,
    confidence: Number(confidence.toFixed(2)),
    rationale: `${reasons.join(". ")}.`,
    classificationEvidence: classification.evidence,
    ownerStakeholderId,
    evidence,
    acceptanceCriteria: deriveAcceptanceCriteria(statement, quantities.length > 0),
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
