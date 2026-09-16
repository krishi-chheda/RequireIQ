"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass, cx } from "./ui";

/**
 * The guided walkthrough.
 *
 * Nine steps that follow the workflow a business analyst would actually run:
 * see the position, look at what was ingested, read what was extracted, find
 * the contradiction, trace it to its sources, decide, and watch the health
 * figure move. Each step deep-links to a real screen - there is no scripted
 * playback, the user is driving the actual product throughout.
 *
 * Progress lives in sessionStorage so a refresh does not lose the reader's
 * place, and a failed storage read never breaks the component.
 */

interface Step {
  title: string;
  body: string;
  path: (base: string) => string;
  look: string;
}

const STEPS: Step[] = [
  {
    title: "Start with the position",
    body: "Requirements health is 100 minus four named deductions, not a model output. Hover the dial, or read the full breakdown on this page, to see exactly which counts produced the number.",
    path: (base) => base,
    look: "Look at: the health dial and the four deductions beneath it.",
  },
  {
    title: "What went in",
    body: "Fifteen documents: workshop transcripts, meeting notes, email threads, a specification extract and a records retention policy. This is the material a business analyst would otherwise read manually over three weeks.",
    path: (base) => `${base}/documents`,
    look: "Look at: the mix of document types, and the requirement count each one produced.",
  },
  {
    title: "What came out",
    body: "Eighty-two candidate requirements, each lifted verbatim from a source sentence and classified by type and MoSCoW priority. Every row is AI proposed - nothing is authoritative yet.",
    path: (base) => `${base}/requirements`,
    look: "Look at: the provenance chip on every row, and the filters down the side.",
  },
  {
    title: "Quality analysis",
    body: "Filter to requirements with open findings. \"Fast response time\" is flagged with the exact span, an explanation, and a measurable rewrite you could take to the business owner tomorrow.",
    path: (base) => `${base}/requirements?view=findings`,
    look: "Look at: a requirement with a vague-term finding, and open it.",
  },
  {
    title: "The conflict nobody caught",
    body: "Seven cross-document conflicts. The capacity target came from a July workshop; the spend cap came from a June email. Neither author saw the other, and no keyword search would ever connect them.",
    path: (base) => `${base}/conflicts`,
    look: "Look at: the capacity-versus-budget conflict, and open it.",
  },
  {
    title: "Investigate it",
    body: "The conflict workspace shows both statements, both sources, the sizing arithmetic line by line, who is affected, and the question a human has to go and answer. It never claims the target is impossible.",
    path: (base) => `${base}/conflicts`,
    look: "Look at: the shown workings, and the four resolution actions at the bottom.",
  },
  {
    title: "Trace it to the source",
    body: "Every requirement traces back to a character range in a real document, the workshop or email it was captured in, and the person who said it. This is the view that answers \"who asked for this?\" in seconds.",
    path: (base) => `${base}/traceability`,
    look: "Look at: the source column, and the stakeholder attribution.",
  },
  {
    title: "What nobody said",
    body: "Coverage gaps are reported by checklist, never generated. Failure behaviour of external dependencies, cutover of in-flight applications, backout of a failed release - all entered by this project, none specified.",
    path: (base) => `${base}/risks?view=gaps`,
    look: "Look at: the reason given for each gap.",
  },
  {
    title: "Resolve, and watch the number move",
    body: "Resolve a conflict or record acceptance criteria, then go back to the workspace. Health moves because a deduction shrank, and the breakdown shows which one. Approving a requirement is audited too, but deliberately does not move the score - health measures unresolved problems, not review throughput.",
    path: (base) => `${base}/conflicts`,
    look: "Then return to the workspace and compare the score.",
  },
];

const STORAGE_KEY = "requireiq.tour";

export function DemoTour({ projectId }: { projectId: string }) {
  const base = `/app/projects/${projectId}`;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { open?: boolean; index?: number };
        setOpen(Boolean(parsed.open));
        setIndex(Math.min(STEPS.length - 1, Math.max(0, parsed.index ?? 0)));
      }
    } catch {
      // Private browsing or blocked storage: the tour just starts fresh.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ open, index }));
    } catch {
      // Not being able to remember the step is not worth an error.
    }
  }, [open, index, ready]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const step = STEPS[index]!;
  const target = step.path(base);
  const onTarget = pathname === target.split("?")[0];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-4 py-2.5 text-[12.5px] font-medium text-brand-ink shadow-lg shadow-black/40 transition-colors hover:bg-brand/20 lg:left-4 lg:right-auto"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-brand-ink" />
        Guided walkthrough
        <span className="rounded-full bg-brand/20 px-1.5 py-px text-[11px]">3 min</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Guided walkthrough"
      className="no-print fixed bottom-0 right-0 z-40 w-full max-w-md border-l border-t border-edge bg-overlay/98 shadow-2xl shadow-black/60 backdrop-blur sm:bottom-5 sm:right-5 sm:rounded-lg sm:border lg:left-4 lg:right-auto"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
            Guided walkthrough
          </span>
          <span data-numeric className="font-mono text-[11px] text-brand-ink">
            {index + 1}/{STEPS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xs px-2 py-1 text-[12px] text-ink-faint transition-colors hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={cx(
              "h-0.5 flex-1 rounded-full transition-colors duration-300",
              i <= index ? "bg-brand" : "bg-line",
            )}
          />
        ))}
      </div>

      <div className="px-4 py-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{step.title}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{step.body}</p>
        <p className="mt-3 rounded-sm border-l-2 border-brand bg-brand-soft/50 px-3 py-2 text-[12px] leading-relaxed text-brand-ink">
          {step.look}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className={buttonClass("ghost")}
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {onTarget ? null : (
            <Link href={target} className={buttonClass("secondary")}>
              Go to this screen
            </Link>
          )}
          {index < STEPS.length - 1 ? (
            <Link
              href={STEPS[index + 1]!.path(base)}
              onClick={() => setIndex(index + 1)}
              className={buttonClass("primary")}
            >
              Next
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setIndex(0);
              }}
              className={buttonClass("primary")}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
