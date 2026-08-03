// TERAGON AI BUSINESS OS — Gate S10.0-D: PRODUCTION IO for the Supabase probes.
//
// Kept separate from supabaseProbes.ts so the probe LOGIC stays pure and unit
// tests never touch the network or the real client.
//
// Only the browser-safe publishable/anon client is used — the same one the app
// already ships (src/persistence/supabase/client.ts). The service-role key is
// server-only and is deliberately absent from this module.
import { getSupabaseClient, readSupabaseConfig } from "@/persistence/supabase/client";
import type { SupabaseProbeEnv } from "./supabaseProbes";

/** The connected domain used for the RLS read path. Bounded to ONE row. */
const RLS_PROBE_TABLE = "customers";

export function productionSupabaseProbeEnv(): SupabaseProbeEnv {
  return {
    isConfigured: () => readSupabaseConfig() !== null,

    // Unauthenticated-safe reachability: the auth settings endpoint accepts the
    // anon key and returns a status without touching tenant data.
    reach: async () => {
      const config = readSupabaseConfig();
      if (!config) throw new Error("not configured"); // caught by the probe
      const res = await fetch(`${config.url}/auth/v1/settings`, {
        headers: { apikey: config.anonKey },
      });
      return res.status;
    },

    // RLS-governed read with the CURRENT session. `select ... limit 1` only —
    // no insert/update/delete, and the row itself is never read or returned.
    rlsRead: async () => {
      const { data, error } = await getSupabaseClient()
        .from(RLS_PROBE_TABLE)
        .select("id")
        .limit(1);
      if (error) return { rowCount: 0, errorCode: String(error.code ?? "unknown") };
      return { rowCount: (data ?? []).length };
    },

    now: () => new Date().toISOString(),
  };
}
