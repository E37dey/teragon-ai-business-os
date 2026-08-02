# TERAGON Business Graph — Entity Map (Phase 1 Discovery)

Every canonical business entity, its authoritative source, and the fields a graph node factory needs.
Read-only audit; cites `file:symbol`. See [`BUSINESS_GRAPH_DISCOVERY.md`](BUSINESS_GRAPH_DISCOVERY.md).

**Conventions:** every persisted record extends `BaseEntity {id, createdAt, updatedAt}` (`src/domain/types.ts`).
`ISODate` = string. Ids are plain strings (no UUID/branding except `HumanUserId`). "Org-scoped?" = does
the record carry an `organizationId` (only Customer and MemoryRecordV2 do). "runtime-gen" = collection
seeds to `[]` and ids are engine-generated at runtime, so **no fixed id format exists**.

---

## Master table

| # | Entity | Type (file) | Repository (collection) | Id format | Org-scoped | Owner | Sensitivity | Lifecycle states | Versioned | Approval-gated | Read agents | Propose agents |
|---|--------|-------------|------------------------|-----------|:----------:|-------|-------------|------------------|:---------:|:--------------:|-------------|----------------|
| 1 | Organization | `types.ts:114` | `organizations` | `org-1` | is-the-org | — | — | EntityStatus (פעיל/לא פעיל/בארכיון) | no | no | Hunter, Nexa | — |
| 2 | User | `types.ts:125` | `users` | `u-maya` | no | self | — | EntityStatus | no | admin action | (identity — no agent) | — (never) |
| 3 | Role (legacy) | `types.ts:134` | `roles` (mixed) | `role-1` | no | — | — | — | no | admin | — | — |
| 3b | RoleDefinition (canonical) | `administration/types.ts:121` | `roles` (`recordKind:"canonical-role"`) | `crole-sales` | no | — | — | — | no | admin approval | — | — |
| 4 | Permission | *enum, not persisted* | none (`PERMISSION_DOMAINS`×`GRANT_LEVELS`) | — | no | — | — | — | — | — | — | — |
| 5 | Customer | `types.ts:141` | `customers` | `cu-1` | **yes** | — | — | EntityStatus + contactState | no | no | Hunter, Nexa, Fixer, Mentor | Hunter, Nexa |
| 6 | Contact | `types.ts:159` | `contacts` | `ct-1` | via customer | — | — | — | no | no | Hunter | Hunter |
| 7 | Lead | `types.ts:177` | `leads` | `l-1` | no | ownerId | — | LeadStatus (8, funnel) | no | no | Hunter, Nexa | Hunter, Nexa |
| 8 | Opportunity | `types.ts:193` | `opportunities` | `opp-1` | no | ownerId | — | OpportunityStage (6) | no | no | Hunter | Hunter |
| 9 | Quotation | `types.ts:217` | `quotations` | `q-1` | no | ownerId | — | QuotationStatus (5) | `version?` edit counter | **yes** (discount/price/change) | Hunter | Hunter (needs approval) |
| 10 | Product | `types.ts:232` | `products` | `prod-1` | no | — | — | `active:boolean` | no | no | Hunter, Nexa, Fixer | — |
| 11 | PrinterModel | `types.ts:245` | `printerModels` | `pm-1` | no | — | — | — | no | no | Fixer, Hunter | — |
| 12 | CustomerPrinter (printer instance) | `types.ts:255` | `customerPrinters` | `cp-1` | via customer | — | — | — | no | no | Fixer | Fixer |
| 13 | ServiceTicket | `types.ts:354` | `serviceTickets` | `t-1` | no | ownerId | — | TicketStatus (6)+priority | `closedAt?` | **yes** (closure) | Fixer | Fixer (needs approval) |
| 14 | RepairAction (repair) | `types.ts:369` | `repairActions` | `ra-1` | no | performedById | — | — | no | no | Fixer | Fixer |
| 15 | Course | `types.ts:272` | `courses` | `c-1` | no | instructorId | — | CourseStatus (4) | no | no | Mentor | Mentor |
| 16 | Student | `types.ts:301` | `students` | `st-1` | no | userId? | — | EntityStatus | no | no | Mentor | Mentor |
| 17 | Enrollment (enrolment) | `types.ts:323` | `enrollments` | `en-1` | no | studentId | — | EnrollmentPayment | no | stage-level | Mentor | Mentor |
| 18 | StageProgress (training progress) | `types.ts:310` *embedded in Enrollment.stages* | — | `stageId` (non-global) | no | — | — | StageProgressStatus (8) | no | instructor approval | Mentor | Mentor |
| 19 | Task | `types.ts:382` | `tasks` | `task-1` | no | ownerId | — | TaskStatus (4) + `workState?` (6) | no | no | Flow | Flow |
| 20 | Document | `types.ts:419` | `documents` | `doc-1` | no | ownerId | `visible` | — | no | no | Mentor, Wiki | — |
| 21 | Automation | `types.ts:463` | `automations` | `auto-1` | no | — | — | `enabled` | no | **yes** (`requiresApproval`) | Flow | Flow (needs approval) |
| 21b | AutomationRun | `types.ts:475` | `automationRuns` | `ar-1` | no | triggeredBy | — | AutomationRunOutcome | no | no | Flow | Flow |
| 22 | Agent | `types.ts:495` | `agents` | `ag-hunter` | no | — | — | AgentStatus (5, incl. מושבת) | promptVersion | governance | Orchestrator | — |
| 23 | AgentRun (agent run) | `agents/types.ts:191` | `agentRuns` | runtime-gen | no | requestedById | — | AgentRunStatus (6) | no | run may await approval | Orchestrator | Orchestrator |
| 24 | AIRecommendation (recommendation) | `types.ts:544` | `aiRecommendations` | `rec-1` | no | agentId | — | (via approvalId) | no | **yes** (`approvalRequired`) | all specialist agents | all (propose only) |
| 25 | Approval | `types.ts:569` | `approvals` | `ap-1` | no | requestedById/decidedById | — | ApprovalStatus (3) + `extendedState?` (9) | no | **is the gate** | — (hard-banned for agents) | — |
| 26 | AuditEvent | `types.ts:582` | `auditEvents` | `ae-1` | no | actor | redacted on export | — | no | no | — (hard-banned) | — |
| 27 | MemoryRecord (legacy) | `types.ts:448` | `memoryRecords` (mixed) | `mem-1` | no | — | — | — | no | no | Wiki | — |
| 27b | MemoryRecordV2 | `memory/types.ts:105` | `memoryRecords` (has `memoryLayer`) | runtime-gen | **yes** (`org-teragon`⚠) | ownerId | **`sensitivity`** (ציבורי/פנימי/רגיש/מוגבל) | verificationState(6)+approvalState(4)+archivedAt | **immutable `MemoryVersion`** | **yes** (permanent-memory-update) | Wiki | Wiki (propose only) |
| 28 | KnowledgeNote (legacy) | `types.ts:437` | `knowledgeNotes` | `kn-1` | no | — | — | `approved:boolean` | no | yes | Wiki, Fixer | — |
| 28b | KnowledgeArticleV2 | `knowledge/types.ts:67` | `knowledgeArticles` | runtime-gen | no | authorId | `safetyNotes` | KnowledgeState (7) + `isAuthoritative()` | **immutable `KnowledgeVersion`** | **yes** | Wiki, Fixer | Wiki (propose only) |
| 29 | LearningObservation | `learning/types.ts:89` | `learningObservations` | runtime-gen | no | agentId? | — | (origin enum) | no | no | Wiki | Wiki |
| 30 | LearningProposal | `learning/types.ts:245` | `learningProposals` | runtime-gen | no | namedReviewerId | — | ProposalApprovalState (3) | no | **yes** (named reviewer) | Wiki | Wiki |
| 31 | LearningRule | `learning/types.ts:363` | `learningRules` | runtime-gen | no | approvedById | — | LearningRuleStatus (active/rolled-back) | **immutable version + rollback** | **yes** (min sample 2) | Wiki | — (approved only) |
| 32 | MetricDefinition (metric) | `types.ts:596` | `metricDefinitions` | `md-1` | no | — | — | `level` (עסקי/תפעולי/AI) | no | no | (analytics) | — |
| 32b | MetricObservation | `types.ts:606` | `metricObservations` | `mo-1` | no | — | — | `value:number\|null` | no | no | (analytics) | — |
| 33 | GovernancePolicy | `governance/types.ts:39` | `governancePolicies` | runtime-gen (`key`) | no | ownerId | — | PolicyStatus (4) | **immutable version + sha256** | **yes** (named, no auto) | — | — |
| 34 | Risk (legacy) | `types.ts:615` | `risks` | `risk-1` | no | ownerId | severity | פתוח/בטיפול/סגור | no | no | — | — |
| 34b | GovernanceRisk | `governance/types.ts:185` | `governanceRisks` | runtime-gen (`key`) | no | ownerId (named) | severity | GovernanceRiskState (6, guarded) | history[] | governance | — | — |
| 35 | GovernanceIncident | `governance/types.ts:230` | `governanceIncidents` (mixed w/ HealthIncident) | runtime-gen | no | reportedBy/assignedTo | severity | IncidentStatus (6) | no | close needs review | — | — |
| 35b | HealthIncident | `system-health/types.ts:155` | `governanceIncidents` (`source:"system-health"`) | runtime-gen | no | — | severity | (health) | no | — | — | — |
| 36 | SubmissionDeliverable | `submission/types.ts:66` | `submissionDeliverables` | `key` (12 canonical) | no | ownerId? | — | DeliverableState (6, "מלא" derived) | `SubmissionSnapshot` | **yes** (`approvalId`) | — | — |

