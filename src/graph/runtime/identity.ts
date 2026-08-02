// TERAGON Business Graph — Phase 10 RUNTIME trusted identity resolver.
// ---------------------------------------------------------------------------
// The trusted identity adapter that turns the Phase-8 opaque session identity
// into a trusted `BusinessGraphResolvedIdentity`. It resolves ONLY from a
// TRUSTED, ALREADY-AUTHENTICATED session (what a REAL auth boundary would emit)
// plus an injected canonical active-user lookup. It NEVER trusts the request
// payload, NEVER fabricates a demo admin, NEVER infers actor kind from an id
// prefix, and resolves ONLY HUMAN actors in Phase 10 (AGENT / SYSTEM ⇒ deny).
//
// The PRODUCTION composition binds this resolver to `UnavailableTrustedSessionSource`
// (no real auth exists in this app — see BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY),
// so it yields IDENTITY_UNAVAILABLE and keeps graph access closed. Tests inject a
// deterministic fake trusted session source + a fake active-user lookup.
import type { EntityStatus } from "@/domain/types";
import type { ActorRef } from "../contracts/actor";
import { isArrayPositionId } from "../contracts/identity";
import type {
  BusinessGraphIdentityResolution,
  BusinessGraphIdentityResolver,
  BusinessGraphResolvedIdentity,
  BusinessGraphSessionIdentity,
} from "../application/types";
import { graphCapabilityForRole, isCanonicalRoleId } from "./authorizationMap";

/** The active-user status value (mirrors `EntityStatus` "פעיל"). */
export const ACTIVE_USER_STATUS: EntityStatus = "פעיל";

// ---------------------------------------------------------------------------
// trusted inputs (what a REAL auth boundary provides)
// ---------------------------------------------------------------------------

/**
 * A trusted, already-verified authenticated session. Every field here is a fact a
 * REAL authentication boundary would have proven — NOT a request-supplied value:
 *   • `authenticatedUserId` — the verified canonical user id (a named human);
 *   • `organizationId` — the tenant from trusted membership (NEVER the request);
 *   • `roleId` — the canonical role from trusted membership (NEVER the request);
 *   • `actorKind` — Phase 10 supports HUMAN only; anything else is denied;
 *   • `sessionRef` — the opaque token the facade forwarded (must match);
 *   • `issuedAtIso` — issued-at, carried for correlation.
 * The runtime NEVER reads a role or organization from anywhere but this object.
 */
export interface TrustedAuthenticatedSession {
  readonly authenticatedUserId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly actorKind: ActorRef["kind"];
  readonly sessionRef: string;
  readonly issuedAtIso: string;
}

/**
 * The seam onto a REAL authentication boundary. Given the opaque session ref the
 * facade forwarded, return the trusted session it stands for — or `null` when
 * there is NO authenticated session (the production default). Synchronous + pure
 * w.r.t. its input, as the Phase-8 resolver contract requires.
 */
export interface TrustedSessionSource {
  lookup(sessionRef: string): TrustedAuthenticatedSession | null;
}

/** The minimal canonical user record the resolver needs to prove active status. */
export interface RuntimeUserRecord {
  readonly id: string;
  readonly status: EntityStatus;
}

/**
 * The seam onto the canonical users repository. Return the user record for a
 * verified id, or `null` when unknown. Synchronous + pure w.r.t. its input.
 */
export interface ActiveUserLookup {
  findUser(userId: string): RuntimeUserRecord | null;
}

// ---------------------------------------------------------------------------
// detailed resolution (richer than the Phase-8 two-reason contract)
// ---------------------------------------------------------------------------

/** Every reason the runtime resolver can deny (deny-by-default). */
export type RuntimeIdentityDenialReason =
  | "NO_TRUSTED_SESSION"
  | "SESSION_REF_MISMATCH"
  | "ACTOR_KIND_UNSUPPORTED"
  | "MALFORMED_USER_ID"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "ORGANIZATION_UNRESOLVED"
  | "ROLE_UNMAPPED"
  | "CAPABILITY_DENIED";

/** The richer resolution the access policy consults. */
export type RuntimeIdentityResolution =
  | { ok: true; identity: BusinessGraphResolvedIdentity }
  | { ok: false; reason: RuntimeIdentityDenialReason };

// ---------------------------------------------------------------------------
// production session source (the honest closed default — no real auth exists)
// ---------------------------------------------------------------------------

/**
 * The PRODUCTION trusted-session source. The app has NO real authentication (only
 * a hardcoded demo persona + a localStorage role selector — see the discovery
 * doc), so there is NEVER a trustworthy authenticated session: `lookup` always
 * returns `null`. Bound in the production composition, this makes the resolver
 * yield IDENTITY_UNAVAILABLE and keeps runtime graph access closed. It NEVER
 * fabricates `u-tzachi`, a demo role, or an admin.
 */
