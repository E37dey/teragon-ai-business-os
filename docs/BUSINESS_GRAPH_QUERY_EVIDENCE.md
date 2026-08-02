# TERAGON Business Graph — Query Evidence Model (Phase 7)

How the business query pack presents *why* a finding holds — provenance-labelled, permission-filtered,
and never opening a protected body. Source: `src/graph/query/{types,service}.ts`.

## Evidence item (`BusinessQueryEvidence`)

Each finding carries a list of evidence items; every item is envelope-safe:

- `nodeId`, `entityType`, `entityRef` — the reached business entity (reference only);
- `provenance` (`EXPLICIT`/`FOREIGN_KEY_DERIVED`/`INFERRED`/`PROPOSED`) + `authority`
  (`CANONICAL`/`DERIVED`/`UNVERIFIED`/`REJECTED`) — preserved from the traversal, so a non-authoritative
  or inferred link stays **visibly labelled**;
- `approvalState`, `relationshipType`;
- `direct` — DIRECT (distance 1) vs INDIRECT;
- `sensitivity` — the reached node's sensitivity when known;
- `path` — the `GraphPath` proving the connection (nodes + labelled steps);
- **`bodyOpened: false`** — the literal `false`; the business-query layer **never** opens a protected
  payload body. Evidence is the *path and references*, not the content.

## Provenance & authority discipline

Evidence and impact default to **authoritative** edges. `INFERRED` links appear only when the caller sets
`includeInferred`, `UNVERIFIED`/`PROPOSED` only under `includeUnverified` — and in every case the item
keeps its real `provenance`/`authority` so nothing masquerades as canonical. `REJECTED` edges are never
traversable. Each finding also rolls these up into `provenanceSummary`, `authoritySummary`, and
`approvalStateSummary` for a quick trust read.

## Confidence is never invented

The layer emits **no AI confidence score**. `BusinessQuerySourceConfidence` is populated **only** when a
canonical, approved source field already carries a confidence value — and it retains `sourceRef` +
`sourceField` so the number is always traceable to its canonical origin. Absent such a field,
`sourceConfidence` is `null`.

## Direct vs indirect

`relationshipKind` on the finding and `direct` on each evidence item distinguish a DIRECT (distance-1)
relationship from an INDIRECT one. `calculateImpact`-backed queries (impact, approved-task) rely on the
traversal layer's DIRECT/INDIRECT split; the query layer never collapses the distinction.

## `buildFullEvidencePath`

Returns a bounded, permission-filtered, provenance-labelled `GraphPath` between two entities via
deterministic shortest-path traversal. Inaccessible intermediates are absent (they were dropped before
the BFS frontier in the traversal layer), so the path shape itself leaks nothing; protected bodies along
it remain unopened.

## Why evidence cannot leak hidden entities

Every evidence item originates from a node/edge the **traversal layer already security-filtered**. The
query layer assembles findings *after* that filtering and derives all counts from the assembled findings,
so a hidden entity never appears in an evidence list, a path, or a total. See
[QUERY_READINESS](BUSINESS_GRAPH_QUERY_READINESS.md) and
[SECURITY_CONTRACTS](BUSINESS_GRAPH_SECURITY_CONTRACTS.md).
