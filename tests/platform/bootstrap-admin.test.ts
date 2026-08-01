// Gate S7.0 — admin bootstrap uses the Admin API + canonical RPC, contains NO
// direct auth.users SQL, is idempotent, and self-verifies role/org/active.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapAdmin, maskEmail, CANONICAL_ADMIN_ROLE } from "../../scripts/platform/bootstrap-admin.mjs";
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
