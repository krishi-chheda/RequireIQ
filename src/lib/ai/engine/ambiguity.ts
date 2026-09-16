import type { AmbiguityKind, Severity } from "@/lib/types";
import { extractQuantities } from "./text";

/**
 * Requirement quality analysis.
 *
 * Each finding names the exact span that triggered it, explains the problem in
 * the vocabulary a business analyst uses, and proposes a measurable rewrite.
 * The rewrite is always labelled as a suggestion - the product never edits a
 * requirement on its own.
 */

export interface AmbiguityFinding {
  kind: AmbiguityKind;
  severity: Severity;
  span: string;
  spanStart: number;
  spanEnd: number;
  explanation: string;
  suggestion: string;
}

/**
 * Vague terms with the measurable dimension each one fails to specify.
 * Drawn from the classic requirements-smell lists (ISO/IEC/IEEE 29148 s5.2.5
 * calls these out as failures of the "verifiable" and "unambiguous" criteria).
 */
const VAGUE_TERMS: Array<{ term: string; missing: string; example: string; severity: Severity }> = [
  { term: "fast", missing: "a latency threshold", example: "return 95% of API responses within 500ms under normal operating load", severity: "high" },
  { term: "quick", missing: "a latency threshold", example: "complete within 2 seconds at the 95th percentile", severity: "high" },
  { term: "slow", missing: "a latency threshold", example: "exceed 3 seconds at the 95th percentile", severity: "medium" },
  { term: "instant", missing: "a latency threshold", example: "render within 300ms of the request", severity: "high" },
  { term: "real-time", missing: "a maximum acceptable delay", example: "propagate within 5 seconds of the source event", severity: "high" },
  { term: "real time", missing: "a maximum acceptable delay", example: "propagate within 5 seconds of the source event", severity: "high" },
  { term: "easy to use", missing: "a measurable usability outcome", example: "allow 90% of first-time users to complete the journey unaided in usability testing", severity: "high" },
  { term: "user-friendly", missing: "a measurable usability outcome", example: "achieve a System Usability Scale score of at least 75", severity: "high" },
  { term: "intuitive", missing: "a measurable usability outcome", example: "allow 90% of first-time users to complete the task without help", severity: "medium" },
  { term: "high availability", missing: "an availability percentage and measurement window", example: "achieve 99.99% availability measured monthly, excluding planned maintenance", severity: "high" },
  { term: "highly available", missing: "an availability percentage and measurement window", example: "achieve 99.99% availability measured monthly", severity: "high" },
  { term: "secure", missing: "a control standard and verification method", example: "encrypt data at rest with AES-256 and pass an independent penetration test with no outstanding critical or high findings", severity: "high" },
  { term: "industry standard", missing: "the named standard", example: "conform to NIST SP 800-63B", severity: "high" },
  { term: "best practice", missing: "the named standard", example: "conform to the OWASP Application Security Verification Standard level 2", severity: "medium" },
  { term: "state of the art", missing: "the named standard", example: "conform to the named standard applicable at contract signature", severity: "medium" },
  { term: "robust", missing: "a failure-mode tolerance", example: "continue to serve reads during the loss of a single availability zone", severity: "medium" },
  { term: "scalable", missing: "a target load and scaling mechanism", example: "sustain 10,000 concurrent sessions by horizontal scaling without a service interruption", severity: "medium" },
  { term: "reliable", missing: "an error-rate or availability figure", example: "keep the submission failure rate below 0.5% over a rolling 24 hours", severity: "medium" },
  { term: "flexible", missing: "the dimension of variation required", example: "support new document types through configuration without a code change", severity: "low" },
  { term: "modern", missing: "an objective criterion", example: "meet the bank's current front-end technology standard TS-014", severity: "low" },
  { term: "reassuring", missing: "an objective criterion", example: "achieve a post-journey confidence score of at least 4 of 5", severity: "low" },
  { term: "seamless", missing: "an objective criterion", example: "require no re-authentication when moving between journey steps", severity: "low" },
  { term: "as needed", missing: "the triggering condition", example: "when the queue depth exceeds 500 items", severity: "medium" },
  { term: "as appropriate", missing: "the triggering condition", example: "when the applicant's risk score exceeds 70", severity: "medium" },
  { term: "where possible", missing: "the condition under which it does not apply", example: "except where the applicant has no digital identity record", severity: "medium" },
  { term: "sufficient", missing: "the quantity required", example: "at least 30% headroom above forecast peak", severity: "medium" },
  { term: "adequate", missing: "the quantity required", example: "at least 30% headroom above forecast peak", severity: "medium" },
  { term: "minimal", missing: "an upper bound", example: "no more than 2 manual steps", severity: "low" },
  { term: "significant", missing: "a threshold", example: "greater than 10% of daily volume", severity: "low" },
  { term: "regularly", missing: "a frequency", example: "every 24 hours", severity: "medium" },
  { term: "periodically", missing: "a frequency", example: "every 24 hours", severity: "medium" },
  { term: "immediately", missing: "a maximum elapsed time", example: "within 30 seconds", severity: "medium" },
  { term: "as soon as possible", missing: "a maximum elapsed time", example: "within 30 seconds", severity: "medium" },
  { term: "necessary", missing: "the objective test for necessity", example: "no longer than 24 hours after the verification outcome is recorded", severity: "medium" },
  { term: "appropriate", missing: "the objective criterion", example: "matching the control set in policy MB-IS-002", severity: "low" },
  { term: "etc", missing: "the full enumeration", example: "the complete list of document types in appendix B", severity: "medium" },
  { term: "and so on", missing: "the full enumeration", example: "the complete list in appendix B", severity: "medium" },
];

