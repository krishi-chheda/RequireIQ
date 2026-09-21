import { describe, expect, it } from "vitest";
import { classifyBindsOn } from "./binds-on";

describe("classifyBindsOn", () => {
  it.each([
    ["The solution shall support records management and retention.", "system"],
    ["The platform must achieve 99.99% availability measured monthly.", "system"],
    ["The system must encrypt all personal data at rest and in transit.", "system"],
    ["Proposals shall be submitted by 2:00PM on Friday 7 August.", "bidder"],
    ["Respondents shall not contact other City staff with any questions.", "bidder"],
    ["The offeror must be registered to do business in the State of New Mexico.", "bidder"],
    ["Contractor shall submit evidence of insurance as is required herein.", "supplier"],
    ["The successful Offeror shall provide implementation and training services.", "supplier"],
    ["The City will provide test data within ten working days of contract award.", "buyer"],
    ["The County shall evaluate proposals against the published criteria.", "buyer"],
  ])("reads %j as binding the %s", (statement, expected) => {
    expect(classifyBindsOn(statement).bindsOn).toBe(expected);
  });

  it("returns unknown rather than guessing when no actor is identifiable", () => {
    // Honest outcome, not a fallback: this surfaces for review instead of
    // silently discarding a real obligation, which is what the old
    // domain-noun filter did to most of what the two sample RFPs yield
    // (measured in docs/analysis-engine.md section 7).
    const result = classifyBindsOn("It shall be completed in a timely manner.");
    expect(result.bindsOn).toBe("unknown");
  });

  it("always explains itself, so a reviewer can disagree with the label", () => {
    const result = classifyBindsOn("The solution shall support single sign-on.");
    expect(result.evidence.length).toBeGreaterThan(10);
    expect(result.evidence.toLowerCase()).toContain("solution");
  });

  it("prefers the grammatical subject over a noun mentioned later", () => {
    // The sentence binds the supplier even though it mentions the system.
    const result = classifyBindsOn("The Contractor shall configure the system before go-live.");
    expect(result.bindsOn).toBe("supplier");
  });

  it("does not read governing-law boilerplate as binding the buyer", () => {
    // "the State of New Mexico" is jurisdiction boilerplate, not an obligation
    // on a government buyer named "the State". Measured against two real RFPs:
    // of the 7 obligation-shaped sentences containing "the state" (extracted,
    // constraint or rejected), every one was jurisdiction or governing-law
    // boilerplate and none was a genuine buyer obligation.
    const result = classifyBindsOn(
      "This Agreement shall be governed by the laws of the State of New Mexico."
    );
    expect(result.bindsOn).not.toBe("buyer");
  });

  it("does not read a client-side system noun as binding the buyer", () => {
    // "the client application/portal/device" is standard IT-RFP phrasing for
    // the system side; matching it as buyer would invert the accountability.
    const result = classifyBindsOn("The client device must support biometric authentication.");
    expect(result.bindsOn).not.toBe("buyer");
  });

  it.each([
    // The article-free cue matches only in subject position. "Earliest cue
    // wins" stands in for "grammatical subject", and a bare noun also turns up
    // early as a modifier, an object or a possessive, where it names what the
    // clause is about rather than who it binds.
    "The use of any and all City property by Selected Respondent or its agents must be approved.",
    "Said policies of insurance shall include coverage for all operations performed for County by Contractor.",
    "County's Proposals need to be submitted electronically via Dropbox at the link provided.",
    "Santa Fe County must be a named an additional insured on the Contractor's policy.",
  ])("does not read the buyer as the subject of %j", (statement) => {
    expect(classifyBindsOn(statement).bindsOn).not.toBe("buyer");
  });

  it.each([
    "City will not open email submittal of the Proposal Response prior to submission deadline.",
    "County personnel will not merge, collate, or assemble proposal materials.",
    "The Evaluation Committee will reject the proposal of any offeror who fails to comply.",
    "The Procurement Specialist will schedule the time for each offeror presentation.",
  ])("still reads %j as binding the buyer", (statement) => {
    expect(classifyBindsOn(statement).bindsOn).toBe("buyer");
  });

  it("does not read the contractor's services as the system", () => {
    // Throughout a real county contract "the services" means the Contractor's
    // services, so the system cue "the service" declines its own plural.
    const result = classifyBindsOn(
      "The services in section 1 (Contractor's Services) must be performed by the Contractor.",
    );
    expect(result.bindsOn).toBe("supplier");
    expect(classifyBindsOn("The service must be available 99.9% of the time.").bindsOn).toBe("system");
  });

  it.each([
    ["Vendors shall provide three references upon request.", "supplier"],
    ["Suppliers shall maintain liability insurance of at least $1,000,000.", "supplier"],
  ])("reads the plural form %j the same as the singular", (statement, expected) => {
    // Contractor/respondent/offeror/proposer/bidder already match bare, so
    // their plurals worked. "the vendor" and "the supplier" required the
    // article, so "Vendors shall..." fell through to unknown - inconsistent
    // with their siblings for no reason.
    expect(classifyBindsOn(statement).bindsOn).toBe(expected);
  });
});
