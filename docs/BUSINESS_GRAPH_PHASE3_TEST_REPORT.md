# TERAGON Business Graph — Phase 3 Test Report

**Branch:** `feature/teragon-business-graph`. Pure-derivation phase; no persistence/index/traversal/
service/APIs/UI/agents/migrations/Copilot/deploy. Includes the Phase-2.1 hardening.

## Gate results (all green)

| Gate | Result |
|------|--------|
| oxlint (`src/graph tests/graph`) | **clean** |
| TypeScript strict (`tsc -b`) | **0 errors** |
| `typecheck:tests` | **0 errors** |
| Vitest — graph suite (`tests/graph`) | **89 / 89 passed** (8 files) |
| Vitest — full suite | **1795 / 1795 passed** (195 files; 1706 baseline + 89 graph) |
| Production build | **pass** |
| Secret scanner | **CLEAN — 0 findings** |
| Playwright baseline (smoke `shell.spec.ts`) | **14 / 14** — derivation is not wired into app runtime, E2E unaffected |
| Working tree | additive only (`src/graph/**`, `tests/graph/**`, docs) |

## Invariants proven (fixture-based, `tests/graph/derivation.test.ts` + focused files)

deterministic node ids · deterministic edge ids · deterministic sorting + serialization (two runs ⇒
identical JSON) · a canonical FK-derived edge is allowed under registry policy · inferred edge cannot be
canonical · missing target ⇒ issue and NO edge · cross-org ⇒ issue and NO edge · ambiguous name ⇒ issue
and NO authoritative edge · org inheritance works only through approved context (else
`MISSING_ORGANIZATION`) · sensitive content absent from nodes/edges · duplicate edges detected · cycles
do not break derivation (cyclic fixture terminates) · archived/superseded records represented correctly ·
identical input ⇒ identical output · all 37 entity types have an explicit `DERIVATION_STATUS` · Core-V1
coverage complete (15/15 yield a node).

Phase-2.1 hardening also covered (65 contract tests): FK_DERIVED reaches CANONICAL only when all six
conditions hold and downgrades on each failing condition; `assertHumanApprover` rejects AGENT/SYSTEM
actors, inactive/ineligible users, missing permission, and self-approval; actor kind is never inferred
from `ag-*` id prefixes.

## Seed-fixture metrics (single synthetic org)

- Nodes **132** · Edges **83**
- Authority: CANONICAL **10** · DERIVED **71** · UNVERIFIED **2** · REJECTED 0
- Provenance: EXPLICIT **11** · FOREIGN_KEY_DERIVED **66** · INFERRED **6**
- Unmappable **0** · duplicateEdges **0** · orphanReferences **0** · issues 14 error / 21 warning / 169 info
  (the 14 errors are correct `CROSS_ORGANIZATION` refusals from mixed-org seed data — see
  `BUSINESS_GRAPH_DERIVATION_COVERAGE.md`).

## DERIVATION_STATUS (37 types)

IMPLEMENTED **15** · DEFERRED **20** · EXCLUDED **2** (`auditEvent`, `agentEvent`) · UNMAPPABLE 0 (static).
