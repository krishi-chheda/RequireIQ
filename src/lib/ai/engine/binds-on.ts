/**
 * Who an obligation binds.
 *
 * A dimension orthogonal to requirement type, not an extension of it: a
 * security obligation on the supplier and one on the system are both security.
 *
 * This replaces the domain-noun rejection filter. That filter asked "does this
 * sentence contain a word I recognise?", which is a vocabulary list that will
 * never be complete - it rejected 132 genuine obligations from two RFPs, every
 * one for the same reason. The question here is "can I identify who this
 * binds?", and `unknown` is a designed answer that surfaces for review.
 */

export type BindsOn = "system" | "supplier" | "bidder" | "buyer" | "unknown";

export const BINDS_ON_LABEL: Record<BindsOn, string> = {
  system: "The system",
  supplier: "The supplier",
  bidder: "The bidder",
  buyer: "The buyer",
  unknown: "Unidentified actor",
};

/**
 * Ordered: the first group whose cue appears earliest in the sentence wins.
 *
 * `documents` are cues that name a *thing* belonging to an actor rather than
 * the actor: a proposal is the bidder's, so "Proposals must be submitted by
 * 3pm" binds the bidder. They classify, but they cannot commit - only a person
 * or an institution can - so `AGENT_SUBJECT` leaves them out.
 *
 * Two sigils on a cue string, read by `cueRegExp`:
 *   `^term`  matches only at the start of the statement (subject position).
 *   `term$`  matches the word exactly, refusing its inflections.
 */
const CUES: Array<{ bindsOn: BindsOn; terms: string[]; documents?: string[] }> = [
  {
    bindsOn: "supplier",
    terms: [
      "successful offeror", "selected respondent", "successful respondent",
      "awarded vendor", "successful proposer", "contractor", "supplier",
      "vendor", "service provider", "the awarded",
    ],
  },
  {
    bindsOn: "bidder",
    terms: ["respondent", "offeror", "proposer", "bidder", "tenderer", "applicant firm"],
    documents: ["proposal", "proposals", "submission", "the bid", "bids"],
  },
  {
    bindsOn: "buyer",
    terms: [
      // "the state" and "the client" dropped: measured against two real RFPs,
      // "the state" was governing-law boilerplate ("...laws of the State of
      // New Mexico") in every case that matched, never a genuine buyer
      // obligation - "the city"/"the county"/"the authority"/"the agency"/
      // "the department" already cover government buyers. "the client" would
      // catch "the client application/portal/device", standard IT-RFP phrasing
      // for the system side, inverting the accountability; "the purchaser"
      // and the government cues already cover the buyer role.
      //
      // Named officers and standing committees act for the buyer as surely as
      // the institution does, and the list had none of them: six genuine buyer
      // commitments ("The Evaluation Committee will reject the proposal of any
      // offeror ...", "The Procurement Specialist will schedule the time for
      // each offeror presentation.", "County personnel will not merge,
      // collate, or assemble proposal materials.") were dropped for want of an
      // identifiable actor.
      "evaluation committee", "evaluation team", "procurement specialist",
      "procurement manager", "purchasing division", "county personnel",
      "county staff", "city staff", "it department staff",
      // The article is not always written ("City will not open email submittal
      // of the Proposal Response ..."), so these two also match bare - but only
      // in subject position. "Earliest cue wins" stands in for "grammatical
      // subject", and that stood while the cue required `the `; a bare noun
      // also appears early as a modifier or an object, where it names what the
      // clause is *about* rather than who it binds. Measured, four clauses were
      // misassigned to the buyer that way ("The use of any and all City
      // property by Selected Respondent ... must be approved", "... coverage
      // for all operations performed for County by Contractor", "County's
      // Proposals need to be submitted electronically via Dropbox", "Santa Fe
      // County must be a named an additional insured on the Contractor's
      // policy"), and the possessive is the same error one word later, so the
      // anchored form declines it too.
      "the city", "the county", "^city", "^county",
      "the authority", "the agency", "the department",
      "the purchaser", "the bank", "the buyer",
    ],
  },
  {
    bindsOn: "system",
    terms: [
      // "the service$" declines its own plural on purpose: throughout a real
      // county contract "the services" means the Contractor's services ("The
      // services in section 1 (Contractor's Services) must be performed by the
      // Contractor ..."), which is a supplier obligation, not a system one.
      "the system", "the platform", "the solution", "the service$",
      "the application", "the software", "the product", "the interface",
      "the onboarding journey", "the portal",
    ],
  },
];

/**
 * The sentence-subject test for a cue naming an actor who can *make* a commitment.
 *
 * Exported so the extractor's commitment-modal guard ("The County will ..." is
 * an obligation, "A final budget will ..." is narrative) can ask the same
 * question this file answers, instead of carrying a second copy of the list
 * that would drift away from it.
 *
 * The document cues are excluded on purpose. A document is not an agent, and
 * including them let the guard through announcements that are not obligations
 * at all - "A Pre-Proposal Conference will be held Tuesday, July 14, 2026 ...",
 * "Request for Proposals will be available by contacting ...".
 */
export const AGENT_SUBJECT = new RegExp(
  `\\b(?:${CUES.flatMap((group) => group.terms)
    .map((term) => literal(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "i",
);

/**
 * Every cue, agents and documents alike, each anchored at a word start.
 *
 * Anchored at the start only, not both ends: a cue has to earn its inflections
 * ("contractor" -> "contractors", "respondent" -> "respondents") but must not
 * be allowed to surface in the middle of an unrelated word. That matters as
 * soon as a cue is short and article-free - plain substring matching finds
 * "city" inside "capacity", "electricity" and "publicity", which would label
 * every throughput requirement in the demo corpus a buyer obligation.
 */
/** The cue word itself, with any sigil removed. */
function literal(term: string): string {
  return term.replace(/^\^/, "").replace(/\$$/, "");
}

function cueRegExp(term: string): RegExp {
  const subjectOnly = term.startsWith("^");
  const wholeWord = term.endsWith("$");
  const body = literal(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A possessive is a modifier, never the subject: "County's Proposals need to
  // be submitted ..." binds whoever submits them, not the County.
  const head = subjectOnly ? "^" : "\\b";
  const tail = `${wholeWord ? "\\b" : ""}${subjectOnly ? "(?!['’]s)\\b" : ""}`;
  return new RegExp(`${head}${body}${tail}`, "i");
}

const ALL_CUES = CUES.map((group) => ({
  bindsOn: group.bindsOn,
  terms: [...group.terms, ...(group.documents ?? [])].map((term) => ({
    term: literal(term),
    re: cueRegExp(term),
  })),
}));

export function classifyBindsOn(statement: string): { bindsOn: BindsOn; evidence: string } {
  const lower = statement.toLowerCase();

  // Earliest cue wins, because the grammatical subject comes first: "The
  // Contractor shall configure the system" binds the supplier, not the system.
  let best: { bindsOn: BindsOn; term: string; index: number } | null = null;

  for (const group of ALL_CUES) {
    for (const { term, re } of group.terms) {
      const index = lower.search(re);
      if (index === -1) continue;
      if (!best || index < best.index) best = { bindsOn: group.bindsOn, term, index };
    }
  }

  if (!best) {
    return {
      bindsOn: "unknown",
      evidence:
        "No actor could be identified from the statement. It carries an obligation but does not say who is bound by it.",
    };
  }

  return {
    bindsOn: best.bindsOn,
    evidence: `Matched "${best.term}" as the earliest actor in the statement.`,
  };
}
