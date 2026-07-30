# TERAGON Business Graph — Phase 8 Test Report (Application Facade)

**Scope:** `src/graph/application/**`, `tests/graph/application/**`, one barrel export block in
`src/graph/index.ts`. Nothing else touched. Not wired into app runtime. Default OFF, read-only. Composes
the Phase 4/6/6.1/7 layers — no store/traversal bypass in the facade, no protected bodies, no mutation.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src/graph tests/graph` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | **342 passed** (33 files) |
| **`vitest run` (full suite)** | **2054 passed** (was 2026; **+28**) |
| `vite build` | pass |
| `scan-bundle-secrets` | CLEAN — 0 findings |
| Playwright `e2e/shell.spec.ts` | 14 / 14 |

## Files

- `src/graph/application/flag.ts` — feature flag + `resolveFacadeEnabled` (mirrors `indexing/flag.ts`)
- `src/graph/application/errors.ts` — closed result-code set + `BusinessGraphApplicationError` + safe messages
- `src/graph/application/types.ts` — all boundary contracts + zod schemas
- `src/graph/application/adapters.ts` — thin production adapters (unregistered) + the system-clock boundary
- `src/graph/application/facade.ts` — `BusinessGraphApplicationFacade` (single secure execution path)
- `src/graph/application/factory.ts` — `BusinessGraphFacadeFactory` (composition root)
- `src/graph/application/index.ts` + barrel wiring in `src/graph/index.ts`
- `tests/graph/application/{helpers,facade,composition}.test.ts`

## What the tests prove

- feature OFF performs **no** graph construction or IndexedDB read (the store provider is never invoked);
- missing identity is denied (`UNAUTHENTICATED`); ambiguous → `IDENTITY_AMBIGUOUS`;
- an organization override in the request is rejected (`ORGANIZATION_MISMATCH`);
- actor kind comes from the resolver, not the id/session-ref format;
- the query caller cannot supply a permission/viewer context;
- all 9 queries execute only through `BusinessGraphQueryService`; no direct store/traversal bypass exists;
- unsupported readiness stays honest (no synthetic upgrade; `QUERY_NOT_READY` on invoke);
- stale access requires the resolved stale permission (`STALE_NOT_AUTHORIZED` otherwise);
- corrupt/missing graph returns a typed safe error (`GRAPH_UNHEALTHY`/`GRAPH_MISSING`);
- hidden entities do not affect facade totals;
- protected bodies never appear in output (`bodyOpened: false`);
- correlation joins facade/query/traversal audits safely with **distinct** execution ids;
- repeated requests have separate execution ids;
- disposal is safe and idempotent;
- construction / import causes no background work;
- the active snapshot remains byte-identical after running facade queries.

A real composition integration test uses `fake-indexeddb` with deterministic identity, clock,
execution-id, and audit providers.
