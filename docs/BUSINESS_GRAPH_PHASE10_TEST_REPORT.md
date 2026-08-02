# TERAGON Business Graph — Phase 10 Test Report (Runtime Identity & Authorization)

**Scope:** `src/graph/runtime/**`, `tests/graph/runtime/**`, one barrel export block in `src/graph/index.ts`,
plus the identity-discovery doc. Authorization/domain/application imported **read-only**, never modified.
No UI/route/nav, no `window` global, no background work on import. Facade, indexing, and rollout guards all
default OFF.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src tests` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | passing |
| **`vitest run` (full suite)** | **2127 passed** (was 2073; **+54**) |
| `vite build` | pass |
| `scan-bundle-secrets` | CLEAN — 0 findings |
| Playwright `e2e/shell.spec.ts` | 14 / 14 |

## Files

- `src/graph/runtime/rollout.ts` — `BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED = false as const` + resolver
- `src/graph/runtime/authorizationMap.ts` — the explicit closed role→graph mapping
- `src/graph/runtime/identity.ts` — `RuntimeBusinessGraphIdentityResolver` + `TrustedAuthenticatedSession`/`TrustedSessionSource`/`ActiveUserLookup` + production `UnavailableTrustedSessionSource`/`EmptyActiveUserLookup`
- `src/graph/runtime/permissionAdapter.ts` — `RuntimeBusinessGraphPermissionAdapter`
- `src/graph/runtime/audit.ts` — `RuntimeBusinessGraphAuditAdapter` + fail-closed/fail-safe resolvers
- `src/graph/runtime/accessPolicy.ts` — `BusinessGraphRuntimeAccessPolicy`
- `src/graph/runtime/composition.ts` — `RuntimeBusinessGraphComposition` + `RuntimeBusinessGraphLifecycle`
- `src/graph/runtime/production.ts` — `createProductionRuntimeComposition()`
- `src/graph/runtime/index.ts` + barrel wiring in `src/graph/index.ts`
- `tests/graph/runtime/{helpers,authorizationMap,identity,accessPolicy,audit,lifecycle,flagMatrix,production}.test.ts` — **54 tests**

## What the 54 tests prove

- no trustworthy identity → no facade access; **no fabricated-admin fallback** (production always
  `IDENTITY_UNAVAILABLE`);
- a request cannot override organization or role;
- an inactive user is denied (`USER_INACTIVE`); an unmapped role is denied (`ROLE_UNMAPPED`);
- a mapped role receives **only** its mapped domains; `crole-viewer` gets no graph despite `customer.read`;
- a role change invalidates the previous context; logout disposes the facade;
- a user switch cannot reuse snapshot permissions; an organization switch cannot leak prior-org data;
- all four feature-flag combinations behave correctly;
- the rollout policy defaults denied; facade-ON does not imply indexing-ON; indexing-ON does not expose
  queries;
- a missing graph returns a typed safe status; a stale graph still requires the stale permission;
- audit correlation uses the authenticated actor; audit failure follows the documented policy (fail-closed
  for sensitive queries, fail-safe degraded for status calls);
- imports create no background work; existing application behavior is unchanged;
- the active snapshot remains byte-identical (immutable) after runtime queries.

Deterministic fakes for session, identity, clock, execution-id, and IndexedDB. See
[RUNTIME_IDENTITY_DISCOVERY](BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md),
[RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md),
[RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md),
[RUNTIME_AUDIT](BUSINESS_GRAPH_RUNTIME_AUDIT.md), [SESSION_LIFECYCLE](BUSINESS_GRAPH_SESSION_LIFECYCLE.md).