*Supporting entities also mapped (not in the requested 37 but needed for edges): Meeting, Activity,
AppNotification, LearningPath, CourseSession, Assignment, AgentTask/Message/Handoff/Conflict,
AgentEventRecord/ErrorRecord, Evidence, Control, MemorySource/Link/Version/Usage/Conflict/Proposal,
KnowledgeSource/Version/Usage/Conflict/Question/Review, LearningEvidence/RuleVersion/Rollback,
GovernancePolicyVersion/Review, PromptVersionRecord, Persona(V2)/PersonaMaterialLink/Objection,
TrainingMaterial(V2), Implementation* (programme/milestone/evidence/decision/pilot), StageGate(V2),
SubmissionPackage/Evidence/Validation/Blocker/Snapshot, MetricAlert/ReportDefinition/Run.*

---

## Per-entity detail (fields beyond the table)

Full per-entity detail — cross-module foreign keys held, duplicate/legacy representations, and
migration risk — is captured field-by-field in [`BUSINESS_GRAPH_EDGE_MAP.md`](BUSINESS_GRAPH_EDGE_MAP.md)
(the outbound FKs of each entity are its edges). The security-relevant fields (sensitivity, approval,
lifecycle, archived/superseded, agent read/propose sets) are captured in
[`BUSINESS_GRAPH_SECURITY_MODEL.md`](BUSINESS_GRAPH_SECURITY_MODEL.md). Highlights:

