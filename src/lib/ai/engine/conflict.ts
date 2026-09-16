import type { ConflictKind, Severity } from "@/lib/types";
import { boundDirection, extractQuantities, type Quantity } from "./text";
import { buildSimilarityIndex, similarity } from "./similarity";

/**
 * Cross-document conflict detection.
 *
 * Five independent detectors run over the whole register. Each one states the
 * arithmetic or the linguistic pattern that made it fire, and each one phrases
 * its output as a tension to validate rather than a verdict. The product is
 * allowed to say "these two numbers do not obviously fit together"; it is never
 * allowed to say "this is impossible", because it does not know the
 * engagement's engineering context well enough to say that.
 *
 * Every conflict therefore carries a `validationQuestion` - the thing a human
 * has to go and check.
 */

export interface ConflictSubject {
  id: string;
  ref: string;
  /** "requirement" or "constraint". */
  type: "requirement" | "constraint";
  statement: string;
  /** Team or function the statement came from, used for impact analysis. */
  team: string | null;
  category?: string;
}

export interface DetectedConflict {
  title: string;
  kind: ConflictKind;
  severity: Severity;
  detector: string;
  explanation: string;
  validationQuestion: string;
  leftId: string;
  leftType: "requirement" | "constraint";
  rightId: string;
  rightType: "requirement" | "constraint";
  confidence: number;
  impactedTeams: string[];
  /**
   * Identity of the underlying tension, independent of which pair of records
   * expressed it. Two documents stating the same availability target produce
   * two record pairs but one real problem, and a reviewer should see one.
   */
  dedupeKey: string;
  /** Other record pairs exhibiting the same tension, as "REQ-1 / CON-2". */
  alsoStatedIn: string[];
}

/**
 * Sizing assumptions behind the capacity-versus-budget heuristic.
 *
 * These are deliberately explicit and exported: the estimate they produce is
 * shown to the user alongside the assumptions, so a platform engineer can
 * disagree with a number rather than with a black box. They are order-of-
 * magnitude figures for a private-cloud tenancy, not a quote.
 */
export const SIZING_MODEL = {
  concurrentUsersPerInstance: 250,
  headroomFactor: 1.3,
  instanceCostPerMonth: 220,
  /** Multi-zone deployment duplicates the serving tier. */
  multiZoneFactor: 2,
  /** Storage, network, observability and managed services as a share of compute. */
  ancillaryFactor: 1.25,
  months: 12,
} as const;

export interface CapacityEstimate {
  instancesAtPeak: number;
  instancesWithHeadroom: number;
  annualComputeCost: number;
  annualTotalCost: number;
  /** Each line of the calculation, for display. */
  workings: string[];
}

/** Runs the sizing heuristic for a concurrency target. Pure and inspectable. */
export function estimateAnnualInfrastructureCost(concurrentUsers: number, multiZone: boolean): CapacityEstimate {
  const m = SIZING_MODEL;
  const instancesAtPeak = Math.ceil(concurrentUsers / m.concurrentUsersPerInstance);
  const instancesWithHeadroom = Math.ceil(instancesAtPeak * m.headroomFactor);
  const zoneFactor = multiZone ? m.multiZoneFactor : 1;
  const annualComputeCost = instancesWithHeadroom * zoneFactor * m.instanceCostPerMonth * m.months;
  const annualTotalCost = Math.round(annualComputeCost * m.ancillaryFactor);

  return {
    instancesAtPeak,
    instancesWithHeadroom,
    annualComputeCost,
    annualTotalCost,
    workings: [
      `${concurrentUsers.toLocaleString("en-US")} concurrent users / ${m.concurrentUsersPerInstance} per instance = ${instancesAtPeak} serving instances at peak`,
      `x ${m.headroomFactor} headroom factor = ${instancesWithHeadroom} instances`,
      multiZone
        ? `x ${m.multiZoneFactor} for multi-zone deployment (required by the availability target) = ${instancesWithHeadroom * zoneFactor} instances`
        : "single-zone deployment assumed",
      `x $${m.instanceCostPerMonth}/instance/month x ${m.months} months = $${annualComputeCost.toLocaleString("en-US")} compute`,
      `x ${m.ancillaryFactor} for storage, network and observability = $${annualTotalCost.toLocaleString("en-US")} total first-year infrastructure`,
    ],
  };
}

