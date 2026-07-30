# TERAGON Business Graph — Runtime Composition (Phase 10)

The internal composition root that constructs the read-only facade for a **real authenticated human
viewer**. Source: `src/graph/runtime/{composition,production,identity,permissionAdapter,audit,rollout,
accessPolicy}.ts`. Internal only — no UI, no route, no HTTP, no `window` global, no module-level singleton,
no background work on import. Both feature flags and the rollout guard default OFF.

## What it composes

`RuntimeBusinessGraphComposition` builds, via the Phase-8 `BusinessGraphFacadeFactory`, the store provider
+ traversal + query + facade, injecting the runtime identity resolver, permission adapter, audit adapter,
clock, and execution-id provider. `RuntimeBusinessGraphLifecycle` owns one facade **per authenticated
context** and disposes it on any change.

```
createProductionRuntimeComposition()
  ├─ UnavailableTrustedSessionSource   (lookup → null; no real auth exists)
  ├─ EmptyActiveUserLookup             (no active user)
  ├─ RuntimeBusinessGraphIdentityResolver(sessionSource, userLookup, authorizationMap)
  ├─ RuntimeBusinessGraphPermissionAdapter(authorizationMap)   → GraphPermissionOracle
  ├─ RuntimeBusinessGraphAuditAdapter  (bounded internal buffer; DEGRADED until canonical)
  ├─ store provider (lazy IndexedDb)   + system clock + execution-id provider
  └─ BusinessGraphFacadeFactory.create(...)  → BusinessGraphApplicationFacade
```

Because the production session source always returns `null`, every production resolve →
`IDENTITY_UNAVAILABLE`, so the production facade never serves a query — the composition is correct and
inert until a real authentication boundary is wired. Tests inject an in-memory
`sessionSourceFrom([...])` + `userLookupFrom([activeUser(...)])`.

**Phase 11:** `createOperatorRuntimeComposition` (see [OPERATOR_AUTH](BUSINESS_GRAPH_OPERATOR_AUTH.md))
provides that real boundary — it binds an `OperatorTrustedSessionSource` + a real `ActiveUserLookup` in
place of the Unavailable/Empty defaults, while deliberately **omitting** the facade/rollout overrides so
those guards stay OFF. An authenticated operator therefore still receives `FEATURE_DISABLED` /
`ROLLOUT_NOT_APPROVED` from the access policy — authentication makes a trustworthy session obtainable but
does not, by itself, open graph access.

## Lifecycle rules

- **Lazy** — constructing the composition/lifecycle invokes the store-provider factory **0** times
  (verified); the store opens only when an authenticated context first queries.
- **One facade per authenticated context** — keyed by `sessionRef ∷ userId ∷ organizationId ∷ role`; the
  same context reuses the instance.
- **Change invalidates + disposes** — a user switch, organization switch, role change, or permission
  revocation disposes the previous facade (`getStatus().disposed === true`) and forces fresh identity
  resolution; a stale oracle is never reused.
- **Organization isolation** — a fresh store provider per facade; an org switch's facade validates against
  the new org, so an org-A subject id under session-B is refused `ORGANIZATION_MISMATCH`.
- **`logout()`** disposes the facade but keeps the lifecycle re-loginable; **`dispose()`** is terminal and
  idempotent.
- **No global exposure** — the facade is never attached to `window`/`globalThis`.

## Feature-flag matrix (all four verified over a shared fake-indexeddb store)

| Facade | Indexing | Behavior |
|:------:|:--------:|----------|
| OFF | OFF | no graph construction, `getStore` invoked 0×, no snapshot, coordinator subscribes to nothing → `FEATURE_DISABLED` |
| ON | OFF | read-only facade opens an already-valid snapshot (`OK`, same snapshotId); no event subscription / background rebuild; missing/stale reported honestly |
| OFF | ON | coordinator may build the active snapshot; facade query → `FEATURE_DISABLED` (no user query access) |
| ON | ON | facade + coordinator share the SAME store; query `OK`; active snapshotId + checksum **unchanged** after the read (immutable); no duplicate coordinator registration; Phase 10 registers no subscriptions itself |

See [RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md) ·
[SESSION_LIFECYCLE](BUSINESS_GRAPH_SESSION_LIFECYCLE.md) · [RUNTIME_AUDIT](BUSINESS_GRAPH_RUNTIME_AUDIT.md).
