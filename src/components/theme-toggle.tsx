"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

/**
 * Light/dark switch.
 *
 * The attribute this writes is the single mechanism behind the two token
 * ramps in `tokens.css`; nothing else in the app knows a theme exists.
 *
 * `THEME_SCRIPT` below runs before first paint and has already resolved the
 * stored choice, so this component only has to catch up with what the
 * document already says. It renders a stable placeholder until it has, because
 * the server cannot know which theme the reader chose and guessing produces a
 * hydration mismatch.
 */

export type Theme = "light" | "dark";

/**
 * Inlined into <head>. Runs synchronously before the first paint, so the page
 * never shows the wrong ramp and flashes to the right one.
 *
 * Wrapped in try/catch because `localStorage` throws outright in a privacy
 * mode rather than returning null, and a theme preference is not worth a blank
 * page.
 */
export const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('requireiq-theme');
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
`.trim();

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const apply = (next: Theme): void => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("requireiq-theme", next);
    } catch {
      // A reader who blocks storage still gets the switch for this page view.
    }
    setTheme(next);
  };

  // Same box before and after hydration, so nothing on the row shifts.
  if (theme === null) {
    return <div aria-hidden className={cx("h-7 w-[58px] rounded-sm border border-line", className)} />;
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cx("inline-flex h-7 items-center rounded-sm border border-line bg-surface p-0.5", className)}
    >
      {(["dark", "light"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => apply(option)}
          aria-pressed={theme === option}
          title={option === "dark" ? "Dark" : "Light"}
          className={cx(
            "rounded-xs px-2 py-0.5 text-[11px] capitalize transition-colors",
            theme === option
              ? "bg-overlay font-medium text-ink"
              : "text-ink-faint hover:text-ink-muted",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
