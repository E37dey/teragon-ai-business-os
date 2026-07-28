# TERAGON Business Graph — Edge Registry & Contract (Phase 2)

Source: `src/graph/contracts/edge.ts` (contract) + `src/graph/registry/edgeRegistry.ts` (registry).

## Relationship types (closed union — 22)

`OWNS · CONTACT_FOR · CREATED · ASSIGNED_TO · RELATED_TO · USES · SUPPORTED_BY · RESOLVED_BY ·
RECOMMENDED · APPROVED_BY · REJECTED_BY · GENERATED_TASK · ENROLLED_IN · PURCHASED · QUOTED_FOR ·
SERVICED · MENTIONED_IN · DERIVED_FROM · SUPERSEDES · CONTRADICTS · VERSION_OF · AUDITS`.

An unknown relationship type is rejected by `graphRelationshipTypeSchema`.

## `BusinessGraphEdge`

`id (GraphEdgeId), organizationId, relationshipType, source (GraphNodeId), target (GraphNodeId),
direction ('directed'|'bidirectional'), provenance, authority, evidenceRefs (GraphEntityRef[]),
sensitivity, approvalState, validFrom, validUntil (nullable), createdAt, createdBy (GraphEntityRef|null),
version, staleState`.

`staleState ∈ { FRESH, STALE, BROKEN, SUPERSEDED, UNRESOLVED }` — dangling/superseded edges are
first-class states (never silently dropped).

## Provenance (how the edge was derived)

`EXPLICIT` (dedicated link/join record) · `FOREIGN_KEY_DERIVED` (a scalar `xxxId` field) · `INFERRED`
(heuristic) · `PROPOSED` (agent/draft, pending approval).

## Authority (how much it may be trusted)

`CANONICAL` · `DERIVED` · `UNVERIFIED` · `REJECTED`.

## The refinement rules (enforced by `businessGraphEdgeSchema.superRefine`)

1. **Only an `EXPLICIT` edge may claim `CANONICAL` authority.** An `INFERRED` or `FOREIGN_KEY_DERIVED`
   edge that declares `CANONICAL` is **rejected** — an inferred edge can never masquerade as canonical.
2. **A `PROPOSED` edge is always `UNVERIFIED` and never `approved`** — a proposed relationship can never
   enter authoritative traversal without approval.
3. **A `REJECTED`-authority edge is never authoritative** (and never `approved`).
4. **Cross-organization edges are rejected** — the schema parses `source`/`target` node ids and requires
   `source.org === target.org === edge.organizationId`.

`edgeIsAuthoritative(edge)` is the **deny-by-default** helper: returns `false` for `REJECTED`/
`UNVERIFIED`/`PROPOSED`, `true` only for a `CANONICAL` (⇒ EXPLICIT) or `DERIVED` edge.

## `EDGE_REGISTRY` (30 entries)

Each `EdgeRegistryEntry` declares `{ relationshipType, sourceType, targetType, direction, cardinality
(1:1|1:N|N:1|N:N), defaultProvenance, defaultAuthority, approvalGated, coreV1 }`. The 30 entries cover
all **core-v1 spine** relationships from the Phase-1 EDGE_MAP, e.g.:

| relationshipType | source → target | provenance | coreV1 |
|---|---|---|---|
| OWNS | organization → customer | FOREIGN_KEY_DERIVED | ✓ |
| QUOTED_FOR | quotation → customer | FOREIGN_KEY_DERIVED | ✓ |
| USES | customerPrinter → printerModel | FOREIGN_KEY_DERIVED | ✓ |
| SERVICED | serviceTicket → customer | FOREIGN_KEY_DERIVED | ✓ |
| RESOLVED_BY | repairAction → serviceTicket | FOREIGN_KEY_DERIVED | ✓ |
| RECOMMENDED | aiRecommendation → agent | FOREIGN_KEY_DERIVED | ✓ |
| SUPPORTED_BY | aiRecommendation → evidence(refs) | FOREIGN_KEY_DERIVED | ✓ |
| APPROVED_BY | aiRecommendation → approval | FOREIGN_KEY_DERIVED | ✓ |
| GENERATED_TASK | approval → task | EXPLICIT | ✓ |
| ENROLLED_IN | enrollment → course/student | FOREIGN_KEY_DERIVED | ✓ |
| RELATED_TO | memoryRecord → entity (entityLinks) | EXPLICIT | ✓ |
| SUPERSEDES | memoryRecord → memoryRecord | FOREIGN_KEY_DERIVED | ✓ |
| USES | knowledgeArticle → printerModel | FOREIGN_KEY_DERIVED | ✓ |

(Full list in the source.) `defaultAuthority` respects the refinement — FK-derived entries default to
`DERIVED`, explicit link records to `CANONICAL`, and approval-gated entries carry `approvalGated:true`
so a later phase tags them provisional until a named-human approval edge exists.