export class UnavailableTrustedSessionSource implements TrustedSessionSource {
  lookup(_sessionRef: string): TrustedAuthenticatedSession | null {
    return null;
  }
}

/** A canonical user lookup that knows no users — the production default. */
export class EmptyActiveUserLookup implements ActiveUserLookup {
  findUser(_userId: string): RuntimeUserRecord | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

/** A well-formed canonical human id: non-empty, no whitespace, not an array index. */
function isCanonicalUserId(id: string): boolean {
  return id.trim().length > 0 && !/\s/u.test(id) && !isArrayPositionId(id);
}

/**
 * Resolves an opaque session identity into a trusted resolved identity, from a
 * trusted authenticated session + a canonical active-user lookup. Rules:
 *   • no trusted session for the ref            ⇒ deny (NO_TRUSTED_SESSION);
 *   • session ref does not match                ⇒ deny (SESSION_REF_MISMATCH);
 *   • actorKind is not HUMAN (AGENT/SYSTEM)     ⇒ deny (ACTOR_KIND_UNSUPPORTED);
 *   • the user id is malformed / not a canonical id ⇒ deny (MALFORMED_USER_ID);
 *   • no such user record                       ⇒ deny (USER_NOT_FOUND);
 *   • the user is not active ("פעיל")           ⇒ deny (USER_INACTIVE);
 *   • the trusted org is blank                  ⇒ deny (ORGANIZATION_UNRESOLVED);
 *   • the role is not a canonical role          ⇒ deny (ROLE_UNMAPPED);
 *   • the role has no graph capability          ⇒ deny (CAPABILITY_DENIED).
 * Actor kind comes from the trusted session's discriminant — NEVER inferred from
 * an id prefix. Org and role come ONLY from the trusted session, never the
 * request. No CEO/admin/demo fallback is EVER fabricated.
 */
export class RuntimeBusinessGraphIdentityResolver implements BusinessGraphIdentityResolver {
  private readonly sessionSource: TrustedSessionSource;
  private readonly userLookup: ActiveUserLookup;

  constructor(deps: { sessionSource: TrustedSessionSource; userLookup: ActiveUserLookup }) {
    this.sessionSource = deps.sessionSource;
    this.userLookup = deps.userLookup;
  }

  /**
   * The Phase-8 contract method: collapses the richer detailed resolution onto the
   * two allowed reasons (UNAUTHENTICATED / IDENTITY_AMBIGUOUS), keeping unauthorized
   * and absent indistinguishable to the facade caller.
   */
  resolve(sessionIdentity: BusinessGraphSessionIdentity): BusinessGraphIdentityResolution {
    const detailed = this.resolveDetailed(sessionIdentity);
    if (detailed.ok) return { ok: true, identity: detailed.identity };
    if (detailed.reason === "SESSION_REF_MISMATCH") {
      return { ok: false, reason: "IDENTITY_AMBIGUOUS" };
    }
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  /** The richer resolution used by the runtime access policy. Deny-by-default. */
  resolveDetailed(sessionIdentity: BusinessGraphSessionIdentity): RuntimeIdentityResolution {
    const session = this.sessionSource.lookup(sessionIdentity.sessionRef);
    if (session === null) return { ok: false, reason: "NO_TRUSTED_SESSION" };
    if (session.sessionRef !== sessionIdentity.sessionRef) {
      return { ok: false, reason: "SESSION_REF_MISMATCH" };
    }
    // Phase 10: HUMAN only. AGENT / SYSTEM are resolved EXPLICITLY to a deny —
    // and the kind is read from the trusted discriminant, never an id prefix.
    if (session.actorKind !== "HUMAN") {
      return { ok: false, reason: "ACTOR_KIND_UNSUPPORTED" };
    }
    const userId = session.authenticatedUserId;
    if (!isCanonicalUserId(userId)) return { ok: false, reason: "MALFORMED_USER_ID" };

    const user = this.userLookup.findUser(userId);
    if (user === null || user.id !== userId) return { ok: false, reason: "USER_NOT_FOUND" };
    if (user.status !== ACTIVE_USER_STATUS) return { ok: false, reason: "USER_INACTIVE" };

    if (session.organizationId.trim() === "") {
      return { ok: false, reason: "ORGANIZATION_UNRESOLVED" };
    }
    if (!isCanonicalRoleId(session.roleId)) return { ok: false, reason: "ROLE_UNMAPPED" };

    const capability = graphCapabilityForRole(session.roleId);
    if (capability === null) return { ok: false, reason: "CAPABILITY_DENIED" };

    const actor: ActorRef = { kind: "HUMAN", userId };
    const identity: BusinessGraphResolvedIdentity = {
      actor,
      organizationId: session.organizationId,
      role: capability.roleId,
      viewerClearance: capability.clearanceCeiling,
      allowedEntityDomains: capability.domains,
      allowStaleGraph: capability.allowStaleGraph,
      capabilities: capability.permittedQueries,
    };
    return { ok: true, identity };
  }
}
