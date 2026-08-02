// Gate S7.3A — Netlify PREVIEW-context config: only browser-safe VITE_ vars in
// the deploy-preview context; Production never touched; unrelated vars preserved.
import { describe, expect, it } from "vitest";
import { buildNetlifyVarPlan, assertScopeInvariants, assertPreviewOnly, isTeragonSite, configureNetlify, PREVIEW_CONTEXT } from "../../scripts/platform/configure-netlify.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { fakeNetlify, memoryStage } from "./fakes";

const noAuth = async () => ({ ready: false, via: "none" });
const CONN = {
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_ANON_KEY: "anon-publishable-key-123456", // resolves SUPABASE_BROWSER_KEY
  SUPABASE_ORG_ID: "org-teragon",
  NETLIFY_AUTH_TOKEN: "nf-token",
  NETLIFY_SITE_ID: "site-1",
};
function provider(env: Record<string, string>) {
  return createCredentialProvider({ env, fileText: "", authResolver: noAuth });
}

describe("Netlify Preview var plan", () => {
  it("is ONLY the 4 browser-safe VITE_ vars in the deploy-preview context", () => {
    const plan = buildNetlifyVarPlan({ supabaseUrl: "u", browserKey: "b", org: "org-teragon", previewProvider: "SUPABASE" });
    const keys = plan.map((p: { key: string }) => p.key);
    expect(keys).toEqual(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_ORG", "VITE_PERSISTENCE_PROVIDER"]);
    // no privileged / server / functions var
    expect(keys.some((k: string) => !k.startsWith("VITE_"))).toBe(false);
    expect(keys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(keys).not.toContain("SUPABASE_URL");
    // every var: browser-safe, non-secret, deploy-preview context
    for (const p of plan) {
      expect(p.browserSafe).toBe(true);
      expect(p.secret).toBe(false);
      expect(p.context).toBe(PREVIEW_CONTEXT);
    }
    expect(plan.find((p: { key: string }) => p.key === "VITE_PERSISTENCE_PROVIDER").value).toBe("SUPABASE");
  });

  it("scope + preview invariants throw on violation", () => {
    expect(() => assertScopeInvariants([{ key: "VITE_SECRET", scopes: ["builds"], secret: true, browserSafe: true }])).toThrow(/VITE_/);
    expect(() => assertPreviewOnly([{ key: "VITE_X", context: "production" }])).toThrow(/preview invariant/);
    expect(() => assertPreviewOnly([{ key: "VITE_X", context: "all" }])).toThrow(/preview invariant/);
  });
});

describe("isTeragonSite", () => {
  it("accepts by id match or teragon name; rejects an unrelated site", () => {
    expect(isTeragonSite({ id: "site-1", name: "whatever" }, "site-1")).toBe(true);
    expect(isTeragonSite({ id: "x", name: "teragon-os-demo" }, "site-1")).toBe(true);
    expect(isTeragonSite({ id: "x", name: "someone-else" }, "site-1")).toBe(false);
  });
});

describe("configureNetlify apply (Preview context only)", () => {
  it("sets the 4 Preview vars, preserves unrelated Preview vars, leaves Production untouched", async () => {
    const netlify = fakeNetlify({
      site: { id: "site-1", name: "teragon-os-demo" },
      previewEnv: { UNRELATED_PREVIEW: "keep" },
      productionEnv: { PROD_ONLY: "must-not-change", AI_MODEL: "x" },
    });
    const { tracker } = memoryStage();
    const result = await configureNetlify({ mode: "apply", credentials: provider(CONN), netlify, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(result.context).toBe("deploy-preview");
    expect(result.setKeys).toHaveLength(4);
    expect(result.preservedUnrelated).toBe(true);
    expect(result.productionUnchanged).toBe(true);
    // our vars now in the Preview context; unrelated preview var kept.
    for (const k of result.setKeys) expect(netlify.ctx["deploy-preview"]!.has(k)).toBe(true);
    expect(netlify.ctx["deploy-preview"]!.has("UNRELATED_PREVIEW")).toBe(true);
    // Production context NEVER written: same keys as before; all setEnv used deploy-preview.
    expect([...netlify.ctx.production!.keys()].sort()).toEqual(["AI_MODEL", "PROD_ONLY"]);
    expect(netlify.calls.filter((c) => c.method === "setEnv").every((c) => (c.args[0] as { context: string }).context === "deploy-preview")).toBe(true);
    // no VITE_ secret / privileged var written
    expect(netlify.calls.filter((c) => c.method === "setEnv").some((c) => (c.args[0] as { secret: boolean }).secret)).toBe(false);
    expect(tracker.completed("NETLIFY_PREVIEW_CONFIGURED")).toBe(true);
  });

  it("is idempotent on a second run (same 4 keys, Production still unchanged)", async () => {
    const netlify = fakeNetlify({ site: { id: "site-1", name: "teragon-os-demo" }, productionEnv: { PROD_ONLY: "x" } });
    const cred = provider(CONN);
    const r1 = await configureNetlify({ mode: "apply", credentials: cred, netlify, stage: memoryStage().tracker, validation: { ok: true } });
    const previewCountAfter1 = netlify.ctx["deploy-preview"]!.size;
    const r2 = await configureNetlify({ mode: "apply", credentials: cred, netlify, stage: memoryStage().tracker, validation: { ok: true } });
    expect(r1.ok && r2.ok).toBe(true);
    expect(netlify.ctx["deploy-preview"]!.size).toBe(previewCountAfter1); // no growth
    expect([...netlify.ctx.production!.keys()]).toEqual(["PROD_ONLY"]);
  });

  it("rejects when the linked site is NOT the Teragon site (no writes)", async () => {
    const netlify = fakeNetlify({ site: { id: "other", name: "acme-corp-site" } });
    const { tracker } = memoryStage();
    const result = await configureNetlify({ mode: "apply", credentials: provider({ ...CONN, NETLIFY_SITE_ID: "site-1" }), netlify, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not the expected teragon/i);
    expect(netlify.calls.some((c) => c.method === "setEnv")).toBe(false);
  });
});

import { createNetlifyAdapter } from "../../scripts/platform/shared/adapters/netlify.mjs";

describe("real Netlify adapter — getLinkedSite resolves by site id (not local link)", () => {
  it("uses api getSite with NETLIFY_SITE_ID and returns {id,name}", async () => {
    const seen: string[][] = [];
    const adapter = createNetlifyAdapter({
      credentials: (n: string) => (n === "NETLIFY_SITE_ID" ? "site-abc" : n === "NETLIFY_AUTH_TOKEN" ? "tok" : undefined),
      capture: async (_cmd: string, args: string[]) => {
        seen.push(args);
        return JSON.stringify({ id: "site-abc", name: "teragon-os-demo" });
      },
    });
    const site = await adapter.getLinkedSite();
    expect(site).toEqual({ id: "site-abc", name: "teragon-os-demo" });
    // used api getSite (not `status`) with the site id in the payload
    expect(seen[0]!.slice(0, 2)).toEqual(["api", "getSite"]);
    expect(seen[0]!.join(" ")).toContain("site-abc");
  });

  it("setEnv targets a single context (never --context all)", async () => {
    const seen: string[][] = [];
    const adapter = createNetlifyAdapter({
      credentials: (n: string) => (n === "NETLIFY_SITE_ID" ? "site-abc" : undefined),
      capture: async (_c: string, args: string[]) => {
        seen.push(args);
        return "{}";
      },
    });
    await adapter.setEnv({ key: "VITE_SUPABASE_URL", value: "v", scopes: ["builds", "runtime"], secret: false, context: "deploy-preview" });
    const args = seen[0]!;
    expect(args).toContain("--context");
    expect(args[args.indexOf("--context") + 1]).toBe("deploy-preview");
    expect(args).not.toContain("all");
  });
});
