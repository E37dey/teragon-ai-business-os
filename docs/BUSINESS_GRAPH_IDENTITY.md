# TERAGON Business Graph — Identity (Phase 2)

Stable node/edge identity derived from **canonical identity only**. Source: `src/graph/contracts/identity.ts`.

## Node id format

```
teragon://{organizationId}/{entityType}/{entityId}
```

- `GraphEntityRef = { organizationId: string; entityType: GraphEntityType; entityId: string }` —
  **`organizationId` is required.**
- `buildNodeId(ref): GraphNodeId` produces the URI; `parseNodeId(id): GraphEntityRef` round-trips it
  (throws `GraphIdentityError` on malformed input). Node/edge ids are branded string types
  (`GraphNodeId`, `GraphEdgeId`) so a raw string cannot be passed where an id is required.

## Forbidden identity sources (rejected by schema/helpers)

Never derived from: array position · display name · `customerName` · `studentName` · free-text printer
name · inferred title · mutable slug. Enforced by:
- `isArrayPositionId(s)` — a pure integer (`0`,`1`,`2`,…) is rejected as an id.
- `entityId` must contain **no whitespace** — rejects display names like `"Acme Corp"` while allowing
  canonical ids like `cu-1` (a bare `cu-1` passes; `"אבי לוטם"` does not).
- `graphEntityTypeSchema` / `graphNodeIdSchema` reject unknown entity types and malformed URIs.
- `graphNodeIdSchema` / `graphEntityRefSchema` reject a blank/missing `organizationId`.

## Organization requirement — no invented tenant

`classifyOrganization(orgId)` returns an `OrgClassification`: a valid org id maps normally; a
missing/blank org yields **`unmappable`** with an `OrgUnmappableReason`. It **never fabricates
`org-teragon`** (the Phase-1 dangling-org hazard). Records without a valid organization are **reported
unmappable, not silently assigned** — so the index (a later phase) can surface them for remediation
rather than mis-scope them.

## The 37 entity types (closed union `GRAPH_ENTITY_TYPES`)

`organization, user, role, customer, contact, lead, opportunity, quotation, product, printerModel,
customerPrinter, serviceTicket, repairAction, course, student, enrollment, task, document, automation,
automationRun, agent, agentRun, agentEvent, aiRecommendation, approval, auditEvent, memoryRecord,
knowledgeArticle, learningObservation, learningProposal, learningRule, metricDefinition,
metricObservation, governancePolicy, governanceRisk, governanceIncident, submissionDeliverable`.

**Deliberate Phase-1 decisions honored:**
- `permission` is **not** a node (typed capability only — kept out of the union).
- `stageProgress` is **excluded** (remains embedded in `Enrollment.stages` unless later promoted).
- `printerModel` and `customerPrinter` are **separate** node types.
- `agentRun` and `agentEvent` are **separate** (never conflated).
