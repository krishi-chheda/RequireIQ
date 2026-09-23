import type { ReactNode } from "react";
import Link from "next/link";
import {
  PROVENANCE_LABEL,
  REVIEW_STATUS_LABEL,
  type Provenance,
  type ReviewStatus,
  type Severity,
} from "@/lib/types";

/**
 * Shared presentation primitives.
 *
 * Kept in one module on purpose. These are twenty small, tightly-related pieces
 * of the same visual language; splitting them across twenty files would add
 * navigation cost and nothing else.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={cx(
        "rounded-lg border border-line bg-surface",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-[13px] font-semibold tracking-[0.02em] text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Small uppercase label that opens a block of related content. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-faint", className)}>
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "positive" | "critical" | "high" | "medium" | "low";
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-edge bg-overlay text-ink-muted",
    brand: "border-brand/35 bg-brand-soft text-brand-ink",
    positive: "border-positive/30 bg-positive-soft text-positive",
    /* Severity tones carry the word in `ink`, not in the severity colour.
       The status set is mode-invariant and is only guaranteed legible as a
       MARK (3:1) rather than as text (4.5:1); the dot and the tint carry the
       colour, the word carries the meaning. */
    critical: "border-critical/35 bg-critical-soft text-ink",
    high: "border-high/35 bg-high-soft text-ink",
    medium: "border-medium/35 bg-medium-soft text-ink",
    low: "border-edge bg-low-soft text-ink-muted",
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<Severity, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} className={cx("uppercase tracking-[0.06em]", className)}>
      <Dot severity={severity} />
      {severity}
    </Badge>
  );
}

export function Dot({ severity }: { severity: Severity }) {
  const colour: Record<Severity, string> = {
    critical: "bg-critical",
    high: "bg-high",
    medium: "bg-medium",
    low: "bg-ink-faint",
  };
  return <span aria-hidden className={cx("size-1.5 rounded-full", colour[severity])} />;
}

const STATUS_TONE: Record<ReviewStatus, "neutral" | "brand" | "positive" | "critical" | "medium"> = {
  proposed: "brand",
  in_review: "medium",
  needs_clarification: "medium",
  approved: "positive",
  rejected: "critical",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

/**
 * The provenance chip.
 *
 * Present on every derived record in the product. It is the single control that
 * stops a reader mistaking a machine reading for something a client said, so it
 * is never abbreviated away and never suppressed for density.
 */
export function ProvenanceTag({
  provenance,
  className,
  compact = false,
}: {
  provenance: Provenance;
  className?: string;
  compact?: boolean;
}) {
  const style: Record<Provenance, { chip: string; dot: string; hint: string }> = {
    source: {
      chip: "border-prov-source/30 bg-overlay text-prov-source",
      dot: "bg-prov-source",
      hint: "Verbatim text from an ingested document.",
    },
    ai_analysis: {
      chip: "border-prov-ai/30 bg-brand-soft text-prov-ai",
      dot: "bg-prov-ai",
      hint: "A machine reading of source text. Traceable to evidence, not authoritative.",
    },
    ai_suggestion: {
      chip: "border-prov-suggest/30 bg-prov-suggest-soft text-prov-suggest",
      dot: "bg-prov-suggest",
      hint: "A proposal. Nothing is applied without a human action.",
    },
    human: {
      chip: "border-prov-human/30 bg-positive-soft text-prov-human",
      dot: "bg-prov-human",
      hint: "Entered or confirmed by a named person.",
    },
  };
  const entry = style[provenance];

  return (
    <span
      title={entry.hint}
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        entry.chip,
        className,
      )}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", entry.dot)} />
      {compact ? null : PROVENANCE_LABEL[provenance]}
    </span>
  );
}

