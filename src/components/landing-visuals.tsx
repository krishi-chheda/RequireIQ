import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Landing-page visuals.
 *
 * All server-rendered: these are pictures of counted records, not widgets, so
 * none of them needs browser state and none ships JavaScript.
 *
 * Two rules from the charting review are load-bearing here and should not be
 * "tidied" later:
 *
 * 1. **Magnitude bars use one hue, never one hue per category.** Colouring
 *    eight nominal categories eight ways double-encodes bar length as hue and
 *    burns the only free channel on information the bar already shows.
 *
 * 2. **Severity is never encoded as adjacent colour fills.** `high` (#f08c3a)
 *    against `medium` (#d9b02c) measures ΔE 9.6 under *normal* vision and 3.9
 *    under deuteranopia - below the legibility floor. Severity is therefore
 *    always written as a word, with the colour as reinforcement only, and the
 *    bands are never stacked against each other in one bar.
 */

// ---------------------------------------------------------------------------
// Magnitude bars
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Horizontal magnitude bars, one hue.
 *
 * Built from HTML rather than SVG: the label and the value are real text, so
 * the chart is its own table view, reflows on a phone and is read correctly
 * without any ARIA scaffolding.
 */
export function BarRows({
  data,
  unit,
  className,
}: {
  data: BarDatum[];
  /** Named in each row's tooltip, e.g. "requirements". */
  unit: string;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ul className={cx("space-y-2.5", className)}>
      {data.map((datum) => {
        const share = Math.round((datum.value / total) * 100);
        return (
          <li
            key={datum.label}
            // The native tooltip is the per-mark hover layer. It costs no
            // JavaScript and is reachable by assistive technology.
            title={`${datum.label}: ${datum.value} ${unit} (${share}% of ${total})`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-ink-muted">{datum.label}</span>
              <span data-numeric className="text-[12px] font-medium text-ink">
                {datum.value}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-overlay">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(datum.value / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

const SEVERITY_FILL: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
};

const SEVERITY_INK: Record<string, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-ink-faint",
};

/**
 * Severity breakdown as separate labelled rows.
 *
 * Deliberately not a stacked bar: see the note at the top of this file. Each
 * band is named in words and carries its own track, so the reading never
 * depends on telling orange from yellow.
 */
export function SeverityRows({ data }: { data: Array<{ severity: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((band) => (
        <li key={band.severity}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cx("size-1.5 rounded-full", SEVERITY_FILL[band.severity] ?? "bg-low")}
              />
              <span className={cx("text-[12px] capitalize", SEVERITY_INK[band.severity] ?? "text-ink-muted")}>
                {band.severity}
              </span>
            </span>
            <span data-numeric className="text-[12px] font-medium text-ink">
              {band.value}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-overlay">
            <div
              className={cx("h-full rounded-full", SEVERITY_FILL[band.severity] ?? "bg-low")}
              style={{ width: `${(band.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Pipeline flow
// ---------------------------------------------------------------------------

export interface FlowStage {
  stage: string;
  value: string;
  unit: string;
  detail: string;
}

/**
 * The pipeline, as a flow carrying its real volumes.
 *
 * Replaces seven paragraphs of description with seven counts: what actually
 * explains a pipeline is how much of what comes out of each stage.
 */
export function PipelineFlow({ stages }: { stages: FlowStage[] }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((stage, index) => (
        <li
          key={stage.stage}
          className={cx(
            "relative bg-surface p-5",
            index === stages.length - 1 && "sm:col-span-2 lg:col-span-1",
          )}
        >
          <div className="flex items-center gap-2">
            <span data-numeric className="font-mono text-[10.5px] text-ink-faint">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-[12.5px] font-semibold text-ink">{stage.stage}</p>
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span data-numeric className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
              {stage.value}
            </span>
            <span className="text-[11.5px] text-ink-faint">{stage.unit}</span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{stage.detail}</p>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Conflict timeline
// ---------------------------------------------------------------------------

export interface TimelineMark {
  /** 0-1 along the axis. */
  at: number;
  date: string;
  source: string;
  statement: string;
  tone: "brand" | "high";
}

/**
 * The two statements on one time axis.
 *
 * This is the product's entire thesis as a picture: two marks eleven weeks
 * apart, in different documents, with the span between them labelled. The
 * drawing is `aria-hidden` and the same facts are in the list beside it, so the
 * diagram never becomes the only way to get the information.
 */
export function ConflictTimeline({
  marks,
  spanLabel,
  children,
}: {
  marks: [TimelineMark, TimelineMark];
  spanLabel: string;
  children: ReactNode;
}) {
  const stroke = { brand: "var(--color-brand)", high: "var(--color-high)" };

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <svg viewBox="0 0 640 132" className="h-auto w-full" aria-hidden>
        {/* Axis: a solid hairline, one shade off the surface. */}
        <line x1="24" y1="96" x2="616" y2="96" stroke="var(--color-edge)" strokeWidth="1" />

        {/* The span that nobody closed. */}
        <line
          x1={24 + marks[0].at * 592}
          y1="112"
          x2={24 + marks[1].at * 592}
          y2="112"
          stroke="var(--color-critical)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x={24 + ((marks[0].at + marks[1].at) / 2) * 592}
          y="127"
          textAnchor="middle"
          className="fill-[var(--color-critical)] text-[10px]"
        >
          {spanLabel}
        </text>

        {marks.map((mark) => {
          const x = 24 + mark.at * 592;
          return (
            <g key={mark.source}>
              <line x1={x} y1="40" x2={x} y2="96" stroke={stroke[mark.tone]} strokeWidth="1.5" />
              <circle cx={x} cy="96" r="4" fill={stroke[mark.tone]} />
              <text
                x={x}
                y="30"
                textAnchor={mark.at > 0.5 ? "end" : "start"}
                className="fill-[var(--color-ink)] text-[11px] font-medium"
              >
                {mark.date}
              </text>
              <text
                x={x}
                y="14"
                textAnchor={mark.at > 0.5 ? "end" : "start"}
                className="fill-[var(--color-ink-faint)] text-[10px]"
              >
                {mark.source}
              </text>
            </g>
          );
        })}
      </svg>

      {children}
    </div>
  );
}
