// Gate S7.0.1 fix — REAL Supabase adapter command-contract for `projects create`.
// The live apply failed because createProject built argv WITHOUT --db-password
// (CLI refuses non-interactively). These tests pin the exact argv contract and
// prove the password is present, correctly placed, ONE element, and never leaked.
import { describe, expect, it } from "vitest";
import { createSupabaseAdapter } from "../../scripts/platform/shared/adapters/supabase.mjs";
import { redact } from "../../scripts/platform/shared/log.mjs";
import { provisionStaging } from "../../scripts/platform/provision-staging.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { memoryStage } from "./fakes";

const PW = "DbP4ss-CSPRNG-value-abcdef123456";

/** A real adapter wired to a capture spy that records (cmd, args, env). */
function adapterWithSpy(dbPassword: string | undefined) {
  const seen: { cmd: string; args: string[]; env: Record<string, string> }[] = [];
  const adapter = createSupabaseAdapter({
    credentials: (n: string) => (n === "SUPABASE_DB_PASSWORD" ? dbPassword : undefined),
    capture: async (cmd: string, args: string[], env: Record<string, string> = {}) => {
      seen.push({ cmd, args, env });
      return JSON.stringify({ id: "createdref01" });
    },
  });
  return { adapter, seen };
}

describe("createProject — argv contract", () => {
  it("REFUSES (NAMES-only) when dbPassword is absent or empty", async () => {
    const { adapter, seen } = adapterWithSpy(undefined);
    await expect(adapter.createProject({ name: "teragon-staging", orgId: "org-1", region: "eu-central-1" })).rejects.toThrow(
      /database password \(by name\): SUPABASE_DB_PASSWORD/,
    );
    // it threw BEFORE invoking the CLI — zero mutation.
    expect(seen).toHaveLength(0);
    // empty string also refused
    await expect(
      adapter.createProject({ name: "teragon-staging", orgId: "org-1", region: "eu-central-1", dbPassword: "   " }),
    ).rejects.toThrow(/SUPABASE_DB_PASSWORD/);
  });

  it("includes --db-password with the value as the NEXT single argv element", async () => {
    const { adapter, seen } = adapterWithSpy(PW);
    await adapter.createProject({ name: "teragon-staging", orgId: "org-1", region: "eu-central-1", dbPassword: PW });
    const { args } = seen[0]!;
    const i = args.indexOf("--db-password");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe(PW); // exactly the supplied password
    // ONE argv element — the flag and value are not fused into a single token.
    expect(args).not.toContain(`--db-password ${PW}`);
    expect(args).not.toContain(`--db-password=${PW}`);
  });

  it("keeps name/org/region/output-mode correct and exact", async () => {
    const { adapter, seen } = adapterWithSpy(PW);
    await adapter.createProject({ name: "teragon-staging", orgId: "org-XYZ", region: "eu-central-1", dbPassword: PW });
    expect(seen[0]!.args).toEqual([
      "projects",
      "create",
      "teragon-staging",
      "--org-id",
      "org-XYZ",
      "--region",
      "eu-central-1",
      "--db-password",
      PW,
      "--output",
      "json",
    ]);
    // no --debug enabled for provisioning
    expect(seen[0]!.args).not.toContain("--debug");
  });

  it("the password never appears once the argv is redacted for logging", () => {
    const args = ["projects", "create", "teragon-staging", "--org-id", "org-1", "--region", "eu-central-1", "--db-password", PW, "--output", "json"];
    const preview = redact(`RUN: supabase ${args.join(" ")}`);
    expect(preview).not.toContain(PW);
    expect(preview).toContain("«REDACTED»");
    // the --db-password mask works INDEPENDENT of value registration (fresh value)
    expect(redact("supabase projects create x --db-password Un-Registered-Secret-9f8 --output json")).not.toContain("Un-Registered-Secret-9f8");
    expect(redact("--db-password=AnotherSecretValue123")).not.toContain("AnotherSecretValue123");
  });
});

