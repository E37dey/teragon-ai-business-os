// TERAGON AI BUSINESS OS — Gate S8.0: CANONICAL identity resolution (fail-closed).
//
// After a valid Supabase session exists, this module derives the application
// identity from SERVER-CONTROLLED records only:
//   1. `current_profile()` — a SECURITY DEFINER RPC that returns the caller's
//      OWN profile row (and, being SECURITY DEFINER, bypasses the profiles RLS
//      `is_active()` gate — so we can still read the row for an INACTIVE user and
//      report "inactive" instead of confusing it with "no profile").
//   2. `memberships` — RLS-scoped to the caller's org; must be exactly ONE active
//      membership, consistent with the profile's org + role.
//   3. `roles` / `organizations` — RLS-readable by an active caller; supply the
//      role label + capability set + org name.
//
// The browser NEVER supplies org / role / active / membership / capabilities.
// Every branch FAILS CLOSED (throws IdentityError with a category) — a partial
// or inconsistent identity is never returned.
import { z } from "zod";
import type { AuthErrorCategory, ResolvedIdentity } from "./types";

/** Thrown by `resolveIdentity` — always carries a differentiated category. */
export class IdentityError extends Error {
  readonly category: AuthErrorCategory;
  constructor(category: AuthErrorCategory, message: string) {
    super(message);
    this.name = "IdentityError";
    this.category = category;
  }
}

// --- Minimal, mockable PostgREST surface (a cast bridges the real client) -----
type PgResult = { data: unknown; error: { message?: string } | null };
interface Filterable extends PromiseLike<PgResult> {
  eq(column: string, value: unknown): Filterable;
}
interface Selectable {
  select(columns: string): Filterable;
}
export interface IdentityClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<PgResult>;
  from(table: string): Selectable;
}

// --- Server-record schemas (strict: unexpected shapes => MALFORMED_IDENTITY) --
const ACTIVE_STATUS = "פעיל";

const ProfileSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  role_id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  active: z.boolean(),
  status: z.string(),
});

const MembershipSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  profile_id: z.string().min(1),
  role_id: z.string().min(1),
  active: z.boolean(),
});

const RoleSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  permissions: z.array(z.string()),
});

const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

/** Any transport/RLS error from PostgREST is treated as a network-class failure. */
function throwOnPgError(result: PgResult, context: string): void {
  if (result.error) {
    throw new IdentityError("NETWORK", `[identity] ${context} query failed`);
  }
}

/**
 * Resolve the canonical identity for the CURRENT session. Throws IdentityError
 * (never returns a partial identity). Callers must fail closed on any throw —
 * there is NO fallback to a browser-supplied or local identity.
 */
export async function resolveIdentity(client: IdentityClient): Promise<ResolvedIdentity> {
  // 1) Profile (SECURITY DEFINER RPC — own row, even when inactive).
  const profileResult = await client.rpc("current_profile");
  throwOnPgError(profileResult, "current_profile");
  const rawProfile = profileResult.data;
  // No session (e.g. after logout) ⇒ current_profile() returns a NULL composite.
  // PostgREST serialises that either as JSON null OR as an all-null object
  // ({ id: null, ... }). Both mean "no profile for this uid" ⇒ MISSING_PROFILE
  // (differentiated from genuinely malformed data, which has a non-null id).
  const profileId = (rawProfile as { id?: unknown } | null)?.id;
  if (rawProfile === null || rawProfile === undefined || profileId === null || profileId === undefined) {
    throw new IdentityError("MISSING_PROFILE", "no profile for the authenticated user");
  }
  const profileParsed = ProfileSchema.safeParse(rawProfile);
  if (!profileParsed.success) {
    throw new IdentityError("MALFORMED_IDENTITY", "profile row failed validation");
  }
  const profile = profileParsed.data;

  // Inactive accounts fail closed (distinct from missing profile / membership).
  if (profile.active !== true || profile.status !== ACTIVE_STATUS) {
    throw new IdentityError("INACTIVE_ACCOUNT", "profile is not active");
  }

  // 2) Active canonical membership: exactly one, consistent with the profile.
  const membershipResult = await client
    .from("memberships")
    .select("id,organization_id,profile_id,role_id,active")
    .eq("profile_id", profile.id)
    .eq("active", true);
  throwOnPgError(membershipResult, "memberships");
  const membershipRows = membershipResult.data;
  if (!Array.isArray(membershipRows) || membershipRows.length === 0) {
    throw new IdentityError("MISSING_MEMBERSHIP", "no active membership");
  }
  if (membershipRows.length > 1) {
    throw new IdentityError("MALFORMED_IDENTITY", "more than one active membership");
  }
  const membershipParsed = MembershipSchema.safeParse(membershipRows[0]);
  if (!membershipParsed.success) {
    throw new IdentityError("MALFORMED_IDENTITY", "membership row failed validation");
  }
  const membership = membershipParsed.data;
  if (
    membership.organization_id !== profile.organization_id ||
    membership.role_id !== profile.role_id ||
    membership.profile_id !== profile.id
  ) {
    throw new IdentityError("MALFORMED_IDENTITY", "membership inconsistent with profile");
  }

  // 3) Role (label + capabilities) — server-controlled.
  const roleResult = await client
    .from("roles")
    .select("id,label,permissions")
    .eq("id", profile.role_id);
  throwOnPgError(roleResult, "roles");
  const roleRows = roleResult.data;
  if (!Array.isArray(roleRows) || roleRows.length !== 1) {
    throw new IdentityError("MALFORMED_IDENTITY", "role not resolvable");
  }
  const roleParsed = RoleSchema.safeParse(roleRows[0]);
  if (!roleParsed.success) {
    throw new IdentityError("MALFORMED_IDENTITY", "role row failed validation");
  }
  const role = roleParsed.data;

  // 4) Organization (name) — server-controlled.
  const orgResult = await client
    .from("organizations")
    .select("id,name")
    .eq("id", profile.organization_id);
  throwOnPgError(orgResult, "organizations");
  const orgRows = orgResult.data;
  if (!Array.isArray(orgRows) || orgRows.length !== 1) {
    throw new IdentityError("MALFORMED_IDENTITY", "organization not resolvable");
  }
  const orgParsed = OrganizationSchema.safeParse(orgRows[0]);
  if (!orgParsed.success) {
    throw new IdentityError("MALFORMED_IDENTITY", "organization row failed validation");
  }
  const organization = orgParsed.data;

  return {
    userId: profile.id,
    profileId: profile.id,
    name: profile.name,
    email: profile.email,
    organizationId: profile.organization_id,
    organizationName: organization.name,
    roleId: role.id,
    roleLabel: role.label,
    capabilities: role.permissions,
    membershipId: membership.id,
  };
}
