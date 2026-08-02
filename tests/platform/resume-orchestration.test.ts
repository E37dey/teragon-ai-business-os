// Gate S7.0.3 — staging resume rebuilds the connection context BEFORE migrate.
// Root cause fixed: on a resumed apply the completed-step skip must first rebuild
// the runtime connection (URL + browser/server keys) or migrate has no creds.
import { describe, expect, it, vi } from "vitest";
import { runApply, rebuildConnectionOnResume } from "../../scripts/platform/staging.mjs";
import { mask } from "../../scripts/platform/shared/stage.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { computeManifest } from "../../scripts/platform/shared/migrations.mjs";
import { fakeSupabase, fakeNetlify, fakeDb, memoryStage } from "./fakes";

const REF = "bjvirkmagwpqroakazjj";
const ORG = "vthlolcsedczobrxiacs";
const REGION = "eu-central-1";
const sessionAuth = async () => ({ ready: true, via: "cli-session" });

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

/** A stage tracker pre-seeded to the resumable PROJECT_READY state. */
function resumeStage(project: Record<string, unknown> = { ref: REF, refMask: mask(REF), orgVerified: true, region: REGION }) {
  const { tracker, store } = memoryStage();
  store.text = JSON.stringify({
    version: 1,
    state: "FAILED",
    completed: ["PLAN_READY", "PROJECT_READY"],
    project,
    netlify: {},
    admin: {},
    history: [],
  });
  return { tracker, store };
}

function healthyStaging() {
  return { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: ORG, region: REGION, name: "teragon-staging" } };
}

describe("rebuildConnectionOnResume — happy paths", () => {
  it("rebuilds from the tracked full ref, zero createProject, keys injected once", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging() });
    const { tracker } = resumeStage();
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(true);
    expect(supabase.called("createProject")).toBe(false);
    expect(supabase.calls.filter((c) => c.method === "getProjectApiKeys")).toHaveLength(1);
    expect(p.has("SUPABASE_URL")).toBe(true);
    expect(p.has("SUPABASE_BROWSER_KEY")).toBe(true);
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(true);
  });

  it("resolves the ref by read-only verified reuse when only a mask is tracked", async () => {
    const p = provider();
    const supabase = fakeSupabase({ projects: [{ id: REF, name: "teragon-staging", organization_id: ORG }], health: healthyStaging() });
    const { tracker } = resumeStage({ refMask: mask(REF), orgVerified: true, region: REGION }); // no full ref
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(true);
    expect(supabase.called("createProject")).toBe(false);
    expect(supabase.called("listProjects")).toBe(true);
  });

  it("is exactly-once: a second call with the server key already present does no discovery", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging() });
    const { tracker } = resumeStage();
    await rebuildConnectionOnResume(p, supabase, tracker);
    const before = supabase.calls.filter((c) => c.method === "getProjectApiKeys").length;
    const r2 = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r2.ok).toBe(true);
    expect(supabase.calls.filter((c) => c.method === "getProjectApiKeys").length).toBe(before);
  });

  it("readiness refreshes so migrate becomes READY after the rebuild", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging() });
    const { tracker } = resumeStage();
    expect((await p.validate("migrate")).ok).toBe(false);
    await rebuildConnectionOnResume(p, supabase, tracker);
    expect((await p.validate("migrate")).ok).toBe(true);
    expect((await p.validate("bootstrap-admin")).ok).toBe(true);
    expect((await p.validate("configure-netlify")).ok).toBe(true);
  });
});

