// TERAGON Business Graph — Phase 11 OPERATOR-AUTH trusted-session source.
// ---------------------------------------------------------------------------
// The REAL drop-in replacement for `UnavailableTrustedSessionSource`. It
// implements the Phase-10 `TrustedSessionSource` seam: given the opaque session
// ref the facade forwarded, return the trusted authenticated session it stands
// for — or `null`. It resolves ONLY from a live operator session:
//   • flag OFF                      ⇒ null (behaves exactly like the Unavailable
//                                     default — runtime stays IDENTITY_UNAVAILABLE);
//   • unknown / expired / revoked   ⇒ null;
//   • live session                  ⇒ a `TrustedAuthenticatedSession` carrying the
//                                     operator's verified facts (HUMAN actor).
// `lookup` is SYNCHRONOUS + pure w.r.t. its input, as the resolver contract
// requires. It fabricates NO admin and reads NO role/org from the request.
import type { OperatorAuthPolicy } from "./flag";
import type { OperatorSessionStore } from "./sessionStore";
import type { TrustedAuthenticatedSession, TrustedSessionSource } from "../runtime/identity";

export interface OperatorTrustedSessionSourceDeps {
  policy: OperatorAuthPolicy;
  sessionStore: OperatorSessionStore;
}

export class OperatorTrustedSessionSource implements TrustedSessionSource {
  private readonly policy: OperatorAuthPolicy;
  private readonly sessionStore: OperatorSessionStore;

  constructor(deps: OperatorTrustedSessionSourceDeps) {
    this.policy = deps.policy;
    this.sessionStore = deps.sessionStore;
  }

  lookup(sessionRef: string): TrustedAuthenticatedSession | null {
    // Flag OFF ⇒ indistinguishable from the Unavailable production default.
    if (!this.policy.isEnabled()) return null;

    const live = this.sessionStore.verify(sessionRef);
    if (live === null) return null;

    return {
      authenticatedUserId: live.identity.authenticatedUserId,
      organizationId: live.identity.organizationId,
      roleId: live.identity.roleId,
      actorKind: live.identity.actorKind,
      sessionRef: live.sessionRef,
      issuedAtIso: live.issuedAtIso,
    };
  }
}
