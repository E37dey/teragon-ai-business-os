# TERAGON Business Graph — Phase 9 Test Report (Canonical Enrichment)

**Scope:** additive canonical contracts (`src/domain/**`), seeds/serialization (`src/repositories/**`),
graph derivation/registry/traversal/query/capabilities (`src/graph/**`), and tests. No UI, no runtime, no
HTTP, no agents; both feature flags remain OFF; no new relationship type; no inverse `AFFECTS` edge.

## Gate (full, green)

| Check | Result |
|-------|--------|
| `oxlint src tests` | 0 errors / 0 warnings |
| `tsc` strict (`typecheck`) | 0 errors |
| `typecheck:tests` | 0 errors |
| `vitest run tests/graph` | **355 passed** |
| **`vitest run` (full suite)** | **2073 passed** (was 2054; **+19**) |
| `vite build` | pass |
| `scan-bundle-secrets` | CLEAN — 0 findings |
| Playwright `e2e/shell.spec.ts` | 14 / 14 |

## The four queries (now structurally SUPPORTED)

| Query | Gap class | Change | Canonical fixture result |
|-------|-----------|--------|--------------------------|
| findRecurringServiceIssues | canonical-data + derivation | `ServiceTicket.customerPrinterId`+`faultCategory`; derive `serviceTicket→customerPrinter`; group by (printerModel, faultCategory) | SUPPORTED — 1 finding, 2 tickets, 2-hop paths; free-text/other-category tickets excluded |
| findDelayedEnrollments | derivation/projection only | project stage summary from embedded `stages`; delayed only when open stage `due < asOf` | SUPPORTED — `DELAYED_ENROLLMENT` on the overdue fixture |
| assessPrinterModelSupportImpact | traversal-direction only | inbound (`incident`) impact over existing `USES` | SUPPORTED — DIRECT = customer printers, INDIRECT = customers/tickets/open-tasks; deterministic |
| findTasksFromApprovedRecommendations | canonical-data + derivation | `Task.sourceRecommendationId`; derive `aiRecommendation→task`; `APPROVED_BY` authoritative only when approved + HUMAN decider | SUPPORTED — 1 finding (human-approved rec); pending rec excluded → INSUFFICIENT |

## Readiness — structural vs instance

`evaluateStructuralReadiness()` now evaluates typed capability requirements against the ENTITY/EDGE
**registries**, so all 9 baselines are structurally **SUPPORTED**. Instance-level honesty is preserved in
the query service: **SUPPORTED + []** (contracts support it, no matching records) is distinguished in code
from **INSUFFICIENT_GRAPH_DATA** (relevant records exist but lack required canonical facts) via per-query
flags (e.g. Q3 unlinked/uncategorized ticket, Q4 stage-facts present vs missing, Q8 saw-approved-approval).

## What the new/changed tests prove (~20 added/changed, incl. `tests/graph/query/phase9Canonical.test.ts`)

- each of the 4 queries is SUPPORTED against a graph **derived from canonical records** (not hand-built edges);
- structurally-supported query with no matching records → **SUPPORTED + []**;
- records missing required facts → **INSUFFICIENT_GRAPH_DATA** (never fabricated);
- delayed enrollment is not inferred from age;
- inbound printer-model traversal is deterministic;
- unapproved / non-human-approved recommendation is excluded;
- recurrence never groups by free-text `printer`/`issue`/name (the free-text-only ticket yields no finding);
- hidden records do not affect recurrence/impact counts (hide 1 of 3 tickets → 2);
- evidence paths retain provenance / authority / approval state and stay body-unopened;
- a legacy `core-v1` snapshot → `REBUILD_REQUIRED` and rebuilds cleanly to `core-v2`;
- legacy `ServiceTicket`/`Task` without the new fields still parse and round-trip (repository compat);
- an invalid `faultCategory` is rejected.

## Compatibility

Additive optional fields only; the shipped valid fixture derivation is unchanged (22 nodes / 22 edges,
since its records carry no new fields). No heuristic backfill; records missing the new facts stay
incomplete. Both flags remain OFF.
