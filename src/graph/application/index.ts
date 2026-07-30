// TERAGON Business Graph — Phase 8 APPLICATION-FACADE barrel.
// ONE internal, read-only application boundary that safely composes the existing
// graph layers. Default-OFF, read-only, NOT wired into app runtime/UI/HTTP/agents.
// No product module, UI, server, or runtime imports from here while the flag is OFF.

// --- feature flag / policy ---
export {
  BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED,
  resolveFacadeEnabled,
  createFeaturePolicy,
} from "./flag";
export type { BusinessGraphFacadeFlagConfig, BusinessGraphFeaturePolicy } from "./flag";

// --- typed error model ---
export {
  BUSINESS_GRAPH_FACADE_RESULT_CODES,
  businessGraphFacadeResultCodeSchema,
  BusinessGraphApplicationError,
  safeMessageFor,
} from "./errors";
export type {
  BusinessGraphFacadeResultCode,
  BusinessGraphFacadeErrorCode,
  BusinessGraphFacadeError,
} from "./errors";

// --- contracts ---
export {
  businessGraphSessionIdentitySchema,
  businessGraphQueryArgsSchema,
} from "./types";
export type {
  BusinessGraphSessionIdentity,
  BusinessGraphQueryArgs,
  BusinessGraphAccessContext,
  BusinessGraphRequestContext,
  BusinessGraphResolvedIdentity,
  BusinessGraphIdentityResolution,
  BusinessGraphIdentityResolver,
  BusinessGraphTraversalStore,
  BusinessGraphStoreProvider,
  BusinessGraphPermissionAdapter,
  BusinessGraphAuditSink,
  BusinessGraphFacadeAuditRecord,
  BusinessGraphFacadeOperation,
  BusinessGraphClock,
  BusinessGraphQueryView,
  BusinessGraphFacadeResult,
  BusinessGraphCapabilityView,
  BusinessGraphCapabilityResult,
  BusinessGraphReadinessResult,
  BusinessGraphFacadeStatus,
} from "./types";

// --- facade ---
export {
  BusinessGraphApplicationFacade,
  MAX_FACADE_SUBJECTS,
  BUSINESS_GRAPH_FACADE_QUERIES,
} from "./facade";
export type { BusinessGraphFacadeDeps } from "./facade";

// --- composition root ---
export {
  BusinessGraphFacadeFactory,
  defaultQueryServiceFactory,
} from "./factory";
export type {
  BusinessGraphFacadeFactoryConfig,
  BusinessGraphQueryServiceFactory,
} from "./factory";

// --- real-adapter boundary (UNREGISTERED while the flag is OFF) ---
export {
  createSystemClock,
  UnavailableIdentityResolver,
  DomainWindowPermissionAdapter,
  createNoopAuditSink,
  createStoreProvider,
  IndexedDbStoreProvider,
} from "./adapters";
