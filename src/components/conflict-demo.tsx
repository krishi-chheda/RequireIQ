"use client";

import { useId, useMemo, useState } from "react";
import { SIZING_MODEL, estimateAnnualInfrastructureCost } from "@/lib/ai/engine/sizing";
import { cx } from "./ui";

/**
 * The capacity-versus-budget detector, run live in the browser.
 *
 * A client component because the whole point is that the reader moves the
 * inputs themselves. It calls the same exported function the server-side
 * detector calls - not a reimplementation of it - so the arithmetic on the
 * landing page is the arithmetic in the product. If the heuristic changes, this
 * changes with it.
 *
 * It also demonstrates the rule the detector is built on: it never says
 * "impossible". Above the threshold it raises a question and names who has to
 * answer it.
 */

const USERS_MIN = 1_000;
const USERS_MAX = 25_000;
const USERS_STEP = 500;

const CAP_MIN = 50_000;
const CAP_MAX = 700_000;
const CAP_STEP = 10_000;

/** The two figures the Meridian documents actually state. */
const STATED_USERS = 10_000;
const STATED_CAP = 200_000;

const money = (value: number): string => `$${value.toLocaleString("en-US")}`;

/**
 * Mirrors the severity bands in `detectConflicts`. Below 1.1x the estimate and
 * the cap are inside the heuristic's own margin of error, so nothing is raised.
 */
function verdict(ratio: number): { tone: "positive" | "medium" | "high" | "critical"; label: string } {
  if (ratio < 1.1) return { tone: "positive", label: "No conflict raised" };
  if (ratio < 1.35) return { tone: "medium", label: "Potential conflict · medium severity" };
  if (ratio < 2) return { tone: "high", label: "Potential conflict · high severity" };
  return { tone: "critical", label: "Potential conflict · critical severity" };
}

const TONE: Record<string, { border: string; bg: string; text: string }> = {
  positive: { border: "border-positive/25", bg: "bg-positive-soft/50", text: "text-positive" },
  medium: { border: "border-medium/25", bg: "bg-medium-soft/50", text: "text-medium" },
  high: { border: "border-high/25", bg: "bg-high-soft/50", text: "text-high" },
  critical: { border: "border-critical/25", bg: "bg-critical-soft/50", text: "text-critical" },
};

export function ConflictDemo() {
  const usersId = useId();
  const capId = useId();
  const zoneId = useId();

  const [users, setUsers] = useState(STATED_USERS);
  const [cap, setCap] = useState(STATED_CAP);
  const [multiZone, setMultiZone] = useState(true);

  const estimate = useMemo(() => estimateAnnualInfrastructureCost(users, multiZone), [users, multiZone]);
  const ratio = estimate.annualTotalCost / cap;
  const result = verdict(ratio);
  const tone = TONE[result.tone]!;

  const atStated = users === STATED_USERS && cap === STATED_CAP && multiZone;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-[12px] font-semibold text-ink">Capacity versus budget, live</p>
        <button
          type="button"
          onClick={() => {
            setUsers(STATED_USERS);
            setCap(STATED_CAP);
            setMultiZone(true);
          }}
          disabled={atStated}
          className="text-[11.5px] text-brand-ink transition-colors hover:text-ink disabled:cursor-default disabled:text-ink-faint"
        >
          {atStated ? "As the documents state it" : "Reset to the documents"}
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <Slider
          id={usersId}
          label="Concurrent users at peak"
          hint="Workshop 07 transcript"
          value={users}
          min={USERS_MIN}
          max={USERS_MAX}
          step={USERS_STEP}
          display={users.toLocaleString("en-US")}
          onChange={setUsers}
        />
        <Slider
          id={capId}
          label="First-year infrastructure cap"
          hint="Finance email, 19 June"
          value={cap}
          min={CAP_MIN}
          max={CAP_MAX}
          step={CAP_STEP}
          display={money(cap)}
          onChange={setCap}
        />

        <div className="flex items-center gap-2.5">
          <input
            id={zoneId}
            type="checkbox"
            checked={multiZone}
            onChange={(event) => setMultiZone(event.target.checked)}
            className="size-3.5 accent-brand"
          />
          <label htmlFor={zoneId} className="text-[12px] text-ink-muted">
            Multi-zone deployment
            <span className="ml-1.5 text-ink-faint">required by the 99.99% availability target</span>
          </label>
        </div>
      </div>

      {/* The workings. Every line comes from the engine, not from this file. */}
      <dl className="space-y-1.5 border-t border-line px-5 py-4 text-[11.5px]">
        {estimate.workings.map((line) => {
          const split = line.lastIndexOf(" = ");
          const left = split === -1 ? line : line.slice(0, split);
          const right = split === -1 ? null : line.slice(split + 3);
          return (
            <div key={line} className="flex justify-between gap-4">
              <dt className="text-ink-faint">{left}</dt>
              {right ? (
                <dd data-numeric className="shrink-0 text-right font-medium text-ink">
                  {right}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>

      <div
        aria-live="polite"
        className={cx("border-t px-5 py-4", tone.border, tone.bg)}
      >
        <p className={cx("text-[12.5px] font-semibold", tone.text)}>{result.label}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
          {money(estimate.annualTotalCost)} indicative first-year infrastructure against a{" "}
          {money(cap)} cap — <span data-numeric>{ratio.toFixed(2)}x</span>.{" "}
          {result.tone === "positive"
            ? "Inside the heuristic's own margin of error, so the detector stays quiet rather than manufacturing a finding."
            : "A heuristic on generic private-cloud unit costs, not a quotation."}
        </p>
        {result.tone !== "positive" ? (
          <p className="mt-2.5 border-t border-line/60 pt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
            <span className="font-medium text-ink-muted">Validation question.</span> Can platform engineering
            serve {users.toLocaleString("en-US")} concurrent users for under {money(cap)} in year one on this
            tenancy? The detector raises the question; it never declares the target impossible.
          </p>
        ) : null}
      </div>

      <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
        Assumes {SIZING_MODEL.concurrentUsersPerInstance} concurrent users per instance,{" "}
        {SIZING_MODEL.headroomFactor}x headroom, ${SIZING_MODEL.instanceCostPerMonth}/instance/month and{" "}
        {SIZING_MODEL.ancillaryFactor}x for storage, network and observability. Disagree with any of them and
        the estimate moves — which is why they are on screen.
      </p>
    </div>
  );
}

function Slider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12px] text-ink-muted">
          {label}
          <span className="ml-1.5 text-ink-faint">{hint}</span>
        </label>
        <output htmlFor={id} data-numeric className="text-[13px] font-semibold text-ink">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-brand"
      />
    </div>
  );
}
