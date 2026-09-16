import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Serverless storage behaviour.
 *
 * On Vercel or Lambda the deployment bundle is read-only, so the database has
 * to live in the instance's own /tmp. Getting this wrong does not fail loudly -
 * it fails at the first write, in production, on a demo someone is watching.
 *
 * Each case re-imports the module so the environment is read fresh.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.VERCEL;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.REQUIREIQ_DB_PATH;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("database location", () => {
  it("writes under the repo by default when running normally", async () => {
    const { isEphemeral, IS_SERVERLESS } = await import("@/lib/db/connection");
    expect(IS_SERVERLESS).toBe(false);
    expect(isEphemeral()).toBe(false);
  });

  it("treats a Vercel deployment as serverless", async () => {
    process.env.VERCEL = "1";
    const { IS_SERVERLESS, isEphemeral } = await import("@/lib/db/connection");
    expect(IS_SERVERLESS).toBe(true);
    // Ephemeral, so the UI must warn that writes do not survive.
    expect(isEphemeral()).toBe(true);
  });

  it("treats a Lambda deployment as serverless", async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "requireiq";
    const { IS_SERVERLESS } = await import("@/lib/db/connection");
    expect(IS_SERVERLESS).toBe(true);
  });

  it("stops warning once a real database path is configured", async () => {
    process.env.VERCEL = "1";
    process.env.REQUIREIQ_DB_PATH = "/mnt/data/requireiq.db";
    const { IS_SERVERLESS, isEphemeral } = await import("@/lib/db/connection");
    expect(IS_SERVERLESS).toBe(true);
    // An explicit path means someone has attached durable storage.
    expect(isEphemeral()).toBe(false);
  });
});
