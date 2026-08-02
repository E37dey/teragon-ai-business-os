// Gate S7.0 — admin bootstrap uses the Admin API + canonical RPC, contains NO
// direct auth.users SQL, is idempotent, and self-verifies role/org/active.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapAdmin, maskEmail, CANONICAL_ADMIN_ROLE, classifyAdminError } from "../../scripts/platform/bootstrap-admin.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { fakeSupabase, memoryStage } from "./fakes";

const noAuth = async () => ({ ready: false, via: "none" });
const CONFIRMED = {
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-key-value-1234",
  TERAGON_ADMIN_EMAIL: "admin@example.test",
  TERAGON_ADMIN_PASSWORD: "admin-password-value-123",
  TERAGON_ADMIN_EMAIL_CONFIRMED: "true",
};
function provider(env: Record<string, string>) {
  return createCredentialProvider({ env, fileText: "", authResolver: noAuth });
}

describe("bootstrap-admin — no direct SQL path (source scan)", () => {
  it("contains NO auth.users INSERT and NO seed-file execution", () => {
    const src = readFileSync(resolve(process.cwd(), "scripts/platform/bootstrap-admin.mjs"), "utf8");
    expect(/insert\s+into\s+[^;]*auth\.users/i.test(src)).toBe(false);
    expect(/db\s+execute/i.test(src)).toBe(false);
    expect(/seed\/admin\.sql/i.test(src)).toBe(false);
    // It DOES use the sanctioned surface.
    expect(src).toContain("createUser");
    expect(src).toContain("bootstrapAdminRpc");
  });

  it("masks the admin email to domain-only", () => {
    expect(maskEmail("someone@teragon.test")).toBe("***@teragon.test");
    expect(maskEmail("not-an-email")).toBe("(admin)");
  });
});

describe("bootstrap-admin apply — Admin API + RPC, idempotent, self-verifying", () => {
  it("creates a new user then calls bootstrap_admin, verifies role/org/active", async () => {
    const supabase = fakeSupabase({ existingUser: null });
    const { tracker } = memoryStage();
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider(CONFIRMED), supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(supabase.called("createUser")).toBe(true);
    expect(supabase.called("bootstrapAdminRpc")).toBe(true);
    expect(result.role).toBe(CANONICAL_ADMIN_ROLE);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(true);
  });

  it("is idempotent — reuses an existing user (never a duplicate)", async () => {
    const supabase = fakeSupabase({ existingUser: { userId: "existing-user" } });
    const { tracker } = memoryStage();
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider(CONFIRMED), supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(result.mutated).toBe(false);
    expect(supabase.called("createUser")).toBe(false);
    expect(supabase.called("bootstrapAdminRpc")).toBe(true);
  });

  it("fails verification when the profile is not the canonical active admin", async () => {
    const supabase = fakeSupabase({ profile: { id: "u", organization_id: "org-teragon", role_id: "crole-viewer", active: true } });
    const { tracker } = memoryStage();
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider(CONFIRMED), supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/role/i);
  });

  it("refuses in S7.0 when the confirmation gate is not set (validation not ok)", async () => {
    const supabase = fakeSupabase();
    const { tracker } = memoryStage();
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider({ ...CONFIRMED, TERAGON_ADMIN_EMAIL_CONFIRMED: "false" }), supabase, stage: tracker, validation: { ok: false } });
    expect(result.ok).toBe(false);
    expect(supabase.called("createUser")).toBe(false);
  });
});

// --- S7.2.1: fail-closed Admin-API error handling + safe categories ----------
describe("bootstrap-admin — fail-closed on Admin API failure (no exception escapes)", () => {
  function throwingSupabaseAt(method: string, err: unknown) {
    const base = fakeSupabase();
    return { ...base, [method]: async () => { throw err; } };
  }

  it("catches an Admin-API HTML/non-JSON failure and records a SAFE failed stage", async () => {
    const { tracker } = memoryStage();
    const supabase = throwingSupabaseAt("findUserByEmail", new Error("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"));
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider(CONFIRMED), supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(false);
    // safe category only — never the HTML body
    expect(result.reason).not.toMatch(/<!DOCTYPE|<html/i);
    expect(result.reason).toMatch(/non-json|gateway/i);
    // did NOT proceed / did NOT mark ADMIN_BOOTSTRAPPED
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(false);
    expect(tracker.read().state).toBe("FAILED");
  });

  it("a createUser failure prevents the RPC and seed (fails closed, resume point preserved)", async () => {
    const { tracker } = memoryStage();
    const err = Object.assign(new Error("Database error finding users"), { status: 500 });
    const supabase = throwingSupabaseAt("createUser", err);
    const result = await bootstrapAdmin({ mode: "apply", credentials: provider(CONFIRMED), supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/500|auth service/i);
    expect(supabase.called("bootstrapAdminRpc")).toBe(false);
    expect(tracker.completed("ADMIN_BOOTSTRAPPED")).toBe(false);
  });
});

describe("classifyAdminError — safe categories, no leakage", () => {
  it("categorizes HTML, 500, 403, 401, network without leaking bodies", () => {
    expect(classifyAdminError(new Error("Unexpected token '<', \"<!DOCTYPE\""))).toMatch(/non-json|gateway/i);
    expect(classifyAdminError(Object.assign(new Error("Database error finding users"), { status: 500 }))).toMatch(/500|auth service/i);
    expect(classifyAdminError(Object.assign(new Error("forbidden"), { status: 403 }))).toMatch(/403|WAF/i);
    expect(classifyAdminError(Object.assign(new Error("unauthorized"), { status: 401 }))).toMatch(/401/);
    expect(classifyAdminError(new Error("AuthRetryableFetchError"))).toMatch(/network|retry/i);
  });

  it("never returns the raw HTML body / DOCTYPE", () => {
    const cat = classifyAdminError(new Error("<!DOCTYPE html><html>secret-page</html>"));
    expect(cat).not.toContain("secret-page");
    expect(cat).not.toContain("DOCTYPE");
  });
});

describe("Admin adapter uses supported init path (no manual Bearer header)", () => {
  it("supabase adapter never manually sets an Authorization/Bearer header", () => {
    const src = readFileSync(resolve(process.cwd(), "scripts/platform/shared/adapters/supabase.mjs"), "utf8");
    expect(/authorization\s*:/i.test(src)).toBe(false);
    expect(/Bearer/i.test(src)).toBe(false);
    // uses the supported client config
    expect(src).toContain("detectSessionInUrl");
    expect(src).toContain("SUPABASE_AUTH_ADMIN_KEY");
  });
});
