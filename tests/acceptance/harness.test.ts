/// <reference types="node" />
// Gate S7.3B-PREP — acceptance-harness self-tests (deterministic; default suite).
// These validate the fail-hard guards, detection, and report redaction of the
// acceptance CORE. They must NEVER substitute for the real live run.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptanceEnvOrThrow,
  isLocalOrigin,
  isProductionOrigin,
  isFixturePrefixed,
  makeRunId,
  maskRef,
  redactReport,
  scanForPrivileged,
  scanBundleForSecrets,
  type SafeAcceptanceReport,
} from "../../e2e/acceptance/_acceptanceCore";

const KEYS = [
  "STAGING_ACCEPTANCE_LIVE",
  "ACCEPTANCE_BASE_URL",
  "INTENDED_COMMIT",
  "STAGING_SUPABASE_PROJECT_REF",
  "TERAGON_ADMIN_EMAIL",
  "TERAGON_ADMIN_PASSWORD",
];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function enableFull() {
  process.env.STAGING_ACCEPTANCE_LIVE = "1";
  process.env.ACCEPTANCE_BASE_URL = "http://localhost:4180";
  process.env.INTENDED_COMMIT = "abc123";
  process.env.STAGING_SUPABASE_PROJECT_REF = "bjvirkmagwpqroakazjj";
  process.env.TERAGON_ADMIN_EMAIL = "admin@example.test";
  process.env.TERAGON_ADMIN_PASSWORD = "x";
}

describe("acceptance guard — fail hard, never skip", () => {
  it("throws when not enabled", () => {
    expect(() => acceptanceEnvOrThrow()).toThrow(/STAGING_ACCEPTANCE_LIVE=1/);
  });
  it("throws with missing NAMES when enabled but unconfigured", () => {
    process.env.STAGING_ACCEPTANCE_LIVE = "1";
    expect(() => acceptanceEnvOrThrow()).toThrow(/ACCEPTANCE_BASE_URL/);
  });
  it("rejects a production / non-local target origin", () => {
    enableFull();
    process.env.ACCEPTANCE_BASE_URL = "https://teragon-preview.netlify.app";
    expect(() => acceptanceEnvOrThrow()).toThrow(/LOCAL serve/);
  });
  it("rejects the wrong Supabase project ref", () => {
    enableFull();
    process.env.STAGING_SUPABASE_PROJECT_REF = "someotherproject";
    expect(() => acceptanceEnvOrThrow()).toThrow(/wrong Supabase project/);
  });
  it("resolves a valid local configuration", () => {
    enableFull();
    const env = acceptanceEnvOrThrow();
    expect(env.targetOrigin).toBe("http://localhost:4180");
    expect(env.projectRef).toBe("bjvirkmagwpqroakazjj");
  });
});

describe("origin classification", () => {
  it("accepts localhost/127.0.0.1", () => {
    expect(isLocalOrigin("http://localhost:4180")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:5000")).toBe(true);
  });
  it("flags deployed origins as production", () => {
    expect(isProductionOrigin("https://x.netlify.app")).toBe(true);
    expect(isProductionOrigin("https://teragon.com")).toBe(true);
    expect(isProductionOrigin("http://localhost:4180")).toBe(false);
  });
});

describe("privileged-material detection", () => {
  it("detects service_role, secrets, tokens and JWTs", () => {
    expect(scanForPrivileged("...service_role...").length).toBeGreaterThan(0);
    expect(scanForPrivileged("sb_secret_ABCdef123").length).toBeGreaterThan(0);
    expect(scanForPrivileged("access_token=foo").length).toBeGreaterThan(0);
    expect(
      scanForPrivileged("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw.signature123")
        .length,
    ).toBeGreaterThan(0);
  });
  it("passes clean text", () => {
    expect(scanForPrivileged("org-teragon crole-sysadmin active")).toEqual([]);
  });
});

describe("bundle secret scan — real values only (no false positives)", () => {
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature123`;

  it("flags a secret key and a service_role JWT", () => {
    expect(scanBundleForSecrets("x=sb_secret_ABCdef12345678")).toContain("sb_secret_key");
    expect(scanBundleForSecrets(jwt("service_role"))).toContain("service_role_jwt");
  });
  it("does NOT flag the browser-safe anon key or library identifiers", () => {
    expect(scanBundleForSecrets(jwt("anon"))).toEqual([]);
    expect(
      scanBundleForSecrets("const t = session.access_token; const r = 'service_role';"),
    ).toEqual([]);
  });
});

describe("report + fixtures", () => {
  it("redacts JWT-shaped material from the report", () => {
    const rep: SafeAcceptanceReport = {
      suite: "staging-acceptance",
      runId: "acceptance-1-abc",
      targetOrigin: "http://localhost:4180",
      provider: "SUPABASE",
      expectedCommit: "abc",
      observedCommit: "abc",
      maskedRef: "bjvi…azjj",
      files: 1,
      executed: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      cleanup: "ok",
      uiCapabilityMissing: [],
      defects: ["leak eyJaaaaaaaaaa.bbbbbbbbbb.ccccccc end"],
      verdict: "PASS",
    };
    expect(redactReport(rep).defects[0]).toContain("[REDACTED]");
  });
  it("fixture ids are prefixed + recognised", () => {
    const id = makeRunId();
    expect(isFixturePrefixed(id)).toBe(true);
    expect(isFixturePrefixed("customer-42")).toBe(false);
  });
  it("masks a project ref", () => {
    expect(maskRef("bjvirkmagwpqroakazjj")).toBe("bjvi…azjj");
  });
});
