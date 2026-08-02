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

describe("live acceptance spec (S7.3B-PREP) encodes the required guards", () => {
  const src = readFileSync(resolve(process.cwd(), "e2e/acceptance/staging-acceptance.accept.ts"), "utf8");

  it("encodes the executed-count guard (never a silent no-op)", () => {
    expect(src).toMatch(/at least one acceptance test must execute/);
    expect(src).toContain("executed++");
  });

  it("detects IndexedDB in the Supabase composition + wrong Supabase project", () => {
    expect(src).toContain("indexedDbInSupabaseComposition");
    expect(src).toContain("wrongSupabaseHosts");
  });

  it("verifies the intended commit + provider provenance before login", () => {
    expect(src).toContain("ENV.intendedCommit");
    expect(src).toContain("observedCommit");
    expect(src).toMatch(/provider.*SUPABASE|SUPABASE.*provider/);
  });

  it("guards prototype flags OFF and scans for Google Fonts + privileged material", () => {
    expect(src).toContain("graphFacadeEnabled");
    expect(src).toContain("graphOperatorAuthEnabled");
    expect(src).toContain("googleFontRequests");
    expect(src).toContain("scanBundleForSecrets");
  });

  it("records missing UI capabilities honestly (never fabricates a domain PASS)", () => {
    expect(src).toContain("uiCapabilityMissing");
    expect(src).toMatch(/UI_CAPABILITY_MISSING|capability/i);
  });
});
