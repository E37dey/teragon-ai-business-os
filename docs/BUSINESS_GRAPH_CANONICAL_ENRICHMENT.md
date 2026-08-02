# TERAGON Business Graph — Canonical Enrichment (Phase 9)

The minimal, additive canonical + derivation changes that lift four queries from
`INSUFFICIENT_GRAPH_DATA` to **structurally SUPPORTED**, without synthetic data and without new
relationship types. Full rationale + rejected alternatives in
[PHASE9_GAP_RESOLUTION](BUSINESS_GRAPH_PHASE9_GAP_RESOLUTION.md).

## Canonical model changes (additive, typed, backward-compatible)

Only two entities gained fields; both are **optional + nullable**, so every existing record still parses
and round-trips. No heuristic backfill — a record without the new fact stays incomplete.

| Entity | New field | Type | For |
|--------|-----------|------|-----|
| `ServiceTicket` | `customerPrinterId` | `string \| null` (opt) | link a ticket to the canonical `CustomerPrinter` (replaces free-text `printer` for grouping) |
| `ServiceTicket` | `faultCategory` | `ServiceFaultCategory \| null` (opt, closed enum) | a stable fault identifier to define recurrence |
| `Task` | `sourceRecommendationId` | `string \| null` (opt) | link a task to the `AIRecommendation` that generated it |

`src/domain/schemas.ts`: `serviceFaultCategorySchema` added; the three fields are `.nullable().optional()`
on `serviceTicketSchema`/`taskSchema`. `Enrollment`/`StageProgress` and `AIRecommendation`/`Approval` were
**not** changed — the facts they needed already existed (`StageProgress.due`/`status`,
`Approval.status`/`decidedById`).

Deterministic demo seeds (`src/repositories/seed/seedData.ts`): a subset of records carry the new fields
(tickets `t-3`/`t-4` get `customerPrinterId` + `faultCategory`; `task-1` gets `sourceRecommendationId`);
others are deliberately left without, to exercise the incomplete-data path. No fabricated ids/dates/actors.

## Derivation changes (existing relationship types only)

Two new **registry entries** (not new relationship types) in `edgeRegistry.ts`, both FK/EXPLICIT → DERIVED,
`coreV1:false`:

- `SERVICED` — `serviceTicket → customerPrinter`, derived from `ServiceTicket.customerPrinterId`. Completes
  `serviceTicket → customerPrinter → printerModel` (`USES`) and `→ customer` (`OWNS`), which already derive
  from `CustomerPrinter.{printerModelId, customerId}`.
- `GENERATED_TASK` — `aiRecommendation → task`, derived from `Task.sourceRecommendationId`.

Plus two non-edge derivation changes:

- `aiRecommendation → approval` (`APPROVED_BY`) is authoritative **only** when `Approval.status = "אושר"`
  and `Approval.decidedById` resolves to a canonical **HUMAN** decider (owner-ref rules; never an id-prefix
  sniff). AGENT/SYSTEM-decided or pending/rejected approvals are not authoritative.
- The enrollment node projects a **safe stage summary** into `metadataSummary`
  (`enrollmentStageFactsPresent`, `enrollmentEarliestOpenStageDue`, `enrollmentOpenStageCount`) computed
  clock-free from the embedded `Enrollment.stages` — StageProgress stays embedded, never a graph node.

## Registry version + rebuild

The derivation registry version moves **`core-v1 → core-v2`**
(`SUPPORTED_GRAPH_REGISTRY_VERSIONS = ["core-v2"]`; indexing default policy `registryVersion: "core-v2"`).
A snapshot built under `core-v1` now returns **`REBUILD_REQUIRED`** (health) / `REGISTRY_VERSION_UNSUPPORTED`
(validation) and rebuilds cleanly to core-v2 — the index is derived, no in-place mutation. Proven by
new tests in `store/health.test.ts` and `store/rebuild.test.ts`.

## What did NOT change

No new relationship type (the closed vocabulary stays at 22). No inverse `AFFECTS` edge — printer-model
impact uses **inbound traversal** of the existing `USES` edge (a traversal-layer capability, see
[TRAVERSAL](BUSINESS_GRAPH_TRAVERSAL.md)). No canonical change for enrollments or approvals. Both feature
flags remain OFF; nothing is wired into runtime.

See [DERIVATION_COVERAGE](BUSINESS_GRAPH_DERIVATION_COVERAGE.md) ·
[QUERY_READINESS](BUSINESS_GRAPH_QUERY_READINESS.md) ·
[PHASE9_TEST_REPORT](BUSINESS_GRAPH_PHASE9_TEST_REPORT.md).
