# TERAGON Business Graph — Session Lifecycle (Phase 10)

How the runtime facade behaves across the authenticated-session lifecycle. Source:
`src/graph/runtime/composition.ts` (`RuntimeBusinessGraphLifecycle`). The governing invariant: **no query
may execute with stale permissions from an earlier session; a role/permission change requires fresh
identity resolution.**

## Behavior per event

| Event | Behavior |
|-------|----------|
| anonymous startup | no facade; evaluation → `IDENTITY_UNAVAILABLE` (and `FEATURE_DISABLED`/`ROLLOUT_NOT_APPROVED` in production) |
| authenticated startup | a facade is built lazily on first query for the resolved context |
| identity-loading state | no trusted session yet → denied, no facade |
| successful login | fresh identity resolution; a facade keyed to `sessionRef ∷ userId ∷ org ∷ role` |
| logout | `logout()` disposes the facade; the lifecycle stays re-loginable |
| user switch | previous facade disposed; a new one built for the new user; snapshot permissions are **not** reused |
| organization switch | previous facade disposed; a fresh store/facade for the new org; a prior-org subject id is refused `ORGANIZATION_MISMATCH` |
| role change | previous facade disposed; fresh resolution under the new role's mapping |
| permission revocation | previous facade disposed; the revoked capability is re-evaluated on the next request |
| inactive-user transition | resolution denies (`USER_INACTIVE`, status ≠ `"פעיל"`); any existing facade is disposed |
| browser reload | nothing authenticated persists (only the demo role selector, which is not trusted) → denied until a trusted session exists |
| facade disposal | `dispose()` is terminal + idempotent; `getStatus().disposed === true` |
| feature flag disabled | evaluation short-circuits at `FEATURE_DISABLED`; no facade constructed |

## Why stale permissions cannot leak

The context key includes `userId`, `organizationId`, **and** `role`, so any change in who is acting, which
org they act in, or what role they hold produces a **different key** → the prior facade is disposed and a
new identity resolution runs. A cached `GraphPermissionOracle` from an earlier session is never reused, and
a disposed facade answers nothing. Organization isolation is reinforced by a fresh store provider per
facade plus the per-hop `ORGANIZATION_MISMATCH` refusal.

See [RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md) ·
[RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md).