describe("rebuildConnectionOnResume — fail-closed paths (never create a project)", () => {
  it("fails on project identity mismatch (name)", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: ORG, region: REGION, name: "teragon-production" } } });
    const { tracker } = resumeStage();
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/identity mismatch/i);
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(false);
    expect(supabase.called("createProject")).toBe(false);
  });

  it("fails on org mismatch", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-OTHER", name: "teragon-staging" } } });
    const { tracker } = resumeStage();
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/org mismatch/i);
  });

  it("fails on a mask mismatch between resolved ref and tracker", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging() });
    const { tracker } = resumeStage({ ref: REF, refMask: mask("some-other-ref-1234567890"), orgVerified: true, region: REGION });
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not match the tracked project/i);
  });

  it("fails on key classification failure (unknown key), never creating a project", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging(), apiKeys: [{ type: "default", api_key: "opaque-not-a-key" }] });
    const { tracker } = resumeStage();
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(false);
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(false);
    expect(supabase.called("createProject")).toBe(false);
  });

  it("fails closed when the ref cannot be resolved (no reuse candidate) — never creates", async () => {
    const p = provider();
    const supabase = fakeSupabase({ projects: [], health: healthyStaging() });
    const { tracker } = resumeStage({ refMask: mask(REF), orgVerified: true, region: REGION }); // no full ref, no project to reuse
    const r = await rebuildConnectionOnResume(p, supabase, tracker);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot resolve the existing staging project/i);
    expect(supabase.called("createProject")).toBe(false);
  });
});

describe("runApply resume — full simulated chain (fakes only)", () => {
  it("skips provision, rebuilds connection, then runs each remaining stage once", async () => {
    const p = provider({ REVIEW_BRANCH: "feature/teragon-supabase-platform", REVIEW_COMMIT: "abc123" });
    const manifest = computeManifest();
    const history = manifest.entries.map((e: { file: string }) => ({ version: /^(\d+)/.exec(e.file)![1] }));
    const supabase = fakeSupabase({
      projects: [{ id: REF, name: "teragon-staging", organization_id: ORG }],
      health: healthyStaging(),
      remoteHistory: history,
      apiKeys: [
        { name: "default", type: "default", api_key: "sb_publishable_TEST" },
        { name: "default", type: "default", api_key: "sb_secret_TEST" },
      ],
    });
    const netlify = fakeNetlify({ site: { id: "site-1", name: "teragon-os-demo" }, previewEnv: { UNRELATED: "keep" } });
    const { tracker } = resumeStage();
    const cmd = vi.fn(async () => 0);
    const git = { clean: true, branch: "feature/teragon-supabase-platform", commit: "abc123" };

    const verdict = await runApply(p, { supabase, netlify, db: fakeDb() }, tracker, { cmd, git });
    expect(verdict.ok).toBe(true);
    // provision skipped → zero createProject; keys fetched exactly once.
    expect(supabase.calls.filter((c) => c.method === "createProject")).toHaveLength(0);
    expect(supabase.calls.filter((c) => c.method === "getProjectApiKeys")).toHaveLength(1);
    // downstream stages ran.
    expect(supabase.called("dbPush")).toBe(true);
    expect(supabase.called("createUser")).toBe(true);
    expect(netlify.calls.some((c) => c.method === "setEnv")).toBe(true);
    expect(netlify.calls.some((c) => c.method === "deploy")).toBe(true);
    // classified from the modern keys.
    expect(tracker.completed("MIGRATIONS_APPLIED")).toBe(true);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(true);
    // privileged runtime values can be cleared and are then gone.
    p.clearRuntime();
    expect(p.has("SUPABASE_SERVER_KEY")).toBe(false);
  });

  it("a connection-rebuild failure halts before migrate (no migrate, safe verdict)", async () => {
    const p = provider();
    const supabase = fakeSupabase({ health: healthyStaging(), apiKeys: [{ type: "default", api_key: "opaque" }] });
    const netlify = fakeNetlify();
    const { tracker } = resumeStage();
    const verdict = await runApply(p, { supabase, netlify, db: fakeDb() }, tracker);
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStep).toBe("provision-staging");
    expect(supabase.called("dbPush")).toBe(false);
    expect(supabase.called("createProject")).toBe(false);
  });
});
