// TERAGON Business Graph — Phase 10 RUNTIME identity-resolver tests.
// Proves the trusted resolver: no trustworthy session ⇒ deny; no fabricated admin;
// request cannot override org/role; inactive/absent user denied; AGENT/SYSTEM denied;
// actor kind never inferred from id prefix; org & role come ONLY from the session.
import { describe, expect, it } from "vitest";
import {
  RuntimeBusinessGraphIdentityResolver,
  type BusinessGraphSessionIdentity,
} from "@/graph";
import {
  activeUser,
  defaultUserLookup,
  NO_SESSION_SOURCE,
  singleSessionSource,
  trustedSession,
  userLookupFrom,
  VALID_ORG,
} from "./helpers";

function resolverWith(
  session = trustedSession(),
  users = defaultUserLookup(),
): RuntimeBusinessGraphIdentityResolver {
  return new RuntimeBusinessGraphIdentityResolver({
    sessionSource: singleSessionSource(session),
    userLookup: users,
  });
}

const REF: BusinessGraphSessionIdentity = { sessionRef: "sess-1" };

describe("runtime identity resolver", () => {
  it("resolves a trusted active HUMAN session into a canonical identity", () => {
    const detailed = resolverWith().resolveDetailed(REF);
    expect(detailed.ok).toBe(true);
    if (!detailed.ok) return;
    expect(detailed.identity.actor).toEqual({ kind: "HUMAN", userId: "u-tzachi" });
    expect(detailed.identity.organizationId).toBe(VALID_ORG);
    expect(detailed.identity.role).toBe("crole-ceo");
    expect(detailed.identity.viewerClearance).toBe("מוגבל");
    expect(detailed.identity.capabilities).toContain("findCustomersNeedingFollowUp");
  });

  it("denies when there is NO trusted session (production shape) — no fabricated admin", () => {
    const resolver = new RuntimeBusinessGraphIdentityResolver({
      sessionSource: NO_SESSION_SOURCE,
      userLookup: defaultUserLookup(),
    });
    const detailed = resolver.resolveDetailed(REF);
    expect(detailed).toEqual({ ok: false, reason: "NO_TRUSTED_SESSION" });
    // the Phase-8 contract collapses this to UNAUTHENTICATED (never an admin).
    expect(resolver.resolve(REF)).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
  });

  it("denies an inactive / archived user", () => {
    const inactive = userLookupFrom([{ id: "u-tzachi", status: "לא פעיל" }]);
    expect(resolverWith(trustedSession(), inactive).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "USER_INACTIVE",
    });
    const archived = userLookupFrom([{ id: "u-tzachi", status: "בארכיון" }]);
    expect(resolverWith(trustedSession(), archived).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "USER_INACTIVE",
    });
  });

  it("denies when the trusted user record is unknown", () => {
    const empty = userLookupFrom([]);
    expect(resolverWith(trustedSession(), empty).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "USER_NOT_FOUND",
    });
  });

  it("denies AGENT and SYSTEM actor kinds (Phase 10 = HUMAN only)", () => {
    const agent = trustedSession({ actorKind: "AGENT", authenticatedUserId: "u-agentish" });
    expect(resolverWith(agent, userLookupFrom([activeUser("u-agentish")])).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "ACTOR_KIND_UNSUPPORTED",
    });
    const system = trustedSession({ actorKind: "SYSTEM" });
    expect(resolverWith(system).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "ACTOR_KIND_UNSUPPORTED",
    });
  });

  it("never infers actor kind from an id prefix — an ag-* HUMAN id is still HUMAN", () => {
    // The trusted session declares HUMAN; the id merely LOOKS agent-ish. Kind wins.
    const clean = trustedSession({ actorKind: "HUMAN", authenticatedUserId: "ag-lookalike" });
    const detailed = resolverWith(clean, userLookupFrom([activeUser("ag-lookalike")])).resolveDetailed(REF);
    expect(detailed.ok).toBe(true);
    if (detailed.ok) expect(detailed.identity.actor).toEqual({ kind: "HUMAN", userId: "ag-lookalike" });
  });

  it("denies a malformed user id (array-position / whitespace)", () => {
    const numeric = trustedSession({ authenticatedUserId: "12" });
    expect(resolverWith(numeric, userLookupFrom([activeUser("12")])).resolveDetailed(REF).ok).toBe(false);
    const spaced = trustedSession({ authenticatedUserId: "u tzachi" });
    expect(resolverWith(spaced, userLookupFrom([activeUser("u tzachi")])).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "MALFORMED_USER_ID",
    });
  });

  it("denies a blank organization and an unmapped role", () => {
    const blankOrg = trustedSession({ organizationId: "   " });
    expect(resolverWith(blankOrg).resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "ORGANIZATION_UNRESOLVED",
    });
    const badRole = trustedSession({ roleId: "crole-nope" });
    expect(resolverWith(badRole).resolveDetailed(REF)).toEqual({ ok: false, reason: "ROLE_UNMAPPED" });
  });

  it("denies a canonical role with no graph capability (viewer)", () => {
    const viewer = trustedSession({ roleId: "crole-viewer" });
    expect(resolverWith(viewer).resolveDetailed(REF)).toEqual({ ok: false, reason: "CAPABILITY_DENIED" });
  });

  it("takes org & role ONLY from the trusted session, never the request ref", () => {
    // Two different session refs map to DIFFERENT trusted sessions (org + role differ);
    // the resolver reflects the trusted facts, not anything on the opaque ref string.
    const resolver = new RuntimeBusinessGraphIdentityResolver({
      sessionSource: {
        lookup: (ref) =>
          ref === "sess-sales"
            ? trustedSession({ sessionRef: "sess-sales", roleId: "crole-sales", organizationId: "org-b", authenticatedUserId: "u-sales" })
            : null,
      },
      userLookup: userLookupFrom([activeUser("u-sales")]),
    });
    const detailed = resolver.resolveDetailed({ sessionRef: "sess-sales" });
    expect(detailed.ok).toBe(true);
    if (detailed.ok) {
      expect(detailed.identity.organizationId).toBe("org-b");
      expect(detailed.identity.role).toBe("crole-sales");
    }
  });

  it("maps a session-ref mismatch to IDENTITY_AMBIGUOUS at the contract boundary", () => {
    const resolver = new RuntimeBusinessGraphIdentityResolver({
      // the stored session carries a DIFFERENT sessionRef than requested.
      sessionSource: { lookup: () => trustedSession({ sessionRef: "other" }) },
      userLookup: defaultUserLookup(),
    });
    expect(resolver.resolveDetailed(REF)).toEqual({ ok: false, reason: "SESSION_REF_MISMATCH" });
    expect(resolver.resolve(REF)).toEqual({ ok: false, reason: "IDENTITY_AMBIGUOUS" });
  });
});
