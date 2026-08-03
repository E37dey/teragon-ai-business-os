// S10.0-D — safe Supabase + RLS health probes.
// Deterministic: the whole IO seam is injected, so no network, no real client,
// no service-role key and no Supabase mutation is possible from these tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  probeSupabaseReachability,
  probeSupabaseRlsRead,
  runSupabaseProbes,
  type SupabaseProbeEnv,
  type SupabaseProbeResult,
} from "@/system-health/supabaseProbes";
import {
  setErrorReportProvider,
  resetErrorReportProvider,
  type SafeErrorEvent,
} from "@/observability/errorSink";

const NOW = "2026-01-01T00:00:00.000Z";
let events: Required<SafeErrorEvent>[] = [];

function env(over: Partial<SupabaseProbeEnv> = {}): SupabaseProbeEnv {
  return {
    isConfigured: () => true,
    reach: async () => 200,
    rlsRead: async () => ({ rowCount: 1 }),
    now: () => NOW,
    ...over,
  };
}

beforeEach(() => {
  events = [];
  setErrorReportProvider((e) => events.push(e));
});
afterEach(() => resetErrorReportProvider());

describe("S10.0-D · reachability probe", () => {
  it("reachable Supabase is healthy", async () => {
    const r = await probeSupabaseReachability(env());
    expect(r).toMatchObject({ id: "supabase-reachability", state: "healthy", timestamp: NOW });
    expect(r.correlationId).toBeTruthy();
    expect(events).toHaveLength(0); // a successful probe is NOT reported
  });

  it("invalid configuration is misconfigured, and never calls the network", async () => {
    const reach = vi.fn(async () => 200);
    const r = await probeSupabaseReachability(env({ isConfigured: () => false, reach }));
    expect(r).toMatchObject({ state: "misconfigured", code: "not_configured" });
    expect(reach).not.toHaveBeenCalled();
  });

  it("network failure is unavailable (thrown dependency is contained)", async () => {
    const r = await probeSupabaseReachability(
      env({ reach: async () => { throw new Error("ECONNREFUSED 10.0.0.1 token=abc"); } }),
    );
    expect(r).toMatchObject({ state: "unavailable", code: "transport_failed" });
  });

  it("401/403 is unauthorized; 5xx is unavailable; other non-2xx is degraded", async () => {
    expect((await probeSupabaseReachability(env({ reach: async () => 401 }))).state).toBe("unauthorized");
    expect((await probeSupabaseReachability(env({ reach: async () => 503 }))).state).toBe("unavailable");
    expect((await probeSupabaseReachability(env({ reach: async () => 418 }))).state).toBe("degraded");
  });
});

describe("S10.0-D · RLS read probe", () => {
  it("a permitted read is healthy", async () => {
    expect((await probeSupabaseRlsRead(env())).state).toBe("healthy");
    expect(events).toHaveLength(0);
  });

  it("an EMPTY result is healthy — the request succeeded, RLS returned nothing", async () => {
    const r = await probeSupabaseRlsRead(env({ rlsRead: async () => ({ rowCount: 0 }) }));
    expect(r.state).toBe("healthy");
    expect(r.code).toBeUndefined();
  });

  it("an RLS denial (42501) is unauthorized", async () => {
    const r = await probeSupabaseRlsRead(env({ rlsRead: async () => ({ rowCount: 0, errorCode: "42501" }) }));
    expect(r).toMatchObject({ state: "unauthorized", code: "42501" });
    expect(events[0]).toMatchObject({ kind: "domain_read_denied", code: "42501", domain: "supabase-rls-read" });
  });

  it("a JWT/auth denial (PGRST301) is unauthorized", async () => {
    expect((await probeSupabaseRlsRead(env({ rlsRead: async () => ({ rowCount: 0, errorCode: "PGRST301" }) }))).state)
      .toBe("unauthorized");
  });

  it("any other error code is degraded, not a denial", async () => {
    const r = await probeSupabaseRlsRead(env({ rlsRead: async () => ({ rowCount: 0, errorCode: "PGRST116" }) }));
    expect(r).toMatchObject({ state: "degraded", code: "PGRST116" });
    expect(events[0]).toMatchObject({ kind: "domain_read_failed" });
  });

  it("a thrown dependency is contained as unavailable", async () => {
    const r = await probeSupabaseRlsRead(env({ rlsRead: async () => { throw new Error("boom a@b.co"); } }));
    expect(r.state).toBe("unavailable");
  });
});

describe("S10.0-D · output safety", () => {
  it("exposes ONLY id, state, timestamp, code and correlationId", async () => {
    const r = await probeSupabaseRlsRead(env({ rlsRead: async () => ({ rowCount: 0, errorCode: "42501" }) }));
    expect(Object.keys(r).sort()).toEqual(["code", "correlationId", "id", "state", "timestamp"]);
  });

  it("leaks no url, query, row, id, message, session or token", async () => {
    const results: SupabaseProbeResult[] = await runSupabaseProbes(
      env({
        reach: async () => { throw new Error("https://x.supabase.co?apikey=eyJsecret"); },
        rlsRead: async () => { throw new Error("row id=cu-1 user=a@b.co Bearer eyJtok"); },
      }),
    );
    const serialized = JSON.stringify(results);
    for (const leak of ["supabase.co", "apikey", "eyJ", "cu-1", "a@b.co", "Bearer", "?"]) {
      expect(serialized).not.toContain(leak);
    }
    // the sink events must be equally clean
    expect(JSON.stringify(events)).not.toContain("eyJ");
  });

  it("runSupabaseProbes returns both checks and never throws", async () => {
    const results = await runSupabaseProbes(env({ reach: async () => { throw new Error("x"); } }));
    expect(results.map((r) => r.id)).toEqual(["supabase-reachability", "supabase-rls-read"]);
  });

  it("each probe run carries a distinct correlationId", async () => {
    const [a, b] = await runSupabaseProbes(env());
    expect(a!.correlationId).not.toBe(b!.correlationId);
  });
});