const RETENTION_KEEP = /\b(retain|retained|retention|keep|kept|preserve|hold)\b/i;
const RETENTION_DELETE = /\b(delete|deleted|deletion|dispose|disposal|purge|erase|remove|destroy)\b/i;
/** Both sides of a retention conflict must be talking about held information. */
const DATA_NOUN = /\b(data|record|records|information|image|images|document|documents|personal|identity|detail|details)\b/i;
const AVAILABILITY_CUE = /\bavailability\b/i;
const RECOVERY_CUE = /\brecovery time objective\b|\brto\b|\bfull service restoration\b|\brestoration\b/i;
/**
 * A duration only blocks a date when the statement says it must happen first.
 * "requires a" alone matches too much - a sentence can require a thing and
 * mention an unrelated period in the same breath.
 */
const PRECONDITION_CUE =
  /\b(?:must (?:complete|commence|run|be completed|be signed off)[^.]{0,40}\b(?:before|prior to|after)|before (?:go[- ]?live|the platform|production|launch)|prior to (?:go[- ]?live|production|launch)|observation period|must commence after|which in practice means[^.]{0,60}delay|delay)\b/i;
/**
 * A date is only a commitment worth checking a schedule against when the
 * statement commits to it. "The baseline date of 24 July 2026" mentions a date;
 * "must go live on 2 March 2027" commits to one.
 */
const COMMITTED_DATE_CUE = /\b(go live|goes live|go-live|launch|deadline|delivered by|in production by|available from|released on|cut ?over)\b/i;

export function detectConflicts(subjects: ConflictSubject[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const index = buildSimilarityIndex(subjects.map((s) => ({ id: s.id, text: s.statement })));

  conflicts.push(...detectCapacityVersusBudget(subjects));
  conflicts.push(...detectRetentionContradiction(subjects, index));
  conflicts.push(...detectAvailabilityVersusRecovery(subjects));
  conflicts.push(...detectTimelineConflict(subjects));
  conflicts.push(...detectScopeDivergence(subjects, index));

  return dedupe(conflicts);
}

/**
 * Detector 1 - a minimum capacity target against a maximum spend envelope.
 *
 * This is the failure that costs programmes six-figure rework: the performance
 * number and the budget number live in different documents and nobody ever puts
 * them on the same page.
 */
function detectCapacityVersusBudget(subjects: ConflictSubject[]): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  const capacityTargets = subjects.flatMap((subject) =>
    extractQuantities(subject.statement)
      .filter(
        (q) =>
          q.dimension === "count" &&
          q.value >= 1000 &&
          /\b(user|session|application|transaction|customer|activation)/i.test(q.subject ?? "") &&
          boundDirection(subject.statement, q.start) !== "maximum",
      )
      .map((q) => ({ subject, quantity: q })),
  );

  const budgetCaps = subjects.flatMap((subject) =>
    extractQuantities(subject.statement)
      .filter((q) => q.dimension === "money" && boundDirection(subject.statement, q.start) === "maximum")
      .map((q) => ({ subject, quantity: q })),
  );

  const multiZoneRequired = subjects.some(
    (s) => AVAILABILITY_CUE.test(s.statement) && extractQuantities(s.statement).some((q) => q.dimension === "percent" && q.value >= 99.9),
  );

  for (const target of capacityTargets) {
    for (const cap of budgetCaps) {
      if (target.subject.id === cap.subject.id) continue;

      const estimate = estimateAnnualInfrastructureCost(target.quantity.value, multiZoneRequired);
      if (estimate.annualTotalCost <= cap.quantity.value) continue;

      const ratio = estimate.annualTotalCost / cap.quantity.value;
      const severity: Severity = ratio >= 2 ? "critical" : ratio >= 1.4 ? "high" : "medium";

      out.push({
        title: `Capacity target of ${target.quantity.value.toLocaleString("en-US")} ${target.quantity.subject ?? "units"} against a ${formatMoney(cap.quantity.value)} spend cap`,
        kind: "quantitative",
        severity,
        detector: "Capacity-versus-budget sizing heuristic",
        explanation: [
          `${target.subject.ref} sets a minimum capacity target of ${target.quantity.raw}. ${cap.subject.ref} sets a maximum first-year infrastructure spend of ${formatMoney(cap.quantity.value)}.`,
          "",
          "Applying the platform sizing heuristic to the stated capacity target:",
          ...estimate.workings.map((line) => `  - ${line}`),
          "",
          `The indicative figure of ${formatMoney(estimate.annualTotalCost)} is approximately ${ratio.toFixed(1)}x the stated cap. This is a heuristic, not a quotation: it uses generic private-cloud unit costs and a generic concurrency-per-instance assumption, either of which this engagement may beat or miss substantially.`,
          "",
          "What it does establish is that the two numbers have never been reconciled against each other, and that the gap is large enough that it will not close by accident.",
        ].join("\n"),
        validationQuestion:
          "Ask platform engineering to size the stated capacity target against the actual tenancy unit costs, and take the result to the capital committee before build commits to an architecture.",
        leftId: target.subject.id,
        leftType: target.subject.type,
        rightId: cap.subject.id,
        rightType: cap.subject.type,
        confidence: 0.72,
        impactedTeams: uniqueTeams([target.subject.team, cap.subject.team, "Engineering", "Finance", "Delivery"]),
        dedupeKey: `capacity-budget:${target.quantity.value}:${cap.quantity.value}`,
        alsoStatedIn: [],
      });
    }
  }

  return out;
}

