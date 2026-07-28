# TERAGON Business Graph — Edge Map (Phase 1 Discovery)

Candidate typed relationships between canonical entities. Read-only audit; cites `file:field`.
~**93** candidate edges catalogued. See [`BUSINESS_GRAPH_DISCOVERY.md`](BUSINESS_GRAPH_DISCOVERY.md).

## 1. Proposed relationship type union (CLOSED — no arbitrary strings)

```
OWNS · CONTACT_FOR · CREATED · ASSIGNED_TO · RELATED_TO · USES · SUPPORTED_BY ·
RESOLVED_BY · RECOMMENDED · APPROVED_BY · REJECTED_BY · GENERATED_TASK ·
ENROLLED_IN · PURCHASED · QUOTED_FOR · SERVICED · MENTIONED_IN · DERIVED_FROM ·
SUPERSEDES · CONTRADICTS · VERSION_OF · AUDITS
```

Each edge below maps to one of these. Every edge carries: `sourceNodeId`, `targetNodeId`,
`relationshipType`, `direction`, `confidence`, `evidence`, `approvalState`, `validFrom/validUntil`,
`version`, `organizationId` (see IMPLEMENTATION_PLAN §Contracts).

## 2. Representation classification (why it matters)

| Class | Meaning | Graph handling |
|---|---|---|
| **(a) EXPLICIT** | dedicated link/join record (`MemoryLink`, `Enrollment`, `Approval`, `AgentRun`, `Evidence`) | index directly; carry the record's own state |
| **(b) INFERRED** | scalar `xxxId` FK field | index with an **existence check** on the target |
| **(c) STRING** | polymorphic `"kind:id"` free-text ref | **parse + resolve + validate**; drop/flag if unresolved |
| **(d) AMBIGUOUS** | resolved by name/substring match, or missing | **do not auto-index as authoritative**; flag for review |

## 3. Edge catalogue by cluster (representative — full list in the audit; every row cites a field)

### CRM / Sales
| Edge | Source → Target | Card | Class | Field | Approval-gated | Stale risk |
|---|---|---|---|---|---|---|
| OWNS | Organization → Customer | 1:N | (b) | `Customer.organizationId` (`types.ts:148`, nullable) | no | med |
| CONTACT_FOR | Contact → Customer | N:1 | (b) | `Contact.customerId` (`:161`) | no | med |
| ASSIGNED_TO | Lead → User | N:1 | (b) | `Lead.ownerId` (`:187`) | no | med |
| DERIVED_FROM | Opportunity → Lead | N:1 | (b) | `Opportunity.leadId` (`:195`) | no | **high** |
| RELATED_TO | Opportunity → Customer | N:1 | (b) | `Opportunity.customerId` (`:196`) | no | med |
| QUOTED_FOR | Quotation → Customer | N:1 | (b)+string name | `Quotation.customerId` (`:219`) + `customerName` | authoritative when `status:"אושרה"` | **high** |
| USES | QuotationLine → Product | N:1 | (b) | `QuotationLine.productId` (`:214`) | no | high (product deletable) |

### Printers / Service
| Edge | Source → Target | Card | Class | Field | Stale risk |
|---|---|---|---|---|---|
| OWNS | CustomerPrinter → Customer | N:1 | (b) | `CustomerPrinter.customerId` (`:256`) | med |
| USES | CustomerPrinter → PrinterModel | N:1 | (b) | `.printerModelId` (`:257`; null-guarded in `search.ts:371`) | high |
| SERVICED | ServiceTicket → Customer | N:1 | (b)+string `printer` | `.customerId` (`:356`), `printer:string` (`:357`) | **high** (printer is free text, not a `cp-*` FK) |
| RESOLVED_BY | RepairAction → ServiceTicket | N:1 | (b) | `.ticketId` (`:371`) | med |

### Learning / Courses
| Edge | Source → Target | Card | Class | Field |
|---|---|---|---|---|
| ASSIGNED_TO | Course → User (instructor) | N:1 | (b) | `Course.instructorId` (`:281`) |
| ENROLLED_IN | Enrollment → Course + Student | N:1 | (b)+string `studentName` | `.courseId`/`.studentId` (`:324,326`) |
| USES | LearningPath → Course | N:1 | (b) | `.courseId` (`:297`) |
| RELATED_TO | Assignment → Course/Stage | N:1 | (b) embedded | `.courseId`/`.stageId` (`:343,344`) — `stageId`→embedded |

### Work / activity
| Edge | Source → Target | Card | Class | Field |
|---|---|---|---|---|
| ASSIGNED_TO | Task → User | N:1 | (b) | `Task.ownerId` (`:388`) |
| RELATED_TO | Task → any entity | N:1 | **(c)** | `Task.relatedRef` `"customer:cu-3"` (`:390`) |
| MENTIONED_IN | Activity → actor + entity | N:1 | (b)+**(c)** | `.actorId` (`:415`), `.entityRef` (`:416`) |
| RELATED_TO | Document → Course/Stage/Customer | N:1 | (b) | `.courseId/.stageId/.customerId` (`:425-430`) |

