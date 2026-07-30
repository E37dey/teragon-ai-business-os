// TERAGON Business Graph — Phase 11 OPERATOR-AUTH runtime binding.
// ---------------------------------------------------------------------------
// Composes the Phase-10 `RuntimeBusinessGraphComposition` with a REAL trusted
// identity boundary: the `OperatorTrustedSessionSource` + a real
// `ActiveUserLookup` in place of the `UnavailableTrustedSessionSource` /
// `EmptyActiveUserLookup` production defaults. It does NOT modify Phase 10 — it
// only constructs it with different (still deny-by-default) seams.
//
// CRITICAL DECOUPLING: making a trustworthy session OBTAINABLE does NOT enable
// graph access. The facade feature flag and the internal rollout are left at
// their OFF / NOT-approved defaults here (no `featureOverride` / `rolloutOverride`
// unless a test forces them), so even a fully-authenticated operator gets
// `FEATURE_DISABLED` (or `ROLLOUT_NOT_APPROVED`) from the access policy. Phase 11
// only makes a trusted session possible; enabling graph access stays a separate,
// deliberate decision.
import { RuntimeBusinessGraphComposition } from "../runtime/composition";
import type { ActiveUserLookup } from "../runtime/identity";
import type { RuntimeBusinessGraphAuditAdapter } from "../runtime/audit";
import type {
  BusinessGraphClock,
  BusinessGraphPermissionAdapter,
  BusinessGraphStoreProvider,
} from "../application/types";
import type { OperatorAuthConfig } from "./config";
import { OperatorAuthenticator } from "./authenticator";
import { createOperatorAuthPolicy, type OperatorAuthPolicy } from "./flag";
import { createWebCryptoRandomSource, type OperatorRandomSource } from "./random";
import { OPERATOR_AUTH_DEFAULTS } from "./config";
import { OperatorSessionStore } from "./sessionStore";
import { OperatorTrustedSessionSource } from "./trustedSessionSource";

export interface OperatorRuntimeCompositionOptions {
  /** the injected operator-auth config, or null (unavailable — auth refuses). */
  config: OperatorAuthConfig | null;
  /** the real active-user lookup (injected users-repo adapter; deny inactive). */
  userLookup: ActiveUserLookup;
  /** builds a FRESH store provider per facade — the org-isolation seam. */
  storeProviderFactory: () => BusinessGraphStoreProvider;
  clock: BusinessGraphClock;
  /** injected entropy for session tokens (default Web Crypto). */
  random?: OperatorRandomSource;
  /** test-only: enable the operator-auth boundary (default OFF). */
  authOverride?: boolean;
  /**
   * test-only facade override. OMITTED in production so the facade stays OFF —
   * authentication being available must NOT enable graph access.
   */
  featureOverride?: boolean;
  /**
   * test-only rollout override. OMITTED in production so the rollout stays
   * NOT-approved — a second, independent closed gate beyond the facade flag.
   */
  rolloutOverride?: boolean;
  auditAdapter?: RuntimeBusinessGraphAuditAdapter;
  permissionAdapter?: BusinessGraphPermissionAdapter;
  executionIdProvider?: () => string;
}

/** The assembled operator runtime: the Phase-10 composition + the auth surfaces. */
export interface OperatorRuntimeComposition {
  /** the Phase-10 composition — its access policy still gates graph access. */
  composition: RuntimeBusinessGraphComposition;
  /** the only surface that mints a trusted session from a presented secret. */
  authenticator: OperatorAuthenticator;
  /** the drop-in `TrustedSessionSource` bound into the composition. */
  sessionSource: OperatorTrustedSessionSource;
  /** the session store (issuance / verify / revoke / expiry / bound). */
  sessionStore: OperatorSessionStore;
  /** the resolved auth policy (flag). */
  authPolicy: OperatorAuthPolicy;
}

/**
 * Build the operator runtime composition. Constructing it does NO graph work and
 * opens NO store (the Phase-10 composition is lazy). With production defaults the
 * facade flag is OFF and the rollout is NOT approved, so an authenticated operator
 * can obtain a trusted session yet still receives `FEATURE_DISABLED` /
 * `ROLLOUT_NOT_APPROVED` from the access policy.
 */
export function createOperatorRuntimeComposition(
  options: OperatorRuntimeCompositionOptions,
): OperatorRuntimeComposition {
  const authPolicy = createOperatorAuthPolicy(options.authOverride);
  const random = options.random ?? createWebCryptoRandomSource();

  const sessionStore = new OperatorSessionStore({
    clock: options.clock,
    random,
    ttlMs: options.config?.sessionTtlMs ?? OPERATOR_AUTH_DEFAULTS.sessionTtlMs,
    maxActiveSessions: options.config?.maxActiveSessions ?? OPERATOR_AUTH_DEFAULTS.maxActiveSessions,
  });

  const authenticator = new OperatorAuthenticator({
    policy: authPolicy,
    config: options.config,
    userLookup: options.userLookup,
    sessionStore,
  });

  const sessionSource = new OperatorTrustedSessionSource({ policy: authPolicy, sessionStore });

  const composition = new RuntimeBusinessGraphComposition({
    sessionSource,
    userLookup: options.userLookup,
    storeProviderFactory: options.storeProviderFactory,
    clock: options.clock,
    ...(options.auditAdapter ? { auditAdapter: options.auditAdapter } : {}),
    ...(options.permissionAdapter ? { permissionAdapter: options.permissionAdapter } : {}),
    ...(options.executionIdProvider ? { executionIdProvider: options.executionIdProvider } : {}),
    // OMITTED unless a test forces them — production keeps facade OFF + rollout NOT approved.
    ...(options.featureOverride !== undefined ? { featureOverride: options.featureOverride } : {}),
    ...(options.rolloutOverride !== undefined ? { rolloutOverride: options.rolloutOverride } : {}),
  });

  return { composition, authenticator, sessionSource, sessionStore, authPolicy };
}