/** Pronoun subjects that leave the responsible actor unstated. */
const WEAK_SUBJECTS = /^(it|this|that|they|we|there|things?|somebody|someone)\b/i;

/** A requirement doing two jobs is a requirement that cannot be signed off once. */
const COMPOUND_JOINERS = /\band also\b|\bas well as\b|;\s*(?:the|it|and)\b/i;

/**
 * Reported speech: "Tom flagged that the status must not reveal...".
 *
 * These carry a genuine obligation, so rejecting them would lose a real
 * requirement. But a register that reads "Tom flagged that..." is not one you
 * hand a client. The statement is kept verbatim - the extraction contract is
 * that a register entry exists word-for-word in a document - and the reviewer
 * is told to restate it directly.
 */
const REPORTED_SPEECH =
  /^s*(?:[A-Z][a-z]+(?:s+[A-Z][a-z]+)?|He|She|They|We|Somebody|Someone)s+(?:flagged|noted|said|confirmed|mentioned|raised|observed|stated|added|asked|explained|commented|reported|indicated)s+(?:that|whether)/;

const ASSUMPTION_MARKERS = /\bit is assumed\b|\bwe assume\b|\bassuming\b|\bpresumably\b|\bshould be fine\b|\bexpected to be\b/i;

const MEASURABILITY_CUES = ["within", "at least", "no more than", "must not exceed", "percentile", "%", "per hour", "per second", "measured"];

/**
 * Runs every quality check over one requirement statement.
 *
 * Findings are ordered by severity so the UI can lead with what matters.
 */
