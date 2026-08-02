# TERAGON Business Graph — Runtime Access Policy (Phase 10)

A **second internal guard** beyond the build flag. Source: `src/graph/runtime/{accessPolicy,rollout}.ts`.
`BusinessGraphRuntimeAccessPolicy.evaluate(...)` returns exactly one decision; `ENABLED` requires **all** of
the gates below, so runtime graph access is closed unless every condition holds.

## Decisions (closed set)

`ENABLED` · `FEATURE_DISABLED` · `IDENTITY_UNAVAILABLE` · `ROLE_UNMAPPED` · `CAPABILITY_DENIED` ·
`ORGANIZATION_UNRESOLVED` · `GRAPH_UNAVAILABLE` · `ROLLOUT_NOT_APPROVED`. Each carries only a fixed safe
Hebrew message — no sensitive detail. The resolved trusted identity is attached **only** when the decision
is `ENABLED`.

## Evaluation order (short-circuit; deny-by-default)

1. **feature** — `BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED` off → `FEATURE_DISABLED`.
2. **rollout** — `BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED` not approved → `ROLLOUT_NOT_APPROVED`.
3. **identity** — no trusted authenticated identity → `IDENTITY_UNAVAILABLE`; a role with no graph mapping
   → `ROLE_UNMAPPED`; a role lacking the requested query's capability → `CAPABILITY_DENIED`.
4. **organization** — request/subject org not matching the resolved identity's org → `ORGANIZATION_UNRESOLVED`.
5. **graph health** — when supplied, an unsupported health state → `GRAPH_UNAVAILABLE` (otherwise deferred
   to the facade's own health gate).

Only when all pass → `ENABLED`.

## Rollout defaults NOT approved

`BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED = false as const`; `resolveRolloutApproved()` returns it unless a
test passes an explicit override. **Development mode never approves it.** Consequently, even with the facade
flag on and a valid trusted identity, `evaluate()` returns `ROLLOUT_NOT_APPROVED` — internal rollout is a
deliberate, separate human decision, not a side effect of enabling the build flag.

## Why production is always closed

With no real authentication (see [RUNTIME_IDENTITY_DISCOVERY](BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md)),
production evaluation fails at gate 1 (flag OFF) and would also fail at gate 2 (rollout) and gate 3
(identity unavailable). Three independent guards must all be deliberately flipped before any runtime graph
query can execute — and even then the per-hop traversal/query/facade security still applies.

See [RUNTIME_AUTHORIZATION_MAP](BUSINESS_GRAPH_RUNTIME_AUTHORIZATION_MAP.md) ·
[RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md).