### Entities requested but NOT first-class
- **Permission** — enum vocabulary (`PERMISSION_DOMAINS` 13 × `GRANT_LEVELS` 4) + free-string
  `Role.permissions`; derive permission nodes from the enum, not from records.
- **Training progress** — `StageProgress`, an array embedded in `Enrollment.stages`, keyed by a
  non-global `stageId` that points into `LearningPath.stages[]`. Must be synthesized.
- **"Printer"** — split into `PrinterModel` (catalog) + `CustomerPrinter` (instance);
  `ServiceTicket.printer` is free text, not an FK.
- **Agent-run timeline** — the run record exists but its events live in `agentEvents`/`agentErrors`.

### Duplicate / legacy representations (node factory must disambiguate)
| Concept | Legacy | Canonical | Discriminator |
|---|---|---|---|
| Role | `Role` (`role-*`) | `RoleDefinitionRecord` (`crole-*`) | `recordKind` / `"permissions" in rec` |
| Memory | `MemoryRecord` (`mem-*`) | `MemoryRecordV2` | presence of `memoryLayer` |
| Knowledge | `KnowledgeNote` (`knowledgeNotes`) | `KnowledgeArticleV2` (`knowledgeArticles`) | separate collections |
| Risk | `Risk` (`risks`) | `GovernanceRisk` (`governanceRisks`) | separate collections |
| Incident | `GovernanceIncident` | `HealthIncident` | `source:"system-health"` (same collection) |
| Persona | `Persona` | `PersonaV2` | separate types |
| TrainingMaterial | `TrainingMaterial` | `TrainingMaterialV2` | separate types |

### Migration-risk register (per DISCOVERY §4)
Polymorphic `"kind:id"` strings · same-collection polymorphism · invented `org-teragon` · denormalized
names · embedded-array target ids · string keys vs record ids. Each is the reason a node/edge factory
must be defensive (parse + existence-check + discriminator branch) rather than trusting a raw field.
