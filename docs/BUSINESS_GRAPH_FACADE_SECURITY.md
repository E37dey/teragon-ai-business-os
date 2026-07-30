# TERAGON Business Graph — Facade Security & Error Model (Phase 8)

The facade inherits every traversal (Phase 6/6.1) and query (Phase 7) guarantee and adds an application
boundary on top. Source: `src/graph/application/{facade,errors,factory}.ts`.

## Feature policy (default OFF)

`BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED = false as const` (+ `resolveFacadeEnabled(override?)`),
mirroring `indexing/flag.ts`. When OFF: no query service is constructed, no repository subscriptions
start, no startup reconciliation runs, **no IndexedDB graph read occurs**, and every method returns a
typed `DISABLED` result — existing application behavior is unchanged. Not exposed to users, agents, or
network input. `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED` stays independently OFF.

## Typed error model (closed set)

`OK` · `DISABLED` · `UNAUTHENTICATED` · `IDENTITY_AMBIGUOUS` · `ORGANIZATION_MISMATCH` · `FORBIDDEN` ·
`GRAPH_MISSING` · `GRAPH_UNHEALTHY` · `STALE_NOT_AUTHORIZED` · `QUERY_NOT_READY` · `LIMIT_EXCEEDED` ·
`INTERNAL_FAILURE`.

`BusinessGraphApplicationError` carries only a code + a fixed safe Hebrew message — **never** a stack
trace, a raw IndexedDB error, a cause from a lower layer, a hidden entity id, permission internals, or any
sensitive value. It is thrown internally to short-circuit the secure path and is always caught and mapped
to a `BusinessGraphFacadeResult`; it never escapes to the caller. Where the contract requires it,
**unauthorized and absent collapse to the same code** (via the traversal layer's indistinguishable
refusals), so existence cannot be probed.

## Security invariants

- **No trust from the caller** — viewer context, permissions, and org are resolved, never supplied
  (see [IDENTITY_ADAPTER](BUSINESS_GRAPH_IDENTITY_ADAPTER.md)).
- **Single query path** — every query goes through `BusinessGraphQueryService`; the facade never touches
  the store or traversal service directly and never duplicates query logic.
- **No aggregate leak** — totals are derived only from permission-filtered findings; a hidden entity never
  affects a facade count (inherited from Phase 7).
- **No protected bodies** — the mapped result exposes envelope-safe views only (`bodyOpened: false`).
- **Stale is authorization** — STALE/DEGRADED requires the resolver's stale grant (Phase-6.1 rules);
  otherwise `STALE_NOT_AUTHORIZED`.
- **Health gating** — CORRUPT/MISSING → `GRAPH_MISSING`/`GRAPH_UNHEALTHY`; a not-ready query →
  `QUERY_NOT_READY`.
- **Read-only** — no snapshot/node/edge is mutated; the active snapshot is byte-identical after facade
  queries (test-proven). No background work on import; `dispose()` is idempotent.

## Audit correlation

One correlation context per facade execution joins three layers with **distinct** execution ids: the
facade execution id, the query-layer execution id, and each traversal execution id (a shared
`executionIdProvider` guarantees uniqueness). The facade audit (`BusinessGraphFacadeAuditRecord`, emitted
to the injected sink — never the canonical AuditEvent repo) records only safe metadata: operation, actor
reference, organization, readiness, health, result count, truncation, safe error code, and the child
execution ids. It **never** records raw search text, protected bodies, or sensitive request fields, and it
never merges separate executions into one record.

See [APPLICATION_FACADE](BUSINESS_GRAPH_APPLICATION_FACADE.md) ·
[FACADE_READINESS](BUSINESS_GRAPH_FACADE_READINESS.md) ·
[SECURITY_CONTRACTS](BUSINESS_GRAPH_SECURITY_CONTRACTS.md).
