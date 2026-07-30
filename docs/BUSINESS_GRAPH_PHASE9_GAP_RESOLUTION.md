# TERAGON Business Graph — Phase 9 Gap Resolution Audit

Written **before** implementation. For each of the four `INSUFFICIENT_GRAPH_DATA` queries: the required
business fact, the existing canonical repository/field, the missing piece, the **gap classification**
(canonical-data / derivation / traversal-direction / query-logic), the chosen minimal solution, rejected
alternatives, and compatibility impact. The closed relationship vocabulary (`OWNS`, `USES`, `SERVICED`,
`APPROVED_BY`, `GENERATED_TASK`, …) already contains every relationship needed — **no new edge type is
introduced**.

## Q3 — findRecurringServiceIssues

- **Required fact:** stable `serviceTicket → customerPrinter → printerModel → customer` chain + a stable
  fault/issue **category identifier** to define recurrence.
- **Existing canonical:** `ServiceTicket` (`src/domain/types.ts`) has `customerId: string | null`,
  free-text `printer: string`, free-text `issue: string`, `status`, `priority`. `CustomerPrinter` already
  has canonical `customerId` **and** `printerModelId` — so `customerPrinter → customer` and
  `customerPrinter → printerModel` (USES) are already derivable.
- **Missing:** a canonical **`customerPrinterId`** on `ServiceTicket` (the only free-text link today is
  `printer`), and a canonical **fault category id** (`issue` is free text).
- **Gap class:** **canonical-data** (+ derivation to wire the edge).
- **Chosen solution:** additive optional `ServiceTicket.customerPrinterId: string | null` and a typed
  `ServiceTicket.faultCategory` (closed enum) `| null`. Derive `serviceTicket → customerPrinter`
  (`SERVICED`/`RESOLVED_BY` per registry) from `customerPrinterId`; recurrence is grouped by
  `(printerModelId, faultCategory)` reached through the canonical chain. Tickets lacking
  `customerPrinterId` or `faultCategory` are reported **incomplete** (do not enter a group).
- **Rejected:** grouping by free-text `printer`/`customerName`, ticket body, substring similarity, or AI
  semantic inference (all explicitly forbidden — no heuristic resolution).
- **Compatibility:** additive optional fields; existing tickets (no `customerPrinterId`) stay valid and
  simply do not contribute recurrence evidence.

## Q4 — findDelayedEnrollments

- **Required fact:** an explicit expected/due date + a progress/completed-stage state to compare against
  an explicit `asOf`.
- **Existing canonical:** `Enrollment.stages: StageProgress[]` is embedded, and **`StageProgress` already
  carries `due: ISODate`, `status: StageProgressStatus`, and `updated`** — the timing facts already exist.
- **Missing:** nothing canonical. The embedded per-stage due/status is simply not projected onto the
  enrollment graph node.
- **Gap class:** **derivation / node-projection** (+ query logic). **No canonical change.**
- **Chosen solution:** during derivation, project a **safe** delay summary from the embedded stages into
  the enrollment node's `metadataSummary` (e.g. earliest open-stage `due`, count of open overdue stages) —
  StageProgress stays embedded and does **not** become a graph node (per the spec). The query flags an
  enrollment as delayed only when an open (non-completed) stage's `due < asOf`. Enrollments with no stages
  / no due dates remain **INSUFFICIENT_GRAPH_DATA**, never delayed-by-age.
- **Rejected:** inferring delay from enrollment age or `createdAt`; promoting StageProgress to a node.
- **Compatibility:** additive derived metadata only; no schema change; deterministic under injected `asOf`
  with the same date-string boundary semantics as milestone status (due day is a grace day, TZ-independent).

## Q5 — assessPrinterModelSupportImpact

- **Required fact:** the printers/customers/tickets/tasks that depend on a `printerModel`.
- **Existing canonical:** `CustomerPrinter.printerModelId` already yields the `customerPrinter → printerModel`
  `USES` edge. The relationship exists; it is oriented **printer → model**.
- **Missing:** nothing in data or the edge registry. `calculateImpact` is currently **outbound-only**, so
  `calculateImpact(model)` finds nothing (a model has no outbound edges).
- **Gap class:** **traversal-direction** (+ query logic). **No canonical change, and NO inverse edge.**
- **Chosen solution:** add **inbound-traversal** support to the impact operation so it walks the existing
  `USES` edge inbound: `printerModel ← customerPrinter (USES) → customer (OWNS)`, plus tickets (via the new
  Q3 `serviceTicket → customerPrinter` link) and open tasks, returning **bounded DIRECT vs INDIRECT**
  impact. Per the audit requirement, the existing `customerPrinter → printerModel` relation **is**
  inbound-traversable, so a redundant inverse `AFFECTS` edge is **not** created (it would encode no new
  business fact and would duplicate `USES`).
- **Rejected:** a new `printerModel → customerPrinter` inverse edge for query convenience; inventing
  operational-consequence facts (downtime/severity).
- **Compatibility:** traversal-layer capability only; no data or registry-edge change for this query.

## Q6 — findTasksFromApprovedRecommendations

- **Required fact:** the path `aiRecommendation → approval → named HUMAN approver → generated task`.
- **Existing canonical:** `AIRecommendation` has `approvalRequired` + `approvalId` (→ `Approval`).
  `Approval` has `status: ApprovalStatus` (`"אושר"` = approved) and **`decidedById`** (the approver) +
  `decidedAt`. `Task` has only a generic `relatedRef` (`"customer:cu-3"` style).
- **Missing:** a **canonical task → recommendation/approval reference** (there is no reliable link from a
  task back to the recommendation that generated it), and the derivation must enforce that
  `Approval.status = "אושר"` **and** `decidedById` is a canonical **active HUMAN** user.
- **Gap class:** **canonical-data** (+ derivation).
- **Chosen solution:** additive optional `Task.sourceRecommendationId: string | null`. Derive
  `aiRecommendation → approval` (`APPROVED_BY`, authoritative only when `status="אושר"` and `decidedById`
  resolves to a HUMAN via the existing actor rules) and `aiRecommendation → task` (`GENERATED_TASK`) from
  `sourceRecommendationId`. The query walks recommendation → approved-human-approval → task. Rejected /
  pending / superseded recommendations, and AGENT/SYSTEM-"approved" ones, never qualify. Actor humanity is
  a typed fact (`assertHumanApprover` semantics), **never** an id-prefix sniff.
- **Rejected:** matching recommendation ↔ task by title or text; treating an unapproved or
  non-human-decided approval as authoritative.
- **Compatibility:** additive optional field; tasks without `sourceRecommendationId` simply do not appear
  as recommendation-generated.

## Registry & readiness impact (all four)

- **Registry version bump:** the derivation registry version moves `core-v1 → core-v2` (new edge
  derivations from the new canonical ids + the enrollment projection). Snapshots built under `core-v1`
  return **`REBUILD_REQUIRED`** and rebuild cleanly (the index is derived; no in-place mutation).
- **Readiness semantics:** capability is separated from instance data via typed capability requirements.
  **SUPPORTED + []** = contracts/derivation support the query but no matching records exist;
  **INSUFFICIENT_GRAPH_DATA** = relevant records exist but required canonical facts are missing/incomplete;
  **PARTIALLY_SUPPORTED** / **UNSUPPORTED** as defined. Readiness no longer depends on a fixture merely
  containing an edge.
- **Flags:** `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED` and `BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED`
  remain OFF. No runtime enablement.
