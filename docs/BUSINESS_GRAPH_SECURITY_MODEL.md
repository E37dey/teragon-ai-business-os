# TERAGON Business Graph — Security Model (Phase 1 Discovery)

How a future graph traversal layer must enforce security, expressed against **existing** primitives it
should reuse (not reinvent). Read-only audit; cites `file:symbol`. No enforcement code was written.

> **Honesty caveat (pervasive in the codebase):** there is **no real authentication** — the app runs as
> a single CEO identity in demo mode (`AUTHZ_DEMO_LABEL_HE = "סימולציית הרשאות במצב הדגמה"`,
> `authorization/permissions.ts:18`). The graph's gates are a *governance simulation* and must be
> labeled as honestly as the rest of the app. Several enforcement points below are **documented seams
> that are not yet active** — the graph is precisely where some should finally be enforced.

## 1. Organization isolation

Single-org today; the boundary field already exists. `AuthzContext.orgId` is always `DEMO_ORG_ID =
"org-1"` and is **ignored** by `canInContext()` / `guardedMutationInContext()` today
(`authorization/matrix.ts:24-79`, `guardedMutation.ts:29-36`). The `Organization` entity is a **client
account**, not the tenant. Only `Customer.organizationId` and `MemoryRecordV2.organizationId` carry an
org (the latter inconsistently set to `org-teragon`, which is not in `organizations` — a dangling risk).

**Requirement:** thread `ctx.orgId` on every node and edge and filter on it **now** (a no-op today) so
multi-tenant enforcement has its home. **Never** rely on "there is only one org" as isolation. No
traversal may cross from one org's `Customer`/`MemoryRecordV2` to another's.

## 2. Roles & permissions (reuse, do not duplicate)

9 canonical roles (`CANONICAL_ROLE_IDS`, `administration/types.ts:95`): sysadmin, ceo, bizmgr, sales,
service, instructor, champion, auditor, viewer. Permission model = **per-domain grant level**: 13
`PERMISSION_DOMAINS` × 4 ranked `GRANT_LEVELS` (`none < read < write < approve`, `types.ts:36-80`),
deep-frozen in `CANONICAL_ROLE_BASELINES` (`administration/roles.ts:26`). The 9×24 permission grid is
computed **once** from the baselines (`matrix.ts:55-64`) — there is **no hand-kept second matrix**.

**Reuse:** `can(role, permission)` / `canInContext(ctx, permission)` (`matrix.ts:72,77`),
`requirePermission` (throws `AUTHZ_DENIED`), `guardedMutation`/`guardedMutationInContext` (the mutation
seam, `guardedMutation.ts:19,29`), and invalid-combination guards `roleGrantViolations()` /
`assertValidCombination()` (`administration/guards.ts`, rules R1–R4, incl. R3: sales barred from
`memory-restricted`).

## 3. Entity / domain sensitivity

Memory sensitivity is a 4-level ordered scale (`MemorySensitivity`, `memory/types.ts:55`):
`ציבורי(0) < פנימי(1) < רגיש(2) < מוגבל(3)`. `HIDDEN_SENSITIVITIES = ["רגיש","מוגבל"]`,
`isHiddenSensitivity()` (`integration/customer360MemoryExtras.ts:16`). Hidden bodies are shown only
behind an explicit **reveal-with-reason**; projections are approved-only with `sensitiveCount` surfaced.
Separately, `memory-restricted` vs `memory-general` are distinct permission domains.

**Pinned limitation the graph must fix:** the evidence validator does **not** refuse a sensitive record
as evidence "because that would require an auth/viewer model"
(`tests/wave7-security/gateEvidenceMemorySensitivity.security.test.ts:16`). Sensitivity is enforced at
the *reveal* layer, not the *linkage* layer. **The graph traversal layer is that missing viewer model**
— it must refuse the sensitive body on the node/edge (return title/label only), and require + audit a
reveal reason before any body crosses a hop.

## 4. Human-approval boundary ("AI proposes, only a NAMED human approves")

Enforced structurally in three independent places:
1. **Type-level:** `HumanUserId` is branded; its only constructor `toHumanUserId()` **throws on any
   `ag-*` id** (`administration/guards.ts:56`). Self-approval blocked by `assertHumanApprover(approver,
   requester)` (`:78`).
2. **One canonical `ApprovalEngine`** (`agents/approvalEngine.ts`): lifecycle `pending → approved|edited|
   rejected → execute → verify → audit`; `execute()` throws `AGENT_EXECUTION_WITHOUT_APPROVAL` (`:255`).
   Agents create the *request* (`requestApproval`, `requestedById`); a human supplies `decidedById`.
3. **Agent definitions declare `approvalRequiredFor`** (the 12 `ApprovalRequiredAction`s,
   `agents/types.ts:50`); `AUTONOMOUS_OPERATIONS` (read/draft/recommend/summarize/classify/search/
   explain) are the only unapproved acts.

`CEO_USER_ID = "u-tzachi"` (`seed/seedData.ts:67`, mapped to `crole-ceo`) is the seeded top approver.

**Requirement:** an `APPROVED_BY`/decides edge may only originate from a node satisfying `HumanUserId`
(never `ag-*`) and never equal the requester. Any agent-created edge is **proposed**, never
authoritative, until a human-approval edge exists. Every mutating/outbound hop passes the one engine.

## 5. Approved-source / lifecycle gates (authoritative vs not)