describe("provisioning forwards the credential-provider password", () => {
  it("provisionStaging passes SUPABASE_DB_PASSWORD from the provider into createProject", async () => {
    const provider = createCredentialProvider({
      env: { SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: PW },
      fileText: "",
      authResolver: async () => ({ ready: true, via: "cli-session" }),
    });
    let forwarded: string | undefined;
    const supabase = {
      async listOrgs() {
        return [{ id: "org-1", name: "Teragon" }];
      },
      async listProjects() {
        return [];
      },
      async createProject(a: { dbPassword?: string }) {
        forwarded = a.dbPassword;
        if (!a.dbPassword) throw new Error("missing db password");
        return { ref: "createdref01", raw: {} };
      },
      async getProjectHealth() {
        return { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-1", region: "eu-central-1" } };
      },
      async link() {},
      async getConnectionMetadata(ref: string) {
        return { url: `https://${ref}.supabase.co` };
      },
      async getProjectApiKeys() {
        return [
          { name: "anon", api_key: "anon-legacy-value-abcdef" },
          { name: "service_role", api_key: "service-role-value-abcdef" },
        ];
      },
    };
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(forwarded).toBe(PW);
  });

  it("plan mode NEVER invokes createProject", async () => {
    const provider = createCredentialProvider({ env: { SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: PW }, fileText: "", authResolver: async () => ({ ready: true, via: "cli-session" }) });
    let called = false;
    const supabase = {
      async createProject() {
        called = true;
        return { ref: "x", raw: {} };
      },
    };
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "plan", credentials: provider, supabase, stage: tracker, validation: { ok: false } });
    expect(result.action).toBe("plan");
    expect(called).toBe(false);
  });
});

describe("failed create leaves the tracker safely resumable + no duplicate on retry", () => {
  it("a create failure leaves the tracker resumable (PROJECT_READY not marked)", async () => {
    const provider = createCredentialProvider({ env: { SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: PW }, fileText: "", authResolver: async () => ({ ready: true, via: "cli-session" }) });
    const supabase = {
      async listOrgs() {
        return [{ id: "org-1" }];
      },
      async listProjects() {
        return [];
      },
      async createProject() {
        throw new Error("CLI refused: missing --db-password");
      },
    };
    const { tracker } = memoryStage();
    await expect(
      provisionStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: { ok: true } }),
    ).rejects.toThrow();
    const st = tracker.read();
    expect(st.completed).not.toContain("PROJECT_READY"); // resumable, not falsely done
  });

  it("retry when the project already exists REUSES it (no duplicate create)", async () => {
    const provider = createCredentialProvider({ env: { SUPABASE_ORG_ID: "org-1", SUPABASE_DB_PASSWORD: PW }, fileText: "", authResolver: async () => ({ ready: true, via: "cli-session" }) });
    let createCalls = 0;
    const supabase = {
      async listOrgs() {
        return [{ id: "org-1" }];
      },
      async listProjects() {
        return [{ id: "existing1", name: "teragon-staging", organization_id: "org-1" }];
      },
      async createProject() {
        createCalls += 1;
        return { ref: "dup", raw: {} };
      },
      async getProjectHealth() {
        return { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-1", region: "eu-central-1" } };
      },
      async link() {},
      async getConnectionMetadata(ref: string) {
        return { url: `https://${ref}.supabase.co` };
      },
      async getProjectApiKeys() {
        return [
          { name: "anon", api_key: "anon-legacy-value-abcdef" },
          { name: "service_role", api_key: "service-role-value-abcdef" },
        ];
      },
    };
    const { tracker } = memoryStage();
    const result = await provisionStaging({ mode: "apply", credentials: provider, supabase, stage: tracker, validation: { ok: true } });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("reuse");
    expect(createCalls).toBe(0);
  });
});
