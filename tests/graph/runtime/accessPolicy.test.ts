// TERAGON Business Graph — Phase 10 RUNTIME access-policy tests.
// Proves the SECOND guard: every decision path, rollout defaults denied, ENABLED
// requires ALL gates, org-context must match, per-query capability, health gate,
// and that dev mode alone never enables access.
import { describe, expect, it } from "vitest";
import {
  BusinessGraphRuntimeAccessPolicy,
  RuntimeBusinessGraphIdentityResolver,
  createFeaturePolicy,
  createRolloutPolicy,
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
import type { TrustedSessionSource } from "@/graph";
import type { ActiveUserLookup } from "@/graph";

const REF = { sessionRef: "sess-1" };

function policy(opts: {
  sessionSource?: TrustedSessionSource;
  userLookup?: ActiveUserLookup;
  feature?: boolean;
  rollout?: boolean;
}): BusinessGraphRuntimeAccessPolicy {
  return new BusinessGraphRuntimeAccessPolicy({
    featurePolicy: createFeaturePolicy(opts.feature ?? true),
    rolloutPolicy: createRolloutPolicy(opts.rollout ?? true),
    identityResolver: new RuntimeBusinessGraphIdentityResolver({
      sessionSource: opts.sessionSource ?? singleSessionSource(trustedSession()),
      userLookup: opts.userLookup ?? defaultUserLookup(),
    }),
  });
}

describe("runtime access policy", () => {
  it("ENABLED requires ALL gates (feature + rollout + identity + org + health)", () => {
    const evaluation = policy({}).evaluate({
      sessionIdentity: REF,
      requestedOrganizationId: VALID_ORG,
      graphHealth: "HEALTHY",
    });
    expect(evaluation.decision).toBe("ENABLED");
    expect(evaluation.identity).not.toBeNull();
  });

  it("FEATURE_DISABLED when the facade flag is off (even with a valid identity)", () => {
    const evaluation = policy({ feature: false }).evaluate({ sessionIdentity: REF });
    expect(evaluation.decision).toBe("FEATURE_DISABLED");
    expect(evaluation.identity).toBeNull();
  });

  it("ROLLOUT_NOT_APPROVED by default — dev mode alone never enables access", () => {
    // rollout override omitted ⇒ the default NOT-approved constant governs.
    const p = new BusinessGraphRuntimeAccessPolicy({
      featurePolicy: createFeaturePolicy(true),
      rolloutPolicy: createRolloutPolicy(),
      identityResolver: new RuntimeBusinessGraphIdentityResolver({
        sessionSource: singleSessionSource(trustedSession()),
        userLookup: defaultUserLookup(),
      }),
    });
    expect(p.evaluate({ sessionIdentity: REF, graphHealth: "HEALTHY" }).decision).toBe(
      "ROLLOUT_NOT_APPROVED",
    );
  });

  it("IDENTITY_UNAVAILABLE when no trusted session exists", () => {
    expect(policy({ sessionSource: NO_SESSION_SOURCE }).evaluate({ sessionIdentity: REF }).decision).toBe(
      "IDENTITY_UNAVAILABLE",
    );
  });

  it("ROLE_UNMAPPED for a non-canonical role", () => {
    const src = singleSessionSource(trustedSession({ roleId: "crole-nope" }));
    expect(policy({ sessionSource: src }).evaluate({ sessionIdentity: REF }).decision).toBe("ROLE_UNMAPPED");
  });

  it("CAPABILITY_DENIED for a canonical role with no graph capability (viewer)", () => {
    const src = singleSessionSource(trustedSession({ roleId: "crole-viewer" }));
    expect(policy({ sessionSource: src }).evaluate({ sessionIdentity: REF }).decision).toBe(
      "CAPABILITY_DENIED",
    );
  });

  it("CAPABILITY_DENIED when the requested query is outside the role's mapped queries", () => {
    // sales cannot run the evidence path (no audit.read / evidence grant).
    const src = singleSessionSource(
      trustedSession({ roleId: "crole-sales", authenticatedUserId: "u-sales" }),
    );
    const p = policy({ sessionSource: src, userLookup: userLookupFrom([activeUser("u-sales")]) });
    expect(p.evaluate({ sessionIdentity: REF, requiredQuery: "buildFullEvidencePath" }).decision).toBe(
      "CAPABILITY_DENIED",
    );
    // but sales CAN run a follow-up query.
    expect(p.evaluate({ sessionIdentity: REF, requiredQuery: "findCustomersNeedingFollowUp" }).decision).toBe(
      "ENABLED",
    );
  });

  it("ORGANIZATION_UNRESOLVED when the request names a different org than the trusted one", () => {
    expect(
      policy({}).evaluate({ sessionIdentity: REF, requestedOrganizationId: "org-other" }).decision,
    ).toBe("ORGANIZATION_UNRESOLVED");
  });

  it("GRAPH_UNAVAILABLE for unsupported / missing health; supported for HEALTHY/STALE/DEGRADED", () => {
    const p = policy({});
    for (const health of ["MISSING", "CORRUPT", "REBUILD_REQUIRED"] as const) {
      expect(p.evaluate({ sessionIdentity: REF, graphHealth: health }).decision).toBe("GRAPH_UNAVAILABLE");
    }
    expect(p.evaluate({ sessionIdentity: REF, graphHealth: null }).decision).toBe("GRAPH_UNAVAILABLE");
    for (const health of ["HEALTHY", "STALE", "DEGRADED"] as const) {
      expect(p.evaluate({ sessionIdentity: REF, graphHealth: health }).decision).toBe("ENABLED");
    }
    // health OMITTED ⇒ gate deferred to the facade (still ENABLED at the policy).
    expect(p.evaluate({ sessionIdentity: REF }).decision).toBe("ENABLED");
  });
});
