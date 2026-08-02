// Gate S7.0.1 — connection discovery + full simulated apply chain with fakes.
// Proves: ref+URL propagation, key classification+injection, readiness updates,
// resume re-fetches (no 2nd project), privileged key never in reports/logs, and
// the complete plan→provision→migrate→bootstrap→netlify→preview→acceptance run.
import { describe, expect, it, vi } from "vitest";
import { discoverAndInjectConnection } from "../../scripts/platform/shared/connection.mjs";
import { provisionStaging } from "../../scripts/platform/provision-staging.mjs";
import { migrateStaging } from "../../scripts/platform/migrate.mjs";
import { bootstrapAdmin } from "../../scripts/platform/bootstrap-admin.mjs";
import { configureNetlify } from "../../scripts/platform/configure-netlify.mjs";
import { deployPreview } from "../../scripts/platform/deploy-preview.mjs";
import { verifyPreview } from "../../scripts/platform/verify-preview.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { computeManifest } from "../../scripts/platform/shared/migrations.mjs";
import { fakeSupabase, fakeNetlify, memoryStage } from "./fakes";

const sessionAuth = async () => ({ ready: true, via: "cli-session" });
const SERVER_KEY_VALUE = "service-role-value-abcdef";
const BROWSER_KEY_VALUE = "anon-legacy-value-abcdef";

function baseEnv(extra: Record<string, string> = {}) {
  return {
    SUPABASE_ORG_ID: "org-1",
    SUPABASE_DB_PASSWORD: "db-pw-value-abcdef",
    TERAGON_ADMIN_EMAIL: "soundcloudillusion@gmail.com",
    TERAGON_ADMIN_EMAIL_CONFIRMED: "true",
    TERAGON_ADMIN_PASSWORD: "admin-pw-value-abcdef",
    NETLIFY_AUTH_TOKEN: "nf-token",
    NETLIFY_SITE_ID: "site-1",
    ...extra,
  };
}

describe("discoverAndInjectConnection", () => {
  it("resolves URL + classifies keys + injects into runtime; report has NAMES only", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-1", region: "eu-central-1" } } });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(true);
    expect(r.report.browserKeySource).toBe("ANON_LEGACY");
    expect(r.report.serverKeySource).toBe("SERVICE_ROLE_LEGACY");
    // injected + visible
    expect(provider.get("SUPABASE_URL")).toBe("https://ref1.supabase.co");
    expect(provider.get("SUPABASE_SERVER_KEY")).toBe(SERVER_KEY_VALUE);
    // report never contains the key VALUE
    expect(JSON.stringify(r.report)).not.toContain(SERVER_KEY_VALUE);
    expect(JSON.stringify(r.report)).not.toContain(BROWSER_KEY_VALUE);
  });

  it("fails CLOSED when key retrieval yields an unknown type (after creation)", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ apiKeys: [{ name: "mystery", api_key: "m" }] });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown/i);
  });

  it("rejects a ref that does not belong to the selected org", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-OTHER" } } });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not belong/i);
  });
});

describe("provision injects connection so downstream becomes READY in the same apply", () => {
  it("migrate/bootstrap/netlify all flip to ready after provision", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ projects: [], createdRef: "chainref01" });
    const { tracker } = memoryStage();

    expect((await provider.validate("migrate")).ok).toBe(false); // no ref yet
    const prov = await provisionStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: { ok: true } });
    expect(prov.ok).toBe(true);
    expect(supabase.called("createProject")).toBe(true);
    expect(supabase.called("getProjectApiKeys")).toBe(true);
    // now the derived values are in the runtime context
    expect((await provider.validate("migrate")).ok).toBe(true);
    expect((await provider.validate("bootstrap-admin")).ok).toBe(true);
    expect((await provider.validate("configure-netlify")).ok).toBe(true);
  });
});

