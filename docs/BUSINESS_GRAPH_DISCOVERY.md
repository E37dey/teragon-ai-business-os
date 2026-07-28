# TERAGON Business Graph — Phase 1 Discovery

**Branch:** `feature/teragon-business-graph` (from green baseline `main` @ `38cfbaa`).
**Status:** Discovery only — **no graph models, storage, APIs, UI, traversal, agent integration, or
Copilot were implemented.** This document set maps the existing domain so a later phase can build a
*derived, read-only, permission-gated* relationship index over the canonical repositories.

Companion documents:
- [`BUSINESS_GRAPH_ENTITY_MAP.md`](BUSINESS_GRAPH_ENTITY_MAP.md) — every canonical entity.
- [`BUSINESS_GRAPH_EDGE_MAP.md`](BUSINESS_GRAPH_EDGE_MAP.md) — candidate typed relationships.
- [`BUSINESS_GRAPH_SECURITY_MODEL.md`](BUSINESS_GRAPH_SECURITY_MODEL.md) — traversal security.
- [`BUSINESS_GRAPH_IMPLEMENTATION_PLAN.md`](BUSINESS_GRAPH_IMPLEMENTATION_PLAN.md) — later phases (not built).

---

## 1. Method

Read-only audit of `src/domain/**` (Wave-1 `types.ts` + Wave-5/6/7/8 sub-modules), `src/repositories/**`
(collection registry + seed), `src/**/selectors.ts`, `src/integration/**`, `src/authorization/**`, and
`src/agents/**`. Every claim in the companion docs cites `file:symbol`. No files under `src/` were
modified.

## 2. Headline counts

| Measure | Count |
|---|---|
| Canonical entities mapped | **48** (37 requested first-class + 11 supporting: e.g. CustomerPrinter, RepairAction, AgentRun events, MemorySource/Version/Link, KnowledgeSource/Version, SubmissionPackage) |
| Requested entities that are **not first-class** | 4 (Permission, Training-progress, a single "Printer", a standalone Agent-run timeline) |
| Candidate typed relationships | **~93** |
| — explicit (dedicated link/join record) | ~35 |
| — inferred from a foreign-key field | ~40 |
| — stored as a polymorphic `"kind:id"` string | ~25 fields |
| — ambiguous / name-matched / missing | ~12 |
| Entities with a **duplicate/legacy** representation | 8 (Role, Memory, Knowledge, Risk, Incident, Persona, TrainingMaterial, and same-collection polymorphism in `roles`/`memoryRecords`/`governanceIncidents`/`accessChangeRequests`) |
| Relationship types (closed union) proposed | **22** (see EDGE_MAP §1) |

## 3. The five findings that shape the whole design

1. **Single-organization today, but the boundary seam already exists.** The app runs as one CEO
   identity in demo mode; `AuthzContext.orgId` is always `DEMO_ORG_ID = "org-1"` and is *ignored* by
   `canInContext()` today (`src/authorization/matrix.ts:24-79`). The `Organization` entity models a
   **client** account, not the tenant. **The graph must thread `orgId` on every node/edge now** (a
   no-op today) so multi-tenant isolation has the home the code reserved — never rely on "there is only
   one org" as the isolation mechanism.

2. **Two parallel edge philosophies.** Wave-1 core connects entities with **polymorphic `"kind:id"`
   free-text strings** (`Task.relatedRef`, `Activity.entityRef`, `Approval.subjectRef`,
   `Evidence.subjectRef/sourceRef`, `AuditEvent.entityRef`, `AIRecommendation.entityRef`). Waves 6-8
   (memory, knowledge, learning, adoption, submission, stage-gates) use **structured, collection-scoped,
   approval-gated** refs (`MemoryEntityLink {collection,entityId,label}`, `EvidenceRef`,
   `SubmissionEvidenceRef`, type-tagged `StageGateEvidenceRef`). The graph must **normalize the string
   refs to the structured form** and treat the new-wave links as the reference design.

3. **Approval is the single authoritative-edge gate, and it is consistent.** An edge becomes
   graph-authoritative only after a **named human** approval — enforced by one `ApprovalEngine`
   (`AGENT_EXECUTION_WITHOUT_APPROVAL`), the `HumanUserId` branded type (constructor throws on any
   `ag-*` id), `isAuthoritative()` for knowledge, `approvalState:"מאושר"` for memory, `status:"אושרה"`
   for quotations, and Go/No-Go for gates. Draft/agent-proposed edges exist but must be tagged
   *provisional*, never authoritative.

4. **The codebase already models dangling/superseded honestly** — `MemoryLink.resolution` has
   first-class `broken`/`ambiguous`/`unresolved` states; `EvidenceRef | null ⇒ "חסרה ראיה"`;
   `KnowledgeUsage.supersededByVersion` is a marker, never a rewrite; archived records are excluded by
   every memory/knowledge selector. The graph should **adopt these same first-class edge states** rather
   than silently dropping edges.

5. **Sensitivity is currently enforced at the render/reveal layer, not the linkage layer.** Memory
   `רגיש`/`מוגבל` bodies are hidden behind reveal-with-reason; evidence projections are title-only. A
   pinned test states the validator does **not** refuse a sensitive record as evidence "because that
   would require an auth/viewer model." **The graph traversal layer is precisely that missing viewer
   model** — it must refuse sensitive bodies on the edge/node, not merely on the screen, and audit every
   reveal.

## 4. Biggest migration risks (detail in ENTITY_MAP §Risks and EDGE_MAP List 3/4)

1. Polymorphic `"kind:id"` string references with no referential integrity (top hazard).
2. Same-collection polymorphism (`roles`, `memoryRecords`, `governanceIncidents`, `accessChangeRequests`)
   — the node factory must branch on a discriminator (`recordKind`, `memoryLayer`, `source`).
3. An invented/inconsistent tenant org id: `MemoryRecordV2.organizationId = "org-teragon"`, which does
   **not** exist in the `organizations` collection (would dangle).
4. Denormalized name/summary fields (`customerName`, `studentName`, `printer`, `printerSummary`,
   `courseNames`) that silently detach when the source is renamed — prefer the id FK, treat names as
   display only.
5. Embedded-array targets (`StageProgress.stageId`, `Assignment.stageId`, `Document.stageId` point at
   `LearningPathStage.id` *inside* `LearningPath.stages[]`) — not resolvable by a top-level lookup.
6. String keys vs record ids (`MetricObservation.metricKey → MetricDefinition.key`, `User.role → Role.key`,
   governance/policy/risk keyed by `key` not `id`).

## 5. What Phase 1 deliberately did NOT do

No `BusinessGraphNode`/`Edge` types, no derived index, no storage, no `BusinessGraphService`, no
traversal, no evidence-path/impact/conflict logic, no `/business-graph` route or components, no agent
graph integration, no voice, no Copilot changes, no deployment. Those are scoped in
`BUSINESS_GRAPH_IMPLEMENTATION_PLAN.md` for review **before** any code is written.
