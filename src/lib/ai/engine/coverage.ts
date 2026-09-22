import type { RelationshipKind, RequirementType, Severity } from "@/lib/types";
import { buildSimilarityIndex, topPairs } from "./similarity";

/**
 * Coverage gap detection and relationship inference.
 *
 * Gap detection answers the hardest question in discovery: not "is this
 * requirement wrong" but "what did nobody say". It works by checklist rather
 * than by generation, because a generated list of missing requirements is
 * indistinguishable from invention. Every gap below is a topic a comparable
 * regulated-delivery engagement carries; the detector only reports one when the
 * project has clearly entered that territory and then said nothing about it.
 */

interface CoverageRule {
  area: string;
  /** The project must touch at least one of these for the rule to apply. */
  trigger: string[];
  /** Any one of these counts as covered. */
  satisfied: string[];
  expectation: string;
  reason: string;
  severity: Severity;
}

const COVERAGE_RULES: CoverageRule[] = [
  {
    area: "Failure behaviour of external dependencies",
    trigger: ["screening", "vendor", "integrat", "service bus", "core banking"],
    satisfied: ["unavailable", "timeout", "time out", "retry", "fallback", "degraded", "circuit breaker", "outage"],
    expectation:
      "A requirement stating what the platform does when an external dependency is unavailable or times out.",
    reason:
      "The register commits to external screening and core banking integration but never states the behaviour when those calls fail. Every integration fails eventually, and without a stated behaviour the build team picks one - usually the one that surfaces as a production incident.",
    severity: "high",
  },
  {
    area: "Data migration from the incumbent platform",
    trigger: ["incumbent", "existing customer", "core banking", "2014", "pre-fill", "existing record"],
    satisfied: ["migrat", "backfill", "cutover", "data load", "reconcil"],
    expectation: "A requirement covering migration or reconciliation of in-flight applications at cutover.",
    reason:
      "The platform replaces an existing origination journey, so applications will be in flight on the day of cutover. No requirement addresses what happens to them.",
    severity: "high",
  },
  {
    area: "Customer session timeout and abandonment",
    trigger: ["journey", "application", "resume", "save"],
    satisfied: ["session", "timeout", "time out", "inactiv", "expire"],
    expectation:
      "A requirement defining the customer-facing session timeout and what the customer sees when it expires.",
    reason:
      "Staff session expiry is specified but the customer-facing equivalent is not, despite the journey being explicitly resumable across devices.",
    severity: "medium",
  },
  {
    area: "Audit of administrative actions",
    trigger: ["administration console", "override", "staff", "underwriter", "analyst"],
    satisfied: ["audit trail", "log every", "logs every", "record the identity", "audit log"],
    expectation: "A requirement to audit every privileged administrative action, not only KYC decisions.",
    reason:
      "Audit is specified for KYC decisions and identity document access. Other privileged actions - configuration changes, queue reordering, manual progression - are unaudited in the register as written.",
    severity: "medium",
  },
  {
    area: "Non-functional targets for the broker channel",
    trigger: ["broker", "introducer", "partner dashboard"],
    satisfied: ["broker.*(latency|availability|concurrent)", "partner.*(latency|availability|volume)"],
    expectation:
      "Capacity, latency and availability targets that explicitly include broker-introduced volume.",
    reason:
      "A broker channel was added after the scope baseline, but the capacity and latency targets were set before it and have not been restated to include it.",
    severity: "high",
  },
  {
    area: "Disposal period for raw identity document images",
    trigger: ["identity document", "document image", "raw document"],
    satisfied: ["within \\d+ (day|hour)", "no longer than \\d+", "disposal period of"],
    expectation: "A stated maximum retention period, in days, for raw identity document images.",
    reason:
      "Both the security review and the retention schedule defer this to a decision that has not been taken. The requirement as written - 'no longer than is necessary' - is not implementable.",
    severity: "high",
  },
  {
    area: "Rollback and release backout",
    trigger: ["go live", "release", "deploy", "cutover", "production"],
    satisfied: ["roll ?back", "back out", "backout", "revert", "previous version"],
    expectation: "A requirement describing how a failed release is backed out and within what time.",
    reason:
      "A fixed go-live date is committed with no stated backout path, which converts any release-day defect into an outage rather than a reversal.",
    severity: "medium",
  },
  {
    area: "Performance testing evidence",
    trigger: ["concurrent", "throughput", "latency", "percentile"],
    satisfied: ["load test", "performance test", "soak", "stress test", "benchmark"],
    expectation:
      "A requirement that the stated capacity and latency targets are demonstrated by test before go-live.",
    reason:
      "Numeric performance targets are stated but nothing requires them to be proven. Targets that are never tested are discovered in production.",
    severity: "medium",
  },
  {
    area: "Joint and multi-party applications",
    trigger: ["current account", "applicant", "personal current account"],
    satisfied: ["joint applic", "second applicant", "multi-party", "co-applicant"],
    expectation: "A decision, recorded as a requirement or an explicit exclusion, on joint applications.",
    reason:
      "Joint applications were raised in the discovery wrap-up and carried as an open question. They are neither in scope nor explicitly excluded, which is the state that produces a change request during build.",
    severity: "medium",
  },
];

