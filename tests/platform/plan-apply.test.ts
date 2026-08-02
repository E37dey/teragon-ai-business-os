// Gate S7.0 — plan/apply separation: plan mutates nothing + calls no remote
// adapter; apply requires APPLY_STAGING=true; production stays separately gated.
import { describe, expect, it } from "vitest";
import { resolveMode, assertApplyAllowed, applyStagingEnabled } from "../../scripts/platform/shared/runtime.mjs";
import { provisionStaging } from "../../scripts/platform/provision-staging.mjs";
import { migrateStaging } from "../../scripts/platform/migrate.mjs";
import { configureNetlify } from "../../scripts/platform/configure-netlify.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { fakeSupabase, throwingSupabase, fakeNetlify, memoryStage } from "./fakes";

const noAuth = async () => ({ ready: false, via: "none" });

function provider(env: Record<string, string> = {}) {
  return createCredentialProvider({ env, fileText: "", authResolver: noAuth });
}

describe("runtime — mode + apply gate", () => {
  it("defaults to plan; 'apply' arg requests apply", () => {
    expect(resolveMode([])).toBe("plan");
    expect(resolveMode(["plan"])).toBe("plan");
    expect(resolveMode(["apply"])).toBe("apply");
  });

  it("apply is refused unless APPLY_STAGING=true", () => {
    expect(assertApplyAllowed("apply", {}).allowed).toBe(false);
    expect(assertApplyAllowed("apply", { APPLY_STAGING: "false" }).allowed).toBe(false);
    expect(assertApplyAllowed("apply", { APPLY_STAGING: "true" }).allowed).toBe(true);
    expect(assertApplyAllowed("plan", {}).allowed).toBe(true);
    expect(applyStagingEnabled({ APPLY_STAGING: "true" })).toBe(true);
  });
});

describe("plan mode performs ZERO mutations and calls NO remote adapter", () => {
  it("provision plan touches nothing (throwing adapter never called)", async () => {
    const supabase = throwingSupabase();
    const { tracker } = memoryStage();
    const result = await provisionStaging({
      mode: "plan",
      credentials: provider({ SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: "pw-abcdefabcdef" }),
      supabase,
      stage: tracker,
      validation: { ok: false },
    });
    expect(result.mutated).toBe(false);
    expect(result.action).toBe("plan");
  });

  it("migrate plan reports local safety and pushes nothing", async () => {
    const supabase = throwingSupabase();
    const { tracker } = memoryStage();
    const result = await migrateStaging({ mode: "plan", credentials: provider(), supabase, stage: tracker, validation: { ok: false }, env: {} });
    expect(result.mutated).toBe(false);
    expect(result.action).toBe("plan");
    // local migration lineage must be intact (14 files + lock match).
    expect(result.safety.count).toBe(14);
    expect(result.safety.lineageOk).toBe(true);
  });

  it("configure-netlify plan produces a browser-only Preview var plan without setting anything", async () => {
    const netlify = fakeNetlify();
    const { tracker } = memoryStage();
    const result = await configureNetlify({ mode: "plan", credentials: provider(), netlify, stage: tracker, validation: { ok: false } });
    expect(result.mutated).toBe(false);
    expect(netlify.calls.length).toBe(0);
    // browser-only Preview vars; no privileged/server var
    expect(result.vars.every((v: { key: string; context: string }) => v.key.startsWith("VITE_") && v.context === "deploy-preview")).toBe(true);
    expect(result.vars.some((v: { key: string }) => v.key === "SUPABASE_SERVICE_ROLE_KEY")).toBe(false);
    expect(result.vars.some((v: { key: string }) => v.key === "VITE_SUPABASE_ANON_KEY")).toBe(true);
  });
});

describe("apply core refuses when credentials are not ready", () => {
  it("provision apply with unready validation makes no create call", async () => {
    const supabase = fakeSupabase();
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider(), supabase, stage: tracker, validation: { ok: false } });
    expect(result.ok).toBe(false);
    expect(supabase.called("createProject")).toBe(false);
  });
});
