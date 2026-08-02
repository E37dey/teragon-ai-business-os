# TERAGON Business Graph — Identity Adapter & Resolution (Phase 8)

How the facade turns opaque application/session identity into a trusted `GraphViewerContext` — and why the
caller can never supply one. Source: `src/graph/application/{types,facade,adapters}.ts`.

## The caller never supplies trust

`BusinessGraphRequestContext` carries only an **opaque** `sessionIdentity`, a request `correlationId`, and
the query args — **never** a `GraphViewerContext`, a permission oracle, or an `organizationId`. A trusted
viewer context is produced solely by `BusinessGraphIdentityResolver.resolve(sessionIdentity)`.

## Resolved context

`resolve` returns the trusted context used for every hop: `ActorRef` (with a canonical `HumanUserId` when
the actor is HUMAN), `organizationId`, role/capabilities, sensitivity clearance, allowed entity domains,
stale-graph permission, and the request correlation id. The facade builds the traversal/query
`GraphQueryContext` from this — never from request input.

## Deny rules

- **missing identity** → `UNAUTHENTICATED`.
- **ambiguous identity** → `IDENTITY_AMBIGUOUS`.
- **organization override** — any `organizationId`/`viewer`/`permissions` key on the request (top level or
  in args), or a targeted subject id in another org → `ORGANIZATION_MISMATCH`. Org comes only from the
  resolver.
- **actor kind** comes from the resolver, never inferred from an id prefix or the session-ref shape.
- **AGENT and SYSTEM** identities must be resolved **explicitly** by the resolver — never inferred.
- **no silent demo admin** — the facade never fabricates an identity; an unavailable resolver denies.

## Adapter boundary (all unregistered while the flag is OFF)

Interfaces defined against existing app concepts, with thin production implementations that stay
**unregistered** (not wired into runtime) until the feature is deliberately enabled:

| Interface | Production adapter (unregistered) | Test fake |
|-----------|-----------------------------------|-----------|
| `BusinessGraphIdentityResolver` | `UnavailableIdentityResolver` (denies — no real auth exists yet) | deterministic resolver |
| `BusinessGraphPermissionAdapter` → `GraphPermissionOracle` | `DomainWindowPermissionAdapter` | deterministic oracle |
| `BusinessGraphStoreProvider` | `IndexedDbStoreProvider` / `createStoreProvider` | `fake-indexeddb`-backed |
| `BusinessGraphAuditSink` | `createNoopAuditSink` | capturing fake |
| `BusinessGraphClock` | `createSystemClock` (the ONE real-time boundary) | fixed clock |

The production identity resolver is deliberately `UnavailableIdentityResolver`: the app has no real
authentication (single demo CEO), so rather than fabricate an admin, the honest production default is to
**deny** until a real identity source is wired. Tests inject a deterministic resolver to exercise the
enabled path.

## Phase 10 — runtime resolver

Phase 10 adds `RuntimeBusinessGraphIdentityResolver`, which resolves a trusted `GraphViewerContext` **only**
from an injected `TrustedSessionSource` + `ActiveUserLookup` (active user = `status "פעיל"`), maps the
canonical role via the [runtime authorization map](BUSINESS_GRAPH_RUNTIME_AUTHORIZATION_MAP.md), and denies
AGENT/SYSTEM (HUMAN-only this phase). Because the app still has **no real authentication**, the production
composition binds it to an `UnavailableTrustedSessionSource` → every resolve yields `IDENTITY_UNAVAILABLE`;
it never trusts `u-tzachi`, the localStorage role, or a display name. See
[RUNTIME_IDENTITY_DISCOVERY](BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md) and
[RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md).

See [APPLICATION_FACADE](BUSINESS_GRAPH_APPLICATION_FACADE.md) and
[FACADE_SECURITY](BUSINESS_GRAPH_FACADE_SECURITY.md).
