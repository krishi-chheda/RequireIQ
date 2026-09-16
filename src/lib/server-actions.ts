"use server";

import { revalidatePath } from "next/cache";
import { z } from "./validate";
import * as writes from "./actions";
import { resetDatabase } from "./db";

/**
 * Server action surface.
 *
 * This is the only place browser input reaches a write. Every action validates
 * its input before touching the database, and every action revalidates the
 * project subtree so the register, the dashboard counts and the sidebar badges
 * can never show three different versions of the same number.
 *
 * The reviewer is a fixed identity in this build because the product has no
 * authentication yet. That is a deliberate, documented limitation rather than
 * an oversight: see the security section of the README. When auth arrives, this
 * is the single function that has to change.
 */

const REVIEWER = "Demo Reviewer (unauthenticated session)";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function revalidateProject(projectId: string): void {
  revalidatePath(`/app/projects/${projectId}`, "layout");
  revalidatePath("/app");
}

/** Wraps a write so a validation or database error becomes a message, not a crash. */
async function run(projectId: string, label: string, fn: () => void): Promise<ActionResult> {
  try {
    fn();
    revalidateProject(projectId);
    return { ok: true, message: label };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Something went wrong. The change was not saved.",
    };
  }
}

export async function reviewRequirementAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const requirementId = z.id(formData.get("requirementId"), "requirementId");
  const decision = z.oneOf(
    formData.get("decision"),
    ["approved", "rejected", "needs_clarification"] as const,
    "decision",
  );
  const note = z.text(formData.get("note"), { max: 1000, label: "note" });

  return run(projectId, `Requirement marked ${decision.replace(/_/g, " ")}.`, () =>
    writes.recordReview(requirementId, decision, note, REVIEWER),
  );
}

export async function editRequirementAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const requirementId = z.id(formData.get("requirementId"), "requirementId");
  const statement = z.text(formData.get("statement"), { min: 10, max: 1000, label: "statement" });

  return run(projectId, "Statement updated and quality analysis re-run.", () =>
    writes.editRequirement(requirementId, statement, REVIEWER),
  );
}

export async function setAcceptanceCriteriaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const requirementId = z.id(formData.get("requirementId"), "requirementId");
  const criteria = z.text(formData.get("criteria"), { max: 2000, label: "acceptance criteria" });

  return run(projectId, "Acceptance criteria recorded.", () =>
    writes.setAcceptanceCriteria(requirementId, criteria, REVIEWER),
  );
}

export async function assignOwnerAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const requirementId = z.id(formData.get("requirementId"), "requirementId");
  const raw = formData.get("stakeholderId");
  const stakeholderId = raw && String(raw).length ? z.id(raw, "stakeholderId") : null;

  return run(projectId, stakeholderId ? "Business owner assigned." : "Business owner cleared.", () =>
    writes.assignOwner(requirementId, stakeholderId, REVIEWER),
  );
}

export async function resolveAmbiguityAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const ambiguityId = z.id(formData.get("ambiguityId"), "ambiguityId");

  return run(projectId, "Finding marked resolved.", () => writes.resolveAmbiguity(ambiguityId, REVIEWER));
}

export async function resolveConflictAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const conflictId = z.id(formData.get("conflictId"), "conflictId");
  const action = z.oneOf(
    formData.get("action"),
    ["accepted", "dismissed", "needs_clarification", "resolved"] as const,
    "action",
  );
  const note = z.text(formData.get("note"), { max: 2000, label: "note" });

  return run(projectId, `Conflict marked ${action.replace(/_/g, " ")}.`, () =>
    writes.resolveConflict(conflictId, action, note, REVIEWER),
  );
}

export async function recordDecisionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const title = z.text(formData.get("title"), { min: 3, max: 200, label: "title" });
  const detail = z.text(formData.get("detail"), { max: 2000, label: "detail" });
  const decidedBy = z.text(formData.get("decidedBy"), { min: 2, max: 120, label: "decided by" });
  const conflictRaw = formData.get("conflictId");
  const conflictId = conflictRaw && String(conflictRaw).length ? z.id(conflictRaw, "conflictId") : null;

  return run(projectId, "Decision recorded.", () =>
    writes.recordDecision(projectId, title, detail, decidedBy, conflictId, null),
  );
}

export async function setRiskStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const riskId = z.id(formData.get("riskId"), "riskId");
  const status = z.oneOf(formData.get("status"), ["open", "mitigated", "accepted"] as const, "status");

  return run(projectId, `Risk marked ${status}.`, () => writes.setRiskStatus(riskId, status, REVIEWER));
}

export async function setGapStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = z.id(formData.get("projectId"), "projectId");
  const gapId = z.id(formData.get("gapId"), "gapId");
  const status = z.oneOf(formData.get("status"), ["open", "addressed", "dismissed"] as const, "status");

  return run(projectId, `Gap marked ${status}.`, () => writes.setGapStatus(gapId, status, REVIEWER));
}

/** Drops every record and re-runs the demo analysis from the source documents. */
export async function resetDemoAction(): Promise<ActionResult> {
  try {
    resetDatabase();
    revalidatePath("/app", "layout");
    return { ok: true, message: "Demo reset. The corpus was re-analysed from source." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Reset failed.",
    };
  }
}
