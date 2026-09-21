import type { Priority, RequirementType } from "@/lib/types";
import { extractQuantities } from "./text";

/**
 * Requirement classification and prioritisation.
 *
 * Lexicon-scored rather than learned, for two reasons that matter in a
 * consulting context: it needs no labelled training data for a new engagement,
 * and every decision comes with the terms that produced it, so a BA can argue
 * with the classifier instead of trusting it.
 */

/**
 * Weighted cues per class.
 *
 * Every cue is anchored at a word start and matched as a prefix from there, so
 * an inflection still counts ("record" -> "records", "integrat" ->
 * "integration", "event" -> "events") but a cue landing in the middle of an
 * unrelated word does not. Measured before changing it: plain substring
 * matching classified "uploaded documents" and "downloading the solicitation"
 * as performance on "load", "a separate capital request" as technical on
 * "api", "speaker identification" as performance on "peak", "a seamless
 * transition" as compliance on "aml", and "prevent the delayed" as technical
 * on "event" - 2 statements in the demo corpus and 7 across the two sample
 * RFPs. Whole-word matching would fix those too but costs 10 and 28
 * respectively, because it also throws away the inflections the cues rely on.
 */
const CLASS_CUES: Record<RequirementType, Array<[string, number]>> = {
  performance: [
    ["concurrent", 3], ["throughput", 3], ["latency", 3], ["response time", 3],
    ["milliseconds", 3], ["per second", 2], ["per hour", 2], ["peak", 2],
    ["scale", 2], ["horizontally", 2], ["capacity", 2], ["headroom", 2],
    ["percentile", 3], ["load", 1], ["sustain", 2], ["degradation", 2],
  ],
  security: [
    ["encrypt", 3], ["encryption", 3], ["credential", 3], ["authentication", 3],
    ["multi-factor", 3], ["penetration test", 3], ["threat", 2], ["secure", 2],
    ["session token", 3], ["vulnerability", 3], ["perimeter", 2],
    ["access", 1], ["password", 3], ["key", 1], ["breach", 2],
  ],
  compliance: [
    ["regulat", 3], ["aml", 3], ["kyc", 3], ["sanctions", 3], ["money laundering", 3],
    ["politically exposed", 3], ["audit trail", 3], ["retention", 2], ["retained", 2],
    // "illegal" is listed in its own right: anchoring means "legal" no longer
    // reaches inside it, and an obligation about illegal payments is as much a
    // compliance statement as one about legal ones.
    ["statutory", 3], ["policy", 1], ["wcag", 2], ["legal", 2], ["illegal", 2], ["supervis", 2],
    ["financial crime", 3], ["screening", 2], ["data protection", 3], ["gdpr", 3],
    ["records", 1], ["disposal", 2], ["consent", 2],
  ],
  operational: [
    ["runbook", 3], ["on-call", 3], ["alert", 3], ["monitoring", 3], ["observability", 3],
    ["maintenance window", 3], ["recovery time", 3], ["recovery point", 3],
    ["incident", 2], ["availability", 2], ["support", 2], ["metrics", 2],
    ["dashboards", 1], ["planned maintenance", 3], ["restoration", 2],
  ],
  ux: [
    ["accessib", 3], ["wcag", 3], ["usable", 3], ["easy to use", 3], ["screen reader", 3],
    ["plain language", 3], ["journey", 2], ["interface", 2], ["mobile browser", 2],
    ["abandon", 2], ["customer experience", 2], ["welsh", 2], ["design", 1],
    ["resume", 1],
  ],
  technical: [
    ["integrat", 3], ["api", 2], ["service bus", 3], ["event", 2], ["deploy", 2],
    ["availability zone", 3], ["tenancy", 2], ["architecture", 2], ["schema", 2],
    ["endpoint", 2], ["core banking", 2], ["publish", 1], ["vendor", 1],
  ],
  business: [
    ["commission", 3], ["revenue", 3], ["benefit", 3], ["cost", 2], ["budget", 3],
    ["conversion", 2], ["volume", 2], ["management information", 3], ["commercial", 2],
    ["market", 2], ["introducer", 2], ["broker", 2], ["growth", 2], ["payback", 3],
  ],
  non_functional: [
    ["availability", 2], ["reliab", 3], ["maintainab", 3], ["portab", 3],
    ["scalab", 3], ["resilien", 3], ["durab", 2],
  ],
  functional: [
    ["must be able to", 2], ["must allow", 3], ["must provide", 2], ["must support", 2],
    ["must show", 3], ["must display", 3], ["must record", 2], ["must calculate", 3],
    ["must validate", 3], ["submit", 2], ["pre-fill", 3], ["override", 2],
    ["dashboard", 2], ["status", 1], ["application", 1], ["customer", 1],
  ],
};

