# TERAGON Business Graph — Phase 2 Test Report

**Branch:** `feature/teragon-business-graph`. Contracts-only phase; no storage/traversal/UI/agent/deploy.

## Gate results (all green)

| Gate | Result |
|------|--------|
| oxlint (`src/graph tests/graph`) | **clean (0/0)** |
| TypeScript strict (`tsc -b --noEmit`) | **0 errors** |
| `typecheck:tests` | **0 errors** |
| Vitest — graph suite (`tests/graph`) | **37 / 37 passed** |
| Vitest — full suite | **1743 / 1743 passed** (1706 pre-existing + 37 new; existing suite unaffected) |
| Playwright baseline (smoke `shell.spec.ts`) | **14 / 14** — contracts are not wired into app runtime, so E2E is unaffected |
| Production build | **pass** |
| Secret scanner | **CLEAN — 0 findings** |
| Working tree | additive only (`src/graph/**`, `tests/graph/**`, docs); no existing source modified |

## Invariants proven (6 test files, 37 tests)

`tests/graph/identity.test.ts` · `node.test.ts` · `edge.test.ts` · `references.test.ts` ·
`security.test.ts` · `registry.test.ts`.

1. Invalid node identity (malformed `teragon://` URI) is **rejected**.
2. Missing `organizationId` is **rejected**.
3. Array-position ids (`0`,`1`,…) are **rejected** (`isArrayPositionId` + schema); display names rejected
   (whitespace rule).
4. Ambiguous / name references are **never resolved to authoritative** (`referenceMayBeAuthoritative`
   false).
5. An **inferred edge cannot claim CANONICAL** authority (refinement throws).
6. **Rejected evidence / REJECTED authority cannot be authoritative** (`edgeIsAuthoritative` false).
7. **Cross-organization edge is rejected** (edge refinement) and CROSS_ORGANIZATION reference classified.
8. **Sensitive payload absent from the default node** — `BusinessGraphNode` has no body/content field;
   `ProtectedPayloadReference` carries no content.
9. **AI agent cannot be human approver** — `humanApproverGuard` throws for an agent / `ag-*` ref.
10. **Unknown entity or relationship type is rejected** (closed zod enums).
11. **Archived / superseded state is represented** — `node.archived`/`node.superseded` and edge
    `staleState`.
12. **Schemas serialize and parse deterministically** — `parse(stringify(x))` deep-equals the original.
13. **Entity registry is exhaustive** — every one of the 37 `GraphEntityType`s has an entry (compile +
    runtime check).
14. **`buildNodeId`/`parseNodeId` round-trip** cleanly.

## Counts

- Entity types: **37** · Relationship types: **22** · Entity-registry entries: **37** · Edge-registry
  entries: **30** · Core-v1 spine: **15** · New unit tests: **37**.

## Design decisions / deviations (from the implementation)

- Branded-id schemas (`businessGraphNodeSchema`, `businessGraphEdgeSchema`) omit `satisfies
  z.ZodType<T>` because a zod `string` output is not assignable to a unique-symbol brand; alignment is
  instead guaranteed by the hand-written interface + JSON round-trip tests. Non-branded contracts use
  `satisfies z.ZodType<T>` per house style.
- Display-name rejection = "`entityId` contains no whitespace" (rejects `"Acme Corp"`; allows `cu-1`).
- `classifyOrganization` does not validate org *membership* (no org registry exists at the contract
  layer) — it only refuses to fabricate one.
- Cross-org enforcement lives in the edge schema refinement **and** the reference-layer
  `CROSS_ORGANIZATION` classification.
