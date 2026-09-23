import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design-system gate.
 *
 * Properties the product claims in its README and its UI skill, checked rather
 * than asserted in prose:
 *
 *   1. Colour lives in `tokens.css`. A raw hex anywhere else is drift.
 *   2. Every text token clears WCAG AA against every surface it can sit on -
 *      in BOTH modes, independently.
 *   3. The severity marks are mode-invariant and clear 3:1 as graphical
 *      objects against both the lightest and the darkest ground.
 *   4. The `theme-color` meta matches the canvas of the mode it names.
 *
 * Written as a test rather than a separate lint script because `npm run
 * verify` already runs vitest, so this needs no new dependency, no new runtime
 * and no new command for anyone to remember.
 */

const SRC = join(process.cwd(), "src");
const TOKENS = readFileSync(join(SRC, "app", "tokens.css"), "utf8");

// ---------------------------------------------------------------------------
// Parsing the two ramps
// ---------------------------------------------------------------------------

/** Pulls `--color-*: #rrggbb;` pairs out of one brace-delimited block. */
function block(startMarker: string): Map<string, string> {
  const start = TOKENS.indexOf(startMarker);
  if (start === -1) throw new Error(`Block ${startMarker} not found in tokens.css`);
  const open = TOKENS.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < TOKENS.length; i += 1) {
    if (TOKENS[i] === "{") depth += 1;
    if (TOKENS[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = TOKENS.slice(open, end);
  const found = new Map<string, string>();
  for (const match of body.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) found.set(name, value.toLowerCase());
  }
  return found;
}

const DARK = block("@theme");
const LIGHT_OVERRIDES = block('[data-theme="light"]');

/**
 * Light inherits every token it does not redeclare - which is how the severity
 * marks stay mode-invariant while their tinted backgrounds do not.
 */
function hex(mode: "dark" | "light", name: string): string {
  const value = mode === "light" ? (LIGHT_OVERRIDES.get(name) ?? DARK.get(name)) : DARK.get(name);
  if (!value) throw new Error(`Token ${name} is not defined for ${mode}`);
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
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// ---------------------------------------------------------------------------
// 1. No raw colour outside tokens.css
// ---------------------------------------------------------------------------

/**
 * `<meta name="theme-color">` is consumed by the browser chrome before CSS is
 * parsed, so it cannot reference a custom property. Both of its literals are
 * checked against the canvas tokens below instead.
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

describe("colour lives in tokens.css", () => {
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

  it("keeps each theme-color meta equal to that mode's canvas", () => {
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    const declared = [...layout.matchAll(/color:\s*"(#[0-9a-fA-F]{6})"/g)].map((m) =>
      m[1]!.toLowerCase(),
    );
    expect(declared).toContain(hex("dark", "--color-canvas"));
    expect(declared).toContain(hex("light", "--color-canvas"));
  });
});

// ---------------------------------------------------------------------------
// 2. Text contrast, per mode
// ---------------------------------------------------------------------------

const SURFACES = ["canvas", "surface", "raised", "overlay", "hover"] as const;

/** Foreground tokens rendered as text somewhere in the product. */
const TEXT = [
  "ink",
  "ink-muted",
  "ink-faint",
  "brand-ink",
  "positive",
  "critical-ink",
  "high-ink",
  "medium-ink",
  "prov-source",
  "prov-ai",
  "prov-suggest",
  "prov-human",
] as const;

const MODES = ["dark", "light"] as const;

describe.each(MODES)("%s mode: text contrast clears WCAG AA", (mode) => {
  it.each(TEXT)("%s is at least 4.5:1 on every surface", (name) => {
    for (const surface of SURFACES) {
      const ratio = contrastRatio(hex(mode, `--color-${name}`), hex(mode, `--color-${surface}`));
      expect(ratio, `${name} on ${surface} in ${mode} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["ink", "critical-soft"],
    ["ink", "high-soft"],
    ["ink", "medium-soft"],
    ["ink", "low-soft"],
    ["ink-muted", "brand-soft"],
    ["positive", "positive-soft"],
    ["brand-ink", "brand-soft"],
    ["prov-suggest", "prov-suggest-soft"],
  ])("%s on %s is at least 4.5:1", (foreground, background) => {
    const ratio = contrastRatio(hex(mode, `--color-${foreground}`), hex(mode, `--color-${background}`));
    expect(
      ratio,
      `${foreground} on ${background} in ${mode} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps on-brand legible on both brand fills", () => {
    for (const fill of ["brand", "brand-strong"]) {
      const ratio = contrastRatio(hex(mode, "--color-on-brand"), hex(mode, `--color-${fill}`));
      expect(ratio, `on-brand over ${fill} in ${mode} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Severity marks: mode-invariant, and legible on both grounds
// ---------------------------------------------------------------------------

const SEVERITY = ["critical", "high", "medium", "low"] as const;

describe("severity is a mode-invariant status palette", () => {
  it.each(SEVERITY)("%s is not redeclared for light mode", (name) => {
    // If a severity mark ever gets a light-mode override, the invariant this
    // whole approach rests on is gone - and so is the reason one status set
    // can serve both grounds.
    expect(LIGHT_OVERRIDES.has(`--color-${name}`)).toBe(false);
  });

  it.each(SEVERITY)("%s clears 3:1 as a mark on the lightest and darkest ground", (name) => {
    const mark = hex("dark", `--color-${name}`);
    for (const ground of [hex("light", "--color-surface"), hex("dark", "--color-canvas")]) {
      const ratio = contrastRatio(mark, ground);
      expect(ratio, `${name} on ${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Graph palette
// ---------------------------------------------------------------------------

/**
 * `supports` is the most common edge by a wide margin; drawn at full strength
 * it turns the picture into noise. The graph is `aria-hidden` and every edge is
 * also a row in the relationship table, so nothing depends on reading it.
 */
const BELOW_THRESHOLD_BY_DESIGN = new Set(["--color-rel-supports"]);

describe.each(MODES)("%s mode: graph palette clears WCAG 1.4.11", (mode) => {
  it("draws every class and relationship colour at 3:1 on surface", () => {
    const surface = hex(mode, "--color-surface");
    const weak: string[] = [];
    const names = new Set([...DARK.keys(), ...LIGHT_OVERRIDES.keys()]);

    for (const name of names) {
      if (!name.startsWith("--color-class-") && !name.startsWith("--color-rel-")) continue;
      if (BELOW_THRESHOLD_BY_DESIGN.has(name)) continue;
      const ratio = contrastRatio(hex(mode, name), surface);
      if (ratio < 3) weak.push(`${name} ${hex(mode, name)} is ${ratio.toFixed(2)}:1`);
    }

    expect(weak, `Below 3:1 against ${mode} surface:\n${weak.join("\n")}`).toEqual([]);
  });

  it("gives every requirement class a colour", () => {
    const classes = [...DARK.keys()].filter((name) => name.startsWith("--color-class-"));
    expect(classes).toContain("--color-class-unknown");
    expect(classes.length).toBeGreaterThanOrEqual(14);
  });
});
