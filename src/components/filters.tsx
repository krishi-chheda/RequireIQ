"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { cx } from "./ui";
import { INPUT_CLASS } from "./forms";

/**
 * Register filters.
 *
 * State lives in the URL, not in the component. That makes every filtered view
 * linkable and shareable - "here are the twelve requirements with no owner" is
 * a link a consultant can paste into an email - and it means the back button
 * does what a reader expects.
 */

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  param: string;
  label: string;
  options: FilterOption[];
}

export function RegisterFilters({
  groups,
  total,
  shown,
}: {
  groups: FilterGroup[];
  total: number;
  shown: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchId = useId();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  // Keep the box in step when the URL changes from elsewhere (a filter chip,
  // the back button, a deep link from the dashboard).
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const push = (mutate: (params: URLSearchParams) => void): void => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  // Debounced so typing does not fire a navigation per keystroke.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const timer = setTimeout(() => {
      push((params) => {
        if (search) params.set("q", search);
        else params.delete("q");
      });
    }, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeCount = groups.filter((g) => searchParams.get(g.param)).length + (search ? 1 : 0);

  return (
    <div className={cx("space-y-4", pending && "opacity-70 transition-opacity")}>
      <div>
        <label htmlFor={searchId} className="sr-only">
          Search requirement text or reference
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search statements and references"
          className={INPUT_CLASS}
        />
      </div>

      {groups.map((group) => {
        const active = searchParams.get(group.param);
        return (
          <fieldset key={group.param} className="border-0 p-0">
            <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
              {group.label}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const selected = active === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      push((params) => {
                        if (selected) params.delete(group.param);
                        else params.set(group.param, option.value);
                      })
                    }
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11.5px] transition-colors duration-150",
                      selected
                        ? "border-brand/50 bg-brand-soft text-brand-ink"
                        : "border-line bg-surface text-ink-muted hover:border-edge hover:text-ink",
                    )}
                  >
                    {option.label}
                    {typeof option.count === "number" ? (
                      <span data-numeric className="text-ink-faint">
                        {option.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p data-numeric className="text-[11.5px] text-ink-faint">
          {shown === total ? `${total} requirements` : `${shown} of ${total}`}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="text-[11.5px] text-brand-ink transition-colors hover:text-ink"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