### AI agents / orchestration
| Edge | Source → Target | Card | Class | Field |
|---|---|---|---|---|
| GENERATED_TASK | AgentTask → Agent | N:1 | (b) | `.agentId` (`:508`) |
| RECOMMENDED | AIRecommendation → Agent | N:1 | (b) | `.agentId` (`:545`) |
| SUPPORTED_BY | AIRecommendation → Evidence[] | N:N | **(c) array** | `.evidenceIds` (`:550`) |
| APPROVED_BY | AIRecommendation → Approval | 1:1 | (b) | `.approvalId` (`:556`) |
| RELATED_TO | AIRecommendation → any entity | N:1 | **(c)** | `.entityRef` (`:557`) |
| RECOMMENDED (handoff) | AgentHandoff → Agent(from/to)+Task | N:1 | (b) | `.fromAgentId/.toAgentId/.taskId` (`:527-529`) |
| CONTRADICTS | AgentConflict → Agent[]+Task | N:N | (b) array | `.agentIds/.taskId` (`:536,537`) |
| (groups) | AgentRun → Task/Conflict/Approval/Agent | 1:N | **(c) arrays** | `.taskIds/.conflictIds/.approvalIds/.specialistAgentIds` (`agents/types.ts:198-200`) |

### Evidence / Approval / Audit spine
| Edge | Source → Target | Card | Class | Field |
|---|---|---|---|---|
| SUPPORTED_BY | Evidence → subject | N:1 | **(c) ×2** | `.subjectRef` + `.sourceRef` (`:561,565`) |
| APPROVED_BY | Approval → subject | 1:1 | **(c)** | `.subjectRef` `"agent-task:at-1"` (`:570`) + `requestedById`/`decidedById` |
| AUDITS | AuditEvent → entity | N:1 | **(c)** | `.entityRef` (`:587`) + `actor` + `correlationId` |

### Memory governance (richest EXPLICIT model)
| Edge | Source → Target | Card | Class | Field |
|---|---|---|---|---|
| RELATED_TO | MemoryRecordV2 → domain entity | N:N | **(a) typed** | `entityLinks[] {collection,entityId,label}` (`memory/types.ts:91`) |
| MENTIONED_IN | MemoryLink → MemoryRecordV2 | N:1 | **(a)** join w/ `resolution` (`broken/ambiguous/unresolved`) | `.fromRecordId/.resolvedRecordId` (`:246,251`) |
| SUPERSEDES | MemoryRecordV2 → MemoryRecordV2 | 1:1 | (b) | `.supersedesId` (`:138`) |
| SUPPORTED_BY | MemoryRecordV2 → MemorySource[] | N:N | (c)+`refId` string | `sourceIds` (`:124`), `MemorySource.refId` (`:220`) |
| VERSION_OF | MemoryVersion → MemoryRecordV2 | N:1 | (a) immutable | `.recordId/.previousVersionId` (`:265,266`) |
| CONTRADICTS | MemoryConflict → proposal+record | 1:1 | (b) | `.proposalId/.recordId` (`:317,318`) |

### Knowledge / Learning / Governance / Submission
Full rows in the audit; key edges: `KnowledgeArticleV2 —USES→ PrinterModel[]` (`supportedPrinterModels`,
string array); `KnowledgeSource —SUPPORTED_BY→ real record` (`ref` string); `LearningRule —DERIVED_FROM→
LearningProposal` (`.proposalId`, named-approval mandatory); `LearningProposal —SUPPORTED_BY/CONTRADICTS→
records` (`supportingRecordIds`/`contraryRecordIds`); `GovernancePolicy —RELATED_TO→ Agent[]`
(`affectedAgentIds`); `GovernanceIncident —RELATED_TO→ AuditEvent[]/Risk[]/Review`; `SubmissionEvidence
—SUPPORTED_BY→ record` (typed `SubmissionEvidenceRef`, nullable ⇒ "חסרה ראיה").

---

## 4. The four required lists

### List 1 — Relationships ALREADY EXPLICIT (dedicated link/join record — safest to index)
`MemoryEntityLink` (collection-scoped, labeled) · `MemoryLink` (with `broken/ambiguous/unresolved`
states + `candidateIds`) · `MemoryVersion/Usage/Conflict` · `KnowledgeSource/Version/Usage/Conflict/
Review` · `LearningObservation/RecommendationOutcome/Proposal/Evidence/Rule(+Version+Rollback)` ·
`GovernancePolicyVersion/Review/PromptVersionRecord` · `Evidence/Approval/AuditEvent` (spine — *but
their targets are strings, see List 3*) · `AgentRun/EventRecord/ErrorRecord/Message/Handoff/Conflict` ·
`ImplementationEvidence/Decision/PilotResult` (typed `EvidenceRef`) · `StageGateEvidenceRef` (type-tagged)
· `SubmissionEvidence/Validation/Blocker/Snapshot` · `PersonaMaterialLink` (version-pinned) · `Contact/
RepairAction/CustomerPrinter/Enrollment/CourseSession/LearningPath` (FK-based join tables).

