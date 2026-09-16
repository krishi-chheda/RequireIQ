"use client";

import { useActionState } from "react";
import { resetDemoAction, type ActionResult } from "@/lib/server-actions";
import { ActionMessage, SubmitButton } from "./forms";

/**
 * Resets the demo engagement.
 *
 * Destructive and irreversible for anything a reviewer has done, so it asks
 * first. The confirm is native rather than a custom modal - it is the one
 * dialog in the product that must be impossible to miss or to style away.
 */
export function ResetDemoButton() {
  const [state, formAction] = useActionState(
    async (_previous: ActionResult | null) => resetDemoAction(),
    null,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Reset the demo engagement?\n\nEvery review decision, edit and conflict resolution will be discarded, and the fifteen source documents will be re-analysed from scratch. This cannot be undone.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <SubmitButton variant="danger" pendingLabel="Re-analysing corpus...">
        Reset demo data
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
