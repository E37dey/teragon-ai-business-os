// Gate S7.0 — the remote acceptance harness is wired but fails HARD (never
// skips) when not configured, and encodes the required failure guards.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { acceptanceEnabled, acceptanceEnvOrThrow } from "../../e2e/acceptance/_guard";

const KEYS = ["STAGING_ACCEPTANCE", "STAGING_PREVIEW_URL", "STAGING_SUPABASE_PROJECT_REF", "INTENDED_COMMIT"];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("acceptance env guard — never a silent skip", () => {
  it("is disabled unless STAGING_ACCEPTANCE=1", () => {
    delete process.env.STAGING_ACCEPTANCE;
    expect(acceptanceEnabled()).toBe(false);
    expect(() => acceptanceEnvOrThrow()).toThrow(/STAGING_ACCEPTANCE=1/);
  });

  it("throws with the missing NAMES when enabled but misconfigured", () => {
    process.env.STAGING_ACCEPTANCE = "1";
    delete process.env.STAGING_PREVIEW_URL;
    delete process.env.STAGING_SUPABASE_PROJECT_REF;
    delete process.env.INTENDED_COMMIT;
    expect(() => acceptanceEnvOrThrow()).toThrow(/STAGING_PREVIEW_URL/);
  });

  it("resolves cleanly when fully configured", () => {
    process.env.STAGING_ACCEPTANCE = "1";
    process.env.STAGING_PREVIEW_URL = "https://preview.example.netlify.app/";
    process.env.STAGING_SUPABASE_PROJECT_REF = "refabc";
    process.env.INTENDED_COMMIT = "deadbeef";
    const env = acceptanceEnvOrThrow();
    expect(env.previewUrl).toBe("https://preview.example.netlify.app");
    expect(env.projectRef).toBe("refabc");
  });
});

describe("acceptance spec encodes the required failure guards", () => {
  const src = readFileSync(resolve(process.cwd(), "e2e/acceptance/staging-acceptance.accept.ts"), "utf8");

  it("fails when no tests execute (executed-count guard)", () => {
    expect(src).toMatch(/executed === 0/);
    expect(src).toMatch(/no tests executed/i);
  });

  it("fails on a silent IndexedDB fallback + wrong Supabase project", () => {
    expect(src).toContain("assertConnectedToSupabase");
    expect(src).toMatch(/no silent IndexedDB fallback/i);
    expect(src).toMatch(/every Supabase request must target the intended staging project/i);
  });

  it("fails when the deployed commit != intended commit", () => {
    expect(src).toMatch(/deployed build must expose the intended commit/i);
    expect(src).toContain("ENV.intendedCommit");
  });

  it("guards prototype flags OFF and CSP present", () => {
    expect(src).toMatch(/Business Graph prototype must be OFF/);
    expect(src).toMatch(/content-security-policy/i);
  });
});
