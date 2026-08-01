// Gate S7.0 — Netlify configuration: correct scopes, privileged never VITE_,
// unrelated vars preserved, wrong site rejected.
import { describe, expect, it } from "vitest";
import { buildNetlifyVarPlan, assertScopeInvariants, isTeragonSite, configureNetlify } from "../../scripts/platform/configure-netlify.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { fakeNetlify, memoryStage } from "./fakes";

const noAuth = async () => ({ ready: false, via: "none" });
const CONN = {
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_ANON_KEY: "anon-publishable-key-123456",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-abcdef",
  SUPABASE_ORG_ID: "org-1",
  NETLIFY_AUTH_TOKEN: "nf-token",
  NETLIFY_SITE_ID: "site-1",
};
function provider(env: Record<string, string>) {
  return createCredentialProvider({ env, fileText: "", authResolver: noAuth });
}

describe("Netlify var scope mapping", () => {
  it("browser-safe vars are VITE_ + build/runtime; service-role is Functions-only + secret", () => {
    const plan = buildNetlifyVarPlan({ supabaseUrl: "u", anonKey: "a", org: "o", serviceKey: "s", previewProvider: "SUPABASE" });
    const byKey = Object.fromEntries(plan.map((p: { key: string }) => [p.key, p]));
    expect(byKey.VITE_SUPABASE_URL.browserSafe).toBe(true);
    expect(byKey.VITE_SUPABASE_URL.scopes).toContain("builds");
    expect(byKey.VITE_PERSISTENCE_PROVIDER.value).toBe("SUPABASE");
    const svc = byKey.SUPABASE_SERVICE_ROLE_KEY;
    expect(svc.secret).toBe(true);
    expect(svc.scopes).toEqual(["functions"]);
    expect(svc.key.startsWith("VITE_")).toBe(false);
  });

  it("the invariant assertion THROWS if a privileged value is VITE_-prefixed", () => {
    expect(() =>
      assertScopeInvariants([{ key: "VITE_SERVICE_ROLE", scopes: ["functions"], secret: true, browserSafe: false }]),
    ).toThrow(/VITE_/);
  });
});

describe("isTeragonSite", () => {
  it("accepts by id match or teragon name; rejects an unrelated site", () => {
    expect(isTeragonSite({ id: "site-1", name: "whatever" }, "site-1")).toBe(true);
    expect(isTeragonSite({ id: "x", name: "teragon-os-demo" }, "site-1")).toBe(true);
    expect(isTeragonSite({ id: "x", name: "someone-else" }, "site-1")).toBe(false);
  });
});

describe("configureNetlify apply", () => {
  it("sets known vars at correct scopes and PRESERVES unrelated existing vars", async () => {
    const netlify = fakeNetlify({ site: { id: "site-1", name: "teragon-os-demo" }, env: { UNRELATED_FLAG: "keep-me", AI_MODEL: "x" } });
    const { tracker } = memoryStage();
    const result = await configureNetlify({ mode: "apply", credentials: provider(CONN), netlify, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(result.preservedUnrelated).toBe(true);
    // unrelated vars still present.
    expect(netlify.state.has("UNRELATED_FLAG")).toBe(true);
    // service-role set at functions scope + secret.
    expect(netlify.state.get("SUPABASE_SERVICE_ROLE_KEY")).toEqual({ scopes: ["functions"], secret: true });
    // never sets a VITE_ service-role var.
    expect([...netlify.state.keys()].some((k) => k.startsWith("VITE_") && /service/i.test(k))).toBe(false);
  });

  it("rejects when the linked site is NOT the Teragon site", async () => {
    const netlify = fakeNetlify({ site: { id: "other", name: "acme-corp-site" } });
    const { tracker } = memoryStage();
    const result = await configureNetlify({ mode: "apply", credentials: provider({ ...CONN, NETLIFY_SITE_ID: "site-1" }), netlify, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not the expected teragon/i);
    expect(netlify.calls.some((c) => c.method === "setEnv")).toBe(false);
  });
});
