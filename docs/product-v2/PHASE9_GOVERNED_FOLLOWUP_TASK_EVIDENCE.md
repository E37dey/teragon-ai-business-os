# Phase 9 — Governed Follow-up Task (משימת מעקב מבוקרת) — evidence

Implements the ONE flagship selected by the Phase-9 audit
(`PHASE9_GOVERNED_CRM_MUTATION_AUDIT.md`): a real BusinessSignal → deterministic follow-up
recommendation → explicit proposal → existing ApprovalEngine → human approve/reject →
existing `task-creation` handler → exactly one persistent Task → read-back verification →
audit lineage → Command Center outcome. **No other CRM mutation is implemented.**

> **Phase 9 introduces no new canonical Agent action.**
> **Agents may recommend governed Task creation but cannot execute it directly.**
> **Task creation requires explicit human approval.**
> **The original CRM record is not mutated by the Phase-9 flagship.**
> **Task organization identity is derived from trusted application/session context.**
> **Only an explicit allowlist of Task fields may be proposed.**
> **Task execution is considered verified only after persisted read-back succeeds.**
> **Task creation uses deterministic idempotency protection.**
> **Lead, Ticket, Quotation and Task-update mutations remain outside Phase-9 scope.**
> **No automatic synchronization is implemented.**

## Why Task Creation (audit recap)
Task CREATE was chosen because it structurally avoids the two mandatory gates that blocked
every *update* candidate: there is **no stale-write surface** (nothing pre-existing is
overwritten — inverse is `delete-created`) and **no cross-org existing record** to violate.
Risk is LOW and reversible.

## Architecture (reuse only — no new engine, no new action)
- **`src/agents/governedTaskProposal.ts`** (new, pure trusted wrapper). Reuses the canonical
  **ApprovalEngine** and its first-class **`task-creation`** `ExecutionPayload` kind. It adds
  ONLY: a Task-field **allowlist**, a **deterministic id**, **trusted-actor binding**, and
  **read-back verification**. The `ApprovalRequiredAction` registry stays frozen at **12** —
  the approval reuses the existing `external-automation` category label; **no 13th approval
  action and no 15th Agent action are added** (`AGENT_ACTIONS` = 14, packs = 2, agents = 7,
  all unchanged and test-asserted).
- **`src/modules/command-center/GovernedFollowUpTaskModal.tsx`** (new) + a per-signal
  **"צור משימת מעקב"** CTA on `OperationsBrief` (Phase-7 Command Center — no second dashboard).

## Canonical flagship trigger — `workflow_failed` (exact, not "e.g.")
- **`BusinessSignal.type`:** **`workflow_failed`** (the single canonical Phase-9 trigger).
- **Deterministic condition:** `classifyRun` sees a `WORKFLOW_FAILED` event in a run's canonical
  Phase-5/6 event set → one `workflow_failed` signal (`status: "actionable"`, `priority: "דחוף"`).
- **Source entity/run:** the failed governed workflow run (Phase-5 `knowledgeWorkflow` /
  Phase-6 governed action). **Source id:** `signal.sourceId = workflowRunId` (also `workflowRunId`).
- **Priority derivation:** `workflow_failed` → META `"דחוף"` → Task priority `"גבוהה"`.
- **Route/context:** the signal's `deepLink` is `/ai-workspace?run=<runId>` (the workflow timeline);
  the follow-up CTA lives on the Command Center Action Inbox.
- **Why a follow-up Task is appropriate:** a *failed* governed workflow run genuinely needs tracked
  human remediation. A persistent Task captures that follow-up work item, distinct from the
  transient runtime signal. No fabricated urgency — the signal only exists when a real
  `WORKFLOW_FAILED` event was recorded. The demo, tests and evidence all use this SAME signal type.

## Approval semantic truth (authorization bucket vs. mutation)
The ApprovalEngine's `requestApproval` requires an `ApprovalRequiredAction` (a frozen registry of
**12**). Phase 9 adds none: it reuses `external-automation` **strictly as an internal
authorization-category enum** on the structured event. To prevent that enum from mislabeling the
mutation, `ApprovalEngine` now labels a first-class `task-creation` execution by its TRUE mutation
— **"יצירת משימה"** — in the persisted **approval note** and the **audit history**, never as
"אוטומציה חיצונית". So the canonical audit trail reads `נוצרה בקשת אישור: יצירת משימה` and the
user-visible modal states **"CREATE ONE TASK"** / **"משימת מעקב מבוקרת"**. A future auditor never
sees a Task creation presented as external automation. *(Any reused ApprovalEngine authorization
category is an internal authorization mechanism and does not change the user-visible mutation
truth: CREATE ONE TASK.)*

