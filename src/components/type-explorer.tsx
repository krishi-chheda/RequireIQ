"use client";

import { useId, useState } from "react";
import { cx } from "./ui";

/**
 * Requirements by type, with the register underneath it.
 *
 * The bar chart alone answers "how many", which is the less interesting
 * question. Making each bar selectable answers "of what kind" - the visitor
 * picks a class and reads actual extracted sentences of that class, verbatim,
 * with their references.
 *
 * A client component because the selection is browser state and nothing else.
 * The samples are counted and sliced on the server and passed down whole:
 * three short statements per class is a small payload, and it means clicking a
 * bar cannot produce a spinner.
 *
 * The bars keep the charting rule they had as a static chart: **one hue, never
 * one hue per category**. Selection is shown by weight and a marker, not by
 * giving each class its own colour - that would spend the identity channel on
 * information the bar length already carries.
 */

export interface TypeSample {
  ref: string;
  statement: string;
}

export interface TypeDatum {
  label: string;
  value: number;
  samples: TypeSample[];
}

export function RequirementTypeExplorer({ data }: { data: TypeDatum[] }) {
  const panelId = useId();
  const [selected, setSelected] = useState<string | null>(null);

  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const active = data.find((d) => d.label === selected) ?? null;

  return (
    <div>
      <ul className="space-y-2.5">
        {data.map((datum) => {
          const isActive = datum.label === selected;
          const share = Math.round((datum.value / total) * 100);
          return (
            <li key={datum.label}>
              <button
                type="button"
                aria-pressed={isActive}
                aria-controls={panelId}
                onClick={() => setSelected(isActive ? null : datum.label)}
                title={`${datum.label}: ${datum.value} requirements (${share}% of ${total})`}
                className="group block w-full text-left"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span
                    className={cx(
                      "text-[12px] transition-colors",
                      isActive ? "font-medium text-ink" : "text-ink-muted group-hover:text-ink",
                    )}
                  >
                    {datum.label}
                  </span>
                  <span
                    data-numeric
                    className={cx("text-[12px] font-medium", isActive ? "text-ink" : "text-ink-muted")}
                  >
                    {datum.value}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-overlay">
                  <span
                    className={cx(
                      "block h-full rounded-full transition-opacity",
                      isActive ? "bg-brand" : "bg-brand/55 group-hover:bg-brand",
                    )}
                    style={{ width: `${(datum.value / max) * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* The panel is always in the DOM and always announced, so a reader who
          presses a bar is told what changed rather than left to notice it. */}
      <div
        id={panelId}
        aria-live="polite"
        className="mt-4 rounded-md border border-line bg-canvas p-3"
      >
        {active ? (
          <>
            <p className="text-[11.5px] text-ink-faint">
              {active.value} {active.label.toLowerCase()} requirements. Showing{" "}
              {active.samples.length}, verbatim.
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {active.samples.map((sample) => (
                <li key={sample.ref} className="border-l border-edge pl-2.5">
                  <span className="font-mono text-[10.5px] text-ink-faint">{sample.ref}</span>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                    {sample.statement}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            Select a class to read the statements the extractor put in it — lifted from the documents
            word for word, not summarised.
          </p>
        )}
      </div>
    </div>
  );
}
