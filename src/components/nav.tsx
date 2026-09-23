"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";
import { Wordmark } from "./brand";

/**
 * Project navigation.
 *
 * A client component only because it needs the current path to mark the active
 * item and to drive the mobile drawer. Everything it links to is server
 * rendered.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Count shown on the right. Rendered only when greater than zero. */
  count?: number;
  /** Draws the count in the severity colour when something needs attention. */
  alert?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function ProjectNav({
  groups,
  projectName,
  projectKey,
}: {
  groups: NavGroup[];
  projectName: string;
  projectKey: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile bar. The sidebar becomes a drawer below the lg breakpoint
          rather than a squeezed column, because the register tables need the
          full width on a phone. */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <Wordmark size={18} />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="project-nav"
          className="rounded-sm border border-edge bg-overlay px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <nav
        id="project-nav"
        aria-label="Project sections"
        className={cx(
          "shrink-0 border-line bg-surface lg:block lg:w-60 lg:border-r",
          open ? "block border-b" : "hidden",
        )}
      >
        {/* No wordmark here on desktop: the top bar already carries it, and
            repeating it costs a row of vertical space on every screen. */}
        <div className="border-b border-line px-4 py-3.5">
          <p className="truncate text-[13px] font-medium text-ink" title={projectName}>
            {projectName}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">{projectKey}</p>
        </div>

        <div className="space-y-5 px-3 py-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  // Exact match for the workspace root, prefix match for its sections, so
  // "/requirements/req_1" still highlights "Requirements".
  const isRoot = item.href.split("/").length === 4;
  const active = isRoot ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "group flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[12.5px] transition-colors duration-150",
          active ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-muted hover:bg-overlay hover:text-ink",
        )}
      >
        <span className="truncate">{item.label}</span>
        {item.count && item.count > 0 ? (
          <span
            data-numeric
            className={cx(
              "shrink-0 rounded-xs px-1.5 py-px text-[10.5px] font-medium tabular-nums",
              item.alert ? "bg-critical-soft text-critical-ink" : "bg-overlay text-ink-faint",
            )}
          >
            {item.count}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
