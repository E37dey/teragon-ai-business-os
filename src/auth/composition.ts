// TERAGON AI BUSINESS OS — Gate S8.0: explicit Auth composition selector.
//
// Chooses EXACTLY ONE auth boundary from the resolved persistence provider:
//   * VITE_PERSISTENCE_PROVIDER=SUPABASE (e.g. the Preview) → SupabaseAuthProvider
//   * anything else (the LOCAL default)                     → LocalAuthProvider
//
// There is NO silent fallback: a build wired for SUPABASE is served the Supabase
// boundary even if the network / config later fails (that surfaces as a safe
// error inside the provider) — it is never quietly downgraded to a local
// identity.
import { resolvePersistenceProvider } from "@/persistence/provider";
import { LocalAuthProvider } from "./LocalAuthProvider";
import { SupabaseAuthProvider } from "./SupabaseAuthProvider";
import type { AuthBoundary, AuthMode } from "./types";

/** The auth mode this build/runtime resolved to (mirrors the persistence provider). */
export function resolveAuthMode(override?: string | null): AuthMode {
  return resolvePersistenceProvider(override) === "SUPABASE" ? "SUPABASE" : "LOCAL";
}

/** Construct the one active auth boundary. `override` is for tests/harness only. */
export function createAuthBoundary(override?: string | null): AuthBoundary {
  return resolveAuthMode(override) === "SUPABASE"
    ? new SupabaseAuthProvider()
    : new LocalAuthProvider();
}
