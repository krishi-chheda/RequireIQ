"use client";

import { useState } from "react";
import type { Stakeholder } from "@/lib/types";
import {
  assignOwnerAction,
  editRequirementAction,
  resolveAmbiguityAction,
  reviewRequirementAction,
  setAcceptanceCriteriaAction,
} from "@/lib/server-actions";
import { ActionForm, Field, INPUT_CLASS, SubmitButton } from "./forms";
import { Eyebrow, buttonClass } from "./ui";

/**
 * Human-in-the-loop controls.
 *
 * Approve, reject, ask for clarification, edit the wording, assign an owner,
 * record acceptance criteria. Each is a separate deliberate act with its own
 * audit entry - in particular, editing a statement does not approve it, because
 * fixing the words and agreeing the requirement are two different decisions
 * that a register has to be able to tell apart.
 */

export function ReviewPanel({
  projectId,
  requirementId,
  currentStatement,
  acceptanceCriteria,
  ownerStakeholderId,
  stakeholders,
  suggestion,
}: {
  projectId: string;
  requirementId: string;
  currentStatement: string;
  acceptanceCriteria: string | null;
  ownerStakeholderId: string | null;
  stakeholders: Stakeholder[];
  /** Highest-severity suggested rewrite, offered as a starting point. */
  suggestion: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const hidden = { projectId, requirementId };

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>Decision</Eyebrow>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
          A requirement becomes authoritative when a person approves it, not when the engine extracts it.
        </p>
        <ActionForm action={reviewRequirementAction} hidden={hidden} className="mt-3 space-y-2">
          <Field label="Note" htmlFor="review-note" hint="Recorded verbatim in the audit trail.">
            <textarea
              id="review-note"
              name="note"
              rows={2}
              maxLength={1000}
              placeholder="Confirmed with the business owner on 16 September."
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approved" variant="positive" pendingLabel="Approving...">
              Approve
            </SubmitButton>
            <SubmitButton
              name="decision"
              value="needs_clarification"
              variant="secondary"
              pendingLabel="Saving..."
            >
              Needs clarification
            </SubmitButton>
            <SubmitButton name="decision" value="rejected" variant="danger" pendingLabel="Rejecting...">
              Reject
            </SubmitButton>
          </div>
        </ActionForm>
      </div>

      <div className="border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Statement</Eyebrow>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={buttonClass("ghost", "px-2 py-1")}
          >
            {editing ? "Cancel" : "Edit wording"}
          </button>
        </div>

        {editing ? (
          <ActionForm action={editRequirementAction} hidden={hidden} className="mt-3 space-y-2">
            <Field
              label="Requirement statement"
              htmlFor="statement"
              hint="The original wording is kept. Quality analysis re-runs against the new text, so a genuine fix clears its own findings."
            >
              <textarea
                id="statement"
                name="statement"
                rows={4}
                required
                minLength={10}
                maxLength={1000}
                defaultValue={currentStatement}
                className={INPUT_CLASS}
              />
            </Field>
            {suggestion ? (
              <p className="rounded-sm border border-prov-suggest/25 bg-[#170f26] px-3 py-2 text-[11.5px] leading-relaxed text-prov-suggest">
                Suggested rewrite: {suggestion}
              </p>
            ) : null}
            <SubmitButton variant="primary" pendingLabel="Re-analysing...">
              Save and re-analyse
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      <div className="border-t border-line pt-5">
        <Eyebrow>Acceptance criteria</Eyebrow>
        <ActionForm action={setAcceptanceCriteriaAction} hidden={hidden} className="mt-2 space-y-2">
          <Field
            label="How this requirement is verified"
            htmlFor="criteria"
            hint="Agreed with the business owner. Recording criteria closes the missing-acceptance-criteria finding."
          >
            <textarea
              id="criteria"
              name="criteria"
              rows={3}
              maxLength={2000}
              defaultValue={acceptanceCriteria ?? ""}
              placeholder="Given 10,000 concurrent sessions, 95% of API responses return within 500ms, demonstrated by load test LT-04 before go-live."
              className={INPUT_CLASS}
            />
          </Field>
          <SubmitButton pendingLabel="Saving...">Save acceptance criteria</SubmitButton>
        </ActionForm>
      </div>

      <div className="border-t border-line pt-5">
        <Eyebrow>Business owner</Eyebrow>
        <ActionForm action={assignOwnerAction} hidden={hidden} className="mt-2 space-y-2">
          <Field
            label="Accountable stakeholder"
            htmlFor="owner"
            hint="Without a named owner there is nobody to agree the acceptance criteria or sign the requirement off."
          >
            <select id="owner" name="stakeholderId" defaultValue={ownerStakeholderId ?? ""} className={INPUT_CLASS}>
              <option value="">No owner assigned</option>
              {stakeholders.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} - {person.role} ({person.team})
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton pendingLabel="Saving...">Assign owner</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

/** Dismisses one quality finding without changing the requirement wording. */
export function ResolveFindingButton({
  projectId,
  ambiguityId,
}: {
  projectId: string;
  ambiguityId: string;
}) {
  return (
    <ActionForm action={resolveAmbiguityAction} hidden={{ projectId, ambiguityId }} className="inline">
      <SubmitButton variant="ghost" pendingLabel="..." className="px-2 py-1 text-[11.5px]">
        Mark resolved
      </SubmitButton>
    </ActionForm>
  );
}
