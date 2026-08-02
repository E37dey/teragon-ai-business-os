// TERAGON Business Graph — Phase 11 OPERATOR-AUTH authenticator.
// ---------------------------------------------------------------------------
// Turns a presented operator secret into an opaque session ref — the ONLY entry
// point that mints a trustworthy session. The flow is deny-by-default:
//   flag ON → config available → credential verifies (constant-time) → the
//   operator's canonical user is ACTIVE ("פעיל") → issue a session.
// Any earlier failure denies. A wrong secret denies with the SAME result shape as
// any other denial and, thanks to the constant-time verifier, the same timing —
// no distinguishable signal about WHY beyond the internal reason code. The raw
// secret is never stored, logged, audited, or echoed.
import { ACTIVE_USER_STATUS, type ActiveUserLookup } from "../runtime/identity";
import type { OperatorAuthConfig } from "./config";
import { verifyOperatorSecret } from "./credential";
import type { OperatorAuthPolicy } from "./flag";
import type { OperatorSessionStore } from "./sessionStore";

/** Why an authentication attempt was denied (internal; never leaks the secret). */
export type OperatorAuthDenialReason =
  | "AUTH_DISABLED"
  | "CONFIG_UNAVAILABLE"
  | "INVALID_CREDENTIAL"
  | "OPERATOR_INACTIVE";

/** The outcome of an authenticate call: an opaque session ref, or a denial. */
export type OperatorAuthResult =
  | { readonly sessionRef: string }
  | { readonly denied: OperatorAuthDenialReason };

export interface OperatorAuthenticatorDeps {
  policy: OperatorAuthPolicy;
  /** null ⇒ config absent/invalid/incomplete ⇒ auth refuses (unavailable). */
  config: OperatorAuthConfig | null;
  userLookup: ActiveUserLookup;
  sessionStore: OperatorSessionStore;
}

/** Narrow an `OperatorAuthResult` to the success arm. */
export function isAuthenticated(result: OperatorAuthResult): result is { sessionRef: string } {
  return "sessionRef" in result;
}

export class OperatorAuthenticator {
  private readonly policy: OperatorAuthPolicy;
  private readonly config: OperatorAuthConfig | null;
  private readonly userLookup: ActiveUserLookup;
  private readonly sessionStore: OperatorSessionStore;

  constructor(deps: OperatorAuthenticatorDeps) {
    this.policy = deps.policy;
    this.config = deps.config;
    this.userLookup = deps.userLookup;
    this.sessionStore = deps.sessionStore;
  }

  /**
   * Authenticate a presented operator secret. Returns `{ sessionRef }` on success,
   * or `{ denied }` for a disabled flag, unavailable config, wrong credential, or an
   * unknown / inactive / archived operator user. Never throws; never echoes the
   * presented secret.
   */
  authenticate(presentedSecret: string): OperatorAuthResult {
    if (!this.policy.isEnabled()) return { denied: "AUTH_DISABLED" };

    const config = this.config;
    if (config === null) return { denied: "CONFIG_UNAVAILABLE" };

    if (!verifyOperatorSecret(presentedSecret, config.verifier)) {
      return { denied: "INVALID_CREDENTIAL" };
    }

    // Confirm the operator's canonical user is ACTIVE — deny unknown/inactive/archived.
    const user = this.userLookup.findUser(config.operatorUserId);
    if (user === null || user.id !== config.operatorUserId || user.status !== ACTIVE_USER_STATUS) {
      return { denied: "OPERATOR_INACTIVE" };
    }

    const sessionRef = this.sessionStore.issue({
      authenticatedUserId: config.operatorUserId,
      organizationId: config.organizationId,
      roleId: config.roleId,
      actorKind: "HUMAN",
    });
    return { sessionRef };
  }
}
