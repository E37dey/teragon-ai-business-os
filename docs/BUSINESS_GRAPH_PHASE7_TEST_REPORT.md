# TERAGON Business Graph — Phase 7 Test Report (Business Query Pack)

**Scope:** `src/graph/query/**`, `tests/graph/query/**`, one barrel export block in `src/graph/index.ts`.
Nothing else touched. Not wired into app runtime. Built strictly on top of the Phase 6/6.1 traversal
service — no store/derivation/indexeddb imports, no re-implemented BFS, no protected-body reads.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src/graph tests/graph` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | **314 passed** |
| **`vitest run` (full suite)** | **2026 passed** (was 1993; **+33**) |
| `vite build` | pass |
| `scan-bundle-secrets` | CLEAN — 0 findings |

## Files

- `src/graph/query/types.ts` — 8 types + zod request schema + reason-code / readiness / relationship-kind vocabularies
- `src/graph/query/capabilities.ts` — the 9-entry `BUSINESS_QUERY_CAPABILITIES` registry (baseline readiness + structured `missingFacts`)
- `src/graph/query/policy.ts` — deterministic calendar-day cutoff + closed business-status vocabularies
- `src/graph/query/service.ts` — `BusinessGraphQueryService` (the 9 methods)
- `src/graph/query/index.ts` + barrel wiring in `src/graph/index.ts`
- `tests/graph/query/{helpers,queries,security,determinism,capabilities}.test.ts`

## What the tests prove

- each supported query returns the expected evidence paths;
- unsupported data produces an honest readiness state (not a fabricated finding);
- delayed enrollment is **not** fabricated — `INSUFFICIENT_GRAPH_DATA` without progress/due-date facts;
- unresolved customer names do not create follow-up findings;
- an unapproved recommendation does **not** generate an approved-task finding;
- recurring-service count **excludes hidden tickets** (3→2 when one ticket is oracle-hidden);
- unsupported printer-model impact is bounded and deterministic;
- superseded evidence is labelled historical (current vs historical);
- conflicts use registered graph relationships only (no semantic inference);
- hidden entities do **not** affect visible counts (removed before totals);
- stale + corrupt health rules remain enforced (Phase-6.1 stale authorization required);
- repeated queries are deterministic except for `executionId`;
- audit records are separate and safe (business + underlying traversal, no duplicate sensitive logging);
- traversal snapshots remain **immutable** — byte-identical after running all 9 queries.

## Readiness landed (fixtures as shipped)

SUPPORTED: `findCustomersNeedingFollowUp`, `findUnansweredQuotations`, `findSupersededEvidence`,
`findRecommendationConflicts`, `buildFullEvidencePath`.
INSUFFICIENT_GRAPH_DATA (proven SUPPORTED on a synthetic augmented fixture that adds the missing fact):
`findRecurringServiceIssues`, `findDelayedEnrollments`, `assessPrinterModelSupportImpact`,
`findTasksFromApprovedRecommendations`. Full gap list in
[QUERY_READINESS](BUSINESS_GRAPH_QUERY_READINESS.md).