/**
 * Detector 2 - opposing retention and deletion obligations over the same data.
 *
 * Fires on polarity (retain vs delete) plus topical overlap plus a large
 * difference in the stated period. Any one of those alone produces noise.
 */
function detectRetentionContradiction(
  subjects: ConflictSubject[],
  index: ReturnType<typeof buildSimilarityIndex>,
): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  // Both sides must be obligations about held information. Without the data
  // noun the detector would happily compare "retain three staff" with "remove
  // an alert after 30 days".
  const keepers = subjects.filter(
    (s) => RETENTION_KEEP.test(s.statement) && !RETENTION_DELETE.test(s.statement) && DATA_NOUN.test(s.statement),
  );
  const deleters = subjects.filter((s) => RETENTION_DELETE.test(s.statement) && DATA_NOUN.test(s.statement));

  for (const keeper of keepers) {
    const keepPeriod = extractQuantities(keeper.statement).find((q) => q.dimension === "duration");
    if (!keepPeriod) continue;

    for (const deleter of deleters) {
      const deletePeriod = extractQuantities(deleter.statement).find((q) => q.dimension === "duration");
      if (!deletePeriod) continue;

      // Lexical overlap is reported when present but not required. Retention
      // and deletion rules are written by different functions in deliberately
      // different vocabulary - that mismatch is precisely why nobody notices
      // the contradiction, so gating on shared wording would suppress the one
      // case the detector exists for.
      const overlap = similarity(index, keeper.id, deleter.id);

      const ratio = keepPeriod.value / deletePeriod.value;
      if (ratio < 3) continue;

      out.push({
        title: `Retention period of ${keepPeriod.raw} against a deletion obligation of ${deletePeriod.raw} for overlapping data`,
        kind: "contradiction",
        severity: ratio > 20 ? "high" : "medium",
        detector: "Opposing-obligation polarity check with topical overlap",
        explanation: [
          `${keeper.ref} obliges the programme to retain data for ${keepPeriod.raw}. ${deleter.ref} obliges it to delete data within ${deletePeriod.raw} - a period roughly ${Math.round(ratio)}x shorter.`,
          "",
          overlap.sharedTerms.length
            ? `The two statements share the terms ${overlap.sharedTerms.slice(0, 4).map((t) => `"${t}"`).join(", ")}. A single implementation cannot satisfy both obligations for any record that falls inside both scopes.`
            : "The two statements share almost no vocabulary, which is exactly why this has not been spotted in review - they were written by different functions in different language. A single implementation still cannot satisfy both obligations for any record that falls inside both scopes.",
          "",
          "The scopes may in fact be disjoint - retention rules commonly separate customers from non-customers - but that distinction is not stated in either source, so the build team has no rule to implement.",
        ].join("\n"),
        validationQuestion:
          "Confirm with the Data Protection Officer and Financial Crime Compliance exactly which records fall under each obligation, and record the boundary as an explicit requirement rather than leaving it implied.",
        leftId: keeper.id,
        leftType: keeper.type,
        rightId: deleter.id,
        rightType: deleter.type,
        confidence: 0.68,
        impactedTeams: uniqueTeams([keeper.team, deleter.team, "Compliance", "Engineering"]),
        dedupeKey: `retention:${keepPeriod.value}:${deletePeriod.value}`,
        alsoStatedIn: [],
      });
    }
  }

  return out;
}

/**
 * Detector 3 - an availability percentage against a recovery time objective.
 *
 * Converts the availability target into its implied monthly downtime budget and
 * compares it with the stated RTO. A four-hour RTO cannot coexist with a
 * 99.99% monthly target, because a single qualifying incident spends 55x the
 * month's entire allowance.
 */
