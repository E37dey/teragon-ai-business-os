# TERAGON Business Graph — Phase 6 Test Report (Read-Only Traversal)

**Scope:** `src/graph/traversal/**`, `tests/graph/traversal/**`, one barrel export in `src/graph/index.ts`.
Nothing else touched. Not wired into app runtime. No commit of product code, no docs beyond this + the
[TRAVERSAL](BUSINESS_GRAPH_TRAVERSAL.md) spec.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src/graph tests/graph` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | **264 passed** |
| **`vitest run` (full suite)** | **1970 passed** (was 1916; **+54** traversal tests) |
| `vite build` | pass |
| `scan-bundle-secrets` | CLEAN — 0 findings |
| Playwright `e2e/shell.spec.ts` | 14 / 14 |

## Files

- `src/graph/traversal/types.ts` — 11 result/request types + zod boundary schemas
- `src/graph/traversal/limits.ts` — `TRAVERSAL_HARD_MAXIMA` + `resolveLimits` (caller-reduce-only)
- `src/graph/traversal/ordering.ts` — stable comparators (`relationshipType → sourceId → targetId → edgeId`)
- `src/graph/traversal/security.ts` — `isNodeAccessible` / `isEdgePermitted` (deny-by-default, per hop)
- `src/graph/traversal/audit.ts` — deterministic `queryId`, duration bucketing, search-text hashing
- `src/graph/traversal/service.ts` — `BusinessGraphTraversalService` (8 operations)
- `src/graph/traversal/index.ts` — barrel
- `tests/graph/traversal/{helpers,limits,ordering,security,health-gating,service}.test.ts` — 54 tests

## What the 54 tests prove

- cross-organization traversal is impossible (node, context, viewer org all checked);
- an **unauthorized start node is byte-identical to an absent one** (`JSON.stringify` equality);
- **hidden intermediate nodes never leak** — neighbors of A are identical whether a branch is forbidden or
  physically absent (no leak via path shape / title / count / error);
- sensitivity clearance is enforced at every hop;
- health gating: `CORRUPT`/`MISSING`/`REBUILD_REQUIRED` refuse; `STALE`/`DEGRADED` deny-by-default;
  `allowStale` yields a `stale:true`-marked result;
- cycles terminate;
- hard limits cannot be exceeded — a caller value above a cap is clamped down;
- shortest path is deterministic; repeated queries are byte-equal;
- authoritative-only is the default; `INFERRED` needs `includeInferred`; `UNVERIFIED`/`PROPOSED` need
  `includeUnverified`; `REJECTED` is excluded under every flag;
- impact distinguishes DIRECT from INDIRECT;
- conflict detection uses registered relationships only (no semantic inference);
- envelope search never inspects a protected payload;
- every query emits a safe audit record with **no sensitive content** (search text stored as hash + class);
- **read-only:** the active snapshot is byte-identical after running all 8 operations.
