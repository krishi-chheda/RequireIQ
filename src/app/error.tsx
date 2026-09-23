"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Root error boundary.
 *
 * Shows the digest rather than the message: the digest is safe to display and
 * is what correlates a user report with the server log, whereas a raw message
 * can carry a file path or a query fragment.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div>
        <p className="font-mono text-[12px] uppercase tracking-[0.13em] text-critical-ink">Something went wrong</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          This screen could not be rendered
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
          Nothing was changed. Retrying is safe - every write in this product is transactional, so a failed
          action leaves no partial record behind.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-ink-faint">Reference: {error.digest}</p>
        ) : null}
      </div>
      <button type="button" onClick={reset} className={buttonClass("primary")}>
        Try again
      </button>
    </main>
  );
}
