// TERAGON AI BUSINESS OS — authentication-READY boundary (Wave 5, W5-B).
//
// DEMO MODE — stated plainly: there is no real identity provider yet. The
// organizationId / userId / sessionId arriving from the client are CLAIMS,
// not verified identities. This module validates their SHAPE (so they can't
// smuggle log/header injection), optionally checks the demo context header's
// structure, and marks every context `trusted:false`. Nothing downstream may
// treat a demo context as authenticated.
//
// The AuthVerifier interface is the seam for a real JWT verifier later: swap
// `demoAuthVerifier` for one that validates a signed token and returns
// `trusted:true` claims — handlers don't change.
import { ServerAIError } from "./errors";

export interface AuthContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  /** demo mode NEVER yields trusted:true */
  trusted: boolean;
  mode: "demo" | "jwt";
}

export interface AuthVerifier {
  readonly mode: AuthContext["mode"];
  verify(input: {
    organizationId: string;
    userId: string;
    sessionId: string;
    /** raw value of the x-teragon-auth header, when present */
    authHeader: string | null;
  }): AuthContext;
}

/** id claims: 1–128 chars of [A-Za-z0-9._:@-] — shape only, NOT identity */
const CLAIM_SHAPE = /^[A-Za-z0-9._:@-]{1,128}$/u;

/** demo context header structure: "demo.<base64url payload>" (unsigned) */
const DEMO_HEADER_SHAPE = /^demo\.[A-Za-z0-9_-]{1,512}$/u;

export const demoAuthVerifier: AuthVerifier = {
  mode: "demo",
  verify({ organizationId, userId, sessionId, authHeader }) {
    for (const [name, value] of [
      ["organizationId", organizationId],
      ["userId", userId],
      ["sessionId", sessionId],
    ] as const) {
      if (!CLAIM_SHAPE.test(value)) {
        throw new ServerAIError("AI_PERMISSION_DENIED", {
          detail: `malformed ${name} claim`,
        });
      }
    }
    // The header is OPTIONAL in demo mode; when present its structure must be
    // valid — a malformed auth artifact is rejected, not ignored.
    if (authHeader !== null && !DEMO_HEADER_SHAPE.test(authHeader)) {
      throw new ServerAIError("AI_PERMISSION_DENIED", {
        detail: "malformed demo auth header",
      });
    }
    return { organizationId, userId, sessionId, trusted: false, mode: "demo" };
  },
};
