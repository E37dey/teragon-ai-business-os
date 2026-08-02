// Gate S7.0.1 — runtime credential context: injection visible to later stages,
// readiness recalculated, presence report is NAMES-only, secrets never serialized.
import { describe, expect, it } from "vitest";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";

const sessionAuth = async () => ({ ready: true, via: "cli-session" });

const PRE = {
  SUPABASE_ORG_ID: "org-1",
  SUPABASE_DB_PASSWORD: "db-pw-value-abcdef",
  TERAGON_ADMIN_EMAIL: "soundcloudillusion@gmail.com",
  TERAGON_ADMIN_EMAIL_CONFIRMED: "true",
  NETLIFY_AUTH_TOKEN: "nf-token",
  NETLIFY_SITE_ID: "site-1",
};

describe("runtime injection + precedence", () => {
  it("makes injected values immediately visible (runtime > file)", () => {
    const p = createCredentialProvider({ env: {}, fileText: "SUPABASE_URL=https://old.file\n", authResolver: sessionAuth });
    expect(p.source("SUPABASE_URL")).toBe("staging-file");
    p.setRuntimeValue("SUPABASE_URL", "https://fresh.runtime");
    expect(p.get("SUPABASE_URL")).toBe("https://fresh.runtime");
    expect(p.source("SUPABASE_URL")).toBe("runtime");
  });

  it("process.env still wins over runtime (operator override)", () => {
    const p = createCredentialProvider({ env: { SUPABASE_URL: "https://env.win" }, fileText: "", authResolver: sessionAuth });
    p.setRuntimeValue("SUPABASE_URL", "https://runtime.lose");
    expect(p.get("SUPABASE_URL")).toBe("https://env.win");
  });

  it("normalized key aliases resolve modern then legacy", () => {
    const legacy = createCredentialProvider({ env: { SUPABASE_ANON_KEY: "anonv", SUPABASE_SERVICE_ROLE_KEY: "svcv" }, fileText: "", authResolver: sessionAuth });
    expect(legacy.get("SUPABASE_BROWSER_KEY")).toBe("anonv");
    expect(legacy.get("SUPABASE_SERVER_KEY")).toBe("svcv");
    const modern = createCredentialProvider({ env: { SUPABASE_PUBLISHABLE_KEY: "pubv", SUPABASE_SECRET_KEY: "secv" }, fileText: "", authResolver: sessionAuth });
    expect(modern.get("SUPABASE_BROWSER_KEY")).toBe("pubv");
    expect(modern.get("SUPABASE_SERVER_KEY")).toBe("secv");
  });
});

describe("readiness recalculation (S7.0.1)", () => {
  it("APPLY_READY pre-creation even though project-derived values are absent", async () => {
    const p = createCredentialProvider({ env: PRE, fileText: "", authResolver: sessionAuth });
    const r = await p.classifyPipelineReadiness();
    expect(r.preProvisionReady).toBe(true);
    expect(r.postProvisionPending).toBe(true); // URL/keys/ref not yet present
    expect(r.applyReady).toBe(true); // NOT blocked by their absence
    expect(r.blocked).toBe(false);
  });

  it("BLOCKED when admin confirmation or netlify target missing", async () => {
    const p = createCredentialProvider({ env: { SUPABASE_ORG_ID: "o", SUPABASE_DB_PASSWORD: "db-pw-abcdef" }, fileText: "", authResolver: sessionAuth });
    const r = await p.classifyPipelineReadiness();
    expect(r.applyReady).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/admin confirmation|Netlify target/);
  });

  it("readiness updates after runtime injection of the derived values", async () => {
    const p = createCredentialProvider({ env: PRE, fileText: "", authResolver: sessionAuth });
    await p.classifyPipelineReadiness();
    p.setRuntimeValues({
      SUPABASE_PROJECT_REF: "ref1",
      SUPABASE_URL: "https://ref1.supabase.co",
      SUPABASE_BROWSER_KEY: "browser-key-abcdef",
      SUPABASE_SERVER_KEY: "server-key-abcdef",
    });
    const r = await p.refreshReadiness();
    expect(r.postProvisionPresent).toBe(true);
    expect(r.state).toMatch(/already present/);
  });
});

describe("value-blind surface", () => {
  it("getPresenceReport carries NAMES + booleans only (no values)", () => {
    const p = createCredentialProvider({ env: PRE, fileText: "", authResolver: sessionAuth });
    const report = p.getPresenceReport();
    const json = JSON.stringify(report);
    expect(json).not.toContain("db-pw-value-abcdef");
    expect(report.names.SUPABASE_ORG_ID.present).toBe(true);
    expect(report.names.SUPABASE_URL.present).toBe(false);
  });

  it("exposes no method that serializes all credentials", () => {
    const p = createCredentialProvider({ env: PRE, fileText: "", authResolver: sessionAuth });
    expect(Object.keys(p)).not.toContain("toJSON");
    expect(Object.keys(p)).not.toContain("dump");
    expect(Object.keys(p)).not.toContain("all");
  });

  it("getRequired throws a NAMES-only error (no value) when absent", () => {
    const p = createCredentialProvider({ env: {}, fileText: "", authResolver: sessionAuth });
    expect(() => p.getRequired("SUPABASE_SERVER_KEY")).toThrow(/by name/);
  });

  it("clearRuntime wipes injected secrets", () => {
    const p = createCredentialProvider({ env: {}, fileText: "", authResolver: sessionAuth });
    p.setRuntimeValue("SUPABASE_SERVER_KEY", "server-key-abcdef");
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(true);
    p.clearRuntime();
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(false);
  });
});
