// Gate S7.0 — migration safety: lineage/count/destructive/unexpected-remote all
// block apply; staging-only; additive push (never db reset).
import { describe, expect, it } from "vitest";
import {
  computeManifest,
  migrationSafetyReport,
  compareRemoteHistory,
  scanDestructive,
  EXPECTED_COUNT,
} from "../../scripts/platform/shared/migrations.mjs";
import { migrateStaging } from "../../scripts/platform/migrate.mjs";
import { createCredentialProvider } from "../../scripts/platform/shared/credentials.mjs";
import { fakeSupabase, memoryStage } from "./fakes";

const readyAuth = async () => ({ ready: true, via: "cli-session" });
function provider(env: Record<string, string> = {}) {
  return createCredentialProvider({ env, fileText: "", authResolver: readyAuth });
}

// A fake migrations dir so we can force mismatches deterministically.
function fakeDir(files: Record<string, string>) {
  return {
    list: (_d: string) => Object.keys(files),
    read: (p: string) => {
      const name = p.split(/[\\/]/).pop() as string;
      return files[name] ?? "";
    },
  };
}

describe("migration lineage (real repo)", () => {
  it("has exactly 14 migrations matching the S5-validated lock", () => {
    const report = migrationSafetyReport({ remoteHistory: null });
    expect(report.count).toBe(EXPECTED_COUNT);
    expect(report.lineageOk).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.destructive).toHaveLength(0);
  });

  it("a changed migration body breaks the lineage digest", () => {
    const base = computeManifest();
    const tampered = computeManifest(".", {
      list: () => base.entries.map((e: { file: string }) => e.file),
      read: (p: string) => (p.endsWith("001_foundation.sql") ? "-- tampered\n" : "x"),
    });
    expect(tampered.combined).not.toBe(base.combined);
  });
});

describe("destructive + unexpected-remote detection", () => {
  it("flags destructive SQL", () => {
    const io = fakeDir({ "900_bad.sql": "DROP TABLE public.customers;" });
    expect(scanDestructive("x", io).length).toBeGreaterThan(0);
  });

  it("flags an unexpected remote migration not present locally", () => {
    const manifest = { entries: [{ file: "001_foundation.sql" }, { file: "002_identity.sql" }] };
    const { unexpected } = compareRemoteHistory([{ version: "001" }, { version: "999" }], manifest);
    expect(unexpected).toEqual(["999"]);
  });
});

describe("migrateStaging apply — blocks + additive push", () => {
  it("refuses when DEPLOY_PRODUCTION=true (staging-only)", async () => {
    const supabase = fakeSupabase();
    const { tracker } = memoryStage();
    const result = await migrateStaging({ mode: "apply", credentials: provider(), supabase, stage: tracker, validation: { ok: true }, env: { DEPLOY_PRODUCTION: "true" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/staging-only/i);
    expect(supabase.called("dbPush")).toBe(false);
  });

  it("blocks apply when an unexpected remote migration exists", async () => {
    const supabase = fakeSupabase({ remoteHistory: [{ version: "999" }] });
    const { tracker } = memoryStage();
    const result = await migrateStaging({ mode: "apply", credentials: provider({ SUPABASE_PROJECT_REF: "" }), supabase, stage: tracker, validation: { ok: true }, env: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unexpected/i);
    expect(supabase.called("dbPush")).toBe(false);
  });

  it("applies an additive push when safety passes (never db reset)", async () => {
    // remote history mirrors local versions → no unexpected.
    const manifest = computeManifest();
    const history = manifest.entries.map((e: { file: string }) => ({ version: /^(\d+)/.exec(e.file)![1] }));
    const supabase = fakeSupabase({ remoteHistory: history });
    const { tracker } = memoryStage();
    const result = await migrateStaging({ mode: "apply", credentials: provider(), supabase, stage: tracker, validation: { ok: true }, env: {} });
    expect(result.ok).toBe(true);
    expect(supabase.called("dbPush")).toBe(true);
    // the only mutating call is dbPush — there is no reset method invoked.
    expect(supabase.calls.map((c) => c.method)).not.toContain("dbReset");
  });
});
