// TERAGON AI BUSINESS OS — Gate S4: Supabase browser-client factory.
//
// SECURITY CONTRACT:
//   * ONLY the PUBLIC anon key is ever used here (VITE_SUPABASE_ANON_KEY).
//   * The service-role key MUST NEVER appear in this file or anywhere in the
//     browser bundle. There is no code path that reads a service-role key.
//   * This module lives under `./supabase/**`, which is imported LAZILY (dynamic
//     import) only when PERSISTENCE_PROVIDER === "SUPABASE" — so importing
//     `@supabase/supabase-js` never happens in the default (LOCAL) bundle.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Minimal surface this adapter layer relies on (kept narrow on purpose). */
export type TeragonSupabaseClient = SupabaseClient;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not configured");
    this.name = "SupabaseNotConfiguredError";
  }
}

let cached: TeragonSupabaseClient | null = null;

/** Read the PUBLIC config from Vite env. Returns null when unset (never throws). */
export function readSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Create (and cache) the browser client from the PUBLIC anon key. Throws
 * `SupabaseNotConfiguredError` when the env is missing so the boundary can map
 * it to a safe "unavailable" result — never a silent fallback to local.
 */
export function getSupabaseClient(): TeragonSupabaseClient {
  if (cached) return cached;
  const config = readSupabaseConfig();
  if (!config) throw new SupabaseNotConfiguredError();
  cached = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cached;
}

/** Test hook — drop the cached client. */
export function __resetSupabaseClientForTests(): void {
  cached = null;
}
