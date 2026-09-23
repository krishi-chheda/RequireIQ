"use client";

import { useEffect } from "react";
import { Callout, buttonClass } from "@/components/ui";

/**
 * Project-segment error boundary.
 *
 * Nested under the project layout on purpose: a failing register keeps the
 * sidebar, so the reader can move to another section instead of being thrown
 * back to the root boundary and losing their place in the engagement.
 *
 * Like the root boundary, this shows the digest rather than the message - the
 * digest correlates a user report with the server log and is safe to display,
 * whereas a raw message can carry a file path or a query fragment.
 */
export default function ProjectSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error in project section:", error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <div className="space-y-4">
        <div className="space-y-2 border-b border-line pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-critical-ink">Section failed</p>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
            This section could not be rendered
          </h1>
        </div>

        <Callout tone="critical" title="Nothing was changed">
          Retrying is safe. Every write in this product is transactional, so a failed action leaves no
          partial record behind, and no register figure on another page is affected by this.
          {error.digest ? (
            <span className="mt-2 block font-mono text-[11px] text-ink-faint">Reference: {error.digest}</span>
          ) : null}
        </Callout>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reset} className={buttonClass("primary")}>
            Try again
          </button>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-faint">
          The other sections of this engagement are still available from the sidebar.
        </p>
      </div>
    </main>
  );
}
