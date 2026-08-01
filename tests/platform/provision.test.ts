// Gate S7.0 — provisioning: verify-before-create selection rules, health-timeout
// safety, ref↔org verification, duplicate prevention, secure DB-password input.
import { describe, expect, it } from "vitest";
import { provisionStaging, selectStagingProject } from "../../scripts/platform/provision-staging.mjs";
import { createSupabaseAdapter } from "../../scripts/platform/shared/adapters/supabase.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { redact } from "../../scripts/platform/shared/log.mjs";
import { fakeSupabase, memoryStage } from "./fakes";

const readyAuth = async () => ({ ready: true, via: "cli-session" });

function provider(env: Record<string, string>) {
  return createCredentialProvider({ env, fileText: "", authResolver: readyAuth });
}

describe("selectStagingProject — verify-before-create rules", () => {
  it("creates when no staging project exists in the org", () => {
    const d = selectStagingProject({ projects: [], orgId: "org-1" });
    expect(d.action).toBe("create");
  });

  it("reuses the single project named teragon-staging in the org", () => {
    const d = selectStagingProject({ projects: [{ id: "r1", name: "teragon-staging", organization_id: "org-1" }], orgId: "org-1" });
    expect(d.action).toBe("reuse");
    expect(d.ref).toBe("r1");
  });

  it("REJECTS a production-looking project", () => {
    const d = selectStagingProject({ projects: [{ id: "rp", name: "teragon-production", organization_id: "org-1" }], orgId: "org-1", explicitRef: "rp" });
    expect(d.action).toBe("reject");
    expect(d.reason).toMatch(/production/i);
  });

  it("REJECTS ambiguous multiple staging matches (no duplicate created)", () => {
    const d = selectStagingProject({
      projects: [
        { id: "a", name: "teragon-staging", organization_id: "org-1" },
        { id: "b", name: "teragon-staging", organization_id: "org-1" },
      ],
      orgId: "org-1",
    });
    expect(d.action).toBe("reject");
    expect(d.reason).toMatch(/ambiguous/i);
  });

  it("REJECTS creating when a staging-like (non-exact) project exists — prevents duplicates", () => {
    const d = selectStagingProject({ projects: [{ id: "x", name: "teragon-staging-old", organization_id: "org-1" }], orgId: "org-1" });
    expect(d.action).toBe("reject");
    expect(d.reason).toMatch(/duplicate/i);
  });

  it("REJECTS an explicit ref that belongs to a different org", () => {
    const d = selectStagingProject({ projects: [{ id: "r", name: "teragon-staging", organization_id: "org-2" }], orgId: "org-1", explicitRef: "r" });
    expect(d.action).toBe("reject");
    expect(d.reason).toMatch(/different org/i);
  });

  it("REJECTS an explicit ref not visible to the token", () => {
    const d = selectStagingProject({ projects: [], orgId: "org-1", explicitRef: "ghost" });
    expect(d.action).toBe("reject");
    expect(d.reason).toMatch(/not visible/i);
  });
});

describe("provisionStaging apply — health + verification", () => {
  const validation = { ok: true };

  it("creates then links when healthy, records masked ref, no duplicate", async () => {
    const supabase = fakeSupabase({ projects: [], createdRef: "brandnew1" });
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider({ SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: "pw-abcdefghij" }), supabase, stage: tracker, validation });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("create");
    expect(supabase.called("createProject")).toBe(true);
    expect(supabase.called("link")).toBe(true);
    expect(tracker.completed("PROJECT_READY")).toBe(true);
  });

  it("re-run REUSES the existing project (retry never duplicates)", async () => {
    const supabase = fakeSupabase({ projects: [{ id: "existing1", name: "teragon-staging", organization_id: "org-1" }] });
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider({ SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: "pw-abcdefghij" }), supabase, stage: tracker, validation });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("reuse");
    expect(supabase.called("createProject")).toBe(false);
  });

  it("fails SAFELY on a health timeout (never reports success)", async () => {
    const supabase = fakeSupabase({ projects: [], createdRef: "slowref1", health: { status: "COMING_UP", found: true, project: { organization_id: "org-1", region: "eu-central-1" } } });
    const { tracker } = memoryStage();
    const result = await provisionStaging({
      mode: "apply",
      credentials: provider({ SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: "pw-abcdefghij" }),
      supabase,
      stage: tracker,
      validation,
      opts: { healthTimeoutMs: 10, pollIntervalMs: 1, sleep: async () => {} },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/healthy/i);
    expect(supabase.called("link")).toBe(false);
  });

  it("rejects when the selected org is not accessible", async () => {
    const supabase = fakeSupabase({ orgs: [{ id: "other-org", name: "Other" }] });
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider({ SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: "pw-abcdefghij" }), supabase, stage: tracker, validation });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not accessible/i);
  });
});

describe("real Supabase adapter — DB password supplied as required --db-password argv", () => {
  it("createProject sends --db-password (CLI mandate) and it is redacted for logs", async () => {
    const seen: { args: string[] }[] = [];
    const adapter = createSupabaseAdapter({
      credentials: (n: string) => (n === "SUPABASE_DB_PASSWORD" ? "TOP-SECRET-PW-123456" : undefined),
      capture: async (_cmd: string, args: string[]) => {
        seen.push({ args });
        return JSON.stringify({ id: "created1" });
      },
    });
    await adapter.createProject({ name: "teragon-staging", orgId: "org-1", region: "eu-central-1", dbPassword: "TOP-SECRET-PW-123456" });
    const { args } = seen[0]!;
    const i = args.indexOf("--db-password");
    expect(args[i + 1]).toBe("TOP-SECRET-PW-123456"); // exact value, one element
    // the logging layer masks the value following --db-password
    expect(redact(`RUN: supabase ${args.join(" ")}`)).not.toContain("TOP-SECRET-PW-123456");
  });

  it("refuses (NAMES-only, no value) when the password is absent", async () => {
    const adapter = createSupabaseAdapter({ credentials: () => undefined, capture: async () => "{}" });
    await expect(adapter.createProject({ name: "n", orgId: "o", region: "r" })).rejects.toThrow(/SUPABASE_DB_PASSWORD/);
  });
});