/** Monospaced record reference, e.g. REQ-1029. */
export function Ref({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("font-mono text-[11.5px] tracking-tight text-ink-muted", className)}>{children}</span>
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * A single dashboard figure.
 *
 * `reason` is required rather than optional by convention: the product's
 * position is that a number without a stated reason is decoration.
 */
export function Stat({
  label,
  value,
  reason,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  reason: string;
  tone?: "neutral" | "critical" | "high" | "positive" | "brand";
  href?: string;
}) {
  const accent: Record<string, string> = {
    neutral: "text-ink",
    critical: "text-critical-ink",
    high: "text-high-ink",
    positive: "text-positive",
    brand: "text-brand-ink",
  };

  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <p data-numeric className={cx("mt-2 text-[27px] font-semibold leading-none tracking-[-0.03em]", accent[tone])}>
        {value}
      </p>
      <p className="mt-2.5 text-[12px] leading-snug text-ink-faint">{reason}</p>
    </>
  );

  const classes =
    "block rounded-lg border border-line bg-surface p-4 transition-colors duration-150";

  return href ? (
    <Link href={href} className={cx(classes, "hover:border-edge hover:bg-raised")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** Horizontal proportion bar. `max` defaults to 100 so it reads as a percent. */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  label,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "critical" | "high" | "medium" | "positive";
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fill: Record<string, string> = {
    brand: "bg-brand",
    critical: "bg-critical",
    high: "bg-high",
    medium: "bg-medium",
    positive: "bg-positive",
  };
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-overlay"
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500", fill[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Extraction confidence, always rendered with the word "confidence" nearby. */
export function Confidence({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? "positive" : pct >= 70 ? "brand" : "medium";
  return (
    <span className={cx("inline-flex items-center gap-2", className)} title={`Extraction confidence ${pct}%`}>
      <span className="w-14">
        <Meter value={pct} tone={tone} label={`Extraction confidence ${pct}%`} />
      </span>
      <span data-numeric className="text-[11.5px] text-ink-muted">
        {pct}%
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div aria-hidden className="mb-1 size-8 rounded-md border border-edge bg-overlay" />
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      <p className="max-w-md text-[12.5px] leading-relaxed text-ink-muted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Skeleton row used by route-level loading files. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-md border border-line bg-surface"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "brand" | "critical" | "high" | "positive";
  title?: ReactNode;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-edge bg-raised",
    brand: "border-brand/25 bg-brand-soft",
    critical: "border-critical/25 bg-critical-soft",
    high: "border-high/25 bg-high-soft",
    positive: "border-positive/25 bg-positive-soft",
  };
  return (
    <div className={cx("rounded-md border px-4 py-3", tones[tone])}>
      {title ? <p className="mb-1 text-[12.5px] font-semibold text-ink">{title}</p> : null}
      <div className="text-[12.5px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export const BUTTON_VARIANTS: Record<string, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "border border-edge bg-overlay text-ink hover:border-ink-faint hover:bg-hover",
  ghost: "text-ink-muted hover:bg-overlay hover:text-ink",
  danger: "border border-critical/40 bg-critical-soft text-critical-ink hover:bg-critical/15",
  positive: "border border-positive/40 bg-positive-soft text-positive hover:bg-positive/15",
};

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "secondary",
  className?: string,
): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Tables scroll horizontally inside their own container, never the page.
 *
 * `minWidth` is per-table and matters more than it looks: with several fixed
 * metadata columns, too small a minimum crushes the one column that carries the
 * actual content. Set it to the sum of the fixed columns plus the room the
 * content column genuinely needs, and let the container scroll below that.
 */
export function TableFrame({
  children,
  className,
  minWidth = 980,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table
        className="table-sticky-first w-full border-collapse text-left text-[12.5px]"
        style={{ minWidth: `${minWidth}px` }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  scope = "col",
}: {
  children: ReactNode;
  className?: string;
  scope?: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      className={cx(
        "border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-4 py-3 align-top text-ink-muted", className)}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Dates are formatted in a fixed locale on purpose.
 *
 * Server-rendered output must match what the client hydrates, and it must not
 * silently change shape depending on where the server runs.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // UTC, and labelled as such: an audit trail whose times a reader silently
  // assumes are local is worse than no timestamp at all.
  return `${formatDate(iso)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