function detectAvailabilityVersusRecovery(subjects: ConflictSubject[]): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  const availability = subjects
    .filter((s) => AVAILABILITY_CUE.test(s.statement))
    .flatMap((subject) =>
      extractQuantities(subject.statement)
        .filter((q) => q.dimension === "percent" && q.value >= 95 && q.value < 100)
        .map((q) => ({ subject, quantity: q })),
    );

  const recovery = subjects
    .filter((s) => RECOVERY_CUE.test(s.statement))
    .flatMap((subject) =>
      extractQuantities(subject.statement)
        .filter((q) => q.dimension === "duration" && q.value >= 60)
        .map((q) => ({ subject, quantity: q })),
    );

  for (const target of availability) {
    const allowedSecondsPerMonth = ((100 - target.quantity.value) / 100) * 30 * 24 * 3600;
    for (const rto of recovery) {
      if (rto.quantity.value <= allowedSecondsPerMonth) continue;

      const multiple = rto.quantity.value / allowedSecondsPerMonth;
      out.push({
        title: `${target.quantity.raw} availability target against a ${rto.quantity.raw} recovery time objective`,
        kind: "quantitative",
        severity: multiple >= 10 ? "high" : "medium",
        detector: "Availability-to-downtime budget conversion",
        explanation: [
          `${target.subject.ref} sets an availability target of ${target.quantity.raw}. Measured monthly that allows ${formatDuration(allowedSecondsPerMonth)} of unplanned downtime in total.`,
          "",
          `${rto.subject.ref} sets a recovery time objective of ${rto.quantity.raw}, which is about ${multiple.toFixed(0)}x the entire monthly allowance. One qualifying incident recovered at the stated RTO would breach the availability target for that month and, depending on the contract, for the year.`,
          "",
          "Both statements are individually reasonable. Together they describe two different service tiers, and the programme has not chosen between them.",
        ].join("\n"),
        validationQuestion:
          "Agree with Service Operations and the business owner which figure is the contractual commitment, then derive the other from it rather than stating both independently.",
        leftId: target.subject.id,
        leftType: target.subject.type,
        rightId: rto.subject.id,
        rightType: rto.subject.type,
        confidence: 0.81,
        impactedTeams: uniqueTeams([target.subject.team, rto.subject.team, "Operations", "Engineering"]),
        dedupeKey: `availability-rto:${target.quantity.value}:${rto.quantity.value}`,
        alsoStatedIn: [],
      });
    }
  }

  return out;
}

/**
 * Detector 4 - a fixed date against a mandatory preceding duration.
 *
 * Fires when a committed go-live date leaves less calendar time than a stated
 * precondition period requires, measured from the date the statement was made.
 */
function detectTimelineConflict(subjects: ConflictSubject[]): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  const dates = subjects
    .filter((s) => COMMITTED_DATE_CUE.test(s.statement))
    .flatMap((subject) =>
      extractQuantities(subject.statement)
        .filter((q) => q.dimension === "date")
        .map((q) => ({ subject, quantity: q })),
    );

  const preconditions = subjects
    .filter((s) => PRECONDITION_CUE.test(s.statement))
    .flatMap((subject) =>
      extractQuantities(subject.statement)
        .filter((q) => q.dimension === "duration" && q.value >= 7 * 86_400)
        .map((q) => ({ subject, quantity: q })),
    );

  for (const target of dates) {
    for (const pre of preconditions) {
      if (target.subject.id === pre.subject.id) continue;

      const weeks = pre.quantity.value / 604_800;
      if (weeks < 2) continue;

      out.push({
        title: `Committed date of ${target.quantity.raw} against a stated ${pre.quantity.raw} dependency`,
        kind: "temporal",
        severity: weeks >= 8 ? "high" : "medium",
        detector: "Fixed-date versus preceding-duration check",
        explanation: [
          `${target.subject.ref} commits to ${target.quantity.raw}. ${pre.subject.ref} states a period of ${pre.quantity.raw} that has to elapse before that point can be met.`,
          "",
          `That precondition consumes roughly ${weeks.toFixed(0)} weeks of the schedule, and it cannot start until the activity it depends on finishes. The committed date has been set without that dependency being subtracted from the plan.`,
          "",
          "This is a sequencing problem rather than a disagreement: neither statement is wrong on its own, but the plan connecting them does not exist yet.",
        ].join("\n"),
        validationQuestion:
          "Build the backward schedule from the committed date through the precondition to the activity that feeds it, and take the resulting start date to the steering committee.",
        leftId: target.subject.id,
        leftType: target.subject.type,
        rightId: pre.subject.id,
        rightType: pre.subject.type,
        confidence: 0.7,
        impactedTeams: uniqueTeams([target.subject.team, pre.subject.team, "Delivery", "Compliance"]),
        dedupeKey: `timeline:${target.quantity.value}:${pre.quantity.value}`,
        alsoStatedIn: [],
      });
    }
  }

  return out;
}

