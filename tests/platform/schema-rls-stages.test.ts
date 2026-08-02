// Gate S7.1 — remote schema-verification + RLS-validation stages + the
// S7_STOP_AFTER=RLS_VALIDATED stop boundary. Fake db adapter only (no network).
import { describe, expect, it, vi } from "vitest";
import { verifySchema } from "../../scripts/platform/schema-verify.mjs";
import { validateRls, listRlsScripts, EXPECTED_CHECK_COUNT } from "../../scripts/platform/rls-validate.mjs";
import { runApply } from "../../scripts/platform/staging.mjs";
import { stopAfterStage } from "../../scripts/platform/shared/runtime.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { computeManifest } from "../../scripts/platform/shared/migrations.mjs";
import { mask } from "../../scripts/platform/shared/stage.mjs";
import { fakeSupabase, fakeNetlify, fakeDb, memoryStage, GOOD_SCHEMA_ROW } from "./fakes";

const REF = "bjvirkmagwpqroakazjj";
const ORG = "vthlolcsedczobrxiacs";
const REGION = "eu-central-1";
const sessionAuth = async () => ({ ready: true, via: "cli-session" });

describe("stopAfterStage", () => {
  it("reads S7_STOP_AFTER (or null when unset)", () => {
    expect(stopAfterStage({})).toBeNull();
    expect(stopAfterStage({ S7_STOP_AFTER: "RLS_VALIDATED" })).toBe("RLS_VALIDATED");
    expect(stopAfterStage({ S7_STOP_AFTER: "  " })).toBeNull();
  });
});

describe("verifySchema (apply, injected db)", () => {
  it("marks SCHEMA_VERIFIED on a matching schema", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb();
    const r = await verifySchema({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(true);
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(true);
  });

  it("fails closed on drift (no auto-repair) and does not mark SCHEMA_VERIFIED", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ schemaRow: { ...GOOD_SCHEMA_ROW, public_tables: 40 } });
    const r = await verifySchema({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/drift/);
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(false);
  });

  it("fails safely when introspection errors (INTROSPECTION_QUERY_FAILURE)", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ queryThrows: true });
    const r = await verifySchema({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.category).toBe("INTROSPECTION_QUERY_FAILURE");
  });

  it("a PARSE failure is INTROSPECTION_PARSE_FAILURE (never reported as missing functions / drift)", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ schemaRow: { ...GOOD_SCHEMA_ROW, functions_present: "not-an-array-or-literal" } });
    const r = await verifySchema({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.category).toBe("INTROSPECTION_PARSE_FAILURE");
    expect(r.reason).not.toMatch(/missing functions|drift/);
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(false);
  });

  it("a real DRIFT is SCHEMA_DRIFT — a DIFFERENT category from a parse failure", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ schemaRow: { ...GOOD_SCHEMA_ROW, public_tables: 46 } });
    const r = await verifySchema({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.category).toBe("SCHEMA_DRIFT");
    expect(r.reason).toMatch(/drift/);
  });
});

describe("validateRls (apply, injected db)", () => {
  it("finds exactly 8 canonical checks on disk", () => {
    expect(listRlsScripts().length).toBe(EXPECTED_CHECK_COUNT);
  });

  it("marks RLS_VALIDATED when all 8 checks pass", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb();
    const r = await validateRls({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(true);
    expect(r.executed).toBe(8);
    expect(r.passed).toBe(8);
    expect(tracker.completed("RLS_VALIDATED")).toBe(true);
  });

  it("fails closed if any check fails (never weaken policies)", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ scriptResults: { "05_role_escalation_denial.sql": { ok: false, error: "FAIL: escalation" } } });
    const r = await validateRls({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/05_role_escalation/);
    expect(tracker.completed("RLS_VALIDATED")).toBe(false);
  });

  it("safe report carries no leaked data (only check names + ok)", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb();
    const r = await validateRls({ mode: "apply", db, stage: tracker });
    expect(JSON.stringify(r.results)).not.toMatch(/select|insert|jwt|secret/i);
  });
});

// --- orchestrator: stop boundary honored / unset unchanged -------------------
function provider(extra: Record<string, string> = {}) {
  return createCredentialProvider({
    env: {
      SUPABASE_ORG_ID: ORG,
      SUPABASE_DB_PASSWORD: "db-pw-value-abcdef",
      TERAGON_ADMIN_EMAIL: "soundcloudillusion@gmail.com",
      TERAGON_ADMIN_EMAIL_CONFIRMED: "true",
      TERAGON_ADMIN_PASSWORD: "admin-pw-value-abcdef",
      NETLIFY_AUTH_TOKEN: "nf-token",
      NETLIFY_SITE_ID: "site-1",
      ...extra,
    },
    fileText: "",
    authResolver: sessionAuth,
  });
}
function resumeStage() {
  const { tracker, store } = memoryStage();
  store.text = JSON.stringify({
    version: 1,
    state: "MIGRATIONS_APPLIED",
    completed: ["PLAN_READY", "PROJECT_READY"],
    project: { ref: REF, refMask: mask(REF), orgVerified: true, region: REGION },
    netlify: {},
    admin: {},
    history: [],
  });
  return tracker;
}
function stagingAdapters() {
  const manifest = computeManifest();
  const history = manifest.entries.map((e: { file: string }) => ({ version: /^(\d+)/.exec(e.file)![1] }));
  return {
    supabase: fakeSupabase({
      projects: [{ id: REF, name: "teragon-staging", organization_id: ORG }],
      health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: ORG, region: REGION, name: "teragon-staging" } },
      remoteHistory: history,
      apiKeys: [
        { name: "default", type: "default", api_key: "sb_publishable_TEST" },
        { name: "default", type: "default", api_key: "sb_secret_TEST" },
      ],
    }),
    netlify: fakeNetlify({ site: { id: "site-1", name: "teragon-os-demo" } }),
    db: fakeDb(),
  };
}

