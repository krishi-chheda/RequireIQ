import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design-system gate.
 *
 * Three properties the product claims in its README and its UI skill, checked
 * rather than asserted in prose:
 *
 *   1. Colour lives in `globals.css`. A raw hex anywhere else is drift.
 *   2. Every text token clears WCAG AA against every surface it can sit on.
 *   3. Every graph colour clears 3:1 against the surface behind it, except the
 *      one that is deliberately below and says so.
 *
 * Written as a test rather than a separate lint script because `npm run verify`
 * already runs vitest, so this needs no new dependency, no new runtime and no
 * new command for anyone to remember.
 */

const SRC = join(process.cwd(), "src");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

function tokens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of CSS.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) found.set(name, value.toLowerCase());
  }
  return found;
}

const TOKENS = tokens();

function hex(name: string): string {
  const value = TOKENS.get(name);
  if (!value) throw new Error(`Token ${name} is not defined in globals.css`);
  return value;
}

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------

function relativeLuminance(value: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(value.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// 1. No raw colour outside globals.css
// ---------------------------------------------------------------------------

/**
 * `<meta name="theme-color">` is consumed by the browser chrome before CSS is
 * parsed, so it cannot reference a custom property. It is checked against the
 * canvas token below instead.
 */
const RAW_COLOUR_EXEMPT = new Set(["app/layout.tsx"]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) acc.push(path);
  }
  return acc;
}

describe("colour lives in globals.css", () => {
  it("has no raw hex in any component or page", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles(SRC)) {
      const relative = path.slice(SRC.length + 1).replace(/\\/g, "/");
      if (RAW_COLOUR_EXEMPT.has(relative)) continue;

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          // Skip comments: a comment may legitimately quote a measured value.
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          const match = line.match(/#[0-9a-fA-F]{6}\b/);
          if (match) offenders.push(`${relative}:${index + 1}  ${match[0]}`);
        });
    }

    expect(offenders, `Use a --color-* token instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps the theme-color meta equal to the canvas token", () => {
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    const declared = layout.match(/themeColor:\s*"(#[0-9a-fA-F]{6})"/)?.[1]?.toLowerCase();
    expect(declared).toBe(hex("--color-canvas"));
  });
});

// ---------------------------------------------------------------------------
// 2. Text contrast
// ---------------------------------------------------------------------------

/** Every background a text token can be rendered on, darkest to lightest. */
const SURFACES = ["canvas", "surface", "raised", "overlay", "hover"] as const;

/** Foreground tokens used for text anywhere in the product. */
const TEXT = [
  "ink",
  "ink-muted",
  "ink-faint",
  "brand-ink",
  "critical",
  "high",
  "medium",
  "positive",
  "prov-source",
  "prov-ai",
  "prov-suggest",
  "prov-human",
] as const;

describe("text contrast clears WCAG AA", () => {
  it.each(TEXT)("%s is at least 4.5:1 on every surface", (name) => {
    for (const surface of SURFACES) {
      const ratio = contrastRatio(hex(`--color-${name}`), hex(`--color-${surface}`));
      expect(ratio, `${name} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["critical", "critical-soft"],
    ["high", "high-soft"],
    ["medium", "medium-soft"],
    ["positive", "positive-soft"],
    ["brand-ink", "brand-soft"],
    ["prov-suggest", "prov-suggest-soft"],
  ])("%s on %s is at least 4.5:1", (foreground, background) => {
    const ratio = contrastRatio(hex(`--color-${foreground}`), hex(`--color-${background}`));
    expect(ratio, `${foreground} on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps white on the brand fill above AA", () => {
    // The tightest pair in the system. If a change pushes it under, either the
    // brand darkens or primary buttons stop using white text.
    const ratio = contrastRatio("#ffffff", hex("--color-brand"));
    expect(ratio, `white on brand is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// 3. Graph palette
// ---------------------------------------------------------------------------

/**
 * `supports` is the most common edge by a wide margin; drawn at full strength
 * it turns the picture into noise. The graph is `aria-hidden` and every edge is
 * also a row in the relationship table, so nothing depends on reading it.
 */
const BELOW_THRESHOLD_BY_DESIGN = new Set(["--color-rel-supports"]);

describe("graph palette clears WCAG 1.4.11", () => {
  it("draws every class and relationship colour at 3:1 on surface", () => {
    const surface = hex("--color-surface");
    const weak: string[] = [];

    for (const [name, value] of TOKENS) {
      if (!name.startsWith("--color-class-") && !name.startsWith("--color-rel-")) continue;
      if (BELOW_THRESHOLD_BY_DESIGN.has(name)) continue;
      const ratio = contrastRatio(value, surface);
      if (ratio < 3) weak.push(`${name} ${value} is ${ratio.toFixed(2)}:1`);
    }

    expect(weak, `Below 3:1 against surface:\n${weak.join("\n")}`).toEqual([]);
  });

  it("still exempts only the edge that is meant to recede", () => {
    // Guards the exemption itself: if someone brightens `supports`, the
    // exemption is stale and should be deleted rather than left to hide a
    // future regression.
    const ratio = contrastRatio(hex("--color-rel-supports"), hex("--color-surface"));
    expect(ratio).toBeLessThan(3);
  });

  it("gives every requirement class a colour", () => {
    // Mirrors GROUP_COLOUR in src/components/graph.tsx. A new class that gets a
    // chip in the register but no token would fall back to `unknown` grey.
    const classes = [...TOKENS.keys()].filter((name) => name.startsWith("--color-class-"));
    expect(classes).toContain("--color-class-unknown");
    expect(classes.length).toBeGreaterThanOrEqual(14);
  });
});
