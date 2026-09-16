import { describe, expect, it } from "vitest";
import { ValidationError, z } from "@/lib/validate";

/**
 * Trust-boundary validation.
 *
 * These run against the exact helpers every server action and route handler
 * uses, because "fails closed" is a claim that needs a test behind it.
 */

describe("z.id", () => {
  it("accepts the identifier shapes the application generates", () => {
    expect(z.id("req_1029", "id")).toBe("req_1029");
    expect(z.id("prj_meridian_onboarding", "id")).toBe("prj_meridian_onboarding");
  });

  it("rejects anything outside the safe character class", () => {
    for (const bad of [
      "req 1029",
      "req'; DROP TABLE requirements;--",
      "../../etc/passwd",
      "req/1029",
      "<script>",
      "",
      null,
      undefined,
      123 as unknown as string,
    ]) {
      expect(() => z.id(bad as never, "id"), String(bad)).toThrow(ValidationError);
    }
  });

  it("rejects an identifier longer than the column allows", () => {
    expect(() => z.id("a".repeat(81), "id")).toThrow(ValidationError);
  });
});

describe("z.text", () => {
  it("trims and enforces the length bounds", () => {
    expect(z.text("  hello  ", { label: "note" })).toBe("hello");
    expect(() => z.text("hi", { min: 10, label: "statement" })).toThrow(ValidationError);
    expect(() => z.text("x".repeat(50), { max: 10, label: "note" })).toThrow(ValidationError);
  });

  it("strips control characters that would corrupt a CSV export", () => {
    const withNul = `The system must be ${String.fromCharCode(0)}secure${String.fromCharCode(27)}.`;
    const cleaned = z.text(withNul, { label: "statement" });
    expect(cleaned).toBe("The system must be secure.");
    expect(cleaned).not.toMatch(/[\p{Cc}]/u);
  });

  it("keeps newlines and tabs, which are legitimate in a note", () => {
    expect(z.text("line one\nline two", { label: "note" })).toBe("line one\nline two");
  });

  it("returns empty string for a missing optional value", () => {
    expect(z.text(null, { label: "note" })).toBe("");
  });
});

describe("z.oneOf", () => {
  it("accepts a member and rejects everything else", () => {
    expect(z.oneOf("approved", ["approved", "rejected"] as const, "decision")).toBe("approved");
    expect(() => z.oneOf("deleted", ["approved", "rejected"] as const, "decision")).toThrow(ValidationError);
    expect(() => z.oneOf(null, ["approved"] as const, "decision")).toThrow(ValidationError);
  });
});

describe("z.optionalOneOf", () => {
  it("returns undefined for a stale filter rather than throwing", () => {
    expect(z.optionalOneOf("gone", ["findings", "unowned"] as const)).toBeUndefined();
    expect(z.optionalOneOf(undefined, ["findings"] as const)).toBeUndefined();
    expect(z.optionalOneOf("findings", ["findings"] as const)).toBe("findings");
  });

  it("takes the first value when a parameter repeats", () => {
    expect(z.optionalOneOf(["findings", "unowned"], ["findings", "unowned"] as const)).toBe("findings");
  });
});

describe("z.search", () => {
  it("caps the length so a pathological query cannot reach the database", () => {
    expect(z.search("x".repeat(500)).length).toBe(120);
  });

  it("passes SQL-looking text straight through, because queries are parameterised", () => {
    expect(z.search("'; DROP TABLE requirements;--")).toBe("'; DROP TABLE requirements;--");
  });
});