describe("runApply — S7_STOP_AFTER=RLS_VALIDATED boundary", () => {
  it("stops SUCCESSFULLY after RLS validation; bootstrap-admin/netlify/deploy NOT run", async () => {
    const p = provider();
    const adapters = stagingAdapters();
    const tracker = resumeStage();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(true);
    expect(verdict.stoppedAt).toBe("RLS_VALIDATED");
    // migrate + schema + rls ran; bootstrap/netlify/deploy did NOT.
    expect(adapters.supabase.called("dbPush")).toBe(true);
    expect(adapters.db.called("query")).toBe(true); // schema-verify
    expect(adapters.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(8);
    expect(adapters.supabase.called("createUser")).toBe(false); // bootstrap-admin NOT run
    expect(adapters.netlify.calls.some((c) => c.method === "setEnv")).toBe(false); // netlify NOT run
    expect(tracker.completed("RLS_VALIDATED")).toBe(true);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(false);
  });

  it("unset stop boundary leaves full-apply behavior unchanged (proceeds past RLS to bootstrap)", async () => {
    const p = provider({ REVIEW_BRANCH: "feature/teragon-supabase-platform", REVIEW_COMMIT: "abc123" });
    const adapters = stagingAdapters();
    const tracker = resumeStage();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: null, cmd: vi.fn(async () => 0), git: { clean: true, branch: "feature/teragon-supabase-platform", commit: "abc123" } });
    expect(verdict.ok).toBe(true);
    expect(verdict.stoppedAt).toBeUndefined();
    expect(adapters.supabase.called("createUser")).toBe(true); // bootstrap DID run
    expect(adapters.netlify.calls.some((c) => c.method === "setEnv")).toBe(true); // netlify DID run
  });

  it("a failed RLS check halts before bootstrap and preserves the resume point", async () => {
    const p = provider();
    const adapters = { ...stagingAdapters(), db: fakeDb({ scriptResults: { "01_anonymous_denial.sql": { ok: false, error: "FAIL: anon" } } }) };
    const tracker = resumeStage();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("rls-validate");
    expect(adapters.supabase.called("createUser")).toBe(false);
    expect(tracker.completed("MIGRATIONS_APPLIED")).toBe(true); // resume point preserved
    expect(tracker.completed("RLS_VALIDATED")).toBe(false);
  });
});

// --- S7.1.1 resume: MIGRATIONS_APPLIED already completed (no re-migrate) ------
function resumeStageMigrated() {
  const { tracker, store } = memoryStage();
  store.text = JSON.stringify({
    version: 1,
    state: "MIGRATIONS_APPLIED",
    completed: ["PLAN_READY", "PROJECT_READY", "MIGRATIONS_APPLIED"],
    project: { ref: REF, refMask: mask(REF), orgVerified: true, region: REGION },
    netlify: {},
    admin: {},
    history: [],
  });
  return tracker;
}

describe("runApply resume from MIGRATIONS_APPLIED — schema + RLS only, no re-migrate", () => {
  it("skips provision AND migrate (zero db push), runs schema then RLS, stops at RLS_VALIDATED", async () => {
    const p = provider();
    const adapters = stagingAdapters();
    const tracker = resumeStageMigrated();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(true);
    expect(verdict.stoppedAt).toBe("RLS_VALIDATED");
    // createProject = 0 AND migration-apply = 0 (db push never called on resume)
    expect(adapters.supabase.called("createProject")).toBe(false);
    expect(adapters.supabase.called("dbPush")).toBe(false);
    // connection rebuilt (keys fetched) then schema-verify then RLS
    expect(adapters.supabase.called("getProjectApiKeys")).toBe(true);
    expect(adapters.db.called("query")).toBe(true);
    expect(adapters.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(8);
    // schema passes BEFORE RLS runs; both recorded; later stages not run
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(true);
    expect(tracker.completed("RLS_VALIDATED")).toBe(true);
    expect(adapters.supabase.called("createUser")).toBe(false);
    expect(adapters.netlify.calls.some((c) => c.method === "setEnv")).toBe(false);
  });

  it("schema-query FAILURE prevents RLS from running", async () => {
    const p = provider();
    const adapters = { ...stagingAdapters(), db: fakeDb({ queryThrows: true }) };
    const tracker = resumeStageMigrated();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("schema-verify");
    expect(adapters.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(0); // RLS never ran
    expect(tracker.completed("MIGRATIONS_APPLIED")).toBe(true); // safe checkpoint kept
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(false);
  });

  it("schema-ASSERTION drift prevents RLS from running", async () => {
    const p = provider();
    const adapters = { ...stagingAdapters(), db: fakeDb({ schemaRow: { ...GOOD_SCHEMA_ROW, public_tables: 46 } }) };
    const tracker = resumeStageMigrated();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("schema-verify");
    expect(adapters.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(0);
  });

  it("a PARSE failure also prevents RLS (distinct from drift), resume point preserved", async () => {
    const p = provider();
    const adapters = { ...stagingAdapters(), db: fakeDb({ schemaRow: { ...GOOD_SCHEMA_ROW, migrations: "14x" } }) };
    const tracker = resumeStageMigrated();
    const verdict = await runApply(p, adapters, tracker, { stopAfter: "RLS_VALIDATED" });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("schema-verify");
    expect(adapters.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(0);
    expect(tracker.completed("MIGRATIONS_APPLIED")).toBe(true);
    expect(tracker.completed("SCHEMA_VERIFIED")).toBe(false);
  });
});