/**
 * How many areas the checklist covers.
 *
 * Derived, not written down: "six gaps" means nothing without the
 * denominator, and a hardcoded denominator goes stale the first time someone
 * adds a rule.
 */
export const COVERAGE_AREA_COUNT = COVERAGE_RULES.length;

export interface DetectedGap {
  area: string;
  expectation: string;
  reason: string;
  severity: Severity;
}

/**
 * Reports topics the project has entered but not specified.
 *
 * Note the asymmetry: a rule that does not trigger produces nothing at all. The
 * detector never claims a project needs something it has shown no sign of
 * needing.
 */
export function detectCoverageGaps(statements: string[]): DetectedGap[] {
  const corpus = statements.join("\n").toLowerCase();
  const gaps: DetectedGap[] = [];

  for (const rule of COVERAGE_RULES) {
    const triggered = rule.trigger.some((term) => corpus.includes(term.toLowerCase()));
    if (!triggered) continue;
    const covered = rule.satisfied.some((pattern) => new RegExp(pattern, "i").test(corpus));
    if (covered) continue;
    gaps.push({
      area: rule.area,
      expectation: rule.expectation,
      reason: rule.reason,
      severity: rule.severity,
    });
  }

  return gaps;
}

export interface InferredRelationship {
  sourceId: string;
  targetId: string;
  kind: RelationshipKind;
  rationale: string;
  strength: number;
}

const DEPENDENCY_CUE = /\b(before|after|once|prior to|requires|depends on|following)\b/i;

/**
 * Infers relationships between requirements from lexical overlap.
 *
 * Every inferred edge carries the shared terms that produced it, so the graph
 * can be argued with. Edges below the overlap floor are simply not drawn - a
 * graph that connects everything to everything tells a reviewer nothing.
 */
export function inferRelationships(
  items: Array<{ id: string; statement: string; type: RequirementType }>,
): InferredRelationship[] {
  const index = buildSimilarityIndex(items.map((item) => ({ id: item.id, text: item.statement })));
  const byId = new Map(items.map((item) => [item.id, item]));
  const out: InferredRelationship[] = [];

  for (const pair of topPairs(index, items.map((i) => i.id), 0.18)) {
    const left = byId.get(pair.leftId);
    const right = byId.get(pair.rightId);
    if (!left || !right) continue;

    const terms = pair.sharedTerms.slice(0, 4).map((t) => `"${t}"`).join(", ");
    const overlapPct = (pair.score * 100).toFixed(0);

    if (pair.score >= 0.35) {
      out.push({
        sourceId: pair.leftId,
        targetId: pair.rightId,
        kind: "duplicates",
        rationale: `${overlapPct}% lexical overlap on ${terms}. These statements are likely two records of the same requirement.`,
        strength: pair.score,
      });
      continue;
    }

    if (DEPENDENCY_CUE.test(left.statement) || DEPENDENCY_CUE.test(right.statement)) {
      const [source, target] = DEPENDENCY_CUE.test(left.statement)
        ? [pair.leftId, pair.rightId]
        : [pair.rightId, pair.leftId];
      out.push({
        sourceId: source,
        targetId: target,
        kind: "depends_on",
        rationale: `${overlapPct}% overlap on ${terms}, and the statement contains sequencing language, so one is likely a precondition of the other.`,
        strength: pair.score,
      });
      continue;
    }

    if (left.type === right.type) {
      out.push({
        sourceId: pair.leftId,
        targetId: pair.rightId,
        kind: "supports",
        rationale: `${overlapPct}% overlap on ${terms} within the same requirement class.`,
        strength: pair.score,
      });
    }
  }

  return out;
}
