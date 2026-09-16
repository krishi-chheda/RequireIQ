import { cx } from "./ui";

/**
 * The mark.
 *
 * Three stacked bars: two aligned, one offset. It is a small picture of the
 * product's subject - statements that should agree and do not.
 */
export function Logo({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cx("shrink-0", className)}
    >
      <rect x="2" y="2.5" width="20" height="19" rx="4.5" className="fill-brand-soft stroke-brand/50" strokeWidth="1" />
      <rect x="6" y="7" width="12" height="2.2" rx="1.1" className="fill-brand-ink" />
      <rect x="6" y="11" width="12" height="2.2" rx="1.1" className="fill-brand-ink" opacity="0.55" />
      <rect x="6" y="15" width="7" height="2.2" rx="1.1" className="fill-critical" />
    </svg>
  );
}

export function Wordmark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <Logo size={size} />
      <span className="text-[14px] font-semibold tracking-[-0.015em] text-ink">
        Require<span className="text-brand-ink">IQ</span>
      </span>
    </span>
  );
}