describe("failed classification prevents downstream readiness (fail-closed)", () => {
  it("keeps migrate/netlify NOT ready and injects no key when keys are unclassifiable", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ apiKeys: [{ type: "default", api_key: "opaque-not-a-key" }] });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(false);
    expect(r.report.classificationSuccess).toBe(false);
    expect(provider.has("SUPABASE_SERVER_KEY")).toBe(false);
    expect((await provider.validate("migrate")).ok).toBe(false);
    expect((await provider.validate("configure-netlify")).ok).toBe(false);
  });

  it("clears the runtime server key after orchestration", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase();
    await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(provider.has("SUPABASE_SERVER_KEY")).toBe(true);
    provider.clearRuntime();
    expect(provider.has("SUPABASE_SERVER_KEY")).toBe(false);
    expect(provider.has("SUPABASE_URL")).toBe(false);
  });

  it("routes the Auth Admin key to the legacy service_role (browser stays browser-safe)", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    // live-shaped: publishable + secret + anon + service_role.
    const supabase = fakeSupabase({
      apiKeys: [
        { name: "default", type: "default", api_key: "sb_publishable_LIVE" },
        { name: "default", type: "default", api_key: "sb_secret_LIVE" },
        { name: "anon", api_key: "anon-legacy-LIVE" },
        { name: "service_role", api_key: "service-role-legacy-LIVE" },
      ],
    });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(true);
    expect(r.report.browserKeySource).toBe("PUBLISHABLE"); // browser unchanged
    expect(r.report.serverKeySource).toBe("SECRET"); // modern server key retained
    expect(r.report.authAdminKeySource).toBe("SERVICE_ROLE_LEGACY"); // Auth Admin routed to legacy
    // the Auth Admin client key resolves to the legacy service_role, NOT modern.
    expect(provider.get("SUPABASE_AUTH_ADMIN_KEY")).toBe("service-role-legacy-LIVE");
    expect(provider.get("SUPABASE_SERVER_KEY")).toBe("sb_secret_LIVE"); // not globally replaced
    // no key value in the safe report
    expect(JSON.stringify(r.report)).not.toContain("sb_secret_LIVE");
    expect(JSON.stringify(r.report)).not.toContain("service-role-legacy-LIVE");
  });

  it("falls back to the modern SECRET for Auth Admin when no legacy key exists", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({
      apiKeys: [
        { name: "default", type: "default", api_key: "sb_publishable_ONLY" },
        { name: "default", type: "default", api_key: "sb_secret_ONLY" },
      ],
    });
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.ok).toBe(true);
    expect(r.report.authAdminKeySource).toBe("SECRET");
    expect(provider.has("SUPABASE_AUTH_ADMIN_KEY")).toBe(false); // none injected; serviceClient falls back to SERVER_KEY
  });

  it("the connection report never carries a key value", async () => {
    const provider = createCredentialProvider({ env: baseEnv(), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase();
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "ref1", orgId: "org-1" });
    expect(r.report.recordCount).toBe(2);
    expect(r.report.classificationSuccess).toBe(true);
    expect(JSON.stringify(r.report)).not.toContain(SERVER_KEY_VALUE);
    expect(JSON.stringify(r.report)).not.toContain(BROWSER_KEY_VALUE);
  });
});

describe("resume — re-fetch keys, never a second project", () => {
  it("rebuilds the runtime context from a stored ref without creating a project", async () => {
    // stored ref (safe metadata) present; NO server key in memory.
    const provider = createCredentialProvider({ env: baseEnv({ SUPABASE_PROJECT_REF: "stored-ref-1" }), fileText: "", authResolver: sessionAuth });
    const supabase = fakeSupabase({ health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-1" } } });
    expect(provider.has("SUPABASE_SERVER_KEY")).toBe(false);
    const r = await discoverAndInjectConnection({ supabase, credentials: provider, ref: "stored-ref-1", orgId: "org-1" });
    expect(r.ok).toBe(true);
    expect(provider.has("SUPABASE_SERVER_KEY")).toBe(true);
    expect(supabase.called("createProject")).toBe(false);
  });
});

describe("FULL simulated apply chain (fakes only, zero network)", () => {
  it("runs every stage once, propagates values, leaks no secret into any report", async () => {
    const provider = createCredentialProvider({
      env: baseEnv({ REVIEW_BRANCH: "feature/teragon-supabase-platform", REVIEW_COMMIT: "abc123" }),
      fileText: "",
      authResolver: sessionAuth,
    });
    const manifest = computeManifest();
    const history = manifest.entries.map((e: { file: string }) => ({ version: /^(\d+)/.exec(e.file)![1] }));
    const supabase = fakeSupabase({ projects: [], createdRef: "chainref01", remoteHistory: history });
    const netlify = fakeNetlify({ site: { id: "site-1", name: "teragon-os-demo" }, previewEnv: { UNRELATED: "keep" } });
    const { tracker } = memoryStage();
    const cmd = vi.fn(async () => 0);
    const reports: Record<string, unknown> = {};

    // 1. provision (+ connection discovery)
    reports.provision = await provisionStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: { ok: true } });
    // 2. migrate
    reports.migrate = await migrateStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: await provider.validate("migrate"), env: {} });
    // 3. bootstrap
    reports.bootstrap = await bootstrapAdmin({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: await provider.validate("bootstrap-admin") });
    // 4. netlify
    reports.netlify = await configureNetlify({ mode: "apply", credentials: provider, netlify, stage: tracker, validation: await provider.validate("configure-netlify") });
    // 5. preview
    reports.preview = await deployPreview({
      mode: "apply",
      credentials: provider,
      netlify,
      stage: tracker,
      validation: await provider.validate("deploy-preview"),
      cmd,
      git: { clean: true, branch: "feature/teragon-supabase-platform", commit: "abc123" },
    });
    // 6. verify / acceptance
    reports.verify = await verifyPreview({
      mode: "apply",
      credentials: provider,
      netlify,
      validation: await provider.validate("verify-preview"),
      probe: { status: 200, headers: { "content-security-policy": "default-src 'self'" } },
      intendedCommit: "abc123",
    });

    for (const [stage, r] of Object.entries(reports)) {
      expect((r as { ok: boolean }).ok, `${stage} ok`).toBe(true);
    }
    // exactly one project created; keys fetched once.
    expect(supabase.calls.filter((c) => c.method === "createProject")).toHaveLength(1);
    expect(supabase.calls.filter((c) => c.method === "getProjectApiKeys")).toHaveLength(1);
    // NO secret value in ANY stage's report.
    const allReports = JSON.stringify(reports);
    expect(allReports).not.toContain(SERVER_KEY_VALUE);
    expect(allReports).not.toContain(BROWSER_KEY_VALUE);
    expect(allReports).not.toContain("db-pw-value-abcdef");
    expect(allReports).not.toContain("admin-pw-value-abcdef");
  });
});
