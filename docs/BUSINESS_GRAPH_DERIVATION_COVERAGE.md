# TERAGON Business Graph — Derivation Coverage (Phase 3)

Explicit derivation status for **every** one of the 37 registered entity types — no type disappears
silently. Source: `DERIVATION_STATUS` in `src/graph/derivation/types.ts` (compile-time exhaustive over
`GraphEntityType`; unit-tested).

## Status breakdown (37 total)

| Status | Count | Meaning |
|--------|------:|---------|
| **IMPLEMENTED** | **15** | node + priority edges fully derived (the Core-V1 spine) |
| **DEFERRED** | **20** | a generic node is derivable, but edge derivation is not committed this phase |
| **EXCLUDED** | **2** | intentionally not a graph node (`auditEvent` — redacted raw content; `agentEvent` — agent-hard-banned append log) |
| **UNMAPPABLE** | 0 (static) | reserved for runtime classification of records lacking a valid org |

*(`permission` and `stageProgress` are not in the 37 — excluded at the registry level in Phase 2:
`permission` is a capability, `stageProgress` is embedded.)*

## IMPLEMENTED — Core-V1 spine (15)

`customer, lead, opportunity, quotation, customerPrinter, printerModel, serviceTicket, knowledgeArticle,
aiRecommendation, approval, task, agentRun, course, enrollment, memoryRecord`.

Each yields a node from a seed fixture (14 from `seedData.ts`; `agentRun` from a constructed fixture —
the seed has no `agentRuns` collection). Priority relationships implemented (supporting the reasoning
paths in the brief):

| Reasoning path | Edges |
|---|---|
| Customer follow-up | `OWNS` (org→customer), `ASSIGNED_TO` (lead→user), `CONTACT_FOR` |
| Opportunity & quotation status | `DERIVED_FROM` (opp→lead), `RELATED_TO` (opp→customer), `QUOTED_FOR` (quotation→customer), `USES` (line→product) |
| Printer ownership | `OWNS` (customerPrinter→customer), `USES` (customerPrinter→printerModel) |
| Recurring service issues | `SERVICED` (ticket→customer), `RESOLVED_BY` (repair→ticket) |
| Approved knowledge evidence | `USES` (knowledgeArticle→printerModel), `SUPPORTED_BY` |
| Recommendation → approval → task | `RECOMMENDED` (rec→agent), `APPROVED_BY` (rec→approval), `GENERATED_TASK` (approval→task) |
| Course & enrollment context | `ENROLLED_IN` (enrollment→course/student), `CREATED` |
| Approved memory evidence | `RELATED_TO` (memory→entity, entityLinks), `SUPERSEDES`, `MENTIONED_IN` |

## DEFERRED (20)

`organization, user, role, contact, product, repairAction, student, document, automation, automationRun,
agent, aiRecommendation`-adjacent supporting types, `learningObservation, learningProposal, learningRule,
metricDefinition, metricObservation, governancePolicy, governanceRisk, governanceIncident,
submissionDeliverable` — each is a derivable node; their edges are scheduled for a later coverage pass.
(Exact membership in `DERIVATION_STATUS`.)

## EXCLUDED (2)

`auditEvent` (raw content is redaction-mandatory; never a plain node) · `agentEvent` (append-only agent
log; agents are hard-banned from it and it carries no cross-entity graph value as a node).

## Seed-fixture snapshot metrics (single synthetic org, `allowOrgInheritance`)

- **Nodes: 132 · Edges: 83**
- Authority: **CANONICAL 10 · DERIVED 71 · UNVERIFIED 2** · REJECTED 0
- Provenance: **EXPLICIT 11 · FOREIGN_KEY_DERIVED 66 · INFERRED 6**
- Unmappable 0 · duplicateEdges 0 · orphanReferences 0 · issues: 14 error / 21 warning / 169 info

**On the 14 error issues (expected, honest):** the seed's customers carry their own concrete org
(`org-2`/`org-3`) while their child records inherit the single test-context org, so those cross-org edges
are correctly **refused** (`CROSS_ORGANIZATION`) — a mixed-org fixture artifact, not a defect. A real
per-organization snapshot (each customer's true org) would not produce them.