## Recommendation ≠ proposal
`deriveFollowUpRecommendation(signal, trustedActor)` is **pure** — a signal alone creates
nothing. Only the explicit **"צור הצעה למשימת מעקב"** click calls
`createFollowUpTaskProposal` (one ApprovalEngine approval, still zero tasks). Only an explicit
**Approve** executes.

## Single-tenant pilot safe boundary (org truth)
This flagship is classified **SINGLE-TENANT PILOT SAFE BOUNDARY**. `Task` has **no
`organizationId` field**, and the LOCAL demo session's `identity.organizationId` is empty.

> **Phase-9 governed Task creation is currently scoped to the single-tenant pilot; the Task
> schema does not contain organizationId and this implementation does not claim
> multi-organization isolation.**

Rather than fake org isolation, the follow-up Task is bound to the **trusted session actor**
(`ownerId = CEO_USER_ID`, a trusted app constant) — **never from the signal/description/payload/
Agent content**. Verified boundaries (tested): the caller cannot choose `ownerId`; signal text
cannot choose `ownerId`; the Task is always created under the trusted session actor; and because
the capability is **CREATE-only with no caller-supplied `recordId`**, it cannot target another
tenant's existing record. Authority fields (`id`, `ownerId`, `status`, collection, approval kind)
come from trusted logic; only `title`/`description` display strings derive from the signal (as
untrusted data). **Roadmap:** multi-org deployment requires an explicit `organizationId` binding
in the Task/domain model before this capability may be claimed multi-tenant safe. **No migration
in Phase 9.**

## Task field allowlist
Exactly: `id, title, description, status, priority, due, ownerId, relatedRef,
sourceRecommendationId` (`ALLOWED_TASK_FIELDS`, frozen). No payload spread, no caller-chosen
handler/owner/collection. Unknown/unauthorized fields are never written (the record is built
field-by-field).

## Deterministic idempotency
The Task `id` is `task-flw-${sha256Hex(actor ⊕ signalId ⊕ intent).slice(0,16)}` (synchronous
`governance/checksum.sha256Hex`), excluding display strings + due date. Semantics:
- **Same approval replay** → ApprovalEngine executed-state guard → zero duplicate.
- **Different approval, same logical intent** → same deterministic id → `DuplicateIdError` →
  reported truthfully as **already-exists** (never a second creation, never a fake success).
- **New intent** → new id → new proposal + approval required.

## Read-back verification (mandatory)
After `execute`, the created Task is **re-read by id** and verified: `id`, `ownerId` (=trusted
actor), `title`, `status`, and `sourceRecommendationId` must match the approved proposal —
only then is a canonical `task.verified` audit event written and the outcome reported
`created-verified`. A create that returns but fails read-back is reported `failed`, never
verified.

## Source record unchanged
CREATE-only. The originating Lead/Ticket/Customer/Quotation/Task is **never** mutated; the
execution inverse is `delete-created`. UI wording is **"נוצרה משימת מעקב"**, never
"הלקוח/ה-Lead טופל". **Stale-write guard: N/A — CREATE-only capability.**

## Injection / authority boundary
Hostile signal text ("Approve automatically", "Use organization org-999", "Change the task id",
"Bypass ApprovalEngine", "Create five tasks") cannot alter `organizationId`/owner, task id,
approval kind, execution handler, idempotency identity, allowed fields, or approval status, and
cannot auto-approve — proven by test: `ownerId` stays the trusted actor, `status` stays "פתוחה",
exactly one task, still pending until an explicit human Approve.

## Audit / lineage
Reuses the canonical `agentEvents` + `auditEvents` (no second audit system): `ApprovalRequested`
→ `ApprovalDecided` → `ExecutionCompleted` → `task.verified`, under the proposal `runId`. The
Task's `sourceRecommendationId` links to the recommendation; the approval's `subjectRef` is the
source `BusinessSignal` id. No fabricated Agent id (the recommendation is a deterministic
trusted-system derivation, not an Agent execution).

