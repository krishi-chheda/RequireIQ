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
    // domain-noun filter did to 132 of them.
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
    // 4 of 6 sentences containing "the state" were this pattern, none were a
    // genuine buyer obligation.
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