/**
 * Detector 5 - two statements clearly about the same thing that state
 * different numbers for it.
 *
 * Topical overlap alone is a duplicate, not a conflict. What makes it a
 * conflict is a shared dimension with materially different values.
 */
function detectScopeDivergence(
  subjects: ConflictSubject[],
  index: ReturnType<typeof buildSimilarityIndex>,
): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  for (let i = 0; i < subjects.length; i += 1) {
    for (let j = i + 1; j < subjects.length; j += 1) {
      const left = subjects[i];
      const right = subjects[j];
      if (!left || !right) continue;

      const overlap = similarity(index, left.id, right.id);
      if (overlap.score < 0.3) continue;

      const leftQuantities = extractQuantities(left.statement);
      const rightQuantities = extractQuantities(right.statement);

      const divergent = findDivergentDimension(leftQuantities, rightQuantities);
      if (!divergent) continue;

      out.push({
        title: `Same requirement stated with different ${divergent.dimension} values (${divergent.left.raw} and ${divergent.right.raw})`,
        kind: "scope_divergence",
        severity: "medium",
        detector: "Topical overlap with divergent quantity",
        explanation: [
          `${left.ref} and ${right.ref} score ${(overlap.score * 100).toFixed(0)}% lexical overlap on the terms ${overlap.sharedTerms.slice(0, 4).map((t) => `"${t}"`).join(", ")}, which means they are describing the same characteristic.`,
          "",
          `They state different values for it: ${divergent.left.raw} against ${divergent.right.raw}. Whichever is built, one of the two source documents will be wrong, and whoever relies on the other document will raise a defect.`,
        ].join("\n"),
        validationQuestion:
          "Decide which value is authoritative, update the losing document, and keep one of the two requirements as the single statement of record.",
        leftId: left.id,
        leftType: left.type,
        rightId: right.id,
        rightType: right.type,
        confidence: 0.6,
        impactedTeams: uniqueTeams([left.team, right.team, "Delivery"]),
        dedupeKey: `divergence:${divergent.dimension}:${divergent.left.value}:${divergent.right.value}`,
        alsoStatedIn: [],
      });
    }
  }

  return out;
}

function findDivergentDimension(
  left: Quantity[],
  right: Quantity[],
): { dimension: string; left: Quantity; right: Quantity } | null {
  for (const l of left) {
    for (const r of right) {
      if (l.dimension !== r.dimension) continue;
      if (l.dimension === "date") continue;
      if (l.value === r.value) continue;
      const ratio = Math.max(l.value, r.value) / Math.max(1e-9, Math.min(l.value, r.value));
      if (ratio < 1.2) continue;
      return { dimension: l.dimension, left: l, right: r };
    }
  }
  return null;
}

/**
 * Collapses conflicts that describe the same underlying tension.
 *
 * The register routinely states the same characteristic in several documents -
 * an availability target in a workshop transcript and again in the
 * specification - so a naive pass reports one real problem three times. That
 * inflates every count on the dashboard and, worse, trains a reviewer to skim.
 *
 * The surviving conflict keeps the highest-severity, highest-confidence pair
 * and lists the other pairs, so nothing is hidden.
 */
function dedupe(conflicts: DetectedConflict[]): DetectedConflict[] {
  const rank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const groups = new Map<string, DetectedConflict[]>();

  for (const conflict of conflicts) {
    groups.set(conflict.dedupeKey, [...(groups.get(conflict.dedupeKey) ?? []), conflict]);
  }

  const merged: DetectedConflict[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) => rank[b.severity] - rank[a.severity] || b.confidence - a.confidence,
    );
    const primary = ordered[0]!;
    const others = ordered.slice(1).map((c) => `${c.leftId} / ${c.rightId}`);
    merged.push({ ...primary, alsoStatedIn: [...new Set(others)] });
  }

  // Two different tensions can still share a record pair; keep the worse one.
  const byPair = new Map<string, DetectedConflict>();
  for (const conflict of merged.sort((a, b) => rank[b.severity] - rank[a.severity] || b.confidence - a.confidence)) {
    const key = [conflict.leftId, conflict.rightId].sort().join("::");
    if (!byPair.has(key)) byPair.set(key, conflict);
  }

  return [...byPair.values()].sort(
    (a, b) => rank[b.severity] - rank[a.severity] || b.confidence - a.confidence,
  );
}

function uniqueTeams(teams: Array<string | null>): string[] {
  return [...new Set(teams.filter((t): t is string => Boolean(t)))];
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)} seconds`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86_400).toFixed(1)} days`;
}
