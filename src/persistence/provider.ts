// TERAGON AI BUSINESS OS — Gate S4: persistence-provider selection (flag).
//
// The whole platform is LOCAL-FIRST. IndexedDB (LOCAL_INDEXEDDB) is and remains
// the DEFAULT persistence provider. Supabase is a SECOND provider added behind a
// boundary — it is opt-in via an explicit build flag and is only imported lazily
// (dynamic import) when actually selected, so the default bundle never pulls in
// `@supabase/supabase-js`.
//
// SUPABASE only becomes the default AFTER staging acceptance — a later, explicit
// human approval. Until then, an absent/unknown flag ALWAYS resolves to LOCAL.

export type PersistenceProvider = "LOCAL_INDEXEDDB" | "SUPABASE";

/** The one true default. Never flip this to SUPABASE without staging sign-off. */
export const DEFAULT_PERSISTENCE_PROVIDER: PersistenceProvider = "LOCAL_INDEXEDDB";

/**
 * Resolve the active provider.
 *
 * Precedence: explicit `override` → `VITE_PERSISTENCE_PROVIDER` → the LOCAL
 * default. Any value that is not exactly "SUPABASE" resolves to LOCAL
 * (fail-safe: an accidental / malformed flag can never silently switch the app
 * onto the remote backend).
 */
export function resolvePersistenceProvider(override?: string | null): PersistenceProvider {
  const raw = override ?? import.meta.env.VITE_PERSISTENCE_PROVIDER ?? "";
  return raw === "SUPABASE" ? "SUPABASE" : DEFAULT_PERSISTENCE_PROVIDER;
}

/**
 * The provider this build/runtime resolved to. Evaluated once from the build-time
 * env. LOCAL unless `VITE_PERSISTENCE_PROVIDER=SUPABASE` was explicitly set.
 */
export const PERSISTENCE_PROVIDER: PersistenceProvider = resolvePersistenceProvider();
