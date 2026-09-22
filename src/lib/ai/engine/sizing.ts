/**
 * The capacity-versus-budget sizing heuristic.
 *
 * Split out of `conflict.ts` because it is pure arithmetic with no
 * dependencies, and the landing page renders it interactively in the browser.
 * Importing it from the detector module would pull the text and similarity
 * engines into the client bundle for the sake of six numbers.
 */

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