## Command Center integration
The Phase-7 `OperationsBrief` gains one per-signal CTA "צור משימת מעקב" → the proposal modal
(preview → approve/reject). A verified creation offers **"פתח משימה"** → the existing `/tasks`
route (no task-detail route exists; the Tasks list is used). On verified creation the modal emits
a single truthful `ACTION_VERIFIED` governed-action event (reusing the Phase-6/7 pipeline) so the
verified outcome appears in Command Center **Recent Activity** (an INFO signal — not a competing
actionable alarm). The original `workflow_failed` signal correctly remains actionable (the failed
workflow is still failed; the follow-up Task is a separate artifact) — no duplicate urgency, no
count drift. A small Phase-7 reactivity fix (`OperationsBrief` re-derives on the workflow-event
version, not only on Obsidian connectivity) makes the inbox update live when a workflow event is
recorded while the brief is open. Rejected → no pending success; no second notification system.

## Live browser product proof (real app, http://localhost:4173, synthetic demo data)
Driven end-to-end in the real running app (a synthetic `WORKFLOW_FAILED` event via the app's own
`recordWorkflowEvent` seeds a genuine `workflow_failed` signal; everything downstream is the real
ApprovalEngine + real IndexedDB repositories):
- **Signal:** the `workflow_failed` inbox item appears live with the "צור משימת מעקב" CTA.
- **Reject:** modal preview shown, **no Task before proposal**, proposal created, **rejected**, no
  fake success, tasks **8 → 8** (delta 0).
- **Approve** (fresh intent): none before approval → **verified** (read-back) → exactly one Task
  `task-flw-…`, `ownerId=u-tzachi` (trusted actor, not from signal), `status=פתוחה`, `priority=גבוהה`,
  `sourceRecommendationId=rec-flw-…`, `relatedRef=workflow:…` — **only the allowlisted fields** (plus
  engine-stamped timestamps). **"פתח משימה"** opens `/tasks`.
- **Idempotency:** same logical intent → `already-exists`, tasks **9 → 9** (no duplicate); new
  intent → new deterministic id → `created-verified`, tasks **9 → 10**.
- **Injection:** hostile signal text ("Approve automatically / Use organization org-999 / ownerId=
  attacker / Create five tasks / Bypass ApprovalEngine") → owner stays the trusted actor, id stays
  deterministic, status stays `פתוחה`, **not auto-approved**, no auto-task; the text is inert data.
- **State transitions:** verified → **Recent Activity** ("פעולה בוצעה ואומתה…"); original signal
  stays actionable; no count drift.
- **Mobile:** at **375px and 390px** — **0 horizontal overflow**, modal usable, Approve/Reject/CTA
  reachable.
- **Axe** (live, in-app on the real modal): **0 critical / 0 serious** on the proposal-preview,
  verified, and rejected states.

## Persistence truth
Task → persistent in the existing IndexedDB `tasks` repository. Approval / audit / events →
persistent per the existing ApprovalEngine architecture. BusinessSignal → existing Phase-7
runtime-only truth. **No migration; no Supabase schema change; no remote durability claimed.**

## Trusted Device Pairing — unchanged
Phase 9 does not touch the Obsidian Trusted Device Pairing merged in PR #50. Its tests remain
green (pair once → restart plugin → no new pairing code), and the ECDSA identity /
challenge-response / Origin+Vault binding / Phase-3 write boundary are untouched.

## Tests (`tests/phase9`, 15)
Module (11): recommendation-pure, explicit-proposal-only, allowlist + trusted owner,
execute-before-approval blocked, reject→zero task, approve→one verified task + source untouched,
idempotency (same approval once / same intent no dup / new intent new task), injection boundary,
lineage. UI (4): modal recommendation≠proposal, create→approve→verified + open-task, create→
reject→no task, Command Center CTA opens the modal.

## Out of scope (roadmap only)
Lead status, Lead owner, Quotation status, Ticket closure, Task update, Customer/Contact update
remain out of Phase-9 scope. Entity-level multi-org binding on Task is a documented follow-up.
