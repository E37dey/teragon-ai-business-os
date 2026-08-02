// TERAGON Business Graph — Phase 10 RUNTIME production composition.
// ---------------------------------------------------------------------------
// The honest PRODUCTION wiring. It binds the runtime identity resolver to the
// `UnavailableTrustedSessionSource` — because this app has NO real authentication
// (only a hardcoded demo persona + a localStorage role selector, see
// BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md) — so identity resolution yields
// IDENTITY_UNAVAILABLE and runtime graph access stays UNAVAILABLE. Access is
// additionally gated by the OFF facade flag and the NOT-approved rollout default,
// making the production path triply closed. It NEVER fabricates an admin.
//
// This factory is UNREGISTERED: nothing in the app runtime/UI/HTTP/agents imports
// or constructs it while the flags are OFF. It exists so a real deployment can
// swap `UnavailableTrustedSessionSource` for a session-backed source once a real
// authentication boundary exists (the Phase 11 forcing function).
import { createSystemClock, IndexedDbStoreProvider } from "../application/adapters";
import { RuntimeBusinessGraphComposition } from "./composition";
import {
  EmptyActiveUserLookup,
  UnavailableTrustedSessionSource,
} from "./identity";

/**
 * Build the production runtime composition. With all defaults it is triply closed:
 * the facade flag is OFF, the rollout is NOT approved, and there is no trustworthy
 * authenticated session (so identity resolution is IDENTITY_UNAVAILABLE). Building
 * it opens NO IndexedDB and starts NO background work.
 */
export function createProductionRuntimeComposition(): RuntimeBusinessGraphComposition {
  const clock = createSystemClock();
  return new RuntimeBusinessGraphComposition({
    sessionSource: new UnavailableTrustedSessionSource(),
    userLookup: new EmptyActiveUserLookup(),
    // fresh per facade — but never actually built in production (flags OFF + no identity).
    storeProviderFactory: () => new IndexedDbStoreProvider(clock),
    clock,
  });
}
