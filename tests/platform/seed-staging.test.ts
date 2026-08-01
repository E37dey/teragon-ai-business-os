// Gate S7.2 — staging-seed stage + STAGING_SEEDED boundary + resume from
// RLS_VALIDATED runs bootstrap once then seed once, stopping at STAGING_SEEDED.
import { describe, expect, it } from "vitest";
import { seedStaging, buildDomainCountSql, normalizeDomainCounts, SEED_DOMAINS } from "../../scripts/platform/seed-staging.mjs";
import { runApply } from "../../scripts/platform/staging.mjs";
import { stopAfterStage } from "../../scripts/platform/shared/runtime.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { computeManifest } from "../../scripts/platform/shared/migrations.mjs";
import { mask } from "../../scripts/platform/shared/stage.mjs";
import { fakeSupabase, fakeNetlify, fakeDb, memoryStage, GOOD_SEED_COUNTS } from "./fakes";

const REF = "bjvirkmagwpqroakazjj";
const ORG = "vthlolcsedczobrxiacs";
const REGION = "eu-central-1";
const sessionAuth = async () => ({ ready: true, via: "cli-session" });

describe("seed helpers", () => {
  it("STAGING_SEEDED boundary is honored by stopAfterStage", () => {
    expect(stopAfterStage({ S7_STOP_AFTER: "STAGING_SEEDED" })).toBe("STAGING_SEEDED");
  });
  it("count SQL targets org-teragon and yields the 7 domains", () => {
    const sql = buildDomainCountSql();
    expect(sql).toMatch(/org-teragon/);
    expect(sql).toMatch(/as crm/);
    expect(normalizeDomainCounts(GOOD_SEED_COUNTS)).toEqual(GOOD_SEED_COUNTS);
    expect(SEED_DOMAINS).toHaveLength(7);
  });
});

describe("seedStaging (apply, injected db)", () => {
  it("applies the seed, proves idempotency (re-run, stable counts), marks STAGING_SEEDED", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb();
    const r = await seedStaging({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(true);
    expect(r.idempotent).toBe(true);
    expect(r.totals).toEqual(GOOD_SEED_COUNTS);
    // seed ran TWICE (idempotency proof), counted twice.
    expect(db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(2);
    expect(tracker.completed("STAGING_SEEDED")).toBe(true);
  });

  it("fails closed when the seed script errors", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ scriptResults: { "staging_seed.sql": { ok: false, error: "FK violation" } } });
    const r = await seedStaging({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(tracker.completed("STAGING_SEEDED")).toBe(false);
  });

  it("fails closed on idempotency DRIFT (count changed on re-run = duplicates)", async () => {
    const { tracker } = memoryStage();
    const drifted = { ...GOOD_SEED_COUNTS, crm: GOOD_SEED_COUNTS.crm + 1 };
    const db = fakeDb({ seedCountRows: [GOOD_SEED_COUNTS, drifted] });
    const r = await seedStaging({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/idempotent/i);
    expect(tracker.completed("STAGING_SEEDED")).toBe(false);
  });

  it("fails closed when a domain is left empty", async () => {
    const { tracker } = memoryStage();
    const db = fakeDb({ seedCountRow: { ...GOOD_SEED_COUNTS, training: 0 } });
    const r = await seedStaging({ mode: "apply", db, stage: tracker });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });
});

// --- orchestrator resume: RLS_VALIDATED -> bootstrap -> seed -> STOP ---------
function provider() {
  return createCredentialProvider({
    env: {
      SUPABASE_ORG_ID: ORG,
      SUPABASE_DB_PASSWORD: "db-pw-value-abcdef",
      TERAGON_ADMIN_EMAIL: "soundcloudillusion@gmail.com",
      TERAGON_ADMIN_EMAIL_CONFIRMED: "true",
      TERAGON_ADMIN_PASSWORD: "admin-pw-value-abcdef",
      NETLIFY_AUTH_TOKEN: "nf-token",
      NETLIFY_SITE_ID: "site-1",
    },
    fileText: "",
    authResolver: sessionAuth,
  });
}
function resumeAtRlsValidated() {
  const { tracker, store } = memoryStage();
  store.text = JSON.stringify({
    version: 1,
    state: "RLS_VALIDATED",
    completed: ["PLAN_READY", "PROJECT_READY", "MIGRATIONS_APPLIED", "SCHEMA_VERIFIED", "RLS_VALIDATED"],
    project: { ref: REF, refMask: mask(REF), orgVerified: true, region: REGION },
    netlify: {},
    admin: {},
    history: [],
  });
  return tracker;
}
function adapters() {
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

describe("runApply resume from RLS_VALIDATED — bootstrap then seed, stop at STAGING_SEEDED", () => {
  it("runs bootstrap once + seed once, stops; zero createProject/migrate/Netlify/deploy", async () => {
    const p = provider();
    const ad = adapters();
    const tracker = resumeAtRlsValidated();
    const verdict = await runApply(p, ad, tracker, { stopAfter: "STAGING_SEEDED" });
    expect(verdict.ok).toBe(true);
    expect(verdict.stoppedAt).toBe("STAGING_SEEDED");
    // resumed: no create, no migrate, no schema/rls re-run
    expect(ad.supabase.called("createProject")).toBe(false);
    expect(ad.supabase.called("dbPush")).toBe(false);
    // bootstrap ran exactly once (createUser), seed ran (runScriptFile twice for idempotency)
    expect(ad.supabase.calls.filter((c) => c.method === "createUser")).toHaveLength(1);
    expect(ad.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(2);
    // stopped before Netlify/deploy
    expect(ad.netlify.calls.some((c) => c.method === "setEnv")).toBe(false);
    expect(ad.netlify.calls.some((c) => c.method === "deploy")).toBe(false);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(true);
    expect(tracker.completed("STAGING_SEEDED")).toBe(true);
    expect(tracker.completed("NETLIFY_CONFIGURED")).toBe(false);
  });

  it("a seed failure halts before Netlify and preserves ADMIN_BOOTSTRAPPED", async () => {
    const p = provider();
    const ad = { ...adapters(), db: fakeDb({ scriptResults: { "staging_seed.sql": { ok: false, error: "boom" } } }) };
    const tracker = resumeAtRlsValidated();
    const verdict = await runApply(p, ad, tracker, { stopAfter: "STAGING_SEEDED" });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("seed-staging");
    expect(ad.netlify.calls.some((c) => c.method === "setEnv")).toBe(false);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(true); // safe resume point
    expect(tracker.completed("STAGING_SEEDED")).toBe(false);
  });

  it("unset stop boundary would proceed past seed (config-netlify next) — boundary only stops when set", async () => {
    // Sanity: without a boundary the loop continues to configure-netlify. We stop
    // it at NETLIFY to avoid the deploy-preview build in this unit test.
    const p = provider();
    const ad = adapters();
    const tracker = resumeAtRlsValidated();
    const verdict = await runApply(p, ad, tracker, { stopAfter: "NETLIFY_CONFIGURED" });
    expect(verdict.ok).toBe(true);
    expect(ad.db.calls.filter((c) => c.method === "runScriptFile")).toHaveLength(2); // seed still ran
    expect(ad.netlify.calls.some((c) => c.method === "setEnv")).toBe(true); // proceeded past seed
  });
});
