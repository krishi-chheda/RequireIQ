/**
 * Input validation at the trust boundary.
 *
 * Small and deliberate rather than a schema library: there are five shapes of
 * input in this application, every one of them arrives as a FormData string or
 * a URL search parameter, and every one of them must fail closed. A dependency
 * would add more surface than it removes.
 *
 * Identifiers are constrained to a conservative character class. Nothing here
 * is the only defence - every query is parameterised - but a value that cannot
 * be an identifier should be rejected before it reaches the data layer rather
 * than after.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Removes C0/C1 control characters, keeping tab, newline and carriage return.
 *
 * Written as a codepoint filter rather than a regex character class so the
 * source file never has to contain a literal control character - a file that
 * does is one bad round-trip away from being silently corrupted.
 */
function stripControlCharacters(input: string): string {
  let out = "";
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    if (isAllowedWhitespace) {
      out += character;
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    out += character;
  }
  return out;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const z = {
  /** A record identifier. Rejects anything outside a safe character class. */
  id(value: FormDataEntryValue | string | null | undefined, label: string): string {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
      throw new ValidationError(`Invalid ${label}.`);
    }
    return value;
  },

  /**
   * Free text. Trimmed, length-checked, and stripped of control characters -
   * a stray NUL or escape sequence in a requirement statement is never
   * intentional and would corrupt an exported CSV.
   */
  text(
    value: FormDataEntryValue | string | null | undefined,
    { min = 0, max = 2000, label }: { min?: number; max?: number; label: string },
  ): string {
    const raw = typeof value === "string" ? value : "";
    const cleaned = stripControlCharacters(raw).trim();
    if (cleaned.length < min) {
      throw new ValidationError(`The ${label} must be at least ${min} characters.`);
    }
    if (cleaned.length > max) {
      throw new ValidationError(`The ${label} must be ${max} characters or fewer.`);
    }
    return cleaned;
  },

  /** One of a fixed set. The set is the type, so a typo fails at compile time. */
  oneOf<const T extends readonly string[]>(
    value: FormDataEntryValue | string | null | undefined,
    allowed: T,
    label: string,
  ): T[number] {
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw new ValidationError(`Invalid ${label}.`);
    }
    return value;
  },

  /**
   * An optional URL search parameter constrained to a fixed set.
   *
   * Returns undefined rather than throwing: a stale bookmark with a filter that
   * no longer exists should show the unfiltered page, not an error.
   */
  optionalOneOf<const T extends readonly string[]>(
    value: string | string[] | undefined,
    allowed: T,
  ): T[number] | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" && allowed.includes(first) ? first : undefined;
  },

  /** A free-text search term from the URL. Length-capped, never interpolated. */
  search(value: string | string[] | undefined, max = 120): string {
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" ? first.slice(0, max).trim() : "";
  },
};
