# TERAGON Business Graph — Issue Catalog (Phase 3)

Every derivation issue is a structured `GraphDerivationIssue`, never a silent drop. Source:
`DerivationIssueCode` + the issue factory in `src/graph/derivation/`.

## `GraphDerivationIssue` shape

`{ code, sourceEntityType, sourceEntityId, field?, attemptedRelationship?, severity
('error'|'warning'|'info'), reasonHe, safeRemediationHe, indexingMayContinue }`.

`indexingMayContinue` lets the caller decide whether a single bad reference aborts a record's derivation
(it never does — a bad edge is skipped, the node still derives) or the whole snapshot (never).

## Codes

| Code | Severity | When | Effect |
|------|---------|------|--------|
| `MISSING_ORGANIZATION` | error | record has no org and none can be inherited via approved context | record → `unmappableRecords`; no node |
| `MISSING_TARGET` | error | an FK/ref points at a record that does not exist | no edge |
| `AMBIGUOUS_REFERENCE` | warning | a name/substring field or an ambiguous ref | no authoritative edge (at most UNVERIFIED candidate) |
| `MALFORMED_REFERENCE` | error | a `"kind:id"` string fails syntax parsing | no edge |
| `UNSUPPORTED_REFERENCE` | warning | a ref kind not in the registry | no edge |
| `CROSS_ORGANIZATION` | error | source and target org differ | no edge |
| `INELIGIBLE_TARGET` | warning | target exists but is not graph-eligible / not authoritative | no authoritative edge |
| `ARCHIVED_SOURCE` | info | source `archivedAt !== null` | node marked `archived`; excluded from authoritative edges |
| `SUPERSEDED_SOURCE` | info | source has a supersede marker | node marked `superseded`; lineage-only |
| `DUPLICATE_EDGE` | info | same deterministic edge id produced twice | de-duplicated into `duplicateEdges` |
| `ORPHAN_NODE` | info | a node with no edges after snapshot build | reported (still indexed) |
| `SENSITIVITY_BLOCKED` | warning | a sensitive body would be needed to satisfy a reference | no body copied; issue emitted |
| `NON_AUTHORITATIVE_SOURCE` | warning | the source record is not authoritative (draft/rejected knowledge/memory) | no authoritative edge |
| `ORG_SCOPE_INHERITED` | info | org inherited from context under approved conditions | node tagged; edge allowed |
| `EXCLUDED_ENTITY` | info | entity type is `EXCLUDED` in `DERIVATION_STATUS` | no node |
| `UNMAPPABLE_ENTITY` | warning | entity cannot be mapped for a structural reason | record → `unmappableRecords` |
| `DANGLING_ENDPOINT` | error | `validateDerivedGraph` finds an edge whose endpoint node is absent | edge flagged |

(13 codes were required by the brief; 4 additional — `ORG_SCOPE_INHERITED`, `EXCLUDED_ENTITY`,
`UNMAPPABLE_ENTITY`, `DANGLING_ENDPOINT` — were added for completeness and honesty.)

## Principle

An issue is always **actionable and non-destructive**: it names the source, field, and attempted
relationship, states a Hebrew reason + safe remediation, and says whether indexing may continue. A bad
reference degrades one edge — never the node, never the snapshot.
