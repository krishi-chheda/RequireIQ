"use client";

import { setGapStatusAction, setRiskStatusAction } from "@/lib/server-actions";
import { ActionForm, SubmitButton } from "./forms";

/** Closes a risk, recording which of the two honest closures it was. */
export function RiskStatusControl({ projectId, riskId }: { projectId: string; riskId: string }) {
  return (
    <ActionForm action={setRiskStatusAction} hidden={{ projectId, riskId }} className="flex gap-1.5">
      <SubmitButton
        name="status"
        value="mitigated"
        variant="ghost"
        pendingLabel="..."
        className="px-2 py-1 text-[11.5px]"
        title="The underlying cause has been addressed."
      >
        Mitigate
      </SubmitButton>
      <SubmitButton
        name="status"
        value="accepted"
        variant="ghost"
        pendingLabel="..."
        className="px-2 py-1 text-[11.5px]"
        title="The programme will carry this risk knowingly."
      >
        Accept
      </SubmitButton>
    </ActionForm>
  );
}

/** Closes a coverage gap once it has been specified, or dismisses it. */
export function GapStatusControl({ projectId, gapId }: { projectId: string; gapId: string }) {
  return (
    <ActionForm action={setGapStatusAction} hidden={{ projectId, gapId }} className="flex gap-1.5">
      <SubmitButton
        name="status"
        value="addressed"
        variant="ghost"
        pendingLabel="..."
        className="px-2 py-1 text-[11.5px]"
        title="A requirement now covers this topic."
      >
        Addressed
      </SubmitButton>
      <SubmitButton
        name="status"
        value="dismissed"
        variant="ghost"
        pendingLabel="..."
        className="px-2 py-1 text-[11.5px]"
        title="Not applicable to this engagement."
      >
        Not applicable
      </SubmitButton>
    </ActionForm>
  );
}
