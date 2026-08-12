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

## Selected real signal
A real Phase-7 **`BusinessSignal`** with `status: "actionable"` — e.g. **`workflow_failed`**
(priority דחוף) — derived deterministically from real Phase-5/6 workflow events (no fabricated
risk/urgency). The CTA is offered on any actionable inbox signal; `workflow_failed` /
`workflow_waiting_for_user` are the canonical "follow-up needed" cases.

## Recommendation ≠ proposal
`deriveFollowUpRecommendation(signal, trustedActor)` is **pure** — a signal alone creates
nothing. Only the explicit **"צור הצעה למשימת מעקב"** click calls
`createFollowUpTaskProposal` (one ApprovalEngine approval, still zero tasks). Only an explicit
**Approve** executes.

## Trusted org / actor binding (honest)
`Task` has **no `organizationId` field**, and the LOCAL demo session's `identity.organizationId`
is empty (single-tenant pilot). Rather than fake org isolation, the follow-up Task is bound to
the **trusted session actor** (`ownerId = CEO_USER_ID`, a trusted app constant) — **never from
the signal/description/payload**. Entity-level multi-org binding is a documented roadmap item;
it is not invented here. Authority fields (`id`, `ownerId`, `status`, collection, approval kind)
all come from trusted logic; only `title`/`description` display strings derive from the signal
(as untrusted data).

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
route (no task-detail route exists; the Tasks list is used). Rejected → no pending success; no
duplicate notification system.

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
