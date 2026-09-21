import { describe, expect, it } from "vitest";
import { classifyPriority, classifyRequirement } from "./classify";

describe("classifyRequirement", () => {
  it.each([
    ["The solution shall support 2,000 concurrent users at peak load.", "performance"],
    ["The system must encrypt all credentials at rest.", "security"],
    ["The platform shall maintain an audit trail for every screening decision.", "compliance"],
    ["The service shall page the on-call engineer when an alert fires.", "operational"],
    ["The journey must meet WCAG 2.2 AA for every screen reader.", "ux"],
    ["The integration shall publish an event to the service bus.", "technical"],
    ["The programme must deliver the revenue benefit within the budget.", "business"],
  ])("reads %j as %s", (statement, expected) => {
    expect(classifyRequirement(statement).type).toBe(expected);
  });

  it("defaults to functional with no margin when nothing specific matches", () => {
    const result = classifyRequirement("The widget shall be blue.");
    expect(result.type).toBe("functional");
    expect(result.margin).toBe(0);
    expect(result.evidence).toContain("defaulted");
  });

  /**
   * Cues are anchored at a word start, so they cannot fire from inside an
   * unrelated word. Each case below was a measured misclassification under the
   * plain substring matching this replaced - the same defect class as the
   * DOMAIN_NOUNS "bid"/"firm" collision - and each one names the cue and the
   * word that was swallowing it.
   */
  it.each([
    ['"load" inside "uploaded"', "The system should retain the applicant's uploaded documents for later.", "performance"],
    ['"load" inside "downloading"', "Solicitation packages can be obtained by downloading from the City website.", "performance"],
    ['"peak" inside "speaker"', "Offerors shall describe any speaker identification the product provides.", "performance"],
    ['"aml" inside "seamless"', "The successful Offeror shall provide a seamless transition to the new product.", "compliance"],
    ['"api" inside "capital"', "Any spend above that threshold requires a separate capital request.", "technical"],
    ['"event" inside "prevent"', "The time of completion shall be extended where the delay did not prevent the work.", "technical"],
  ])("does not classify on %s", (_case, statement, wrongType) => {
    expect(classifyRequirement(statement).type).not.toBe(wrongType);
  });

  /**
   * Start-anchoring cannot help where the cue *is* the prefix of the colliding
   * word. Each case below was a measured misclassification inside a statement
   * the extractor actually registered, and each cue is now spelled out as
   * explicit whole-word inflections.
   */
  it.each([
    ['"design" inside "designated"', "It shall be the Respondent's sole risk to assure submission by the designated time.", "ux"],
    ['"design" inside "designee"', "All offeror proposals must be received by the Procurement Manager or designee.", "ux"],
    ['"event" inside "eventual"', "Confidential data shall be separable from the proposal to facilitate eventual public inspection.", "technical"],
    ['"comprehen" inside "comprehensive"', "Contractor shall maintain a comprehensive general liability insurance policy.", "ux"],
    ['"sustain" inside "sustainable"', "All submitted proposal documents shall be double-sided, adopting Sustainable Resource Management.", "performance"],
  ])("does not classify on %s", (_case, statement, wrongType) => {
    expect(classifyRequirement(statement).type).not.toBe(wrongType);
  });

  it("scores accessibility once, not once per class", () => {
    // "accessibility" used to hit the ux cue "accessib" (3) and the security
    // cue "access" (1), so one word scored 4 across two classes and widened the
    // margin that feeds confidence. Only ux should see it now.
    const result = classifyRequirement("The portal shall preserve public accessibility of every record.");
    expect(result.type).toBe("ux");
    expect(result.evidence).not.toContain('"access"');
  });

  it("still matches an inflection of a cue, which is why whole-word matching was wrong", () => {
    // "record" -> "records", "integrat" -> "integration", "event" -> "events".
    expect(classifyRequirement("The platform shall keep records of every disposal.").type).toBe("compliance");
    expect(classifyRequirement("The integration shall expose an endpoint per tenancy.").type).toBe("technical");
  });
});

describe("classifyPriority", () => {
  it.each([
    ["The system shall encrypt the data.", "must"],
    ["The system must not expose the key.", "must"],
    ["The system should log the attempt.", "should"],
    ["The system may cache the response.", "could"],
    ["That capability is out of scope for this release.", "wont"],
  ])("reads %j as %s", (statement, expected) => {
    expect(classifyPriority(statement).priority).toBe(expected);
  });

  it("does not read a modal out of a word that merely contains one", () => {
    // "mustard", "shallow" and "coulder" are not modals. The patterns are
    // word-bounded; this is the test that keeps them that way.
    const result = classifyPriority("The canteen menu lists mustard in a shallow dish.");
    expect(result.priority).toBe("should");
    expect(result.evidence).toContain("No explicit modal");
  });
});
