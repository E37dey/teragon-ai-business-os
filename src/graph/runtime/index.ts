// TERAGON Business Graph — Phase 10 RUNTIME barrel.
// Trusted runtime identity, authorization mapping, access policy, audit adapter,
// and the lazy composition/lifecycle. Default-closed, NOT wired into app
// runtime/UI/HTTP/agents while the flags are OFF. Nothing here fabricates an
// authenticated admin; production resolves to IDENTITY_UNAVAILABLE.

// --- rollout gate (second guard beyond the build flag) ---
export {
  BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED,
  resolveRolloutApproved,
  createRolloutPolicy,
} from "./rollout";
export type { BusinessGraphRuntimeRolloutPolicy } from "./rollout";

// --- authorization mapping (explicit closed role → graph capability) ---
export {
  RUNTIME_QUERY_REQUIRED_PERMISSION,
  RUNTIME_GRAPH_ROLE_GRANTS,
  isCanonicalRoleId,
  graphCapabilityForRole,
  roleMayRunQuery,
} from "./authorizationMap";
export type { RuntimeGraphRoleGrant, RuntimeGraphRoleCapability } from "./authorizationMap";

// --- trusted identity resolver ---
export {
  ACTIVE_USER_STATUS,
  UnavailableTrustedSessionSource,
  EmptyActiveUserLookup,
  RuntimeBusinessGraphIdentityResolver,
} from "./identity";
export type {
  TrustedAuthenticatedSession,
  TrustedSessionSource,
  RuntimeUserRecord,
  ActiveUserLookup,
  RuntimeIdentityDenialReason,
  RuntimeIdentityResolution,
} from "./identity";

// --- permission adapter ---
export { RuntimeBusinessGraphPermissionAdapter } from "./permissionAdapter";

// --- audit adapter + fail-closed/fail-safe policy ---
export {
  toSafeAuditEntry,
  RuntimeBusinessGraphAuditAdapter,
  SENSITIVE_GRAPH_QUERIES,
  resolveQueryOutcome,
  resolveStatusOutcome,
} from "./audit";
export type {
  SafeGraphAuditEntry,
  AuditWriteState,
  CanonicalGraphAuditWriter,
  RuntimeAuditAdapterOptions,
  RuntimeQueryOutcome,
  RuntimeStatusOutcome,
} from "./audit";

// --- access policy (second guard) ---
export {
  RUNTIME_ACCESS_DECISIONS,
  BusinessGraphRuntimeAccessPolicy,
} from "./accessPolicy";
export type {
  RuntimeAccessDecision,
  RuntimeAccessPolicyInput,
  RuntimeAccessEvaluation,
  RuntimeAccessPolicyDeps,
} from "./accessPolicy";

// --- composition root + lifecycle ---
export {
  RuntimeBusinessGraphComposition,
  RuntimeBusinessGraphLifecycle,
} from "./composition";
export type {
  RuntimeCompositionOptions,
  AuthenticatedContextKey,
  RuntimeAcquisition,
  RuntimeQueryExecution,
  RuntimeStatusExecution,
  AcquireOptions,
} from "./composition";

// --- production wiring (UNREGISTERED; resolves to IDENTITY_UNAVAILABLE) ---
export { createProductionRuntimeComposition } from "./production";
