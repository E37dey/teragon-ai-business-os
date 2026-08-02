// Gate S7.0 — unified credential provider: precedence, safe .env.staging.local
// loading, CLI-session authorization without a token var, fail-closed, redaction.
import { describe, expect, it, vi } from "vitest";
import { createCredentialProvider, parseEnvText } from "../../scripts/platform/shared/credentials.mjs";
import { redact, registerSecretValues } from "../../scripts/platform/shared/log.mjs";

const STAGING = [
  "# comment",
  "SUPABASE_ORG_ID=org-xyz",
  "SUPABASE_DB_PASSWORD=super-secret-db-password-value",
  "TERAGON_ADMIN_EMAIL=admin@example.test",
  'QUOTED="quoted-value-here"',
].join("\n");

const tokenAuth = async () => ({ ready: true, via: "env-token" });
const sessionAuth = async () => ({ ready: true, via: "cli-session" });
const noAuth = async () => ({ ready: false, via: "none" });

describe("credential provider — loading + precedence", () => {
  it("parses .env.staging.local safely (comments, quotes)", () => {
    const parsed = parseEnvText(STAGING);
    expect(parsed.SUPABASE_ORG_ID).toBe("org-xyz");
    expect(parsed.QUOTED).toBe("quoted-value-here");
    expect(parsed["# comment"]).toBeUndefined();
  });

  it("loads staging-file values and reports their source", () => {
    const p = createCredentialProvider({ env: {}, fileText: STAGING, authResolver: sessionAuth });
    expect(p.get("SUPABASE_ORG_ID")).toBe("org-xyz");
    expect(p.source("SUPABASE_ORG_ID")).toBe("staging-file");
    expect(p.has("SUPABASE_DB_PASSWORD")).toBe(true);
  });

  it("process.env WINS over the staging file (documented precedence)", () => {
    const p = createCredentialProvider({ env: { SUPABASE_ORG_ID: "org-from-env" }, fileText: STAGING, authResolver: sessionAuth });
    expect(p.get("SUPABASE_ORG_ID")).toBe("org-from-env");
    expect(p.source("SUPABASE_ORG_ID")).toBe("env");
  });
});

describe("credential provider — Supabase authorization = env-token OR cli-session", () => {
  it("accepts a CLI session with NO access-token var present", async () => {
    const p = createCredentialProvider({ env: {}, fileText: STAGING, authResolver: sessionAuth });
    const v = await p.validate("provision-staging");
    expect(v.supabaseAuth.required).toBe(true);
    expect(v.supabaseAuth.ready).toBe(true);
    expect(v.supabaseAuth.via).toBe("cli-session");
    // ORG + DB password present from the staging file → ready.
    expect(v.ok).toBe(true);
  });

  it("accepts an env token", async () => {
    const p = createCredentialProvider({ env: { SUPABASE_ACCESS_TOKEN: "tok" }, fileText: STAGING, authResolver: tokenAuth });
    const v = await p.validate("provision-staging");
    expect(v.supabaseAuth.via).toBe("env-token");
    expect(v.ok).toBe(true);
  });

  it("fail-closed when NEITHER token nor session is available", async () => {
    const p = createCredentialProvider({ env: {}, fileText: STAGING, authResolver: noAuth });
    const v = await p.validate("provision-staging");
    expect(v.supabaseAuth.ready).toBe(false);
    expect(v.ok).toBe(false);
  });
});

describe("credential provider — fail-closed per command", () => {
  it("bootstrap-admin is HELD until the confirmation gate is true", async () => {
    const env = {
      SUPABASE_URL: "https://ref.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "svc-role-key-value-1234",
      TERAGON_ADMIN_EMAIL: "admin@example.test",
      TERAGON_ADMIN_PASSWORD: "admin-password-value-123",
    };
    const held = createCredentialProvider({ env, fileText: "", authResolver: noAuth });
    expect((await held.validate("bootstrap-admin")).ok).toBe(false);
    const confirmed = createCredentialProvider({ env: { ...env, TERAGON_ADMIN_EMAIL_CONFIRMED: "true" }, fileText: "", authResolver: noAuth });
    const v = await confirmed.validate("bootstrap-admin");
    expect(v.confirmGate.confirmed).toBe(true);
    expect(v.ok).toBe(true);
  });

  it("reports missing plain names without weakening fail-closed", async () => {
    const p = createCredentialProvider({ env: {}, fileText: "", authResolver: sessionAuth });
    const v = await p.validate("migrate");
    expect(v.missing).toContain("SUPABASE_PROJECT_REF");
    expect(v.ok).toBe(false);
  });
});

describe("credential provider — redaction", () => {
  it("registers staging-file secret values so the logger scrubs them", () => {
    const p = createCredentialProvider({ env: {}, fileText: STAGING, authResolver: sessionAuth });
    p.registerSecrets();
    const line = redact(`db=${p.get("SUPABASE_DB_PASSWORD")}`);
    expect(line).not.toContain("super-secret-db-password-value");
    expect(line).toContain("«REDACTED»");
  });

  it("registerSecretValues scrubs a directly-registered value", () => {
    registerSecretValues(["another-long-secret-abcdef"]);
    expect(redact("x=another-long-secret-abcdef")).not.toContain("another-long-secret-abcdef");
  });

  it("does not attempt to resolve auth for commands that do not need it", async () => {
    const spy = vi.fn(noAuth);
    const p = createCredentialProvider({ env: { NETLIFY_AUTH_TOKEN: "nf", NETLIFY_SITE_ID: "s" }, fileText: "", authResolver: spy });
    await p.validate("deploy-preview");
    expect(spy).not.toHaveBeenCalled();
  });
});