### List 2 — Relationships INFERRED from foreign keys (index with existence check)
`Customer.organizationId` · `Contact.customerId` · `Lead.ownerId` · `Opportunity.{leadId,customerId,
ownerId}` · `Quotation.{customerId,ownerId}` · `QuotationLine.productId` · `CustomerPrinter.{customerId,
printerModelId}` · `Course.instructorId` · `LearningPath.courseId` · `Student.userId` · `Enrollment.
{studentId,courseId}` · `CourseSession.{courseId,attendance[].studentId}` · `Assignment.{courseId,
stageId}` · `ServiceTicket.customerId` · `RepairAction.{ticketId,performedById}` · `Task.ownerId` ·
`Meeting.participantIds` · `Activity.actorId` · `Document.{courseId,stageId,ownerId,customerId}` ·
`AppNotification.ownerId` · agent FKs (`AgentTask.agentId/approvalId`, message/handoff/conflict,
`AIRecommendation.agentId/approvalId`, `AgentEventRecord.runId`) · memory/knowledge/learning/governance/
adoption/personas FKs (see per-cluster tables).

### List 3 — Relationships stored as STRINGS (the top hazard — exact fields)
`Task.relatedRef` · `Meeting.relatedRef` · `Activity.entityRef` · `AIRecommendation.{entityRef,
evidenceIds[]}` · `AgentTask.evidenceIds[]` · `AgentRun.{taskIds,conflictIds,approvalIds,
specialistAgentIds}[]` · `Evidence.{subjectRef,sourceRef}` · `Approval.subjectRef` · `AuditEvent.
{entityRef,actor,correlationId}` · `Risk.controlIds[]` · `Control.evidenceIds[]` · `GovernanceRisk.
{controlIds[],sourceRef}` · `GovernanceReview.subjectRef` (kind-tagged) · `GovernanceIncident.
{relatedAuditEventIds,relatedRiskIds}[]` · `MemoryRecordV2.{sourceIds,wikiLinks,backlinks}[]` ·
`MemorySource.refId` · `KnowledgeArticleV2.{supportedPrinterModels,supportedMaterials,
troubleshootingCategories,sourceIds}[]` · `KnowledgeSource.ref` · `KnowledgeNote.sourceRef` ·
`LearningObservation.sourceRef` · `LearningProposal.{supportingRecordIds,contraryRecordIds}[]` ·
`LearningEvidence.sourceRef` · `ImplementationDecision.evidenceIds[]` · `StageGateEvidenceRef.refId`
(type-tagged) · `SubmissionValidationRecord.affectedRecord` · `serviceMemoryHooks` outputs
(`"serviceTicket:${id}"`, `"repairAction:${id}"`, `"supportRequest:${id}"`).

### List 4 — AMBIGUOUS / MISSING / UNSAFE-to-index

**Ambiguous / name-matched (do NOT auto-index as authoritative):**
- Memory↔Customer resolves by **name containment**, not FK (`modules/customers/selectors.ts:68`;
  `integration/customer360Memory.ts:33` falls back to name). Homonyms collide; renames detach.
- Proposal↔Customer (`proposalMatchesCustomer`) — substring heuristic.
- `Customer.printerSummary`/`courseNames[]` — free-text mirrors of real edges.
- `ServiceTicket.printer` — free text, not `CustomerPrinter.id` (the "serviced-a-specific-printer" edge is missing).
- Denormalized `customerName`/`studentName` alongside nullable id FKs.
- Embedded-array targets: `StageProgress.stageId`, `Assignment.stageId`, `Document.stageId` → `LearningPathStage.id`.
- `Customer.revenue ↔ approved quotations` — documented invariant, no materialized edge.

**Missing (arguably should exist):** Opportunity→Quotation · ServiceTicket→CustomerPrinter ·
Product→QuotationLine reverse.

**UNSAFE — must NOT be indexed as authoritative (exclude or hard-gate):**
- Non-authoritative knowledge — anything failing `isAuthoritative()` (draft/pending/`שנוי במחלוקת`/
  rejected/archived/expired), `knowledge/types.ts:194`.
- Non-approved / archived memory — `approvalState !== "מאושר"` or `archivedAt !== null`
  (`memory/selectors.ts:57`).
- Rejected / contrary evidence — `MemoryConflict`, `KnowledgeConflict`, `LearningProposal.
  contraryRecordIds`; `evidenceBasis:"correlation"` never surfaced as causation.
- Sensitive memory bodies — `sensitivity ∈ {רגיש, מוגבל}` gated (see SECURITY_MODEL).
- Broken/ambiguous wikilinks — `MemoryLink.resolution ∈ {broken,ambiguous,unresolved}` (already dropped
  by `buildLinkGraph`, `memory/selectors.ts:167`).
- Protected prompt content — `PromptVersionRecord` stores checksum only (`protectedTextStored:false`).
- Raw audit `details` — redaction-mandatory before indexing.
- Draft integration-hook edges — `serviceMemoryHooks` outputs are born `"ממתין לאישור"` (`assertDraftOnly()`).
