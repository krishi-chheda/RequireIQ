import type { ProjectHealth } from "@/lib/queries";
import { cx } from "./ui";

/**
 * Requirements health.
 *
 * Deliberately not an "AI score". It is 100 minus four named deductions, and
 * the deductions are always available next to the number - hovering the dial
 * shows them, and the workspace prints them in full. A figure a partner cannot
 * defend in a steering meeting has no business being on the screen.
 */

const BAND_LABEL: Record<ProjectHealth["band"], string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
  critical: "Critical",
};

const BAND_COLOUR: Record<ProjectHealth["band"], string> = {
  healthy: "var(--color-positive)",
  watch: "var(--color-medium)",
  at_risk: "var(--color-high)",
  critical: "var(--color-critical)",
};

const BAND_TEXT: Record<ProjectHealth["band"], string> = {
  healthy: "text-positive",
  watch: "text-medium-ink",
  at_risk: "text-high-ink",
  critical: "text-critical-ink",
};

export function HealthDial({ health, size = 104 }: { health: ProjectHealth; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (health.score / 100) * circumference;
  const summary = health.deductions
    .filter((d) => d.points > 0)
    .map((d) => `${d.label}: -${d.points}`)
    .join("\n");

  return (
    <div className="flex flex-col items-center gap-2" title={summary || "No deductions."}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-overlay)"
            strokeWidth="6"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={BAND_COLOUR[health.band]}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-numeric
            className={cx("text-[24px] font-semibold leading-none tracking-[-0.03em]", BAND_TEXT[health.band])}
          >
            {health.score}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-faint">/ 100</span>
        </div>
      </div>
      <p className={cx("text-[12px] font-medium", BAND_TEXT[health.band])}>
        {BAND_LABEL[health.band]}
      </p>
      <p className="text-[10.5px] uppercase tracking-[0.11em] text-ink-faint">Requirements health</p>
    </div>
  );
}

/** The deduction breakdown, printed in full. */
export function HealthBreakdown({ health }: { health: ProjectHealth }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
        <p className="text-[12.5px] text-ink-muted">Starting score</p>
        <p data-numeric className="text-[13px] font-medium text-ink">
          100
        </p>
      </div>
      {health.deductions.map((deduction) => (
        <div key={deduction.label} className="border-b border-line pb-3 last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12.5px] font-medium text-ink">{deduction.label}</p>
            <p
              data-numeric
              className={cx(
                "shrink-0 text-[13px] font-medium",
                deduction.points > 0 ? "text-critical-ink" : "text-ink-faint",
              )}
            >
              {deduction.points > 0 ? `-${deduction.points}` : "0"}
            </p>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">{deduction.detail}</p>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <p className="text-[12.5px] font-semibold text-ink">Requirements health</p>
        <p data-numeric className={cx("text-[15px] font-semibold", BAND_TEXT[health.band])}>
          {health.score} &middot; {BAND_LABEL[health.band]}
        </p>
      </div>
    </div>
  );
}
