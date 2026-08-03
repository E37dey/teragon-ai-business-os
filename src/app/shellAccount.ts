// TERAGON AI BUSINESS OS — Gate S9.1-B2: shell identity resolution.
//
// Resolves the SAFE header identity (name + role label) the shell displays, and
// whether a logout control is offered. Only safe fields are ever read from the
// canonical identity (name / email / roleLabel / organizationName) — never a
// JWT, session, token, capability payload, or raw DB id.
//
//   * SUPABASE: the real server-resolved identity when AUTHENTICATED; otherwise a
//     NEUTRAL placeholder — NEVER the static CANONICAL_USER (no impersonation of
//     a fixed identity in the remote-backed app).
//   * LOCAL_INDEXEDDB: the approved local/default identity (unchanged behaviour).
import type { ShellUser } from "@/layout";
import type { AuthMode, AuthStatus, ResolvedIdentity } from "@/auth/types";

/** Neutral, non-static shell users for the transient SUPABASE non-authenticated states. */
const SUPABASE_INITIALIZING: ShellUser = { name: "…", role: "מאמת חיבור…" };
const SUPABASE_SIGNED_OUT: ShellUser = { name: "—", role: "לא מחובר" };

/**
 * Build the header `ShellUser`. Pure + total.
 * SUPABASE + AUTHENTICATED + identity → real identity ("role · organization").
 * SUPABASE otherwise → a neutral placeholder (never the static local user).
 * LOCAL → the provided local fallback (CANONICAL_USER), unchanged.
 */
export function resolveShellUser(
  mode: AuthMode,
  status: AuthStatus,
  identity: ResolvedIdentity | null,
  localFallback: ShellUser,
): ShellUser {
  if (mode === "SUPABASE") {
    if (status === "AUTHENTICATED" && identity) {
      return {
        name: identity.name || identity.email,
        role: `${identity.roleLabel} · ${identity.organizationName}`,
      };
    }
    return status === "INITIALIZING" ? SUPABASE_INITIALIZING : SUPABASE_SIGNED_OUT;
  }
  return localFallback;
}

/** Offer logout only for a real authenticated Supabase session (LOCAL has none). */
export function shellShowsLogout(mode: AuthMode, status: AuthStatus): boolean {
  return mode === "SUPABASE" && status === "AUTHENTICATED";
}