/**
 * Cues whose prefix form collides with a longer, unrelated word, spelled out as
 * explicit whole-word inflections instead.
 *
 * Start-anchoring cannot help where the cue *is* the prefix of the colliding
 * word, and measured inside extracted statements each of these produced a real
 * misclassification: "design" matched "designated" x3 and "designee" x1 - dense
 * procurement vocabulary - labelling two submission-deadline clauses ux;
 * "event" matched "eventual", labelling a public-inspection clause technical;
 * "sustain" matched "sustainable", labelling a double-sided-printing clause
 * performance. "access" is here for a second reason as well: as a prefix it
 * also fires on "accessibility", which the ux cue "accessib" already scores, so
 * one word scored 4 across two classes and inflated the margin that feeds
 * confidence.
 *
 * Every other cue keeps prefix matching, because it genuinely relies on it for
 * inflections ("integrat" -> "integration", "submit" -> "submitted" x21).
 */
const WHOLE_WORD_CUES: Record<string, string[]> = {
  access: ["access", "accesses", "accessed", "accessing"],
  design: ["design", "designs", "designed", "designing"],
  event: ["event", "events"],
  sustain: ["sustain", "sustains", "sustained", "sustaining"],
};

const escapeCue = (cue: string): string => cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One pattern per cue, compiled once at module load. */
const CUE_PATTERNS = new Map<string, RegExp>(
  Object.values(CLASS_CUES)
    .flat()
    .map(([cue]) => {
      const inflections = WHOLE_WORD_CUES[cue];
      return [
        cue,
        inflections
          ? new RegExp(`\\b(?:${inflections.map(escapeCue).join("|")})\\b`, "i")
          : new RegExp(`\\b${escapeCue(cue)}`, "i"),
      ] as const;
    }),
);

export interface Classification {
  type: RequirementType;
  /** 0-1 separation between the winner and runner-up, used for confidence. */
  margin: number;
  /** Human-readable cue list, shown in the UI as "why this label". */
  evidence: string;
}

/**
 * Scores a statement against every class and returns the best.
 *
 * Ties break toward `functional`, which is the honest default: a statement that
 * matched nothing specific is a plain capability statement, not a mystery.
 */
export function classifyRequirement(statement: string): Classification {
  const scores = new Map<RequirementType, number>();
  const hits = new Map<RequirementType, string[]>();

  for (const [type, cues] of Object.entries(CLASS_CUES) as Array<[RequirementType, Array<[string, number]>]>) {
    let score = 0;
    const matched: string[] = [];
    for (const [cue, weight] of cues) {
      if (CUE_PATTERNS.get(cue)?.test(statement)) {
        score += weight;
        matched.push(cue);
      }
    }
    if (score > 0) {
      scores.set(type, score);
      hits.set(type, matched);
    }
  }

  // A quantified statement is far more likely to be a measurable non-functional
  // characteristic than a plain capability, so nudge the specific classes up.
  const quantities = extractQuantities(statement);
  if (quantities.some((q) => q.dimension === "duration" || q.dimension === "percent")) {
    for (const type of ["performance", "operational"] as const) {
      if (scores.has(type)) scores.set(type, (scores.get(type) ?? 0) + 1.5);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) {
    return {
      type: "functional",
      margin: 0,
      evidence: "No class-specific terminology matched; defaulted to Functional.",
    };
  }

  const runnerUp = ranked[1]?.[1] ?? 0;
  const margin = top[1] === 0 ? 0 : (top[1] - runnerUp) / top[1];
  const matched = hits.get(top[0]) ?? [];
  return {
    type: top[0],
    margin,
    evidence: `Matched ${matched.length} ${top[0]} term${matched.length === 1 ? "" : "s"}: ${matched
      .slice(0, 5)
      .map((t) => `"${t}"`)
      .join(", ")}.`,
  };
}

/**
 * MoSCoW priority from the modal verb actually used.
 *
 * Requirements engineering convention (and IEEE 830 / ISO 29148 practice) is
 * that "shall/must" is binding and "should" is not. Reading the modal rather
 * than guessing importance keeps the register defensible in a review.
 */
export function classifyPriority(statement: string): { priority: Priority; evidence: string } {
  const text = statement.toLowerCase();
  if (/\b(must not|shall not|may not|will not)\b/.test(text)) {
    return { priority: "must", evidence: 'Prohibitive modal ("must not") - binding constraint.' };
  }
  if (/\b(must|shall|is required to|are required to|has to|have to)\b/.test(text)) {
    return { priority: "must", evidence: 'Binding modal ("must"/"shall") per ISO 29148.' };
  }
  if (/\b(should|ought to|is expected to)\b/.test(text)) {
    return { priority: "should", evidence: 'Recommendation modal ("should") - desirable, not binding.' };
  }
  if (/\b(could|may|might|would like|nice to have)\b/.test(text)) {
    return { priority: "could", evidence: 'Optional modal ("may"/"could") - discretionary.' };
  }
  if (/\b(out of scope|will not be|excluded)\b/.test(text)) {
    return { priority: "wont", evidence: "Explicit exclusion language." };
  }
  return { priority: "should", evidence: "No explicit modal; defaulted to Should have pending review." };
}
