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

## Authority rules — centralized policy (updated in Phase 2.1)

Authority is decided by ONE central function, **`resolveEdgeAuthority(input)`**
(`src/graph/contracts/authority.ts`) — the rules are **not scattered across factories**. It returns
`{ authority, reasons[] }`:

1. **`EXPLICIT`** (a dedicated link/join record) ⇒ may be `CANONICAL` by construction.
2. **`FOREIGN_KEY_DERIVED`** ⇒ may reach `CANONICAL` **only when ALL six hold**: the registry marks the
   relationship authoritative · the source is canonical + eligible · the **target exists** · source and
   target share `organizationId` · the source is **not archived/rejected/invalid** · **no ambiguous
   resolution** was used. If any fails, it downgrades to `DERIVED` (e.g. registry-not-authoritative /
   archived) or `UNVERIFIED` (broken FK / cross-org / ineligible). A broken/missing FK yields a
   non-authoritative result **and instructs the caller to emit an issue, not an edge.**
3. **`INFERRED`** ⇒ capped at `DERIVED` — **can never be `CANONICAL`.**
4. **`PROPOSED`** ⇒ always `UNVERIFIED` until a named-human approval (never authoritative without it).
5. **`REJECTED`** ⇒ never authoritative. **Name/substring/ambiguous** resolution ⇒ capped at `UNVERIFIED`.

The static `businessGraphEdgeSchema.superRefine` enforces the *shape* invariants (rejects
`INFERRED`+`CANONICAL`, `PROPOSED`+non-UNVERIFIED/approved, `REJECTED`-authoritative, and cross-org where
`source.org === target.org === edge.organizationId`), while the runtime six-condition gate for
`FOREIGN_KEY_DERIVED → CANONICAL` lives in `resolveEdgeAuthority`. `edgeIsAuthoritative(edge)` remains
**deny-by-default**: `false` for `REJECTED`/`UNVERIFIED`/`PROPOSED`, `true` only for `CANONICAL` or
`DERIVED`.

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
