"use client";

import { recordDecisionAction, resolveConflictAction } from "@/lib/server-actions";
import { ActionForm, Field, INPUT_CLASS, SubmitButton } from "./forms";
import { Eyebrow } from "./ui";

/**
 * Conflict resolution.
 *
 * Four outcomes, because a conflict has four honest endings: the tension is
 * real and accepted, the detector was wrong, somebody has to go and ask, or the
 * underlying requirements have been changed so it no longer exists. Every one
 * carries a note into the audit trail, and accepting or resolving also updates
 * the risk the conflict generated so the two registers cannot drift apart.
 */
export function ConflictActions({
  projectId,
  conflictId,
  validationQuestion,
}: {
  projectId: string;
  conflictId: string;
  validationQuestion: string;
}) {
  return (
    <div className="space-y-5">
      <ActionForm
        action={resolveConflictAction}
        hidden={{ projectId, conflictId }}
        className="space-y-3"
      >
        <Field
          label="Resolution note"
          htmlFor="resolution-note"
          hint="What was checked, with whom, and what was decided. Written straight into the audit trail."
        >
          <textarea
            id="resolution-note"
            name="note"
            rows={3}
            maxLength={2000}
            placeholder={validationQuestion}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <SubmitButton name="action" value="accepted" variant="secondary" pendingLabel="Saving...">
            Accept conflict
          </SubmitButton>
          <SubmitButton name="action" value="needs_clarification" variant="secondary" pendingLabel="Saving...">
            Needs clarification
          </SubmitButton>
          <SubmitButton name="action" value="resolved" variant="positive" pendingLabel="Saving...">
            Mark resolved
          </SubmitButton>
          <SubmitButton name="action" value="dismissed" variant="danger" pendingLabel="Saving...">
            Dismiss as false positive
          </SubmitButton>
        </div>

        <dl className="space-y-1.5 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-faint">
          <div>
            <dt className="inline font-medium text-ink-muted">Accept: </dt>
            <dd className="inline">
              the tension is real and the programme will carry it. The linked risk becomes accepted.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-ink-muted">Needs clarification: </dt>
            <dd className="inline">somebody has to go and ask. Stays in the open queue.</dd>
          </div>
          <div>
            <dt className="inline font-medium text-ink-muted">Resolved: </dt>
            <dd className="inline">
              the underlying statements have been changed or reconciled. The linked risk is mitigated.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-ink-muted">Dismiss: </dt>
            <dd className="inline">the detector was wrong. Kept in the record, not deleted.</dd>
          </div>
        </dl>
      </ActionForm>

      <div className="border-t border-line pt-5">
        <Eyebrow>Record a decision</Eyebrow>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
          Creates a decision of record against this conflict, so the reasoning survives the people who made it.
        </p>
        <ActionForm
          action={recordDecisionAction}
          hidden={{ projectId, conflictId }}
          className="mt-3 space-y-2"
        >
          <Field label="Decision" htmlFor="decision-title">
            <input
              id="decision-title"
              name="title"
              required
              minLength={3}
              maxLength={200}
              placeholder="Capacity target reduced to 4,000 concurrent users for release 1"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Detail" htmlFor="decision-detail">
            <textarea
              id="decision-detail"
              name="detail"
              rows={2}
              maxLength={2000}
              placeholder="Engineering sized the original target at $343k against a $200k cap. Steering agreed a staged target."
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Decided by" htmlFor="decision-by">
            <input
              id="decision-by"
              name="decidedBy"
              required
              minLength={2}
              maxLength={120}
              placeholder="Steering committee"
              className={INPUT_CLASS}
            />
          </Field>
          <SubmitButton pendingLabel="Recording...">Record decision</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
