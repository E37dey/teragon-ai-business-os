// S10.0-D2 — the two Supabase probes reached through the CANONICAL health path.
// Deterministic: the probe IO seam is injected, so no network, no real client,
// no service-role key and no Supabase mutation is possible from these tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRepositoriesForTests } from "@/repositories/factory";
import { HEALTH_COMPONENT_IDS } from "@/domain/system-health";
import { ALL_CHECKS, componentStateForProbe, runAllChecks } from "@/system-health/checks";
import type { SupabaseProbeEnv } from "@/system-health/supabaseProbes";
import { makeEnv } from "./helpers";

beforeEach(() => __resetRepositoriesForTests());

const probeEnv = (over: Partial<SupabaseProbeEnv> = {}): SupabaseProbeEnv => ({
  isConfigured: () => true,
  reach: async () => 200,
  rlsRead: async () => ({ rowCount: 0 }), // empty ⇒ healthy
  now: () => "2026-01-01T00:00:00.000Z",
  ...over,
});

const byId = (rs: Awaited<ReturnType<typeof runAllChecks>>, id: string) =>
  rs.find((r) => r.componentId === id)!;

describe("S10.0-D2 · canonical registry", () => {
  it("registers BOTH probes in ALL_CHECKS, in registry order", () => {
    expect(ALL_CHECKS.map((c) => c.id)).toEqual([...HEALTH_COMPONENT_IDS]);
    expect(ALL_CHECKS.map((c) => c.id)).toContain("supabase-reachability");
    expect(ALL_CHECKS.map((c) => c.id)).toContain("supabase-rls-read");
  });

  it("the canonical runner executes both when a probe env is injected", async () => {
    const env = { ...(await makeEnv()), supabaseProbe: probeEnv() };
    const results = await runAllChecks(env);
    expect(byId(results, "supabase-reachability").state).toBe("תקין");
    expect(byId(results, "supabase-rls-read").state).toBe("תקין"); // empty result is healthy
  });

  it("executes each probe EXACTLY once per health check (no polling/duplication)", async () => {
    const reach = vi.fn(async () => 200);
    const rlsRead = vi.fn(async () => ({ rowCount: 0 }));
    const env = { ...(await makeEnv()), supabaseProbe: probeEnv({ reach, rlsRead }) };
    await runAllChecks(env);
    expect(reach).toHaveBeenCalledTimes(1);
    expect(rlsRead).toHaveBeenCalledTimes(1);
  });
});

describe("S10.0-D2 · state mapping", () => {
  it("maps every provider-neutral state onto the canonical Hebrew state", () => {
    expect(componentStateForProbe("healthy")).toBe("תקין");
    expect(componentStateForProbe("degraded")).toBe("מוגבל");
    expect(componentStateForProbe("unavailable")).toBe("לא זמין");
    expect(componentStateForProbe("unauthorized")).toBe("דורש תשומת לב");
    expect(componentStateForProbe("misconfigured")).toBe("לא הוגדר");
  });

  it("an RLS denial surfaces as 'דורש תשומת לב' in the aggregate", async () => {
    const env = {
      ...(await makeEnv()),
      supabaseProbe: probeEnv({ rlsRead: async () => ({ rowCount: 0, errorCode: "42501" }) }),
    };
    const results = await runAllChecks(env);
    expect(byId(results, "supabase-rls-read").state).toBe("דורש תשומת לב");
  });

  it("missing configuration surfaces as 'לא הוגדר'", async () => {
    const env = { ...(await makeEnv()), supabaseProbe: probeEnv({ isConfigured: () => false }) };
    const results = await runAllChecks(env);
    expect(byId(results, "supabase-reachability").state).toBe("לא הוגדר");
  });
});

describe("S10.0-D2 · resilience and safety", () => {
  it("a FAILING probe does not block the remaining checks", async () => {
    const env = {
      ...(await makeEnv()),
      supabaseProbe: probeEnv({ reach: async () => { throw new Error("transport down"); } }),
    };
    const results = await runAllChecks(env);
    // every registry component is still present and ordered
    expect(results.map((r) => r.componentId)).toEqual([...HEALTH_COMPONENT_IDS]);
    expect(byId(results, "supabase-reachability").state).toBe("לא זמין");
    expect(byId(results, "supabase-rls-read").state).toBe("תקין"); // the other probe still ran
    expect(byId(results, "indexeddb").lastCheck).not.toBeNull(); // local checks unaffected
  });

  it("no url, token, id, row, session or error message enters the aggregate", async () => {
    const env = {
      ...(await makeEnv()),
      supabaseProbe: probeEnv({
        reach: async () => { throw new Error("https://x.supabase.co?apikey=eyJsecret"); },
        rlsRead: async () => { throw new Error("row id=cu-1 user=a@b.co Bearer eyJtok"); },
      }),
    };
    const results = await runAllChecks(env);
    const serialized = JSON.stringify([
      byId(results, "supabase-reachability"),
      byId(results, "supabase-rls-read"),
    ]);
    for (const leak of ["supabase.co", "apikey", "eyJ", "cu-1", "a@b.co", "Bearer"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});
