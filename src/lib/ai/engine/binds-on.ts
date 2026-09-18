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

/** Ordered: the first group whose cue appears earliest in the sentence wins. */
const CUES: Array<{ bindsOn: BindsOn; terms: string[] }> = [
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
    terms: [
      "respondent", "offeror", "proposer", "bidder", "tenderer", "proposal",
      "proposals", "submission", "the bid", "bids", "applicant firm",
    ],
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
      "the city", "the county", "the authority", "the agency", "the department",
      "the purchaser", "the bank", "the buyer",
    ],
  },
  {
    bindsOn: "system",
    terms: [
      "the system", "the platform", "the solution", "the service",
      "the application", "the software", "the product", "the interface",
      "the onboarding journey", "the portal",
    ],
  },
];

export function classifyBindsOn(statement: string): { bindsOn: BindsOn; evidence: string } {
  const lower = statement.toLowerCase();

  // Earliest cue wins, because the grammatical subject comes first: "The
  // Contractor shall configure the system" binds the supplier, not the system.
  let best: { bindsOn: BindsOn; term: string; index: number } | null = null;

  for (const group of CUES) {
    for (const term of group.terms) {
      const index = lower.indexOf(term);
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