| Entity | Field | Authoritative when |
|---|---|---|
| Knowledge | `approval.state` + `isAuthoritative(article, now)` (`knowledge/types.ts:194`) | `מאושר` AND not archived AND effective now AND not past `reviewDate` |
| Memory | `approvalState` / `archivedAt` (`memory/selectors.ts:57`) | `מאושר` AND `archivedAt === null` |
| Governance policy | `status` + `effectiveAt` (`governance/types.ts:91`) | `פעילה` with named approval (no auto/anonymous) |
| Quotation | `status` (`types.ts`) | `אושרה` |
| Memory source | `verified:boolean` (`memory/types.ts:227`) | referenced record verified to exist |
| Stage gate / decision | Go/No-Go decision | decided |

Route knowledge trust through `isAuthoritative()` / `mayUseAsEvidence()` (`knowledge/evidenceEligibility.ts:22`);
`nonAuthoritativeReasonHe()` gives the honest reason.

## 6. Archived / superseded handling

Exclude `archivedAt !== null` (memory) and `archived === true` (knowledge). Every memory/knowledge
selector already does this (`memory/selectors.ts:57-172`; `buildLinkGraph` drops archived nodes at
`:161`). Treat `supersedesId` / `supersededByVersion` chains as **historical** — traversable for
lineage/audit, never returned as current truth. Immutable version stores reject update/remove
(`MemoryVersion` `:260`, `KnowledgeVersion`, `GovernancePolicyVersion` w/ sha-256).

## 7. Query audit

Every graph query must create an audit record via the existing single sink `writeAudit(stores, runId,
clock, {actor, action, entityRef, detailsHe, correlationId?})` (`agents/runlog.ts:39`) — pass `actor` =
querying identity, `action` = `graph.query` / `graph.traverse`, `entityRef` = root node, a traversal
`correlationId`. Expose via existing `AuditQuery` + `buildAuditExport` (redacted) (`governance/
auditExplorer.ts`). Raw `AuditEvent.details` may contain secrets — redact before indexing.

## 8. Agent-specific graph views (deny-by-default)

`canAgent(agentId, operation, domain)` is **deny-by-default** (`agents/definitions.ts:276`): true only if
the agent is one of 7, the op is granted, the domain is not in `prohibitedDomains` (hard ban wins), and
the domain is in `allowedDomains`. **All 7 hard-ban `approvals, auditEvents, users, roles`** and have
`maxUsageBudgetILS: 0`. Each agent's view window:

| Agent | May READ (allowedDomains) | May PROPOSE (approvalRequiredFor) | Extra hard-ban |
|---|---|---|---|
| Orchestrator | agents/agentRuns/agentTasks/messages/handoffs/conflicts/events/errors | — (plan/dispatch/synthesize only) | — |
| Hunter | customers, leads, products, printerModels, quotations, activities | customer-message, quotation-change, price-change, discount | serviceTickets |
| Fixer | printerModels, customerPrinters, serviceTickets, repairActions, knowledgeNotes, aiRecommendations, evidence | ticket-closure, customer-message, external-notification | quotations |
| Mentor | courses, students, enrollments, learningPaths, courseSessions, assignments, trainingMaterials | customer-message, external-notification | quotations |
| Nexa (marketing/growth) | leads, customers, activities, meetings, products | customer-message, external-notification, financial-commitment | serviceTickets |
| Wiki | knowledgeNotes, memoryRecords, aiRecommendations, evidence, documents + Wave-6 knowledge*/memory* | permanent-knowledge-update, permanent-memory-update, record-deletion | quotations |
| Flow (automations) | automations, automationRuns, tasks, notifications | external-automation, external-notification | customers |

A traversal **on behalf of an agent** must gate every hop through `canAgent(agentId, op,
collectionKey)`. Derive from the frozen `AGENT_DEFINITIONS` / `AgentPermissionView` — never duplicate.

## 9. Prohibited cross-domain traversal paths (enforce)

1. No cross-organization traversal (filter every hop by `ctx.orgId`).
2. Agent view windows are hard walls: e.g. Hunter must never reach `serviceTickets`; Flow never reaches
   `customers`; **no agent** reaches `users`/`roles`/`approvals`/`auditEvents`.
3. A sensitive memory body (`רגיש`/`מוגבל`) must never be delivered because a node is *connected* —
   title/label only, reveal-with-reason + audit.
4. Rejected/unverified evidence (`פסולה`, `MemorySource.verified:false`, rejected memory/knowledge) is
   never a valid source.
5. Draft/pending/disputed/expired knowledge is never authoritative (`isAuthoritative()`).
6. Archived/superseded nodes excluded from the authoritative graph (lineage-only).
7. AI-proposed → human-approved boundary is never crossed silently.
8. Every graph query is audited.
9. Protected prompt content and secret payloads are checksum/label-only, never reconstructed.

## 10. Traversal, cycle & resource limits (to be specified in Phase 2 contracts)

The domain has natural cycles (memory backlinks, agent handoff graphs, supersedes chains). A traversal
service MUST enforce: organization boundary (required), permission + agent-view filtering (required),
max depth, max nodes, max paths, timeout, cancellation, and **no unlimited recursive traversal** —
with visited-set cycle detection (memory `supersedesId` chains and `MemoryLink` graphs can loop). Every
returned path must carry: nodes, relationships, evidence, source versions, permissions applied,
limitations, and traversal method (see IMPLEMENTATION_PLAN §Traversal). These limits are **specified,
not implemented**, in Phase 1.