export function analyseAmbiguity(statement: string): AmbiguityFinding[] {
  const findings: AmbiguityFinding[] = [];
  const lower = statement.toLowerCase();

  // 1. Vague terminology, matched on word boundaries so "secure" does not fire
  //    inside "securely obtained" false-positives like "insecure".
  for (const entry of VAGUE_TERMS) {
    const index = findTerm(lower, entry.term);
    if (index === -1) continue;
    // "secure"/"necessary" are only vague when they are the requirement's test.
    if ((entry.term === "secure" || entry.term === "necessary") && hasMeasurableClause(lower)) continue;
    findings.push({
      kind: "vague_term",
      severity: entry.severity,
      span: statement.slice(index, index + entry.term.length),
      spanStart: index,
      spanEnd: index + entry.term.length,
      explanation: `The phrase "${entry.term}" states an intent without ${entry.missing}, so two reviewers can agree the requirement is met and disagree about what was built. ISO/IEC/IEEE 29148 requires each requirement to be verifiable.`,
      suggestion: `Replace with a measurable clause, for example: "${entry.example}".`,
    });
  }

  // 2. An obligation with no number and no objective test at all.
  const quantities = extractQuantities(statement);
  if (quantities.length === 0 && !hasMeasurableClause(lower) && findings.length === 0) {
    findings.push({
      kind: "unquantified",
      severity: "medium",
      span: statement,
      spanStart: 0,
      spanEnd: statement.length,
      explanation:
        "The statement carries an obligation but no threshold, count, duration or objective test, so there is nothing for a test case to assert against.",
      suggestion:
        "Add the condition and the measurable outcome, in the form: given <condition>, the system must <behaviour> within <threshold>.",
    });
  }

  // 3. Missing acceptance criteria on a binding requirement.
  if (/\b(must|shall)\b/i.test(statement) && !hasMeasurableClause(lower) && quantities.length === 0) {
    findings.push({
      kind: "missing_acceptance_criteria",
      severity: "high",
      span: statement,
      spanStart: 0,
      spanEnd: statement.length,
      explanation:
        "This is a binding (must) requirement with no stated acceptance criteria. It cannot be accepted or rejected at UAT without a reviewer inventing the test at the time.",
      suggestion:
        "Define the acceptance test with the business owner before build, and record it against this requirement.",
    });
  }

  // 4. Undefined actor.
  if (WEAK_SUBJECTS.test(statement.trim())) {
    const subject = statement.trim().split(/\s+/)[0] ?? "";
    findings.push({
      kind: "undefined_actor",
      severity: "medium",
      span: subject,
      spanStart: statement.indexOf(subject),
      spanEnd: statement.indexOf(subject) + subject.length,
      explanation: `The subject "${subject}" does not name the component or role responsible, so the requirement cannot be allocated to a team.`,
      suggestion: `Name the actor explicitly, for example "The onboarding service must ..." or "A branch colleague must be able to ...".`,
    });
  }

  // 5. Compound requirement.
  const compound = COMPOUND_JOINERS.exec(statement);
  if (compound) {
    findings.push({
      kind: "compound_requirement",
      severity: "low",
      span: compound[0],
      spanStart: compound.index,
      spanEnd: compound.index + compound[0].length,
      explanation:
        "The statement bundles more than one obligation, so it cannot be partially accepted, estimated separately, or traced to a single test case.",
      suggestion: "Split into one requirement per obligation and link them with a depends-on relationship.",
    });
  }

  // 6. Unverified assumption stated as fact.
  const assumption = ASSUMPTION_MARKERS.exec(statement);
  if (assumption) {
    findings.push({
      kind: "unverified_assumption",
      severity: "high",
      span: assumption[0],
      spanStart: assumption.index,
      spanEnd: assumption.index + assumption[0].length,
      explanation:
        "The statement rests on an assumption that has not been verified against a source. If the assumption is wrong the dependent design work is wasted.",
      suggestion: "Assign an owner to verify the assumption and record the evidence, or convert it into an explicit risk.",
    });
  }

  // 7. An obligation narrated rather than stated.
  const reported = REPORTED_SPEECH.exec(statement);
  if (reported) {
    findings.push({
      kind: "reported_speech",
      severity: "medium",
      span: reported[0].trim(),
      spanStart: reported.index + (reported[0].length - reported[0].trimStart().length),
      spanEnd: reported.index + reported[0].length,
      explanation:
        "The obligation is reported as something a person said rather than stated as a requirement. It cannot go into a client-facing register in this form, and the reporting clause hides who the requirement is actually binding on.",
      suggestion:
        'Restate it directly, in the form "The <component> must <behaviour>", and record the person who raised it as the business owner rather than leaving them inside the sentence.',
    });
  }

  return findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function findTerm(lowerText: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?<![a-z])${escaped}(?![a-z])`).exec(lowerText);
  return match ? match.index : -1;
}

function hasMeasurableClause(lowerText: string): boolean {
  return MEASURABILITY_CUES.some((cue) => lowerText.includes(cue));
}

function severityRank(severity: Severity): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[severity];
}

/**
 * A 0-1 quality score derived from the findings, used for register-level
 * sorting and the project health figure. High severity costs more than low, and
 * the score is a deduction from 1 rather than a mysterious model output - a
 * reviewer can reconstruct it from the findings list.
 */
export function qualityScore(findings: AmbiguityFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    return total + { low: 0.05, medium: 0.12, high: 0.22, critical: 0.35 }[finding.severity];
  }, 0);
  return Number(Math.max(0, 1 - penalty).toFixed(2));
}
